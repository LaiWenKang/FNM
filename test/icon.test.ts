import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ═══ THE ICON IS GEOMETRY, SO TEST IT AS GEOMETRY ════════════════════════
//
// Two cuts of this icon shipped looking wrong, and both times the fault was
// measurable: 5.6% margin above the ears against 17.7% at the flanks, and an
// optical centre 25px north of the tile's. Nobody catches that by eye at
// 512px — it only becomes obvious at 40px on a home screen, next to icons
// that got it right.
//
// So the numbers in the SVG's own comment are checked here rather than
// asserted there. If someone nudges the transform, this fails.

const ROOT = join(__dirname, "..", "public");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** `translate(a b) scale(s) translate(-60 -66)` → a mapper from art to tile. */
function placement(svg: string) {
  const m = svg.match(
    /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\) translate\(-60 -66\)/,
  );
  if (!m) throw new Error("no artwork transform found");
  const [tx, ty, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return {
    scale: s,
    x: (ax: number) => tx + s * (ax - 60),
    y: (ay: number) => ty + s * (ay - 66),
  };
}

/* The artwork's true bounding box, in the 120-unit drawing space.
   HORIZONTALLY it is exactly the head circle — cx 60, r 38 — because the ears
   (x 31..89) sit inside it. VERTICALLY it runs from the ear apex to the bottom
   of that same circle. The apex is a bezier whose control points bottom out at
   y=17.5, so the curve itself turns at roughly y=20; that is the one soft
   number here, and it is soft by ~1px at 512. */
const ART = { left: 22, right: 98, top: 20, bottom: 104 };
const TILE = 512;

describe("the app icon is sized, not eyeballed", () => {
  for (const file of ["icon.svg", "icon-512.svg"]) {
    it(`${file} sits centred with even margins`, () => {
      const p = placement(read(file));
      const left = p.x(ART.left);
      const right = TILE - p.x(ART.right);
      const top = p.y(ART.top);
      const bottom = TILE - p.y(ART.bottom);

      // Symmetry first: the previous cut failed here, not on any absolute size.
      expect(Math.abs(left - right)).toBeLessThan(1);
      expect(Math.abs(top - bottom)).toBeLessThan(3);

      // And it has to actually FILL the tile. Between 11% and 18% keeps the
      // face large enough to read at 40px without crowding the rounded corner.
      for (const margin of [left, right, top, bottom]) {
        expect(margin / TILE).toBeGreaterThan(0.11);
        expect(margin / TILE).toBeLessThan(0.18);
      }
    });
  }

  it("keeps the two full-size icons identical, so they cannot drift apart", () => {
    expect(read("icon.svg")).toBe(read("icon-512.svg"));
  });

  it("pulls the maskable in far enough for a circular crop", () => {
    // Android may crop to a circle inscribed in the middle 80%. Anything
    // outside that safe zone is not guaranteed to survive, and an ear is
    // exactly the thing that gets guillotined.
    const p = placement(read("icon-maskable.svg"));
    const r = Math.hypot(
      Math.max(TILE / 2 - p.x(ART.left), p.x(ART.right) - TILE / 2),
      Math.max(TILE / 2 - p.y(ART.top), p.y(ART.bottom) - TILE / 2),
    );
    expect(r).toBeLessThanOrEqual((TILE * 0.8) / 2);
  });

  it("declares a 512 square viewBox everywhere", () => {
    for (const f of ["icon.svg", "icon-512.svg", "icon-maskable.svg"]) {
      expect(read(f)).toContain('viewBox="0 0 512 512"');
    }
  });
});

describe("the marks that make it FNM's husky and not a generic dog", () => {
  it("cuts the blaze at exactly 60° — the same angle as the radar needle", () => {
    const m = read("icon.svg").match(/d="M60 30 L([\d.]+) ([\d.]+)/);
    expect(m).toBeTruthy();
    const halfAngle = (Math.atan2(Number(m![1]) - 60, Number(m![2]) - 30) * 180) / Math.PI;
    expect(halfAngle).toBeCloseTo(30, 1);
  });

  it("clears the cap above the eyes", () => {
    // A cap that dips onto the eyes turns every expression into a scowl. The
    // cap's lower edge passes through (46,54); the left eye's top is at
    // cy - ry. This margin is the difference between friendly and furious.
    const svg = read("icon.svg");
    const eye = svg.match(/<ellipse cx="46" cy="([\d.]+)" rx="[\d.]+" ry="([\d.]+)"/);
    expect(eye).toBeTruthy();
    const eyeTop = Number(eye![1]) - Number(eye![2]);
    expect(eyeTop).toBeGreaterThan(54);
  });

  it("keeps the ears dark so they read as one mass with the cap", () => {
    // Cream ears were the rabbit problem: two pale spikes taller than the
    // skull, which is a rabbit's silhouette and not a husky's.
    const svg = read("icon.svg");
    const ears = svg.slice(svg.indexOf("<g fill="), svg.indexOf("<circle"));
    expect(ears).toContain('fill="#20141B"');
    expect(ears).not.toContain("#FFF6EC");
  });
});
