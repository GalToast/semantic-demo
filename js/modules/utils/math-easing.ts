/**
 * math-easing.ts
 *
 * Pure mathematical operations, clamp logic, and animation easing curves.
 */

export function parseFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function easeInOutSine(t: number): number {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function quadraticBezierComponent(a: number, b: number, c: number, t: number): number {
    const inverse = 1 - t;
    return inverse * inverse * a + 2 * inverse * t * b + t * t * c;
}

export function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeOutQuint(t: number): number {
    return 1 - Math.pow(1 - t, 5);
}

export function clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
