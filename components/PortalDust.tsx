"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";

// Gold dust glittering along the edge of the opening portal, like light catching in a doorway.
const COUNT = 420;
const dust = Array.from({ length: COUNT }, (_, i) => {
  const rand = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1; // stable per particle
  return {
    angle: rand(1) * Math.PI * 2,
    offset: (rand(2) + rand(3) - 1) * 1.2, // clustered on the rim, a few strays either side
    size: 0.6 + rand(4) ** 3 * 2.6,
    phase: rand(5) * Math.PI * 2,
    drift: (rand(6) - 0.5) * 0.25,
  };
});

type Props = { radius: MotionValue<number>; center: () => { x: number; y: number; max: number } };

export default function PortalDust({ radius, center }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      // Follow height changes too (Safari's toolbar resizes the view): a stale height stretches the ring off the circle.
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const R = radius.get();
      const { x, y, max } = center();
      if (R <= 0.5 || R >= max) return;
      const fade = R > max * 0.75 ? 1 - (R - max * 0.75) / (max * 0.25) : Math.min(1, R / 30);
      const spread = 5 + R * 0.05;
      const t = now / 1000;
      g.globalCompositeOperation = "lighter";
      for (const d of dust) {
        const a = d.angle + t * d.drift;
        const rr = R + d.offset * spread;
        const twinkle = 0.45 + 0.55 * Math.sin(t * 3 + d.phase);
        g.globalAlpha = Math.max(0, twinkle * fade);
        g.fillStyle = d.size > 1.6 ? "#fff6dc" : "#e8c27a";
        g.beginPath();
        g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, d.size, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [radius, center]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}
