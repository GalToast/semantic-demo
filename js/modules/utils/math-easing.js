/**
 * math-easing.js
 *
 * Pure mathematical operations, clamp logic, and animation easing curves.
 */

export function parseFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function quadraticBezierComponent(a, b, c, t) {
    const inverse = 1 - t;
    return inverse * inverse * a + 2 * inverse * t * b + t * t * c;
}

export function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
}

export function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
