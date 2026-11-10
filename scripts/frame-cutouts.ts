// Cuts each artist's frame out of its wing's room (raw/rooms/<wing>.png), with the wall around it removed, so the
// frame that lifts off the wall when a visitor clicks an artist carries no wallpaper with it (components/FrameFlip.tsx).
// The wall is found by flooding in from the crop's edge through everything wall-coloured (the wallpaper's colour is
// measured at the crop's edge) or near-black: the wallpaper, and the bits of wall seen between the carvings. The opening stays solid (the portrait covers it).
// Writes public/rooms/frames/<exhibit slug>.webp. Run: node scripts/frame-cutouts.ts
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { exhibits } from "../content/gallery.ts";

// The frames' openings per wing, [x, y, w, h] fractions of the room (the same as ROOMS in components/WingWalk.tsx),
// and the carved border around them (FRAME_PAD there).
const FRAMES: Record<string, [number, number, number, number][]> = {
  renaissance: [[0.432, 0.244, 0.132, 0.292], [0.746, 0.244, 0.132, 0.293]],
  baroque: [[0.43, 0.249, 0.136, 0.284], [0.735, 0.25, 0.132, 0.282]],
  romanticism: [[0.43, 0.219, 0.135, 0.304], [0.75, 0.219, 0.133, 0.304]],
  expressionism: [[0.425, 0.231, 0.145, 0.303], [0.73, 0.23, 0.144, 0.304]],
};
const PAD = { x: 0.025, y: 0.045 };

mkdirSync("public/rooms/frames", { recursive: true });
for (const [wing, frames] of Object.entries(FRAMES)) {
  const room = sharp(`raw/rooms/${wing}.png`);
  const { width: RW, height: RH } = await room.metadata();
  const inWing = exhibits.filter((e) => e.period === wing);
  for (const [i, [fx, fy, fw, fh]] of frames.entries()) {
    const left = Math.round((fx - PAD.x) * RW!), top = Math.round((fy - PAD.y) * RH!);
    const W = Math.round((fw + 2 * PAD.x) * RW!), H = Math.round((fh + 2 * PAD.y) * RH!);
    const px = await sharp(`raw/rooms/${wing}.png`).extract({ left, top, width: W, height: H }).removeAlpha().raw().toBuffer();
    const open = { l: Math.round(PAD.x * RW!), t: Math.round(PAD.y * RH!), r: W - Math.round(PAD.x * RW!), b: H - Math.round(PAD.y * RH!) };
    // The wall's own colour, measured along the crop's outer edge (each room's wallpaper differs).
    const ring: number[] = [];
    for (let x = 0; x < W; x++) ring.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) ring.push(y * W, y * W + W - 1);
    const mean = [0, 1, 2].map((c) => ring.reduce((t, k) => t + px[k * 3 + c], 0) / ring.length);
    // Wall: close to that colour, or a near-black gap between carvings. Everything else (gilt, even in shadow) stays.
    const gilt = (k: number) => {
      const [r, g, b] = [px[k * 3], px[k * 3 + 1], px[k * 3 + 2]];
      const near = Math.hypot(r - mean[0], g - mean[1], b - mean[2]) < 34;
      return !(near || 0.3 * r + 0.59 * g + 0.11 * b < 22);
    };
    // Flood in from the border through the wall. The spotlight brightens the wallpaper unevenly, so the flood also
    // follows gentle steps from one wall pixel to the next (but never far from the wall's colour, nor into gilt).
    const dist = (k: number, j: number) => Math.hypot(px[k * 3] - px[j * 3], px[k * 3 + 1] - px[j * 3 + 1], px[k * 3 + 2] - px[j * 3 + 2]);
    const fromMean = (k: number) => Math.hypot(px[k * 3] - mean[0], px[k * 3 + 1] - mean[1], px[k * 3 + 2] - mean[2]);
    const wall = new Uint8Array(W * H);
    const queue: [number, number][] = [];
    for (let x = 0; x < W; x++) queue.push([x, -1], [(H - 1) * W + x, -1]);
    for (let y = 0; y < H; y++) queue.push([y * W, -1], [y * W + W - 1, -1]);
    while (queue.length) {
      const [k, from] = queue.pop()!;
      if (wall[k]) continue;
      const golden = px[k * 3] - px[k * 3 + 2] > 42; // gilt runs much redder than blue; the wallpapers do not
      const wallish = !golden && (!gilt(k) || (from >= 0 && dist(k, from) < 11 && fromMean(k) < 80));
      if (!wallish) continue;
      const x = k % W, y = (k / W) | 0;
      if (x >= open.l && x < open.r && y >= open.t && y < open.b) continue; // never into the opening
      wall[k] = 1;
      if (x > 0) queue.push([k - 1, k]);
      if (x < W - 1) queue.push([k + 1, k]);
      if (y > 0) queue.push([k - W, k]);
      if (y < H - 1) queue.push([k + W, k]);
    }
    const alpha = Buffer.alloc(W * H);
    for (let k = 0; k < W * H; k++) alpha[k] = wall[k] ? 0 : 255;
    const soft = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer(); // a 1px feather (blur widens one channel to three)
    const rgba = Buffer.alloc(W * H * 4);
    for (let k = 0; k < W * H; k++) {
      rgba[k * 4] = px[k * 3];
      rgba[k * 4 + 1] = px[k * 3 + 1];
      rgba[k * 4 + 2] = px[k * 3 + 2];
      rgba[k * 4 + 3] = soft[k];
    }
    const slug = inWing[i].slug;
    await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(`public/rooms/frames/${slug}.webp`);
    console.log("frame", slug, W, H);
  }
}
