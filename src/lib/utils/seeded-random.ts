/**
 * @lib/utils/seeded-random.ts — Deterministic pseudo-random hash
 *
 * Port of
 * Returns a value in [0, 1). The hash is GLSL-portable so the same
 * expression can be reused in vertex/fragment shaders when an
 * off-CPU source of randomness is needed.
 */

export function seededUnit(index: number, salt: number = 0): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
