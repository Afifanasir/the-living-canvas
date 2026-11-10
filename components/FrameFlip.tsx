"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { animate } from "motion/react";
import CarvedFrame from "@/components/CarvedFrame";
import type { Box } from "@/components/WingWalk";
import type { Exhibit } from "@/content/gallery";
import { hang } from "@/lib/hang";

export type Flip = { exhibit: Exhibit; rect: DOMRect; outer: Box; opening: Box };

// Flips that have already walked the visitor in. Next keeps the gallery page alive in the background; when the
// visitor comes back, React re-runs this component's effects with the old flip still set, and without this
// it would replay the entrance and walk them straight back into the exhibit.
const played = new WeakSet<Flip>();

/**
 * Entering an exhibit:
 *  1. the gallery dims and softens while the frame lifts off the wall and comes toward you;
 *  2. it turns over. The front is cut from the room itself (the very frame on the wall); the back is the
 *     painting in a carved frame of its own shape. The change of shape happens edge-on, where it can't be seen;
 *  3. the wing's exhibit room lights up and the painting settles onto its wall, exactly where the room shows it.
 * Every move is a uniform scale of one piece, so frame and picture always resize together.
 * A click or Escape skips straight in.
 */
/** `onDone` clears the flip once the exhibit has opened. The gallery page stays alive in the background (Next keeps
 *  visited routes), and without it, returning to the gallery would replay the flip and walk straight back in. */
export default function FrameFlip({ flip, onDone }: { flip: Flip | null; onDone: () => void }) {
  const router = useRouter();
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!flip) return;
    if (played.has(flip)) return onDone();
    const { exhibit, rect } = flip;
    const href = `/exhibit/${exhibit.slug}`;
    router.prefetch(href);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      played.add(flip);
      router.push(href);
      setTimeout(onDone, 900); // after the room has taken over the screen
    };
    const skip = (e: KeyboardEvent) => e.key === "Escape" && go();
    addEventListener("keydown", skip);

    const W = innerWidth, H = innerHeight;
    const { painting: p, frame: T } = hang(W, H, exhibit.ratio);
    const F = { x: p.x - T, y: p.y - T, w: p.w + 2 * T, h: p.h + 2 * T }; // the framed painting on the exhibit wall
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      if (reduce) return go();
      const ease = [0.6, 0, 0.2, 1] as const;
      animate(shade.current!, { opacity: 1 }, { duration: 0.7 });
      // 1. Lift, then come forward to the middle of the screen, scaling the whole frame as one piece.
      const k = Math.min((H * 0.6) / rect.height, (W * 0.7) / rect.width);
      await animate(front.current!, { scale: 1.04, y: -8 }, { duration: 0.25, ease: "easeOut" });
      await animate(front.current!, { x: W / 2 - (rect.left + rect.width / 2), y: H / 2 - (rect.top + rect.height / 2), scale: k }, { duration: 0.75, ease });
      if (done) return;
      // 2. Turn over: the front swings to edge-on, then the painting swings in from edge-on at the same height.
      await animate(front.current!, { rotateY: 90 }, { duration: 0.4, ease: "easeIn" });
      front.current!.style.visibility = "hidden";
      const s = (rect.height * k) / F.h;
      const bx = W / 2 - (F.x + F.w / 2), by = H / 2 - (F.y + F.h / 2);
      await animate(back.current!, { x: bx, y: by, scale: s, rotateY: -90 }, { duration: 0 }); // edge-on, out of sight
      back.current!.style.opacity = "1";
      await animate(back.current!, { rotateY: 0 }, { duration: 0.45, ease: "easeOut" });
      if (done) return;
      // 3. The room lights up and the painting settles onto its wall.
      animate(room.current!, { opacity: 1 }, { duration: 0.8, ease: "easeInOut" });
      await animate(back.current!, { x: 0, y: 0, scale: 1 }, { duration: 0.85, ease });
      go();
    })();
    return () => {
      done = true;
      removeEventListener("keydown", skip);
    };
  }, [flip, router, onDone]);

  if (!flip || played.has(flip)) return null;
  const { exhibit, rect, outer, opening } = flip;
  const { painting: p, frame: T } = hang(innerWidth, innerHeight, exhibit.ratio);
  const [ox, oy, ow, oh] = outer, [fx, fy, fw, fh] = opening;
  const pct = (n: number) => `${n * 100}%`;
  return (
    <div className="fixed inset-0 z-50 cursor-pointer [perspective:1800px]" aria-live="polite" onClick={() => {
        played.add(flip);
        router.push(`/exhibit/${exhibit.slug}`);
        setTimeout(onDone, 900);
      }}>
      <span className="sr-only">Entering {exhibit.title}</span>
      <div ref={shade} className="absolute inset-0 bg-[rgb(8_5_3/0.6)] opacity-0 backdrop-blur-[6px]" />
      {/* eslint-disable-next-line @next/next/no-img-element -- the wing's exhibit room, faded in behind the painting */}
      <img ref={room} src={`/rooms/exhibit-${exhibit.period}.webp`} alt="" className="absolute top-1/2 left-1/2 aspect-video w-[max(118vw,177.78dvh)] max-w-none -translate-1/2 opacity-0" />

      {/* Front: the frame exactly as it hangs on the wall, cut out of the room image, with the portrait in it. */}
      <div
        ref={front}
        className="absolute [backface-visibility:hidden] [filter:drop-shadow(0_20px_28px_rgb(0_0_0/0.6))]"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          // The frame cut out of the wall (scripts/frame-cutouts.ts): carving only, no wallpaper lifting off with it.
          backgroundImage: `url(/rooms/frames/${exhibit.slug}.webp)`,
          backgroundSize: "100% 100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the artist's portrait, already loaded on the wall */}
        <img src={exhibit.portrait} alt="" className="absolute object-cover" style={{ left: pct((fx - ox) / ow), top: pct((fy - oy) / oh), width: pct(fw / ow), height: pct(fh / oh) }} />
      </div>

      {/* Back: the painting in a carved frame of its own shape, laid out at its final size and moved by transform. */}
      <div ref={back} className="absolute opacity-0 [backface-visibility:hidden]" style={{ left: p.x - T, top: p.y - T, width: p.w + 2 * T, height: p.h + 2 * T }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the exhibit's display image, prefetched with the room */}
        <img src={`/exhibits/${exhibit.slug}/base.webp`} alt="" className="absolute object-cover" style={{ left: T, top: T, width: `calc(100% - ${2 * T}px)`, height: `calc(100% - ${2 * T}px)` }} />
        <CarvedFrame w={p.w + 2 * T} h={p.h + 2 * T} rail={T} style={{ left: 0, top: 0 }} />
      </div>
    </div>
  );
}
