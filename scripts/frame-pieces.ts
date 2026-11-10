// Builds the paintings' frame from the very frame the artists hang in on the gallery wall (the Baroque room's
// left-hand frame), so the two always match:
//   1. cut it from raw/rooms/baroque.png and enlarge it 4x with the open-source Swin2SR upscaler (raw/models);
//   2. clear the opening (and the dark rim of the room's empty canvas just inside it), and soften the bits of wall
//      showing between the carvings on the outer edge.
// The result, public/frames/frame-source.webp, is used as a 9-slice border (components/CarvedFrame.tsx): the corners
// stay exactly as they are, and on longer sides the run of sprig, shell cartouche, sprig repeats, as on a real long
// frame. Writes lib/frame-geometry.json. Run: node scripts/frame-pieces.ts
import { writeFileSync } from "node:fs";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

const OUT = "public/frames";
const OPENING = [0.43, 0.249, 0.136, 0.284]; // the frame's opening in the room, fractions (components/WingWalk.tsx)
const PAD = { x: 40, y: 42 }; // the carved border around it, room px

// 1. Cut and enlarge.
const [ox, oy, ow, oh] = OPENING;
const left = Math.round(ox * 1536) - PAD.x, top = Math.round(oy * 864) - PAD.y;
let w = Math.round(ow * 1536) + 2 * PAD.x, h = Math.round(oh * 864) + 2 * PAD.y;
w -= w % 8;
h -= h % 8;
const px = await sharp("raw/rooms/baroque.png").extract({ left, top, width: w, height: h }).removeAlpha().raw().toBuffer();
const input = new Float32Array(3 * w * h);
for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) input[c * w * h + i] = px[i * 3 + c] / 255;
const session = await ort.InferenceSession.create("raw/models/swin2sr-x4.onnx");
const rec = (await session.run({ pixel_values: new ort.Tensor("float32", input, [1, 3, h, w]) })).reconstruction;
const [H, W] = rec.dims.slice(-2) as number[];
const d = rec.data as Float32Array;

// 2. RGBA: opening cleared; along the outer edge, dark wall between the carvings fades out, gold stays.
const IN = { l: PAD.x * 4, t: PAD.y * 4, r: W - PAD.x * 4, b: H - PAD.y * 4 };
const EDGE = 26; // px of outer edge where wall can show through
const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const [r, g, b] = [0, 1, 2].map((c) => Math.max(0, Math.min(255, Math.round(d[c * W * H + i] * 255))));
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    let a = 255;
    if (x >= IN.l && x < IN.r && y >= IN.t && y < IN.b) a = 0; // the opening
    // just outside it, the room's dark empty canvas still shows: clear what is dark, keep the gilt lip
    // (distance to the opening's rectangle itself, so only a thin band around it, never stripes through the carving)
    const lip = Math.max(IN.l - x, x - IN.r, IN.t - y, y - IN.b);
    if (a && lip < 22 && 0.3 * r + 0.59 * g + 0.11 * b < 48) a = 0;
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge < EDGE) {
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      const gold = Math.min(1, Math.max(0, (lum - 55) / 45)); // bright gilt vs dark damask
      a = Math.round(255 * Math.min(1, Math.max(gold, edge / EDGE)));
    }
    rgba[i * 4 + 3] = a;
  }
const source = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
await sharp(source).webp({ quality: 92, alphaQuality: 95 }).toFile(`${OUT}/frame-source.webp`);

// The corners: how far along each side the corner carving reaches (the 9-slice keeps these exactly).
const CORNER = { x: Math.round(0.2 * W), y: Math.round(0.17 * H) };
// The loupe's bezel: one run of the top rail between the corners (sprig, shell cartouche, sprig), which the loupe
// bends into a ring (components/Loupe.tsx).
await sharp(source).extract({ left: CORNER.x, top: 0, width: W - 2 * CORNER.x, height: IN.t }).webp({ quality: 92, alphaQuality: 95 }).toFile(`${OUT}/loupe-rail.webp`);
writeFileSync("lib/frame-geometry.json", JSON.stringify({ W, H, rail: { t: IN.t, r: W - IN.r, b: H - IN.b, l: IN.l }, corner: CORNER }, null, 1));
console.log("frame", W, H, IN, CORNER);
