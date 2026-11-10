// Makes a depth map for each painting (white = near, black = far) for the parallax shader in Painting.tsx.
// Nothing is cut out: every pixel is shifted by its own depth, so the painting can never tear.
// Runs locally with the open-source Depth Anything V2 Small model (raw/models, Apache-2.0). Free.
// Run: node scripts/depth-maps.ts [slug ...]
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { exhibits } from "../content/gallery.ts";

const session = await ort.InferenceSession.create("raw/models/depth-anything-v2-small.onnx");
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const only = process.argv.slice(2);

for (const e of exhibits.filter((x) => !only.length || only.includes(x.slug))) {
  const dir = `public/exhibits/${e.slug}`;
  const base = sharp(`${dir}/base.webp`).removeAlpha();
  const { width: W, height: H } = await base.metadata();
  // The model takes sides that are multiples of 14; keep the painting's shape at about 518 px on the long side.
  const k = 518 / Math.max(W!, H!);
  const w = Math.round((W! * k) / 14) * 14, h = Math.round((H! * k) / 14) * 14;
  const px = await base.clone().resize(w, h, { fit: "fill" }).raw().toBuffer();
  const input = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) input[c * w * h + i] = (px[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await session.run({ pixel_values: new ort.Tensor("float32", input, [1, 3, h, w]) });
  const d = out.predicted_depth.data as Float32Array;
  const [oh, ow] = out.predicted_depth.dims.slice(-2) as number[];
  // Normalise (ignoring the extreme 1% at each end so one bright spot can't flatten the rest).
  const sorted = Float32Array.from(d).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  const g = Buffer.alloc(ow * oh);
  for (let i = 0; i < ow * oh; i++) g[i] = Math.round(Math.min(1, Math.max(0, (d[i] - lo) / (hi - lo))) * 255);
  // A soft depth map keeps the shifting smooth: hard depth edges are what make 3D photos smear.
  await sharp(g, { raw: { width: ow, height: oh, channels: 1 } })
    .resize({ width: Math.round(1024 * (W! / Math.max(W!, H!))), height: Math.round(1024 * (H! / Math.max(W!, H!))), fit: "fill" })
    .blur(3)
    .extractChannel(0)
    .webp({ quality: 90 })
    .toFile(`${dir}/depth.webp`);
  console.log("depth", e.slug, `${ow}x${oh}`);
}
