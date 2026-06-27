/**
 * @lib/utils/timer-utils.ts — Central registry for application-wide timeouts and intervals
 *
 * Port of
 * Keeps background tasks flushable during state transitions.
 */

import {
  requestAnimationFrame,
  cancelAnimationFrame
} from '@lib/utils/environment';

interface TrackedTimer {
  id: number;
  isInterval: boolean;
}

const registry = new Map<string, TrackedTimer>();

export function registerTimer(key: string, timerId: number, isInterval: boolean = false): void {
  if (registry.has(key)) {
    clearTimer(key);
  }
  registry.set(key, { id: timerId, isInterval });
}

export function clearTimer(key: string): void {
  const timer = registry.get(key);
  if (!timer) return;

  if (timer.isInterval) {
    clearInterval(timer.id);
  } else {
    clearTimeout(timer.id);
  }
  registry.delete(key);
}

export function clearAllTimers(): void {
  for (const key of Array.from(registry.keys())) {
    clearTimer(key);
  }
}

export function setTrackedTimeout(key: string, fn: () => void, delay: number): number {
  const id = window.setTimeout(() => {
    registry.delete(key);
    fn();
  }, delay);
  registerTimer(key, id, false);
  return id;
}

export function setTrackedInterval(key: string, fn: () => void, delay: number): number {
  const id = window.setInterval(fn, delay);
  registerTimer(key, id, true);
  return id;
}

export function debounceRAF<T extends (...args: unknown[]) => void>(fn: T): T {
  let rafId: number | null = null;
  const debounced = (...args: unknown[]) => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    // eslint-disable-next-line no-restricted-syntax -- animation loop helper (intentional RAF call)
    rafId = requestAnimationFrame(() => {
      rafId = null;
      fn(...args);
    });
  };
  return debounced as T;
}
