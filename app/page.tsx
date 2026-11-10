"use client";

import Image, { getImageProps } from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, transform, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import AudioScene, { GALLERY } from "@/components/AudioScene";
import { setScene } from "@/lib/audio";
import PortalDust from "@/components/PortalDust";
import FrameFlip, { type Flip } from "@/components/FrameFlip";
import SoundToggle from "@/components/SoundToggle";
import WingWalk, { viewForHash, viewsFor, type Box, type View } from "@/components/WingWalk";
import type { Exhibit } from "@/content/gallery";

// ---- artwork ------------------------------------------------------------------

// The foyer is built from separate layers (generated on green, keyed by scripts/key-layers.ts),
// so each element can move on its own over an empty sky.
const LAYERS = "/foyer/layers";
const V = "?v=5"; // bump when scripts/key-layers.ts regenerates the layers, so browsers drop cached copies

const props = (src: string, width: number, height: number) =>
  getImageProps({ alt: "", sizes: "100vw", loading: "eager", fetchPriority: "high", src, width, height }).props;
const HALL_ART = { wide: props("/foyer/hall-wide-v1.webp", 1536, 864), tall: props("/foyer/hall-tall-v1.webp", 864, 1536) };

// Where the hall's round window sits in each painting (fractions of the image; radius as a fraction of its width).
const OCULUS = {
  wide: { w: 1536, h: 864, cx: 0.5, cy: 0.422, r: 0.218 },
  tall: { w: 864, h: 1536, cx: 0.5, cy: 0.286, r: 0.407 },
};

/** The window's centre and radius on screen, for a painting drawn with object-fit: cover. */
function oculusOnScreen(vw: number, vh: number) {
  const o = vh >= vw ? OCULUS.tall : OCULUS.wide;
  const k = Math.max(vw / o.w, vh / o.h);
  const W = o.w * k, H = o.h * k;
  const x = (vw - W) / 2 + o.cx * W;
  const y = (vh - H) / 2 + o.cy * H;
  const max = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
  return { x, y, r: o.r * W, max, portrait: vh >= vw };
}
type Geo = ReturnType<typeof oculusOnScreen>;

// The hall's candle flames (fractions of the wide hall painting, measured from it): [x, y, size, seed].
const FLAMES: [number, number, number, number][] = [
  [0.948, 0.603, 1.2, 0], [0.9125, 0.68, 1, 1], [0.8955, 0.72, 0.95, 2], [0.981, 0.673, 1, 3],
  [0.8385, 0.859, 0.85, 4], [0.823, 0.893, 0.7, 5], [0.8115, 0.907, 0.65, 6], [0.859, 0.9, 0.7, 7],
  [0.732, 0.938, 0.55, 8], [0.7465, 0.976, 0.5, 9], [0.717, 0.977, 0.5, 10],
];

/** Living candlelight over the hall's painted flames. Each flame is driven by its own layered, never-repeating
 *  flicker: mostly steady, with irregular bursts of flutter as if a draught passed, then calm again. The flame
 *  stretches, shrinks and leans; its glow on the wall brightens and dims with it. Laid over the wide painting exactly
 *  as it is cropped (the portrait painting has no candles in view). */
function CandleLight() {
  const root = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return;
    const flames = [...root.current!.querySelectorAll<HTMLElement>("[data-flame]")];
    const halos = [...root.current!.querySelectorAll<HTMLElement>("[data-halo]")];
    // Per flame: its own frequencies and phases, so no two move alike and nothing visibly loops.
    const seeds = flames.map((_, i) => {
      const r = (n: number) => ((Math.sin(i * 91.7 + n * 37.3) * 43758.5) % 1 + 1) % 1;
      return { f: [6 + r(1) * 3, 11 + r(2) * 5, 19 + r(3) * 7], p: [r(4) * 6.3, r(5) * 6.3, r(6) * 6.3], g: 0.25 + r(7) * 0.35, gp: r(8) * 6.3 };
    });
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const t = now / 1000;
      seeds.forEach((s, i) => {
        // A draught comes and goes: calm most of the time, then a burst of flutter.
        const gust = 0.5 + 0.6 * Math.pow(Math.max(0, Math.sin(t * s.g + s.gp)), 2) + 0.25 * Math.max(0, Math.sin(t * s.g * 2.7 + s.gp * 1.9));
        const n = 0.55 * Math.sin(t * s.f[0] + s.p[0]) + 0.3 * Math.sin(t * s.f[1] + s.p[1]) + 0.15 * Math.sin(t * s.f[2] + s.p[2]);
        const lean = Math.sin(t * s.f[0] * 0.37 + s.p[1]) * gust;
        const flick = n * gust;
        flames[i].style.transform = `scale(${1 - 0.1 * flick}, ${1 + 0.32 * flick}) skewX(${11 * lean}deg)`;
        flames[i].style.opacity = `${0.72 + 0.28 * flick}`;
        halos[i].style.opacity = `${0.6 + 0.4 * flick}`;
        halos[i].style.transform = `scale(${1 + 0.1 * flick})`;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still]);
  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 aspect-video w-[max(100%,177.78dvh)] -translate-1/2 portrait:hidden">
      {FLAMES.map(([x, y, size, seed]) => (
        <span key={seed} className="absolute" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
          {/* the light the flame throws on the wall around it */}
          <span className="absolute -translate-1/2" style={{ width: `${4.5 * size}vw`, height: `${4.5 * size}vw` }}>
            <span data-halo className="block size-full rounded-full bg-[radial-gradient(circle,rgb(255_200_140/0.16),rgb(255_180_110/0.06)_45%,transparent_70%)] mix-blend-screen blur-[2px]" />
          </span>
          {/* the flame itself, anchored at its wick */}
          <span className="absolute -translate-x-1/2 -translate-y-[78%]" style={{ width: `${0.7 * size}vw`, height: `${1.9 * size}vw` }}>
            <span
              data-flame
              className="block size-full origin-bottom rounded-[50%_50%_45%_45%/62%_62%_38%_38%] bg-[radial-gradient(ellipse_at_50%_72%,rgb(255_246_220/0.92),rgb(255_208_130/0.55)_40%,rgb(255_150_60/0)_74%)] mix-blend-screen blur-[0.5px]"
            />
          </span>
        </span>
      ))}
    </div>
  );
}

function Hall() {
  const { srcSet, ...img } = HALL_ART.wide;
  return (
    <>
      <picture className="absolute inset-0 block">
        <source media="(orientation: portrait)" srcSet={HALL_ART.tall.srcSet} />
        <source srcSet={srcSet} />
        <img {...img} alt="" className="size-full object-cover" />
      </picture>
      <CandleLight />
    </>
  );
}

// ---- scroll timeline (0 = foyer, 1 = gallery) -------------------------------------
//  0.00–0.12  title lifts away
//  0.02–0.40  the foyer comes apart: the two side clusters slide out, the cherub sinks, the sky pushes in
//  0.12–0.35  a ring of gold dust opens into the hall's round window
//  0.35–0.45  hold: the hall is seen through the window
//  0.45–0.66  the window widens until the hall fills the screen, settling back into place
//  0.55–0.70  "Welcome to the Gallery"
//
// Every scroll gesture moves exactly one step: the foyer opens into "Welcome to the Gallery", the hall dissolves
// forward into Wing I, then each step is the next wing (or, on narrow screens, the next part of the room).
// Lengths in viewport heights.
const INTRO = 2.6;
const HOLD = 0.2;
const ENTER = 0.8;
const stopTop = (i: number) => INTRO + HOLD + ENTER + i; // scroll position (in vh) of view i

// Scroll-driven values computed in JS. Motion would otherwise hand plain opacity/transform ranges to the
// browser's native ScrollTimeline, which tracks the page instead of this inner scroller.
function useRange<T extends number | string>(p: MotionValue<number>, input: number[], output: T[]) {
  return useTransform(() => transform(p.get(), input, output) as T);
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export default function Home() {
  const scroller = useRef<HTMLElement>(null);
  const { scrollY } = useScroll({ container: scroller });
  const vh = useRef(800);
  const p = useTransform(() => Math.min(1, Math.max(0, scrollY.get() / (INTRO * vh.current)))); // foyer → welcome
  const y = () => scrollY.get() / vh.current;
  const enter = useTransform(() => Math.min(1, Math.max(0, (y() - INTRO - HOLD) / ENTER))); // hall → wall
  const stop = useTransform(() => y() - INTRO - HOLD - ENTER); // which view is in front of the visitor
  const size = useMotionValue({ width: 1280, height: 800 }); // same on server and first client render
  const [views, setViews] = useState<View[]>(() => viewsFor(1280, 800));
  const TOTAL = stopTop(views.length - 1) + 1;
  const reduce = useReducedMotion();

  // Whether the visitor is on the gallery walk (the wings only take clicks then).
  // (The same on server and first client render; coming back from a painting sets it below, from the #hash.)
  const [walking, setWalking] = useState(false);
  useMotionValueEvent(enter, "change", (v) => setWalking(v > 0.5));

  const [current, setCurrent] = useState(0);
  useMotionValueEvent(stop, "change", (v) => {
    setCurrent(Math.round(Math.min(views.length - 1, Math.max(0, v))));
  });

  // ---- stepping: one gesture, one step ----
  const busy = useRef(false);
  const glide = useCallback(
    (top: number) => {
      const el = scroller.current!;
      busy.current = true;
      // One gesture, one unhurried glide: a step between views takes about 1.6 s, and the foyer's long opening scene
      // (2.6 screens) about 4.8 s, so it plays out rather than rushing. Soft start, long gentle settle.
      const span = Math.abs(top - el.scrollTop / vh.current);
      return animate(el.scrollTop, top * vh.current, {
        duration: reduce ? 0 : Math.min(4.8, 1.6 + Math.max(0, span - 1) * 2),
        ease: [0.42, 0, 0.25, 1],
        onUpdate: (v) => (el.scrollTop = v),
        onComplete: () => (busy.current = false),
      });
    },
    [reduce],
  );
  const goTo = (i: number) => glide(stopTop(Math.max(0, Math.min(views.length - 1, i))));
  useEffect(() => {
    const el = scroller.current!;
    const pos = () => el.scrollTop / vh.current;
    // The whole walk steps: foyer, welcome, then each view. Nothing to do past either end.
    const tops = () => [0, INTRO, ...viewsFor(innerWidth, innerHeight).map((_, i) => stopTop(i))];
    const stepping = (dir: number) => {
      const t = tops(), y = pos();
      return dir > 0 ? y < t[t.length - 1] - 0.02 : y > 0.02;
    };
    const step = (dir: number) => {
      const y = pos(), at = tops();
      const i = at.reduce((best, t, k) => (Math.abs(t - y) < Math.abs(at[best] - y) ? k : best), 0);
      glide(at[Math.max(0, Math.min(at.length - 1, i + dir))]).then(() => {
        // A gesture made while gliding is not lost: it moves one more step as soon as this one lands.
        const q = queued;
        queued = 0;
        if (q) step(q);
      });
    };
    let queued = 0;
    // ---- the wheel and trackpad: the scene follows the scroll itself ----
    // A scroll is not a click: the walk moves with the fingers (smoothed), at a calm pace, and never past the next
    // stop. When the scrolling stops it settles gently onto that stop, or eases back if it was only nudged.
    let seg: { a: number; b: number } | null = null; // the step being scrolled through, in screen heights
    let target = 0, settling = false, idle = 0, raf = 0, lastWheel = 0;
    let lastFrame = 0;
    const tick = (now: number) => {
      raf = 0;
      if (!seg) return;
      // Time-based easing, so the pace is the same on a 60 Hz or a 120 Hz screen: follows the fingers at 5/s,
      // glides on to a stop at 2/s (most of the way in about a second and a half). The last few pixels snap, since the
      // browser rounds sub-pixel scrolling and would otherwise creep forever just short of the stop.
      const dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 1 / 60);
      lastFrame = now;
      const y = pos(), k = 1 - Math.exp(-(settling ? 2.4 : 5) * dt);
      const done = Math.abs(target - y) * vh.current < (settling ? 4 : 1.5);
      // A speed limit, so the scene unfolds at an even pace instead of rushing just after the step commits: the
      // foyer's long opening at most 0.8 screens a second (the circle widens steadily), later steps 1.1.
      const limit = (Math.abs(seg.b - seg.a) > 2 ? 0.8 : 1.1) * dt;
      const next = done ? target : y + Math.max(-limit, Math.min(limit, (target - y) * k));
      el.scrollTop = next * vh.current;
      if (settling && done) {
        seg = null;
        settling = false;
        lastFrame = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const run = () => (raf ||= requestAnimationFrame((t) => tick(t)));
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const dir = Math.sign(d), now = performance.now(), gap = now - lastWheel;
      lastWheel = now;
      if (!dir || busy.current) return;
      // While a step glides to its stop, the same flick's after-motion is not a new step: one gesture, one step.
      // (A pause, or scrolling back the other way, is.)
      if (seg && settling && dir === Math.sign(seg.b - seg.a) && gap < 250) {
        e.preventDefault();
        return;
      }
      // Scrolling back against the step in hand turns it around: it now heads back to where it came from.
      if (seg && dir !== Math.sign(seg.b - seg.a)) {
        seg = { a: seg.b, b: seg.a };
        target = pos();
        settling = false;
      }
      // Scrolling out past either end of the step in hand (on, or back the way it came) starts the next step that
      // way, so the walk never holds the visitor in place, forwards or backwards.
      if (seg) {
        const lo = Math.min(seg.a, seg.b), hi = Math.max(seg.a, seg.b);
        if ((dir > 0 && target >= hi - 0.01) || (dir < 0 && target <= lo + 0.01)) seg = null;
      }
      if (!seg) {
        if (!stepping(dir)) return;
        const at = tops(), y = pos();
        const i = at.reduce((best, t, k) => (Math.abs(t - y) < Math.abs(at[best] - y) ? k : best), 0);
        seg = { a: at[i], b: at[Math.max(0, Math.min(at.length - 1, i + dir))] };
        target = y;
      }
      e.preventDefault();
      settling = false;
      // How far a swipe carries: the foyer's long opening takes a long, calm swipe (about 2400 px); later steps
      // answer sooner (about 1100 px), so there is no pause before the gallery.
      const len = Math.abs(seg.b - seg.a), foyer = len > 2;
      target = Math.min(Math.max(target + d * (len / (foyer ? 2400 : 1100)), Math.min(seg.a, seg.b)), Math.max(seg.a, seg.b));
      // Part of the way in, the step is decided: glide on to its stop now (no waiting for the trackpad's
      // after-motion to die away).
      if ((target - seg.a) / (seg.b - seg.a || 1) > (foyer ? 0.25 : 0.15)) {
        target = seg.b;
        settling = true;
      }
      run();
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        if (!seg) return;
        // Settle: onward if the scroll went a little way, back if it was only a nudge.
        const went = (target - seg.a) / (seg.b - seg.a || 1);
        target = went > 0.12 ? seg.b : seg.a;
        settling = true;
        run();
      }, 180);
    };
    let sx = 0, sy = 0;
    const onTouchStart = (e: TouchEvent) => ((sx = e.touches[0].clientX), (sy = e.touches[0].clientY));
    const swipe = (t: Touch) => {
      const dx = sx - t.clientX, dy = sy - t.clientY;
      return Math.abs(dx) > Math.abs(dy) ? dx : dy;
    };
    const onTouchMove = (e: TouchEvent) => {
      const d = swipe(e.touches[0]);
      if (d && stepping(Math.sign(d))) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const d = swipe(e.changedTouches[0]);
      if (Math.abs(d) > 40 && stepping(Math.sign(d)) && !busy.current) step(Math.sign(d));
    };
    const onKey = (e: KeyboardEvent) => {
      const dir = { ArrowDown: 1, PageDown: 1, ArrowRight: 1, " ": e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1, ArrowLeft: -1 }[e.key];
      if (!dir || !stepping(dir) || (e.target as HTMLElement).closest("input,textarea")) return;
      e.preventDefault();
      if (!busy.current) step(dir);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
      clearTimeout(idle);
    };
  }, [glide]);
  const [flip, setFlip] = useState<Flip | null>(null);
  const clearFlip = useCallback(() => setFlip(null), []);
  const enterExhibit = (exhibit: Exhibit, frame: HTMLElement, outer: Box, opening: Box) => {
    // The painting's music starts with the click, so it is already there as the painting opens.
    setScene({ music: `/audio/music/${exhibit.slug}.mp3` });
    setFlip({ exhibit, rect: frame.getBoundingClientRect(), outer, opening });
  };

  const [geo, setGeo] = useState<Geo | null>(null);
  const live = useRef(oculusOnScreen(1, 1)); // read every frame by the portal, without re-rendering
  useEffect(() => {
    const measure = () => {
      // A resize must not leave the gallery stranded between two steps: stay in front of the same wing.
      const el = scroller.current!, was = size.get(), y = el.scrollTop / vh.current;
      if (y > INTRO + 0.02) {
        const old = viewsFor(was.width, was.height);
        const wing = old[Math.round(Math.min(old.length - 1, Math.max(0, y - INTRO - HOLD - ENTER)))].wing;
        const at = viewsFor(innerWidth, innerHeight).findIndex((v) => v.wing === wing);
        requestAnimationFrame(() => (el.scrollTop = stopTop(at) * innerHeight));
      }
      vh.current = innerHeight;
      size.set({ width: innerWidth, height: innerHeight });
      const next = viewsFor(innerWidth, innerHeight);
      setViews((prev) => (prev.length === next.length ? prev : next));
      live.current = oculusOnScreen(innerWidth, innerHeight);
      setGeo(live.current);
    };
    measure();
    addEventListener("resize", measure);
    // Coming back from an exhibit lands in front of its artist (#<exhibit slug>), a wing (#<wing id>), or the welcome (#gallery).
    const hash = location.hash.slice(1);
    const at = viewForHash(viewsFor(innerWidth, innerHeight), hash);
    if (hash === "gallery") scroller.current!.scrollTop = INTRO * innerHeight;
    else if (at >= 0) {
      // The page is only as tall as the views once React has re-rendered with them.
      requestAnimationFrame(() => {
        scroller.current!.scrollTop = stopTop(at) * innerHeight;
        setWalking(true); // landing in front of a wing: its music, and its artists clickable, straight away
      });
    }
    return () => removeEventListener("resize", measure);
  }, [size]);

  // Foyer: the title leaves, then the scene separates into its layers.
  const titleOpacity = useRange(p, [0, 0.1], [1, 0]);
  const titleY = useRange(p, [0, 0.12], [0, -70]);
  const cueOpacity = useRange(p, [0, 0.04], [1, 0]);
  const leftX = useRange(p, [0.02, 0.4], ["0%", "-115%"]);
  const leftRotate = useRange(p, [0.02, 0.4], [0, -6]);
  const rightX = useRange(p, [0.02, 0.4], ["0%", "115%"]);
  const rightRotate = useRange(p, [0.02, 0.4], [0, 6]);
  const cherubY = useRange(p, [0.02, 0.4], ["0%", "115%"]);
  const layerScale = useRange(p, [0.02, 0.4], [1, 1.12]);
  const skyScale = useRange(p, [0, 0.6], [1, 1.5]);
  const skyDim = useRange(p, [0, 0.25, 0.55], [0, 0.55, 0.92]);
  const foyerOpacity = useRange(p, [0.6, 0.68], [1, 0]);

  // Each layer drifts against the pointer by its depth, so the foyer reads as a deep, layered scene.
  const mx = useSpring(0, { stiffness: 40, damping: 20 });
  const my = useSpring(0, { stiffness: 40, damping: 20 });
  const drift = (depth: number) => () => `translate(${-mx.get() * depth}%, ${-my.get() * depth}%)`;
  const skyDrift = useTransform(drift(0.6));
  const sideDrift = useTransform(drift(1.4));
  const frontDrift = useTransform(drift(2.2));
  useEffect(() => {
    if (reduce) return;
    const move = (e: PointerEvent) => {
      mx.set((e.clientX / innerWidth) * 2 - 1);
      my.set((e.clientY / innerHeight) * 2 - 1);
    };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, [mx, my, reduce]);

  // Portal into the hall.
  const hallScale = useRange(p, [0.12, 0.7], [1.2, 1]);
  const radius = useTransform(() => {
    const v = p.get(), { r, max } = live.current, rim = r * hallScale.get();
    if (v <= 0.12) return 0;
    if (v < 0.35) return rim * ease((v - 0.12) / 0.23);
    if (v < 0.45) return rim;
    if (v < 0.66) return rim + (max - rim) * ease((v - 0.45) / 0.21);
    return max + 4;
  });
  const clipPath = useTransform(() => `circle(${radius.get()}px at ${live.current.x}px ${live.current.y}px)`);
  const dustCenter = useCallback(() => live.current, []);
  const hallOpacity = useTransform(() => 1 - enter.get());
  // The welcome's own cue: appears once the welcome has settled, leaves as the first wing arrives.
  const welcomeCue = useTransform(() => Math.min(1, Math.max(0, (p.get() - 0.9) / 0.1)) * Math.max(0, 1 - enter.get() * 4));
  const hallLeave = useTransform(() => 1 + 0.25 * enter.get());

  return (
    <main ref={scroller} tabIndex={-1} className="fixed inset-0 overflow-y-auto overscroll-none outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* One track for the whole walk, from the first page through every wing: Moby's "LA1". */}
      <AudioScene music={GALLERY} />
      <div className="relative" style={{ height: `${TOTAL * 100}dvh` }}>

        <div className="sticky top-0 isolate h-dvh overflow-hidden">
          {/* ---- Foyer, in layers ---- */}
          <motion.div aria-hidden className="absolute inset-0" style={{ opacity: foyerOpacity }} initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 2.4, ease: [0.2, 0.7, 0.2, 1] }}>
            <motion.div className="absolute -inset-[3%]" style={{ transform: skyDrift }}>
              <motion.div className="absolute inset-0" style={{ scale: skyScale }}>
                <Image src={`${LAYERS}/sky.webp${V}`} alt="" fill unoptimized preload className="object-cover object-[50%_40%]" />
                <motion.div className="absolute inset-0 bg-ink" style={{ opacity: skyDim }} />
              </motion.div>
            </motion.div>

            {/* Layers bleed past the screen edges further than the pointer drift can move them, so their cut edges never show. */}
            <motion.div className="absolute inset-0" style={{ transform: sideDrift }}>
              <motion.div className="absolute -bottom-[4dvh] -left-[4vw] h-[min(108dvh,180vw)] origin-bottom-left portrait:h-[62dvh] portrait:-translate-x-[22%]" style={{ x: leftX, rotate: leftRotate, scale: layerScale }}>
                <Image src={`${LAYERS}/left.webp${V}`} alt="" width={864} height={1536} unoptimized className="h-full w-auto max-w-none" />
              </motion.div>
              <motion.div className="absolute -right-[4vw] -bottom-[4dvh] h-[min(108dvh,240vw)] origin-bottom-right portrait:h-[62dvh] portrait:translate-x-[18%]" style={{ x: rightX, rotate: rightRotate, scale: layerScale }}>
                <Image src={`${LAYERS}/right.webp${V}`} alt="" width={621} height={1536} unoptimized className="h-full w-auto max-w-none" />
              </motion.div>
            </motion.div>

            <motion.div className="absolute inset-0" style={{ transform: frontDrift }}>
              <motion.div className="absolute -bottom-[5dvh] left-1/2 w-[min(62vw,110dvh)] -translate-x-1/2 origin-bottom portrait:w-[min(170vw,120dvh)]" style={{ y: cherubY, scale: layerScale }}>
                <Image src={`${LAYERS}/cherub.webp${V}`} alt="" width={1454} height={694} unoptimized className="h-auto w-full" />
              </motion.div>
            </motion.div>

            {/* A faint dusk tint behind the title, darker top and bottom edges. */}
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(ellipse_46%_30%_at_50%_26%,rgb(26_15_9/0.3),rgb(26_15_9/0.12)_55%,transparent_82%),linear-gradient(to_bottom,rgb(12_8_6/0.55),transparent_16%,transparent_85%,rgb(12_8_6/0.5))] portrait:bg-[radial-gradient(ellipse_75%_24%_at_50%_26%,rgb(26_15_9/0.3),rgb(26_15_9/0.12)_55%,transparent_82%),linear-gradient(to_bottom,rgb(12_8_6/0.55),transparent_16%,transparent_85%,rgb(12_8_6/0.5))]"
              style={{ opacity: titleOpacity }}
            />
          </motion.div>

          {/* The title sits in the open sky above the cherub. */}
          <motion.div
            className="text-glow pointer-events-none absolute inset-x-0 top-0 flex h-[46dvh] flex-col items-center justify-center pt-[clamp(48px,9dvh,104px)] text-center squat:h-[54dvh] squat:pt-[40px]"
            style={{ opacity: titleOpacity, y: titleY }}
          >
            <motion.h1
              initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.6, delay: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
              // One lockup sized in ems of CANVAS, like an engraved title: everything scales together.
              className="flex flex-col items-center font-display text-[clamp(2.3rem,min(10.5vw,9.2dvh),7.4rem)] leading-none text-parchment uppercase squat:flex-row squat:items-baseline squat:gap-[0.25em] squat:text-[8dvh]"
            >
              <span className="mb-[0.06em] pl-[0.32em] text-[0.4em] tracking-[0.32em] squat:mb-0 squat:pl-0 squat:text-[0.6em]">The</span>
              {/* The script just kisses the top of CANVAS so the two read as one lockup without the letters colliding. */}
              <span className="relative z-10 -mb-[0.34em] font-script text-[1.45em] leading-[1.1] tracking-normal normal-case squat:mb-0 squat:text-[1.3em]">
                Living
              </span>
              <span className="pl-[0.14em] tracking-[0.14em] text-parchment/90 squat:text-[1em]">Canvas</span>
            </motion.h1>
            <motion.div initial={{ opacity: 0, scaleX: 0.6 }} animate={{ opacity: 0.85, scaleX: 1 }} transition={{ duration: 1.4, delay: 0.9, ease: [0.2, 0.7, 0.2, 1] }} className="mt-[2dvh] squat:hidden">
              <Divider />
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              transition={{ duration: 1.2, delay: 1 }}
              className="mt-[1.4dvh] font-display text-[clamp(14px,1.35vw,19px)] font-medium tracking-[0.28em] text-parchment uppercase squat:hidden"
            >
              A museum of voices
            </motion.p>
          </motion.div>

          {/* A soft cinematic darkening along the bottom edge (full width, no box) so the cue reads over the roses. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[30dvh] bg-[linear-gradient(to_top,rgb(12_8_6/0.78),rgb(12_8_6/0.42)_40%,transparent)]"
            style={{ opacity: cueOpacity }}
          />
          <motion.button
            onClick={() => scroller.current?.scrollTo({ top: INTRO * vh.current, behavior: "smooth" })}
            className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),2.5dvh)] mx-auto flex w-max flex-col items-center gap-2 font-display text-[clamp(14px,1.15vw,17px)] font-semibold tracking-[0.3em] text-parchment uppercase [text-shadow:0_1px_8px_rgb(10_6_4/0.75),0_0_22px_rgb(10_6_4/0.85),0_0_48px_rgb(10_6_4/0.7)]"
            style={{ opacity: cueOpacity }}
          >
            Scroll to enter
            <span aria-hidden className="scroll-cue h-[clamp(22px,4dvh,38px)] w-[1.5px] bg-parchment shadow-[0_0_16px_rgb(10_6_4/0.8)]" />
            <span className="text-[clamp(10.5px,0.85vw,12.5px)] font-medium tracking-[0.24em] text-parchment squat:hidden">Best experienced with sound on</span>
          </motion.button>

          {/* On the welcome, the next step is not obvious: the same cue as the foyer's, inviting one more scroll. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),2.5dvh)] z-10 mx-auto flex w-max flex-col items-center gap-2 font-display text-[clamp(14px,1.15vw,17px)] font-semibold tracking-[0.3em] text-parchment uppercase [text-shadow:0_1px_8px_rgb(10_6_4/0.75),0_0_22px_rgb(10_6_4/0.85),0_0_48px_rgb(10_6_4/0.7)]"
            style={{ opacity: welcomeCue }}
          >
            Scroll to step inside
            <span className="scroll-cue h-[clamp(22px,4dvh,38px)] w-[1.5px] bg-parchment shadow-[0_0_16px_rgb(10_6_4/0.8)]" />
          </motion.div>

          {/* ---- Gallery, seen through the portal (it dissolves forward as the wings arrive) ---- */}
          <motion.div className="absolute inset-0" style={{ clipPath, opacity: hallOpacity, scale: hallLeave }}>
            <motion.div className="absolute inset-0" style={{ scale: hallScale, transformOrigin: geo ? `${geo.x}px ${geo.y}px` : "50% 42%" }}>
              <Hall />
            </motion.div>
            {geo && <Welcome p={p} geo={geo} />}
          </motion.div>
          <PortalDust radius={radius} center={dustCenter} />

          {/* ---- The four wings ---- */}
          <WingWalk stop={stop} enter={enter} size={size} views={views} current={current} goTo={goTo} onEnter={enterExhibit} walking={walking} />

          <div className="absolute top-[max(env(safe-area-inset-top),clamp(12px,2.5dvh,28px))] right-[max(env(safe-area-inset-right),clamp(16px,3vw,48px))] z-10">
            <SoundToggle hint />
          </div>
        </div>
      </div>
      <FrameFlip flip={flip} onDone={clearFlip} />
    </main>
  );
}

function Welcome({ p, geo }: { p: MotionValue<number>; geo: Geo }) {
  const opacity = useRange(p, [0.55, 0.7], [0, 1]);
  const y = useRange(p, [0.55, 0.72], [24, 0]);
  const { x, y: cy, r, portrait } = geo;
  const size = Math.max(28, r * (portrait ? 0.2 : 0.19));

  return (
    <>
      {/* Soft shade inside the window so the cream lettering reads over bright cloud. */}
      <motion.div
        aria-hidden
        className="absolute rounded-full bg-[radial-gradient(circle,rgb(20_13_8/0.28),rgb(20_13_8/0.1)_55%,transparent_72%)]"
        style={{ left: x - r, top: cy - r, width: r * 2, height: r * 2, opacity }}
      />
      <motion.h2
        className="text-glow absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center font-display leading-none text-parchment uppercase"
        style={{ left: x, top: cy, width: r * 1.7, fontSize: size, opacity, y }}
      >
        <span className="relative z-10 -mb-[0.26em] font-script text-[1.6em] leading-[1.1] tracking-normal normal-case">
          Welcome
        </span>
        <span className="pl-[0.14em] text-[0.62em] tracking-[0.14em] text-parchment/90">To the Gallery</span>
      </motion.h2>
    </>
  );
}

/** Thin rule with a small classical knot in the middle, as on an engraved title page. */
function Divider() {
  return (
    <svg viewBox="0 0 240 16" aria-hidden className="h-auto w-[clamp(170px,22vw,340px)] text-parchment" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <path d="M2 8H98M142 8H238" />
      <path d="M116 8C112 2.5 104 3 103.5 8C103 12.5 109.5 13 110.5 9.5M124 8C128 2.5 136 3 136.5 8C137 12.5 130.5 13 129.5 9.5" />
      <path d="M120 3.5L124 8L120 12.5L116 8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
