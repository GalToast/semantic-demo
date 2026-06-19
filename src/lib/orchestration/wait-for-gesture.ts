/**
 * @lib/orchestration/wait-for-gesture.ts — Gesture-driven init gate (W6-T1)
 *
 * Listens for the first user gesture (pointer, keyboard, wheel, touch)
 * and fires a one-shot callback. A visibility-change fallback covers
 * kiosk-style displays where no physical gesture ever fires.
 *
 * Usage:
 *   const teardown = installGestureMonitor({ onReady: signalReady });
 *   // …later: teardown(); // if you need to clean up
 *
 * @module
 */

export interface GestureMonitorOpts {
  /** Called exactly once when a qualifying gesture or visibility event fires. */
  onReady: () => void;
  /** Debounce window in ms after the first gesture (default: 200). */
  cooldownMs?: number;
}

const DEFAULT_COOLDOWN = 200;

/** Window-level events that signal user intent. */
const GESTURE_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'mousemove',
];

/**
 * Install the gesture monitor on window.
 *
 * Returns a teardown function that removes all listeners.
 */
export function installGestureMonitor(opts: GestureMonitorOpts): () => void {
  const cooldown = opts.cooldownMs ?? DEFAULT_COOLDOWN;
  let fired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function handleReady(): void {
    if (fired) return;
    fired = true;
    opts.onReady();
    // Safety: remove all listeners after the cooldown even if teardown wasn't called.
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(cleanup, cooldown);
  }

  const listeners: Array<{
    target: EventTarget;
    type: string;
    handler: EventListener;
  }> = [];

  function listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (ev: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    const wrapped = handler as unknown as EventListener;
    target.addEventListener(type, wrapped, opts);
    listeners.push({ target, type, handler: wrapped });
  }

  // ── Gesture listeners ────────────────────────────────────────────────────

  for (const evt of GESTURE_EVENTS) {
    listen(window, evt, () => handleReady(), { passive: true });
  }

  // ── Visibility fallback (kiosk / no-gesture scenario) ───────────────────

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      handleReady();
    }
  }
  listen(document as unknown as Window, 'visibilitychange' as any, onVisibilityChange);

  // ── Cleanup ──────────────────────────────────────────────────────────────

  function cleanup(): void {
    for (const l of listeners) {
      l.target.removeEventListener(l.type, l.handler);
    }
    listeners.length = 0;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return cleanup;
}
