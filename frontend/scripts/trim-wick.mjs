// Regenerates Wick's launcher sprites from the owner's 1254×1254 originals in public/wick/.
// Both knights are trimmed to their opaque pixels, placed on one canvas height with the feet on the bottom edge,
// and scaled by the same factor, so a theme switch reads as an armour change at the same size.
// Run from frontend/: node scripts/trim-wick.mjs
import sharp from "sharp";

const OUT_HEIGHT = 216; // 3× the 72 CSS px launcher size
const names = ["wick-dark", "wick-light"];

const boxes = await Promise.all(
  names.map(async (name) => {
    const { data, info } = await sharp(`public/wick/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > 16) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
    if (x1 < 0) throw new Error(`${name}: no opaque pixels`);
    return { name, left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }),
);

const canvas = Math.max(...boxes.map((b) => b.height));
const scale = OUT_HEIGHT / canvas;
for (const b of boxes) {
  const cropped = await sharp(`public/wick/${b.name}.png`).extract({ left: b.left, top: b.top, width: b.width, height: b.height }).png().toBuffer();
  const width = Math.round(b.width * scale);
  await sharp(cropped)
    .extend({ top: canvas - b.height, background: { r: 0, g: 0, b: 0, alpha: 0 } }) // feet on the shared baseline
    .resize({ width, height: OUT_HEIGHT, fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
    .toFile(`public/wick/${b.name}-${OUT_HEIGHT}.png`);
  console.log(`${b.name}-${OUT_HEIGHT}.png ${width}×${OUT_HEIGHT} (source box ${b.width}×${b.height})`);
}
