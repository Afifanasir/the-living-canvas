"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion, useSpring, type MotionValue } from "motion/react";
import Loupe from "@/components/Loupe";
import type { Exhibit, Technique } from "@/content/gallery";

const SPRING = { stiffness: 60, damping: 18, mass: 0.6 };
const OVERSCAN = 0.965;
/** Where a point of the painting appears while the parallax overscan enlarges it (the voice dots follow it). */
/** Where a point of the painting is drawn (the parallax view overscans slightly). */
export const shown = (n: number) => 0.5 + (n - 0.5) / OVERSCAN;
const pct = (n: number) => `${n * 100}%`;

// Depth parallax ("3D photo"): every pixel is shifted by its own depth from public/exhibits/<slug>/depth.webp
// (white = near). Nothing is cut out, so the painting can never tear or double.
const VERT = `
attribute vec2 a;
varying vec2 vUv;
void main() { vUv = vec2(a.x, -a.y) * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uPaint, uDepth;
uniform vec2 uLook;    // pointer, -1..1
uniform float uShift;  // how far the nearest paint moves against the farthest, in painting widths
uniform vec2 uAxis;    // tall paintings move sideways by their height, not their (narrow) width, so all feel alike
uniform float uGrow;   // stepping in: near paint comes toward you faster than far paint
uniform float uOver;   // overscan: enlarges slightly so shifted edges never show; exactly 1.0 while the loupe is out
varying vec2 vUv;
void main() {
  // A little overscan so a shifted edge never shows the frame's lining.
  vec2 uv = 0.5 + (vUv - 0.5) * uOver;
  // Walk toward the viewer through the depth so near paint covers far paint (cheap relief mapping).
  vec2 dir = uLook * uShift * uAxis;
  vec2 p = uv;
  for (int i = 0; i < 8; i++) {
    float d = texture2D(uDepth, p).r;
    p = uv - dir * (d - 0.45);
    p = 0.5 + (p - 0.5) / (1.0 + uGrow * d);
  }
  gl_FragColor = texture2D(uPaint, clamp(p, 0.0, 1.0));
}`;

type Props = {
  exhibit: Exhibit;
  loupe: boolean;
  speaking?: string;
  onHotspot: (id: string) => void;
  clue?: Technique;
  onNear: (closeness: number) => void;
  onFound: (t: Technique) => void;
  /** 0 = standing in the room … 1 = inside the painting. */
  zoom?: MotionValue<number>;
  /** The character whose turn it is to speak (in the roster's order): only they glow fully. */
  next?: string;
  /** Everyone has been heard: every figure glows, quietly, ready to be heard again. */
  all?: boolean;
  /** The visitor has stepped into the painting to look at it: no rings at all. */
  looking?: boolean;
};

export default function Painting({ exhibit, loupe, speaking, onHotspot, clue, onNear, onFound, zoom, next, all, looking }: Props) {
  const reduce = useReducedMotion();
  const mx = useSpring(0, SPRING);
  const my = useSpring(0, SPRING);
  // Parallax eases to flat while the loupe is out, so the lens lines up with the hi-res scan.
  const amount = useSpring(1, SPRING);
  useEffect(() => amount.set(loupe || reduce ? 0 : 1), [loupe, reduce, amount]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      mx.set((e.clientX / innerWidth) * 2 - 1);
      my.set((e.clientY / innerHeight) * 2 - 1);
    };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, [mx, my]);

  const dir = `/exhibits/${exhibit.slug}`;
  const still = useSpring(0);
  const z = zoom ?? still;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [gl, setGl] = useState(true); // false: WebGL unavailable, show the flat painting

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("webgl", { premultipliedAlpha: false, antialias: false });
    const prog = ctx && program(ctx);
    if (!ctx || !prog) return setGl(false);
    ctx.useProgram(prog);
    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), ctx.STATIC_DRAW);
    const loc = ctx.getAttribLocation(prog, "a");
    ctx.enableVertexAttribArray(loc);
    ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
    const u = (n: string) => ctx.getUniformLocation(prog, n);
    const [uLook, uShift, uGrow, uOver] = [u("uLook"), u("uShift"), u("uGrow"), u("uOver")];
    // Sideways movement is measured against the painting's width; on tall, narrow paintings (Saturn, the Pearl
    // Earring, the Scream) that meant far less visible movement. Measure it against the height there instead.
    ctx.uniform2f(u("uAxis"), Math.max(1, 1 / exhibit.ratio), 1);
    ctx.uniform1i(u("uPaint"), 0);
    ctx.uniform1i(u("uDepth"), 1);

    let alive = true, ready = 0, raf = 0;
    const load = (src: string, unit: number) => {
      const img = new window.Image();
      img.onload = () => {
        if (!alive) return;
        const t = ctx.createTexture();
        ctx.activeTexture(ctx.TEXTURE0 + unit);
        ctx.bindTexture(ctx.TEXTURE_2D, t);
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, img);
        for (const [k, v] of [[ctx.TEXTURE_MIN_FILTER, ctx.LINEAR], [ctx.TEXTURE_MAG_FILTER, ctx.LINEAR], [ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE], [ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE]]) ctx.texParameteri(ctx.TEXTURE_2D, k, v);
        ready++;
      };
      img.src = src;
    };
    load(`${dir}/base.webp`, 0);
    load(`${dir}/depth.webp`, 1);

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
      const w = Math.round((c.clientWidth || r.width) * dpr), h = Math.round((c.clientHeight || r.height) * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        ctx.viewport(0, 0, w, h);
      }
      if (ready < 2) return;
      const zz = z.get(), a = amount.get();
      ctx.uniform2f(uLook, mx.get() * a, my.get() * a);
      ctx.uniform1f(uShift, (0.022 + 0.03 * zz) * a);
      ctx.uniform1f(uGrow, 0.1 * zz);
      // The overscan relaxes to the painting's true size as the parallax settles for the magnifying glass,
      // so the glass, the clues and the canvas line up exactly.
      ctx.uniform1f(uOver, 1 - (1 - OVERSCAN) * a);
      ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);
    };
    frame();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [dir, mx, my, amount, z, exhibit.ratio]);

  return (
    <div className="relative size-full">
      <div className="absolute inset-0 overflow-hidden bg-ink">
        {/* The flat painting underneath: shown while the shader loads, and if WebGL is unavailable. */}
        <Image src={`${dir}/base.webp`} alt={`${exhibit.title} by ${exhibit.artist}`} fill unoptimized preload className="pointer-events-none select-none" draggable={false} />
        {gl && <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />}
        {!loupe &&
          !looking &&
          exhibit.hotspots.map((h) => {
            const turn = h.id === next && speaking !== h.id; // whose turn it is: full glow and ripple
            const lit = turn || (all && speaking !== h.id); // after everyone has spoken: a quieter glow, no ripple
            return (
              <button
                key={h.id}
                onClick={() => onHotspot(h.id)}
                aria-label={`Listen to ${h.character}`}
                aria-pressed={speaking === h.id}
                data-hotspot={h.id}
                // A small ring on the figure, the same size on every painting.
                className={`group absolute size-[clamp(30px,3.4vmin,42px)] -translate-1/2 cursor-pointer rounded-full transition-opacity duration-700 ${speaking === h.id || turn ? "opacity-100" : lit ? "opacity-55 hover:opacity-100" : "opacity-0 hover:opacity-60 focus-visible:opacity-60"}`}
                style={{ left: pct(shown(h.x)), top: pct(shown(h.y)) }}
              >
                {speaking === h.id ? (
                  // Selected: the ring dissolves into a very faint warm halo over the figure.
                  <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(255_236_195/0.14)_0%,rgb(255_236_195/0.07)_55%,transparent_72%)] ring-1 ring-[rgb(240_212_150/0.22)] transition-all duration-700" />
                ) : (
                  // Whose turn it is (or, once everyone has spoken, everyone): a thin gold ring breathing slowly, with a
                  // faint dark edge so it reads on bright passages too. Everyone else shows nothing until their turn
                  // (still clickable; a hover shows their ring faintly).
                  <>
                    {/* The pulse that says "click me": a soft ripple spreading out from the ring and fading. */}
                    {turn && <span aria-hidden className="absolute inset-0 animate-[ring-ripple_2.4s_ease-out_infinite] rounded-full border-2 border-[rgb(255_228_165/0.85)]" />}
                    <span
                      data-pulse={lit || undefined}
                      className={`absolute inset-0 rounded-full border-2 border-[rgb(255_228_165)] shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_0_6px_1px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(0_0_0/0.25),0_0_16px_4px_rgb(240_205_130/0.6),inset_0_0_10px_rgb(240_205_130/0.4)] transition-all duration-700 group-hover:scale-110 ${lit ? "animate-[ring-breathe_2.4s_ease-in-out_infinite]" : ""}`}
                    />
                  </>
                )}
              </button>
            );
          })}
      </div>
      {loupe && <Loupe exhibit={exhibit} target={clue} onNear={onNear} onFound={onFound} />}
    </div>
  );
}

// Returns null instead of throwing: a painting that fails to draw must never take the page down.
function program(gl: WebGLRenderingContext) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return console.warn("painting shader:", gl.getShaderInfoLog(s)), null;
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}
