import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installGestureMonitor, GestureMonitorOpts } from '../../src/lib/orchestration/wait-for-gesture'

const GESTURE_EVENTS = ['pointerdown', 'wheel', 'touchstart', 'mousemove'] as const
const DEFAULT_COOLDOWN = 200

function resetGlobals(): void {
    window.__PLAYWRIGHT__ = false
    try {
        Object.defineProperty(navigator, 'webdriver', {
            configurable: true,
            get: () => false
        })
    } catch {
        // not configurable in some environments; no-op
    }
    if (document.body?.dataset) {
        document.body.dataset.renderKind = ''
    }
    try {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible'
        })
    } catch {
        // already set or not configurable
    }
}

function createSplashElement(): HTMLDivElement {
    const el = document.createElement('div')
    el.setAttribute('role', 'dialog')
    el.classList.add('splash')
    document.body.appendChild(el)
    return el
}

describe('installGestureMonitor — basic listener registration', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('registers all 4 gesture listeners on window with passive:true', () => {
        const addSpy = vi.spyOn(window, 'addEventListener')
        installGestureMonitor({ onReady: vi.fn() })
        const captured = addSpy.mock.calls.filter(([type]) =>
            GESTURE_EVENTS.includes(type as (typeof GESTURE_EVENTS)[number])
        )
        expect(captured).toHaveLength(4)
        captured.forEach(([, , opts]) => {
            expect(opts).toEqual({ passive: true })
        })
    })

    it('registers 1 visibilitychange listener on document', () => {
        const docAddSpy = vi.spyOn(document, 'addEventListener')
        installGestureMonitor({ onReady: vi.fn() })
        const visCalls = docAddSpy.mock.calls.filter(([type]) => type === 'visibilitychange')
        expect(visCalls).toHaveLength(1)
    })

    it('returns a function teardown', () => {
        const teardown = installGestureMonitor({ onReady: vi.fn() })
        expect(typeof teardown).toBe('function')
    })
})

describe('handleReady — gating logic', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('fires onReady exactly once across 5 pointerdown events', () => {
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        for (let i = 0; i < 5; i++) {
            window.dispatchEvent(new Event('pointerdown' as any))
        }
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('skips when dataset.renderKind === "placeholder2d"', () => {
        const onReady = vi.fn()
        document.body.dataset.renderKind = 'placeholder2d'
        installGestureMonitor({ onReady })
        window.dispatchEvent(new Event('pointerdown' as any))
        expect(onReady).not.toHaveBeenCalled()
    })

    it('skips when event target is inside splash[role="dialog"]', () => {
        const onReady = vi.fn()
        const splashEl = createSplashElement()
        installGestureMonitor({ onReady })
        splashEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        expect(onReady).not.toHaveBeenCalled()
    })

    it('fires when event target is outside splash[role="dialog"]', () => {
        const onReady = vi.fn()
        createSplashElement()
        const outsideEl = document.createElement('div')
        outsideEl.classList.add('outside')
        document.body.appendChild(outsideEl)
        installGestureMonitor({ onReady })
        outsideEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('fires via visibility hidden->visible fallback (handleReady called with no event)', () => {
        const onReady = vi.fn()
        let current = 'visible'
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => current
        })
        installGestureMonitor({ onReady })
        // transition hidden -> visible
        current = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        current = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).toHaveBeenCalledTimes(1)
    })
})

describe('onReady cooldown / auto-teardown', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('schedules dispose after default 200ms cooldown', () => {
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        window.dispatchEvent(new Event('pointerdown' as any))
        const cooldownCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === DEFAULT_COOLDOWN)
        expect(cooldownCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('teardown fires removeEventListener after cooldown elapses', () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener')
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        window.dispatchEvent(new Event('pointerdown' as any))
        vi.advanceTimersByTime(DEFAULT_COOLDOWN + 1)
        expect(removeSpy).toHaveBeenCalled()
        // at least the 4 gesture listeners were removed
        const gestureTypes = removeSpy.mock.calls
            .filter(([type]) => GESTURE_EVENTS.includes(type as (typeof GESTURE_EVENTS)[number]))
            .map(([type]) => type)
        expect(gestureTypes).toHaveLength(4)
    })

    it('custom cooldownMs=1000 overrides default 200', () => {
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
        const onReady = vi.fn()
        installGestureMonitor({ onReady, cooldownMs: 1000 })
        window.dispatchEvent(new Event('pointerdown' as any))
        const customCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 1000)
        expect(customCalls.length).toBeGreaterThanOrEqual(1)
    })
})

describe('onVisibilityChange fallback', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('visible on initial load does NOT fire onReady', () => {
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).not.toHaveBeenCalled()
    })

    it('hidden sets wasHidden=true without firing onReady', () => {
        const onReady = vi.fn()
        let current = 'visible'
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => current
        })
        installGestureMonitor({ onReady })
        current = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).not.toHaveBeenCalled()
        // hidden state should not block a subsequent gesture
        window.dispatchEvent(new Event('pointerdown' as any))
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('hidden->visible transition fires handleReady (no event arg)', () => {
        const onReady = vi.fn()
        let current = 'visible'
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => current
        })
        installGestureMonitor({ onReady })
        current = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        current = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('subsequent visibility events after first fire do NOT double-call onReady', () => {
        const onReady = vi.fn()
        let current = 'visible'
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => current
        })
        installGestureMonitor({ onReady })
        // first fire via visibility fallback
        current = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        current = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).toHaveBeenCalledTimes(1)
        // second fallback cycle must be silent
        current = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        current = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).toHaveBeenCalledTimes(1)
    })
})

describe('Playwright/test auto-fire', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('window.__PLAYWRIGHT__ schedules auto-fire setTimeout with delay 0', () => {
        // 682b3e82 (2026-08-23): bare automated sessions no longer auto-fire;
        // the shortcut requires ?contract-boot=1 (F12 reconciliation).
        window.history.replaceState(null, '', '/?contract-boot=1')
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
        window.__PLAYWRIGHT__ = true
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        const autoCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 0)
        expect(autoCalls.length).toBeGreaterThanOrEqual(1)
        vi.advanceTimersByTime(1)
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('navigator.webdriver schedules auto-fire', () => {
        window.history.replaceState(null, '', '/?contract-boot=1')
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
        Object.defineProperty(navigator, 'webdriver', {
            configurable: true,
            get: () => true
        })
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        const autoCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 0)
        expect(autoCalls.length).toBeGreaterThanOrEqual(1)
        vi.advanceTimersByTime(1)
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('no auto-fire when flags are true but contract-boot param absent (682b3e82 gating)', () => {
        // Clear any ?contract-boot=1 leaked by an earlier test's replaceState.
        window.history.replaceState(null, '', '/')
        window.__PLAYWRIGHT__ = true
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        vi.advanceTimersByTime(50)
        expect(onReady).not.toHaveBeenCalled()
    })

    it('no auto-fire setTimeout scheduled when both flags are false', () => {
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        const autoCalls = setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 0)
        expect(autoCalls).toHaveLength(0)
        // no gesture fired, so onReady stays at 0
        expect(onReady).not.toHaveBeenCalled()
    })
})

describe('Teardown', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('teardown removes gesture listeners and document listener', () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener')
        const docRemoveSpy = vi.spyOn(document, 'removeEventListener')
        const onReady = vi.fn()
        const teardown = installGestureMonitor({ onReady })
        teardown()
        expect(removeSpy).toHaveBeenCalled()
        const gestureTypes = removeSpy.mock.calls
            .filter(([type]) => GESTURE_EVENTS.includes(type as (typeof GESTURE_EVENTS)[number]))
            .map(([type]) => type)
        expect(gestureTypes).toHaveLength(4)
        expect(docRemoveSpy).toHaveBeenCalled()
        expect(docRemoveSpy.mock.calls.some(([type]) => type === 'visibilitychange')).toBe(true)
    })

    it('teardown before any gesture does NOT throw', () => {
        const teardown = installGestureMonitor({ onReady: vi.fn() })
        expect(() => teardown()).not.toThrow()
    })

    it('teardown called twice does NOT throw', () => {
        const teardown = installGestureMonitor({ onReady: vi.fn() })
        expect(() => {
            teardown()
            teardown()
        }).not.toThrow()
    })
})

describe('Gate-check edge cases (public-API driven)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        resetGlobals()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        resetGlobals()
    })

    it('dispatches on non-Element target (window) → gate-check false → onReady fires', () => {
        const onReady = vi.fn()
        installGestureMonitor({ onReady })
        window.dispatchEvent(new Event('pointerdown' as any))
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('dispatches on Element inside splash[role="dialog"] → gate-check true → onReady NOT called', () => {
        const onReady = vi.fn()
        const splashEl = createSplashElement()
        installGestureMonitor({ onReady })
        splashEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        expect(onReady).not.toHaveBeenCalled()
    })
})
