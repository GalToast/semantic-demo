import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installGestureMonitor } from '@lib/orchestration/wait-for-gesture'

/**
 * Vitest regression coverage for src/lib/orchestration/wait-for-gesture.ts
 *
 * Gesture-driven init gate: listens for first pointer/touch engagement and
 * fires a one-shot callback. Visibility-change fallback covers kiosk displays.
 * Automated browser sessions (Playwright) auto-fire via setTimeout(handleReady, 0).
 */

const GESTURE_EVENTS = ['pointerdown', 'wheel', 'touchstart', 'mousemove'] as const

describe('wait-for-gesture — ling regression (oz-big-pickle)', () => {
    let visState: string

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false })
        vi.clearAllMocks()

        // Spy on addEventListener / removeEventListener for window and document
        vi.spyOn(window, 'addEventListener')
        vi.spyOn(window, 'removeEventListener')
        vi.spyOn(document, 'addEventListener')
        vi.spyOn(document, 'removeEventListener')

        // Spy on setTimeout to capture cooldown arguments
        vi.spyOn(globalThis, 'setTimeout')

        // Reset global flags
        delete (window as any).__PLAYWRIGHT__
        Object.defineProperty(navigator, 'webdriver', {
            value: false, configurable: true, writable: true,
        })

        // Reset body dataset
        if (document.body?.dataset?.renderKind) {
            delete document.body.dataset.renderKind
        }

        // Control document.visibilityState via getter
        visState = 'visible'
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => visState,
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        if (document.body?.dataset?.renderKind) {
            delete document.body.dataset.renderKind
        }
        delete (window as any).__PLAYWRIGHT__
    })

    // ── 1. installGestureMonitor — basic listener registration ──────────────

    describe('installGestureMonitor — listener registration', () => {
        it('returns a function (teardown)', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })
            expect(typeof teardown).toBe('function')
            teardown()
        })

        it('registers all 4 gesture listeners on window with { passive: true }', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            for (const evt of GESTURE_EVENTS) {
                const calls = (window.addEventListener as any).mock.calls.filter(
                    (c: any[]) => c[0] === evt
                )
                expect(calls.length).toBeGreaterThanOrEqual(1)
                const lastCall = calls[calls.length - 1]
                const opts = lastCall[2]
                if (typeof opts === 'object' && opts !== null) {
                    expect((opts as any).passive).toBe(true)
                }
            }
            teardown()
        })

        it('registers a visibilitychange listener on document', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            const calls = (document.addEventListener as any).mock.calls.filter(
                (c: any[]) => c[0] === 'visibilitychange'
            )
            expect(calls.length).toBeGreaterThanOrEqual(1)
            teardown()
        })
    })

    // ── 2. handleReady — gating logic ───────────────────────────────────────

    describe('handleReady — gating logic', () => {
        it('fires onReady exactly once after multiple gesture events', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            window.dispatchEvent(new Event('pointerdown'))
            window.dispatchEvent(new Event('wheel'))
            window.dispatchEvent(new Event('touchstart'))
            window.dispatchEvent(new Event('mousemove'))
            window.dispatchEvent(new Event('pointerdown'))

            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })

        it('skips fire when document.body.dataset.renderKind is "placeholder2d"', () => {
            document.body.dataset.renderKind = 'placeholder2d'
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            window.dispatchEvent(new Event('pointerdown'))
            expect(onReady).not.toHaveBeenCalled()
            teardown()
        })

        it('fires when dataset.renderKind is NOT placeholder2d', () => {
            document.body.dataset.renderKind = 'webgl'
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            window.dispatchEvent(new Event('pointerdown'))
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })

        it('skips fire when event target is inside .splash[role="dialog"]', () => {
            // Create a mock element whose closest('.splash[role="dialog"]') returns truthy
            const mockTarget = document.createElement('div')
            const origClosest = mockTarget.closest.bind(mockTarget)
            mockTarget.closest = ((selector: string) => {
                if (selector === '.splash[role="dialog"]') return mockTarget
                return origClosest(selector)
            }) as any

            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            // Capture the handler registered on window for pointerdown
            const addCalls = (window.addEventListener as any).mock.calls
            const pointerdownCall = addCalls.find((c: any[]) => c[0] === 'pointerdown')
            const handler = pointerdownCall![1] as (e: Event) => void

            // Create a synthetic event with our mock target
            const event = new Event('pointerdown')
            Object.defineProperty(event, 'target', { value: mockTarget, configurable: true })

            handler(event)
            expect(onReady).not.toHaveBeenCalled()
            teardown()
        })

        it('fires when event target is NOT inside the splash gate (closest returns null)', () => {
            const mockTarget = document.createElement('div')
            // closest returns null by default in jsdom for unmatched selectors

            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            const addCalls = (window.addEventListener as any).mock.calls
            const pointerdownCall = addCalls.find((c: any[]) => c[0] === 'pointerdown')
            const handler = pointerdownCall![1] as (e: Event) => void

            const event = new Event('pointerdown')
            Object.defineProperty(event, 'target', { value: mockTarget, configurable: true })

            handler(event)
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })

        it('fires handleReady with no event arg via visibilitychange hidden→visible path', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            // Transition to hidden
            visState = 'hidden'
            document.dispatchEvent(new Event('visibilitychange'))
            expect(onReady).not.toHaveBeenCalled()

            // Transition back to visible — this calls handleReady() with no event
            visState = 'visible'
            document.dispatchEvent(new Event('visibilitychange'))
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })
    })

    // ── 3. onReady cooldown / auto-teardown ─────────────────────────────────

    describe('onReady cooldown / auto-teardown', () => {
        it('schedules setTimeout with default 200ms cooldown after firing', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            window.dispatchEvent(new Event('pointerdown'))
            expect(onReady).toHaveBeenCalledTimes(1)

            // Check that setTimeout was called with 200
            const timerCalls = (globalThis.setTimeout as any).mock.calls
            const cooldownCall = timerCalls.find((c: any[]) => c[1] === 200)
            expect(cooldownCall).toBeDefined()
            teardown()
        })

        it('disposes listeners after cooldown elapses', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            window.dispatchEvent(new Event('pointerdown'))

            // Clear removeEventListener mocks to get a clean count
            ;(window.removeEventListener as any).mockClear()

            // Advance past the 200ms cooldown
            vi.advanceTimersByTime(250)

            // The registry.timer setTimeout fires → disposeAll() → removeEventListener called
            expect(window.removeEventListener).toHaveBeenCalled()
            // Verify at least gesture events were removed
            const removedTypes = (window.removeEventListener as any).mock.calls.map((c: any[]) => c[0])
            for (const evt of GESTURE_EVENTS) {
                expect(removedTypes).toContain(evt)
            }
            teardown()
        })

        it('uses custom cooldownMs when provided', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady, cooldownMs: 1000 })

            window.dispatchEvent(new Event('pointerdown'))

            // Check that setTimeout was called with 1000
            const timerCalls = (globalThis.setTimeout as any).mock.calls
            const cooldownCall = timerCalls.find((c: any[]) => c[1] === 1000)
            expect(cooldownCall).toBeDefined()
            teardown()
        })
    })

    // ── 4. onVisibilityChange fallback ──────────────────────────────────────

    describe('onVisibilityChange fallback', () => {
        it('does NOT fire onReady on initial load when visibilityState is "visible"', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            // Initial state is visible — no fire without a hidden→visible transition
            expect(onReady).not.toHaveBeenCalled()
            teardown()
        })

        it('sets wasHidden=true on "hidden" without firing onReady', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            visState = 'hidden'
            document.dispatchEvent(new Event('visibilitychange'))
            expect(onReady).not.toHaveBeenCalled()
            teardown()
        })

        it('fires onReady on transition from hidden → visible', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            visState = 'hidden'
            document.dispatchEvent(new Event('visibilitychange'))

            visState = 'visible'
            document.dispatchEvent(new Event('visibilitychange'))
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })

        it('does NOT double-fire onReady for subsequent visibility events', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            // hidden → visible: first fire
            visState = 'hidden'
            document.dispatchEvent(new Event('visibilitychange'))
            visState = 'visible'
            document.dispatchEvent(new Event('visibilitychange'))
            expect(onReady).toHaveBeenCalledTimes(1)

            // Another hidden → visible cycle
            visState = 'hidden'
            document.dispatchEvent(new Event('visibilitychange'))
            visState = 'visible'
            document.dispatchEvent(new Event('visibilitychange'))
            // Still only 1 — idempotent
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })
    })

    // ── 5. Playwright / test auto-fire ──────────────────────────────────────

    describe('Playwright / automated browser auto-fire', () => {
        it('auto-fires when window.__PLAYWRIGHT__ is truthy before install', () => {
            // 682b3e82: auto-fire requires the ?contract-boot=1 opt-in.
            window.history.replaceState(null, '', '/?contract-boot=1')
            ;(window as any).__PLAYWRIGHT__ = true
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            // setTimeout(handleReady, 0) was scheduled — advance past it
            vi.advanceTimersByTime(1)
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })

        it('auto-fires when navigator.webdriver is true before install', () => {
            window.history.replaceState(null, '', '/?contract-boot=1')
            Object.defineProperty(navigator, 'webdriver', {
                value: true,
                configurable: true,
                writable: true,
            })
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            vi.advanceTimersByTime(1)
            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })

        it('does NOT auto-fire when both flags are false', () => {
            delete (window as any).__PLAYWRIGHT__
            Object.defineProperty(navigator, 'webdriver', {
                value: false,
                configurable: true,
                writable: true,
            })
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            vi.advanceTimersByTime(1)
            expect(onReady).not.toHaveBeenCalled()
            teardown()
        })
    })

    // ── 6. Teardown ─────────────────────────────────────────────────────────

    describe('teardown', () => {
        it('removes gesture listeners and document listener', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            teardown()

            // Assert removeEventListener was called
            expect(window.removeEventListener).toHaveBeenCalled()

            // Check at least one gesture event type was removed
            const removedWindowTypes = (window.removeEventListener as any).mock.calls.map((c: any[]) => c[0])
            const gestureRemoved = GESTURE_EVENTS.some((evt) => removedWindowTypes.includes(evt))
            expect(gestureRemoved).toBe(true)

            // Check visibilitychange was removed from document
            const removedDocTypes = (document.removeEventListener as any).mock.calls.map((c: any[]) => c[0])
            expect(removedDocTypes).toContain('visibilitychange')
        })

        it('does NOT throw when called before any gesture fires', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            expect(() => teardown()).not.toThrow()
        })

        it('does NOT throw when called twice', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            expect(() => {
                teardown()
                teardown()
            }).not.toThrow()
        })
    })

    // ── 7. Bonus: gate-check via non-Element target ─────────────────────────

    describe('gate-check — non-Element target fires normally', () => {
        it('dispatches gesture with Window target (non-Element) — onReady fires', () => {
            const onReady = vi.fn()
            const teardown = installGestureMonitor({ onReady })

            const event = new Event('pointerdown')
            Object.defineProperty(event, 'target', { value: window, configurable: true })

            // Capture and invoke the registered handler
            const addCalls = (window.addEventListener as any).mock.calls
            const call = addCalls.find((c: any[]) => c[0] === 'pointerdown')
            const handler = call![1] as (e: Event) => void
            handler(event)

            expect(onReady).toHaveBeenCalledTimes(1)
            teardown()
        })
    })
})
