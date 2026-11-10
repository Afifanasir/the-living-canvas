// Builds the frame of the wall panels (the carved gilt moulding around dark wood that holds each wing's brass plate)
// from the Renaissance room itself, so the painting's plate in the exhibit rooms can hang in the very same frame.
// Cuts it from raw/rooms/renaissance.png, enlarges it 4x with Swin2SR (raw/models), and writes
// public/rooms/panel-frame.webp for use as a 9-slice border (corners kept, the beaded runs repeated, the wood filled).
// Run: node scripts/panel-frame.ts
import * as ort from "onnxruntime-node";
import sharp from "sharp";

// The moulding's outer edge in the 1536x864 room, measured from the image (the panel box is [0.105, 0.212, 0.147, 0.383]).
const [left, top] = [150, 173];
const [w, h] = [248, 352]; // a multiple of 8 for the upscaler, reaching just past the moulding on the right and bottom

const px = await sharp("raw/rooms/renaissance.png").extract({ left, top, width: w, height: h }).removeAlpha().raw().toBuffer();
const input = new Float32Array(3 * w * h);
for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) input[c * w * h + i] = px[i * 3 + c] / 255;
const session = await ort.InferenceSession.create("raw/models/swin2sr-x4.onnx");
const rec = (await session.run({ pixel_values: new ort.Tensor("float32", input, [1, 3, h, w]) })).reconstruction;
const [H, W] = rec.dims.slice(-2) as number[];
const d = rec.data as Float32Array;
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.max(0, Math.min(255, Math.round(d[c * W * H + i] * 255)));
// Trim to the moulding on all four sides (right and bottom edges measured at 395 and 523 in the room).
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
  .extract({ left: 0, top: 0, width: (396 - left) * 4, height: (524 - top) * 4 })
  .webp({ quality: 90 })
  .toFile("public/rooms/panel-frame.webp");
console.log("panel frame", (396 - left) * 4, "x", (524 - top) * 4);
