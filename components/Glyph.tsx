// GLYPH — the renderer for the whole two-tone family.
//
// One component, three path slots, two grids. Pure presentational: no hooks, no
// state, server-safe, and nothing here needs a gid because there are no defs —
// the two tones are flat fills that inherit from CSS, which is exactly why they
// can be recoloured per theme, tinted for safer/brave, and animated. Emoji
// could do none of that.

import type { GlyphKey } from "@/lib/glyphs";
import { DISH_PATHS } from "@/components/glyphs/dishes";
import { MOOD_PATHS } from "@/components/glyphs/moods";
import { DIM_PATHS } from "@/components/glyphs/dims";

const GRID_32 = DISH_PATHS as Record<string, [string, string, string]>;
const GRID_24: Record<string, [string, string, string]> = { ...MOOD_PATHS, ...DIM_PATHS };

export interface GlyphProps {
  name: GlyphKey;
  /** Rendered edge length in px. Default 24. */
  size?: number;
  /**
   * Overrides --glyph-accent for this instance — the safer card takes the good
   * green, the brave card takes plum, so semantics travel with the drawing.
   */
  accent?: string;
  className?: string;
  /** Supply only when the glyph carries meaning alone; otherwise decorative. */
  label?: string;
}

export default function Glyph({ name, size = 24, accent, className, label }: GlyphProps) {
  const dish = GRID_32[name];
  const paths = dish ?? GRID_24[name];
  if (!paths) return null;
  const grid = dish ? 32 : 24;

  return (
    <svg
      viewBox={`0 0 ${grid} ${grid}`}
      width={size}
      height={size}
      className={`glyph${className ? ` ${className}` : ""}`}
      style={accent ? { ["--glyph-accent" as string]: accent } : undefined}
      focusable="false"
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      <path className="glyph-sil" d={paths[0]} fill="currentColor" />
      <path className="glyph-accent" d={paths[1]} fill="var(--glyph-accent, var(--accent))" />
      {/* the specular shares the glass's light source — top-left, always */}
      <path className="glyph-spec" d={paths[2]} fill="rgba(255,255,255,.2)" />
    </svg>
  );
}
