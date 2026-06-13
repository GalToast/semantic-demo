/**
 * seeded-random.ts
 *
 * Deterministic pseudo-random hash returning a value in [0, 1).
 *
 * Used by the 3D scene to drive per-node seeded variation (spore scales,
 * colors, glow pulse phases) without per-frame allocation. The hash is
 * GLSL-portable so the same expression can be reused in vertex/fragment
 * shaders when an off-CPU source of randomness is needed.
 */
export function seededUnit(index: number, salt: number = 0): number {
    const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}
