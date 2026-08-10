// focus-pocket-math.ts
// Pure geometry / easing utilities shared by every focus-pocket layout pass.
// No state, no Vec3, no appState — safe to import from any other module.

// === Pure geometry/easing utilities ===

export function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number(value) || 0))
}

export function easeOutQuint(t: number): number {
    return 1 - Math.pow(1 - t, 5)
}

export function seededUnit(...values: number[]): number {
    const seed = values.reduce((sum, value, index) => sum + (Number(value) || 0) * (index + 1) * 12.9898, 78.233)
    const x = Math.sin(seed) * 43758.5453
    return x - Math.floor(x)
}

export function safeUnitScore(value: unknown, fallback: number = 0): number {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.max(0, Math.min(1, numeric))
}
