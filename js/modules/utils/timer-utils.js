/**
 * Central registry for application-wide timeouts and intervals.
 * Keeps background tasks flushable during state transitions.
 */

import { requestAnimationFrame, cancelAnimationFrame } from '../environment.js';

const registry = new Map();

export function registerTimer(key, timerId, isInterval = false) {
    if (registry.has(key)) {
        clearTimer(key);
    }
    registry.set(key, { id: timerId, isInterval });
}

export function clearTimer(key) {
    const timer = registry.get(key);
    if (!timer) return;

    if (timer.isInterval) {
        clearInterval(timer.id);
    } else {
        clearTimeout(timer.id);
    }
    registry.delete(key);
}

export function clearAllTimers() {
    for (const key of Array.from(registry.keys())) {
        clearTimer(key);
    }
}

export function setTrackedTimeout(key, fn, delay) {
    const id = setTimeout(() => {
        registry.delete(key);
        fn();
    }, delay);
    registerTimer(key, id, false);
    return id;
}

export function setTrackedInterval(key, fn, delay) {
    const id = setInterval(fn, delay);
    registerTimer(key, id, true);
    return id;
}

export function debounceRAF(fn) {
    let rafId = null;
    return (...args) => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            rafId = null;
            fn(...args);
        });
    };
}
