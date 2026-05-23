/**
 * Shared control scaling — density, motion, intensity (each 0–1).
 */

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** Density → node/particle count (8 at low → 40 at high). */
export function densityToCount(density, min = 8, max = 40) {
  const d = clamp01(density);
  return Math.round(min + d * (max - min));
}

/** Slice items to a density-scaled count. */
export function sliceByDensity(items, density, min = 5) {
  if (!items?.length) return [];
  const count = Math.max(min, densityToCount(density, min, Math.max(min, items.length)));
  return items.slice(0, Math.min(count, items.length));
}

/** Normalise slider value (0–100) to 0–1. */
export function sliderToUnit(value) {
  return clamp01(Number(value) / 100);
}
