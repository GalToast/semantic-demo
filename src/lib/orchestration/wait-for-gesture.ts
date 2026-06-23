/**
 * @lib/orchestration/wait-for-gesture.ts — Gesture-driven init gate (W6-T1)
 *
 * Listens for the first pointer/touch engagement and fires a one-shot
 * callback. A visibility-change fallback covers kiosk-style displays
 * where no physical gesture ever fires.
 *
 * Keyboard input is deliberately excluded: the Splash gate exposes a
 * primary CTA ("Explore") as the keyboard path into the engine. Treating
 * ambient key navigation (Tab/Shift+Tab/Arrows) as a launch gesture would
 * dismiss the gate a keyboard user is trying to read and steal focus into
 * the 3D scene before they opt in. See Splash.svelte's modal focus mgmt.
 *
 * Usage:
 *   const teardown = installGestureMonitor({ onReady: signalReady });
 *   // …later: teardown(); // if you need to clean up
 *
 * @module
 */

export interface GestureMonitorOpts {
    /** Called exactly once when a qualifying gesture or visibility event fires. */
    onReady: () => void
    /** Debounce window in ms after the first gesture (default: 200). */
    cooldownMs?: number
}

const DEFAULT_COOLDOWN = 200

/** Window-level events that signal user intent. */
const GESTURE_EVENTS: Array<keyof WindowEventMap> = ['pointerdown', 'wheel', 'touchstart', 'mousemove']

/**
 * Whether an event originated on the active Splash gate (the fullscreen
 * modal shown until the user opts in). Pointer/touch/mouse activity on the
 * gate itself is the user operating the gate's UI (typing a search, pressing
 * the Explore CTA), not gesturing to launch the 3D engine. Those interactions
 * drive readiness through the gate's own handlers, so the gesture monitor
 * ignores them. Synthetic events dispatched directly on `window` (e.g. test
 * harnesses) have a non-Element target and are NOT treated as gate-internal.
 */
function isInsideGestureGate(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('.splash[role="dialog"]'))
}

function isAutomatedBrowserSession(): boolean {
    return Boolean(
        typeof window !== 'undefined' &&
        ((window as any).__PLAYWRIGHT__ || (typeof navigator !== 'undefined' && navigator.webdriver))
    )
}

/**
 * Install the gesture monitor on window.
 *
 * Returns a teardown function that removes all listeners.
 */
export function installGestureMonitor(opts: GestureMonitorOpts): () => void {
    const cooldown = opts.cooldownMs ?? DEFAULT_COOLDOWN
    let fired = false
    let wasHidden = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function handleReady(event?: Event): void {
        if (fired) return
        // W45-A: Skip auto-fire when the 2D placeholder is shown; the CTA is the
        // exclusive gate for entering the 3D scene. On desktop (webgl) this is a
        // no-op because the render kind is not 'placeholder2d'.
        if (typeof document !== 'undefined' && document.body?.dataset?.renderKind === 'placeholder2d') {
            return
        }
        // The Splash gate is a fullscreen modal with explicit entry actions
        // (search submit / Explore CTA). Pointer/touch/mouse events landing on
        // the gate are the user operating its UI, not gesturing to launch —
        // let the gate's own handlers drive readiness. Visibility/test fallbacks
        // call handleReady() with no event and are unaffected.
        if (event && isInsideGestureGate(event.target)) {
            return
        }
        fired = true
        opts.onReady()
        // Safety: remove all listeners after the cooldown even if teardown wasn't called.
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(cleanup, cooldown)
    }

    const listeners: Array<{
        target: EventTarget
        type: string
        handler: EventListener
    }> = []

    function listen<K extends keyof WindowEventMap>(
        target: Window,
        type: K,
        handler: (ev: WindowEventMap[K]) => void,
        opts?: AddEventListenerOptions
    ): void {
        const wrapped = handler as unknown as EventListener
        target.addEventListener(type, wrapped, opts)
        listeners.push({ target, type, handler: wrapped })
    }

    // ── Gesture listeners ────────────────────────────────────────────────────

    for (const evt of GESTURE_EVENTS) {
        listen(window, evt, (e: Event) => handleReady(e), { passive: true })
    }

    // ── Visibility fallback (kiosk / no-gesture scenario) ───────────────────
    // Only fire on transition from hidden → visible, not on initial load.
    function onVisibilityChange(): void {
        if (document.visibilityState === 'hidden') {
            wasHidden = true
            return
        }
        if (wasHidden && document.visibilityState === 'visible') {
            handleReady()
        }
    }
    listen(document as unknown as Window, 'visibilitychange' as any, onVisibilityChange)

    // Playwright test auto-fire: skip gesture wait in automated tests so
    // canvas mounts without requiring every test to simulate a gesture.
    if (isAutomatedBrowserSession()) {
        setTimeout(() => handleReady(), 0)
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────

    function cleanup(): void {
        for (const l of listeners) {
            l.target.removeEventListener(l.type, l.handler)
        }
        listeners.length = 0
        if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
        }
    }

    return cleanup
}
