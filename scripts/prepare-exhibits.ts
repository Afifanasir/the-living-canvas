// Turns the raw scans in raw/ into the images the site serves.
//
// Per painting → public/exhibits/<slug>/
//   base.webp    display image (2400 px long edge)
//   hires.webp   the loupe's copy (full downloaded resolution)
//   depth.webp   made separately by scripts/depth-maps.ts (run it after this)
// Per artist → public/artists/<name>.webp (portrait, 1000 px tall)
import { mkdirSync, rmSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { exhibits } from "../content/gallery.ts";

for (const e of exhibits) {
  const src = `raw/exhibits/${e.slug}/master.jpg`;
  const out = `public/exhibits/${e.slug}`;
  mkdirSync(out, { recursive: true });
  await sharp(src).resize({ width: 2400, height: 2400, fit: "inside" }).webp({ quality: 84 }).toFile(`${out}/base.webp`);
  await sharp(src).webp({ quality: 80 }).toFile(`${out}/hires.webp`);
  console.log("prepared", e.slug);
}

// Portraits: raw/artists/<name>.jpg (Commons self-portraits, or images supplied by the project owner; see each .source.txt).
const crops: Record<string, { from: string; x: number; y: number; w: number; h: number }> = {};
mkdirSync("public/artists", { recursive: true });
for (const e of exhibits) {
  const name = e.portrait.replace("/artists/", "").replace(".webp", "");
  const crop = crops[name];
  let img = sharp(crop ? crop.from : `raw/artists/${name}.jpg`);
  if (crop) {
    const m = await img.metadata();
    img = img.extract({ left: Math.round(crop.x * m.width!), top: Math.round(crop.y * m.height!), width: Math.round(crop.w * m.width!), height: Math.round(crop.h * m.height!) });
  }
  await img.resize({ height: 1000 }).webp({ quality: 84 }).toFile(`public/artists/${name}.webp`);
  console.log("portrait", name);
}

// Remove exhibits that are no longer in the roster.
const keep = new Set(exhibits.map((e) => e.slug));
for (const dir of readdirSync("public/exhibits")) if (!keep.has(dir)) rmSync(`public/exhibits/${dir}`, { recursive: true });
const portraits = new Set(exhibits.map((e) => e.portrait.replace("/artists/", "")));
for (const file of readdirSync("public/artists")) if (!portraits.has(file)) rmSync(`public/artists/${file}`);
