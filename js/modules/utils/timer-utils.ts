/**
 * timer-utils.ts
 *
 * Central registry for application-wide timeouts and intervals.
 * Ensures background tasks are cleanly flushed during state transitions
 * to prevent memory leaks and race conditions.
 */

import { requestAnimationFrame, cancelAnimationFrame } from '../environment.js';

/** Internal representation of a tracked timer. */
interface TrackedTimer {
    id: number;
    isInterval: boolean;
}

/** Central registry mapping unique keys to tracked timers. */
const _registry = new Map<string, TrackedTimer>();

/**
 * Register a timer for central tracking.
 * @param key - Unique identifier (e.g., 'view-prelude', 'toast-auto-hide')
 * @param timerId - Return value from setTimeout or setInterval
 * @param isInterval - True if id is from setInterval
 */
export function registerTimer(key: string, timerId: number, isInterval: boolean = false): void {
    if (_registry.has(key)) {
        clearTimer(key);
    }
    _registry.set(key, { id: timerId, isInterval });
}

/**
 * Clear a specific timer by key.
 */
export function clearTimer(key: string): void {
    const timer = _registry.get(key);
    if (!timer) return;

    if (timer.isInterval) {
        clearInterval(timer.id);
    } else {
        clearTimeout(timer.id);
    }
    _registry.delete(key);
}

/**
 * Clear all registered timers. Useful during global resets.
 */
export function clearAllTimers(): void {
    for (const key of _registry.keys()) {
        clearTimer(key);
    }
}

/**
 * Convenience wrapper for setTimeout that registers itself.
 */
export function setTrackedTimeout(key: string, fn: () => void, delay: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
        _registry.delete(key);
        fn();
    }, delay);
    registerTimer(key, id as unknown as number, false);
    return id;
}

/**
 * Convenience wrapper for setInterval that registers itself.
 */
export function setTrackedInterval(key: string, fn: () => void, delay: number): ReturnType<typeof setInterval> {
    const id = setInterval(fn, delay);
    registerTimer(key, id as unknown as number, true);
    return id;
}

/**
 * Debounce a function using requestAnimationFrame.
 * Ensures the function only runs once per animation frame,
 * using the latest provided arguments.
 *
 * @param fn - The function to debounce.
 * @returns The debounced function.
 */
export function debounceRAF<T extends (...args: any[]) => void>(fn: T): (...args: Parameters<T>) => void {
    let rafId: number | null = null;
    return (...args: Parameters<T>) => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            rafId = null;
            fn(...args);
        });
    };
}
