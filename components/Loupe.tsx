"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Exhibit, Technique } from "@/content/gallery";

const pct = (n: number) => `${n * 100}%`;

// A glass sphere drawn in WebGL: clear magnification in the middle, fisheye bending and
// rainbow fringing toward the rim, a soft sheen and a thin bright edge.
const VERT = `
attribute vec2 a;
varying vec2 vP;
void main() { vP = vec2(a.x, -a.y); gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uRail; // a run of the gallery frame's carved rail, bent into the bezel
uniform vec2 uCenter; // painting uv under the lens centre
uniform vec2 uSpan;   // uv covered by the lens radius
uniform float uPx;    // one CSS pixel in lens units, for a smooth edge
varying vec2 vP;      // -1..1, y down

const vec3 WALL = vec3(0.043, 0.031, 0.024);

vec3 paint(vec2 d) {
  vec2 uv = uCenter + d * uSpan;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return WALL;
  return texture2D(uTex, uv).rgb;
}

void main() {
  float R = length(vP);
  float mask = 1.0 - smoothstep(1.0 - 1.5 * uPx, 1.0, R);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // The bezel is the gallery frame's own carved rail (sprig, shell cartouche, sprig) bent into a ring, so the loupe
  // is gilded and carved exactly like the frames. Lit from the upper left like the lens.
  const float RIM = 0.8;
  if (R > RIM) {
    float t = (R - RIM) / (1.0 - RIM);                         // 0 at the glass, 1 at the outer edge
    float u = fract(atan(vP.y, vP.x) / 6.28318 * 8.0 + 0.25);  // eight runs around the ring
    vec4 rail = texture2D(uRail, vec2(u, 1.0 - t));            // the rail's outer edge outermost
    float side = dot(vP / R, normalize(vec2(-0.6, -0.8)));
    float bevel = cos(t * 3.14159);
    vec3 col = rail.rgb * (0.82 + 0.3 * side * bevel);         // the ring catches light like a turned moulding
    col *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.1, t));        // dark seat where it holds the glass
    float a = rail.a * mask;
    gl_FragColor = vec4(col * a, a);
    return;
  }

  // The glass, inside the bezel.
  vec2 q = vP / RIM;
  float r = length(q);
  float z = sqrt(max(1.0 - r * r, 0.0));
  vec2 d = q * (1.0 + 2.4 * pow(1.0 - z, 1.4));  // rim looks farther out, squeezing the image like a sphere
  float fringe = 0.16 * pow(r, 3.0);      // red and blue bend by different amounts near the edge
  vec3 col = vec3(paint(d * (1.0 + fringe)).r, paint(d).g, paint(d * (1.0 - fringe)).b);

  vec2 h = q - vec2(-0.3, -0.42);
  col += 0.2 * exp(-7.0 * dot(h, h));                                         // sheen, upper left
  vec2 g = q - vec2(0.45, 0.4);
  col += 0.07 * exp(-3.0 * dot(g, g));                                        // frosty glow, lower right
  col += vec3(0.85, 0.92, 1.0) * 0.22 * pow(r, 6.0);                          // fresnel glow at the edge
  col *= 1.0 - 0.3 * smoothstep(0.92, 1.0, r);                                // the bezel's shadow on the glass

  gl_FragColor = vec4(col, 1.0);
}`;

// Returns null instead of throwing: a lens that fails to draw must never take the page down.
function program(gl: WebGLRenderingContext) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return console.warn("loupe shader:", gl.getShaderInfoLog(s)), null;
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  gl.useProgram(p);
  return p;
}

// ponytail: one hi-res image per painting, loaded when the loupe first opens. Move to tiles (DZI) once real scans go past ~8k px.
type LoupeProps = {
  exhibit: Exhibit;
  /** The clue being hunted. Only it can be found; the lens reports how close it is. */
  target?: Technique;
  /** 0 (far) … 1 (on it), as the glass moves. */
  onNear: (closeness: number) => void;
  onFound: (t: Technique) => void;
};

export default function Loupe({ exhibit, target: clue, onNear, onFound }: LoupeProps) {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: 0, y: 0, lift: 0, shown: false });
  const [region, setRegion] = useState<Technique>();
  // Guidance: a gilt arrow on the rim points to the clue; after a while searching, the spot itself shimmers.
  const arrow = useRef<HTMLSpanElement>(null);
  const clueRef = useRef(clue);
  useEffect(() => {
    clueRef.current = clue;
  }, [clue]);
  const [stuck, setStuck] = useState<string | null>(null);
  // Picked up from the plate: the glass appears over the middle of the painting at once, before the pointer arrives.
  useEffect(() => {
    const r = area.current!.getBoundingClientRect();
    target.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, lift: 0, shown: true };
  }, []);
  useEffect(() => {
    if (!clue) return;
    const t = setTimeout(() => setStuck(clue.id), 10000);
    return () => clearTimeout(t);
  }, [clue]);
  const dir = `/exhibits/${exhibit.slug}`;

  useEffect(() => {
    const c = canvas.current!;
    const gl = c.getContext("webgl", { premultipliedAlpha: true });
    if (!gl || gl.isContextLost()) return;
    const p = program(gl);
    if (!p) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, "a");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const uCenter = gl.getUniformLocation(p, "uCenter");
    const uSpan = gl.getUniformLocation(p, "uSpan");
    const uPx = gl.getUniformLocation(p, "uPx");

    const paint = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paint);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([11, 8, 6, 255]));

    // The base image fills in until the hi-res scan arrives; whichever is sharper wins.
    let natural = 0;
    let dirty = true;
    let alive = true;
    const upload = (src: string) => {
      const img = new Image();
      img.onload = () => {
        if (!alive || img.naturalWidth <= natural) return;
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        let source: TexImageSource = img;
        if (Math.max(img.naturalWidth, img.naturalHeight) > max) {
          const k = max / Math.max(img.naturalWidth, img.naturalHeight);
          const fit = document.createElement("canvas");
          fit.width = Math.floor(img.naturalWidth * k);
          fit.height = Math.floor(img.naturalHeight * k);
          fit.getContext("2d")!.drawImage(img, 0, 0, fit.width, fit.height);
          source = fit;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, paint);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        natural = img.naturalWidth;
        dirty = true;
      };
      img.src = src;
    };
    upload(`${dir}/base.webp`);
    upload(`${dir}/hires.webp`);
    // The carved rail for the bezel, on texture unit 1.
    gl.uniform1i(gl.getUniformLocation(p, "uRail"), 1);
    let railed = false; // until the rail is on the GPU the bezel would draw black, so the lens stays hidden
    const rail = new Image();
    rail.onload = () => {
      if (!alive) return;
      railed = true;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]])
        gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rail);
      gl.activeTexture(gl.TEXTURE0);
      dirty = true;
    };
    rail.src = "/frames/loupe-rail.webp";

    let pos: { x: number; y: number } | null = null;
    let raf = 0;
    const frame = () => {
      if (!area.current) return; // the glass was just put away: React lets go of the painting before this loop stops
      raf = requestAnimationFrame(frame);
      const t = target.current;
      const shown = t.shown && railed && natural > 0; // brass and painting both ready: never a black rim or blank glass
      c.style.opacity = shown ? "1" : "0";
      c.style.scale = shown ? "1" : "0.85";
      if (!shown) {
        if (arrow.current) arrow.current.style.opacity = "0";
        return;
      }

      // Glide toward the pointer rather than snapping to it.
      const next = pos ? { x: pos.x + (t.x - pos.x) * 0.3, y: pos.y + (t.y - pos.y) * 0.3 } : { x: t.x, y: t.y };
      const moved = !pos || Math.abs(next.x - pos.x) + Math.abs(next.y - pos.y) > 0.05;
      pos = next;

      // The lens is sized to the painting, so it never sweeps far past the frame.
      const box = area.current!.getBoundingClientRect();
      // Sized to the painting as it hangs (its layout size, before any zoom), so stepping in never changes the glass.
      const el = area.current!;
      const size = Math.round(Math.min(320, Math.max(170, 0.6 * Math.min(el.offsetWidth, el.offsetHeight))));
      if (c.offsetWidth !== size) c.style.width = c.style.height = `${size}px`;
      const R = size / 2;
      const px = Math.round(R * 2 * Math.min(devicePixelRatio || 1, 2));
      if (c.width !== px) {
        c.width = c.height = px;
        gl.viewport(0, 0, px, px);
        dirty = true;
      }
      c.style.left = `${pos.x}px`;
      c.style.top = `${pos.y - t.lift}px`;

      // The rim arrow: points from the lens toward the clue, brighter as it closes in, gone once over it.
      const g = clueRef.current, a = arrow.current;
      if (a) {
        if (!g) a.style.opacity = "0";
        else {
          const cx = box.left + (g.x + g.w / 2) * box.width, cy = box.top + (g.y + g.h / 2) * box.height;
          const ly = pos.y - t.lift;
          const ex = Math.max(box.left + g.x * box.width - pos.x, 0, pos.x - (box.left + (g.x + g.w) * box.width));
          const ey = Math.max(box.top + g.y * box.height - ly, 0, ly - (box.top + (g.y + g.h) * box.height));
          const dist = Math.hypot(ex, ey) / Math.max(box.width, box.height);
          const ang = Math.atan2(cy - ly, cx - pos.x);
          a.style.left = `${pos.x + Math.cos(ang) * (R + 12)}px`;
          a.style.top = `${ly + Math.sin(ang) * (R + 12)}px`;
          a.style.rotate = `${ang}rad`;
          a.style.opacity = dist === 0 ? "0" : `${0.55 + 0.45 * Math.max(0, 1 - dist / 0.5)}`;
        }
      }
      if (!moved && !dirty) return;
      dirty = false;

      // Magnified to fit the clue being hunted: it fills about three-quarters of the glass (small details up to
      // the scan's own pixels, 6x at most; larger subjects gently, so the whole of them shows in the glass).
      const r = area.current!.getBoundingClientRect();
      const most = Math.min(6, Math.max(2.5, natural / r.width || 3));
      const hunted = clueRef.current;
      const fit = hunted ? (1.5 * R) / Math.max(hunted.w * r.width, hunted.h * r.height) : most;
      const zoom = Math.min(most, Math.max(1.25, fit));
      gl.uniform2f(uCenter, (pos.x - r.left) / r.width, (pos.y - r.top) / r.height);
      gl.uniform2f(uSpan, R / (r.width * zoom), R / (r.height * zoom));
      gl.uniform1f(uPx, 1 / R);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame();
    return () => {
      alive = false;
      cancelAnimationFrame(raf); // the context stays: the canvas is reused if this effect runs again
    };
  }, [dir]);

  const move = (e: React.PointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    const shown = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    // On touch the lens floats above the finger so it stays visible.
    target.current = { x: e.clientX, y: e.clientY, lift: e.pointerType === "touch" ? canvas.current!.offsetWidth / 2 + 24 : 0, shown };
    if (!shown) return;

    if (!clue) return;
    // Distance from the lens centre to the clue's centre, in lens radii: the clue is found only once it sits in the
    // middle of the glass (within a third of the radius), filling it, not merely somewhere inside the lens.
    const R = canvas.current!.offsetWidth / 2;
    const dx = (u - (clue.x + clue.w / 2)) * r.width, dy = (v - (clue.y + clue.h / 2)) * r.height;
    const d = Math.hypot(dx, dy) / R;
    onNear(Math.max(0, 1 - d / 5)); // warmer from five radii away, hottest at the centre
    if (d < 0.33 && region !== clue) {
      setRegion(clue);
      onFound(clue);
    }
  };

  return (
    <>
      <div
        ref={area}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => (target.current = { ...target.current, shown: false })}
        className="absolute inset-0 cursor-none touch-none"
      >
        {/* Still searching after a while: the spot gives a faint shimmer. */}
        {clue && stuck === clue.id && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-12 -translate-1/2 animate-ping rounded-full bg-[radial-gradient(circle,rgb(255_226_160/0.55),transparent_70%)] [animation-duration:2.6s]"
            style={{ left: pct(clue.x + clue.w / 2), top: pct(clue.y + clue.h / 2) }}
          />
        )}
        {region && region === clue && (
          <div
            className="pointer-events-none absolute rounded-sm ring-1 ring-gilt/80 shadow-[0_0_30px_-6px_var(--color-gilt)]"
            style={{ left: pct(region.x), top: pct(region.y), width: pct(region.w), height: pct(region.h) }}
          />
        )}
      </div>
      {createPortal(
        <>
      <span
        ref={arrow}
        aria-hidden
        className="pointer-events-none fixed z-50 -translate-1/2 text-[#f3d58a] opacity-0 drop-shadow-[0_1px_3px_rgb(0_0_0/0.9)] transition-opacity duration-200"
      >
        <svg viewBox="0 0 24 24" className="size-8 drop-shadow-[0_0_6px_rgb(243_213_138/0.8)]" fill="currentColor">
          <path d="M5 5.5 19 12 5 18.5 8.5 12Z" />
        </svg>
      </span>
      <canvas
        ref={canvas}
        aria-hidden
        className="pointer-events-none fixed z-50 size-[200px] -translate-1/2 rounded-full opacity-0 shadow-[0_40px_70px_-10px_rgb(0_0_0/0.75),0_12px_24px_-8px_rgb(0_0_0/0.6)] transition-[opacity,scale] duration-300 ease-out"
      />
        </>,
        // Outside the painting's zoom, so the glass keeps its own size however far the visitor steps in.
        document.body,
      )}
    </>
  );
}
