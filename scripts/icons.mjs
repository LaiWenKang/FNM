import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// ═══ RASTERISE THE ICONS ══════════════════════════════════════════════════
//
//   npm run icons
//
// Run this after touching any icon SVG. test/icon.test.ts fails if you don't:
// the lockfile records the hash of every source, so a PNG left behind by an
// edited SVG is caught rather than shipped.
//
// PNGs are not a belt-and-braces extra here, they are the only thing that
// works. iOS Safari does not render SVG for home-screen icons, and it reads
// `apple-touch-icon` rather than the manifest — so an all-SVG icon set means
// an iPhone shows whatever `rel="icon"` happens to point at, upscaled. That is
// exactly what shipped: a 32px favicon blown up to 180.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");

/** flatten: iOS applies its own corner mask and refuses to composite — any
    transparency in the source renders as BLACK. Full-bleed tiles must be
    opaque. The favicon keeps its alpha, because its rounded corners are part
    of the drawing rather than an artefact. */
const JOBS = [
  { src: "icon.svg", out: "apple-touch-icon.png", size: 180, flatten: true },
  { src: "icon.svg", out: "icon-192.png", size: 192, flatten: true },
  { src: "icon.svg", out: "icon-512.png", size: 512, flatten: true },
  { src: "icon-maskable.svg", out: "icon-maskable-512.png", size: 512, flatten: true },
  { src: "favicon.svg", out: "favicon-96.png", size: 96, flatten: false },
];

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

const lock = {};
for (const { src, out, size, flatten } of JOBS) {
  const source = readFileSync(join(PUB, src));
  // density 1200 rasterises the 512-unit viewBox far above the target and lets
  // the resize downsample, which keeps the curves clean at 96px.
  let img = sharp(source, { density: 1200 }).resize(size, size, { fit: "cover" });
  if (flatten) img = img.flatten({ background: "#FF6A2A" });
  await img.png({ compressionLevel: 9 }).toFile(join(PUB, out));
  lock[src] = sha(source);
  console.log(`${out.padEnd(24)} ${size}x${size}  ${flatten ? "opaque" : "alpha"}`);
}

writeFileSync(join(PUB, "icons.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log("\nicons.lock.json written — sources pinned.");
