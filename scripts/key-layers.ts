// Cuts the foyer's generated elements out of their chroma-green backgrounds.
// Run: node scripts/key-layers.ts   (reads raw/foyer/layer-*.png, writes public/foyer/layers/*.webp)
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const OUT = "public/foyer/layers";
mkdirSync(OUT, { recursive: true });

// "Green" = how much greener a pixel is than its red/blue. Pure key green scores ~255.
const ramp = (x: number, lo: number, hi: number) => (x <= lo ? 0 : x >= hi ? 1 : ((x - lo) / (hi - lo)) ** 2 * (3 - (2 * (x - lo)) / (hi - lo)));
// Inside the painting, painted olive leaves stay well below this and are kept.
const CORE = [60, 140] as const;
// Near a cut edge (fine curls, feather tips, the holes between them) pixels are part key green,
// so a much lower bar applies there and any remaining green is pulled out.
const EDGE = [18, 80] as const;
const BAND = 7; // px from transparency that count as "near a cut edge"
const HAIR = [196, 128, 66]; // the cherub's mid-tone gold-brown curls
const HAIR_LUMA = 0.3 * HAIR[0] + 0.59 * HAIR[1] + 0.11 * HAIR[2];
const IVORY = [242, 234, 222]; // feathers, marble and pearls
const IVORY_LUMA = 0.3 * IVORY[0] + 0.59 * IVORY[1] + 0.11 * IVORY[2];

/** Marks every pixel within `r` px of a transparent one (separable square dilation). */
function nearTransparent(alpha: Uint8Array, w: number, h: number, r: number) {
  const row = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !hit; k++) hit = alpha[y * w + k] < 128 ? 1 : 0;
      row[y * w + x] = hit;
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let hit = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !hit; k++) hit = row[k * w + x];
      out[y * w + x] = hit;
    }
  return out;
}

// [name, source, destination]
const JOBS: [string, string, string][] = [
  ["left", "raw/foyer/layer-left.png", `${OUT}/left.webp`],
  ["right", "raw/foyer/layer-right.png", `${OUT}/right.webp`],
  ["cherub", "raw/foyer/layer-cherub.png", `${OUT}/cherub.webp`],
];
for (const [name, source, dest] of JOBS) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const green = (i: number) => data[i + 1] - Math.max(data[i], data[i + 2]);

  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = Math.round(255 * (1 - ramp(green(p * 4), ...CORE)));
  // Seed the edge band from any noticeably green pixel, not just fully keyed ones: the gaps inside the curls are only part green.
  const seed = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) seed[p] = green(p * 4) > 25 ? 0 : 255;
  const edge = nearTransparent(seed, w, h, BAND);
  const hairBand = name === "cherub" ? nearTransparent(seed, w, h, 14) : edge; // curls carry green cast deeper in

  // The actual key colour, sampled from the corner (generators never paint exactly #00FF00).
  const K = [data[0], data[1], data[2]];
  const keyGreen = K[1] - Math.max(K[0], K[2]);

  for (let p = 0; p < w * h; p++) {
    const i = p * 4, g = green(i);
    let a = alpha[p] / 255;
    if (edge[p] && g > 0) {
      // Near a cut edge: the more green a pixel carries, the more transparent it becomes; wisps that are mostly
      // green disappear. Its remaining green is pulled down to the average of red and blue, which turns spill on
      // gold hair brown and on ivory feathers back to ivory, without pushing either toward orange.
      a = Math.min(a, 1 - Math.min(1, g / keyGreen) * 1.15, 1 - ramp(g, ...EDGE) * 0.6);
      if (a < 0.2) a = 0;
      const [r0, g0, b0] = [data[i], data[i + 1], data[i + 2]];
      const sat0 = (Math.max(r0, g0, b0) - Math.min(r0, g0, b0)) / Math.max(r0, g0, b0, 1);
      const luma0 = 0.3 * r0 + 0.59 * g0 + 0.11 * b0;
      // Bright pixels whose green is at or above their red are feathers in green-tinted light; gold hair is always redder.
      if (sat0 < 0.35 || (g0 >= r0 && luma0 > 150)) {
        // Near-neutral (ivory feathers, marble, pearls) with a green cast: back to ivory at the same brightness,
        // rather than letting the green removal leave them tan or peach.
        const k = luma0 / IVORY_LUMA;
        for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(IVORY[c] * k));
      } else data[i + 1] = Math.min(g0, Math.round((r0 + b0) / 2));
    } else if (g > 30) data[i + 1] = Math.max(data[i], data[i + 2]);
    // Edge band: strands painted with a green cast (olive loops in the curls) are warmed back toward gold.
    {
      const [r, gg, b] = [data[i], data[i + 1], data[i + 2]];
      const sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(r, gg, b, 1);
      if (edge[p] && gg > 0.85 * r && gg > b && sat > 0.32) data[i + 1] = Math.round(0.85 * r); // ivory is left alone
    }
    // Cherub's hair (top of that layer): edge strands that came out olive or khaki are recoloured onto the
    // hair's own gold-brown at the same brightness. Nothing is deleted here, so no holes open up in the edge.
    if (name === "cherub" && hairBand[p] && p / w < h * 0.45) {
      const [r, gg, b] = [data[i], data[i + 1], data[i + 2]];
      // Only olive / yellow-green tones (green close to or above red, both above blue). Ivory and pink feathers
      // have blue at or above green and are left exactly as painted.
      const sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(r, gg, b, 1);
      const offTone = gg > 0.78 * r && gg > b * 1.08 && sat > 0.5; // olive strands are strongly saturated; peach-ivory feathers are not
      if (offTone) {
        const k = (0.3 * r + 0.59 * gg + 0.11 * b) / HAIR_LUMA;
        for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(0.15 * data[i + c] + 0.85 * HAIR[c] * k));
      }
    }
    data[i + 3] = Math.round(a * 255);
  }
  // Feather: soften the cut edge inward (never outward, which would bring back key-coloured pixels).
  // Fine hair gets the most, so curls fade into the sky instead of ending in a hard, jagged line.
  const sigma = name === "cherub" ? 1.8 : 1.1;
  const solid = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) solid[p] = data[p * 4 + 3];
  if (name === "cherub") {
    // Smooth hair contour: blur the cut-out shape and re-trace it with a soft threshold. Curls keep their
    // rounded outline, hair-thin wisps (which read as scratchy on the sky) fall away, and the edge has no
    // stair-steps. Applied to the hair and wings, easing out across the shoulders.
    const blurred = await sharp(solid, { raw: { width: w, height: h, channels: 1 } }).blur(2.6).extractChannel(0).raw().toBuffer();
    for (let p = 0; p < w * h; p++) {
      const weight = 1 - ramp(p / w / h, 0.4, 0.5);
      if (weight <= 0) break;
      const contour = 255 * ramp(blurred[p] / 255, 0.42, 0.72);
      solid[p] = Math.min(solid[p], Math.round(255 - weight * (255 - contour)));
    }
  }
  const soft = await sharp(solid, { raw: { width: w, height: h, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
  for (let p = 0; p < w * h; p++) data[p * 4 + 3] = Math.min(solid[p], soft[p]);

  await sharp(data, { raw: info }).trim({ threshold: 1 }).webp({ quality: 88, alphaQuality: 100 }).toFile(dest);
  const meta = await sharp(dest).metadata();
  console.log(name, `${meta.width}x${meta.height}`);
}

await sharp("raw/foyer/layer-sky.png").webp({ quality: 86 }).toFile(`${OUT}/sky.webp`);
console.log("sky done");
