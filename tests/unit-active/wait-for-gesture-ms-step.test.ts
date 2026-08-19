import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installGestureMonitor } from '@lib/orchestration/wait-for-gesture'
// ── helpers ──────────────────────────────────────────────────────────────
function spyWindowEvents() {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    return { addSpy, removeSpy }
}
function spyDocEvents() {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    return { addSpy, removeSpy }
}
let currentVisibilityState: string
function mockVisibilityState(initial: string) {
    currentVisibilityState = initial
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => currentVisibilityState
    })
}
function dispatchGesture(type: string, target?: EventTarget | null) {
    const evt = new Event(type)
    if (target !== undefined) {
        Object.defineProperty(evt, 'target', { value: target, configurable: true })
    }
    window.dispatchEvent(evt)
}
function makeSplashElement(): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('role', 'dialog')
    el.classList.add('splash')
    return el
}
// ── global beforeEach / afterEach ─────────────────────────────────────────
beforeEach(() => {
    vi.useFakeTimers()
    delete (window as any).__PLAYWRIGHT__
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false, writable: true })
    document.body.dataset.renderKind = ''
    mockVisibilityState('visible')
    vi.clearAllMocks()
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.dataset.renderKind = ''
    delete (window as any).__PLAYWRIGHT__
})
describe('installGestureMonitor — listener registration', () => {
    let { addSpy, removeSpy: _removeSpy } = spyWindowEvents()
    let { addSpy: docAddSpy } = spyDocEvents()
    beforeEach(() => {
        ;({ addSpy, removeSpy: _removeSpy } = spyWindowEvents())
        ;({ addSpy: docAddSpy } = spyDocEvents())
    })
    it('registers 4 gesture listeners on window with { passive: true }', () => {
                installGestureMonitor({ onReady: vi.fn() as () => void })
        expect(addSpy).toHaveBeenCalledTimes(4)
        for (const evt of ['pointerdown', 'wheel', 'touchstart', 'mousemove']) {
            expect(addSpy).toHaveBeenCalledWith(evt, expect.any(Function), { passive: true })
        }
    })
    it('registers 1 visibilitychange listener on document', () => {
                installGestureMonitor({ onReady: vi.fn() as () => void })
        expect(docAddSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })
    it('returns a function (teardown)', () => {
        const teardown = installGestureMonitor({ onReady: vi.fn() as () => void })
        expect(typeof teardown).toBe('function')
    })
})
describe('handleReady — gating logic', () => {
        let onReady: () => void
    let teardown: () => void
    beforeEach(() => {
        onReady = vi.fn() as () => void
    })
    afterEach(() => {
        if (teardown) teardown()
    })
    it('calls onReady exactly once across 5 rapid pointerdown events', () => {
                teardown = installGestureMonitor({ onReady })
        for (let i = 0; i < 5; i++) dispatchGesture('pointerdown')
        expect(onReady).toHaveBeenCalledTimes(1)
    })
    it('does NOT call onReady when dataset.renderKind === "placeholder2d"', () => {
        document.body.dataset.renderKind = 'placeholder2d'
                teardown = installGestureMonitor({ onReady })
        dispatchGesture('pointerdown')
        expect(onReady).not.toHaveBeenCalled()
    })
    it('does NOT call onReady when event target is inside .splash[role="dialog"]', () => {
                teardown = installGestureMonitor({ onReady })
        const splash = makeSplashElement()
        dispatchGesture('pointerdown', splash)
        expect(onReady).not.toHaveBeenCalled()
    })
    it('calls onReady once when closest(".splash[role="dialog"]") returns null', () => {
                teardown = installGestureMonitor({ onReady })
        dispatchGesture('pointerdown')
        expect(onReady).toHaveBeenCalledTimes(1)
    })
    it('calls onReady when handleReady is triggered via hidden→visible (no event arg)', () => {
                teardown = installGestureMonitor({ onReady })
        mockVisibilityState('hidden')
        document.dispatchEvent(new Event('visibilitychange')) // hidden → sets wasHidden
        currentVisibilityState = 'visible'
        document.dispatchEvent(new Event('visibilitychange')) // visible → fires onReady
        expect(onReady).toHaveBeenCalledTimes(1)
    })
})
describe('onReady cooldown / auto-teardown', () => {
        let onReady: () => void
    let setTimeoutSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        onReady = vi.fn() as () => void
        setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    })
    afterEach(() => {
        setTimeoutSpy.mockRestore()
    })
    it('schedules setTimeout(dispose, 200) with default cooldown after onReady fires', () => {
                installGestureMonitor({ onReady })
        dispatchGesture('pointerdown')
        expect(onReady).toHaveBeenCalledTimes(1)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 200)
    })
    it('registry.disposeAll() fires after advancing timers past 200 ms', () => {
        const { addSpy, removeSpy } = spyWindowEvents()
        const { addSpy: docAddSpy, removeSpy: docRemoveSpy } = spyDocEvents()
                installGestureMonitor({ onReady })
        dispatchGesture('pointerdown')
        vi.advanceTimersByTime(201)
        // removeEventListener calls should now be present for all listeners
        expect(removeSpy).toHaveBeenCalled()
        expect(docRemoveSpy).toHaveBeenCalled()
    })
    it('schedules setTimeout with custom cooldownMs value', () => {
                installGestureMonitor({ onReady, cooldownMs: 1000 })
        dispatchGesture('pointerdown')
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })
    it('disposeAll fires after advancing timers past custom cooldownMs (1000)', () => {
        const { removeSpy } = spyWindowEvents()
        const { removeSpy: docRemoveSpy } = spyDocEvents()
                installGestureMonitor({ onReady, cooldownMs: 1000 })
        dispatchGesture('pointerdown')
        vi.advanceTimersByTime(1001)
        expect(removeSpy).toHaveBeenCalled()
        expect(docRemoveSpy).toHaveBeenCalled()
    })
    it('second gesture after cooldown expiry does NOT call onReady again', () => {
                installGestureMonitor({ onReady })
        dispatchGesture('pointerdown')
        expect(onReady).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(201)
        dispatchGesture('wheel')
        expect(onReady).toHaveBeenCalledTimes(1)
    })
})
describe('onVisibilityChange fallback', () => {
        let onReady: () => void
    let teardown: () => void
    beforeEach(() => {
        onReady = vi.fn() as () => void
    })
    afterEach(() => {
        if (teardown) teardown()
    })
    it('does NOT call onReady on initial load when visibilityState is already "visible"', () => {
                teardown = installGestureMonitor({ onReady })
        window.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).not.toHaveBeenCalled()
    })
    it('sets wasHidden and does NOT call onReady when visibilityState becomes "hidden"', () => {
                teardown = installGestureMonitor({ onReady })
        mockVisibilityState('hidden')
        window.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).not.toHaveBeenCalled()
    })
    it('calls onReady when transitioning from hidden to visible (wasHidden was set)', () => {
                teardown = installGestureMonitor({ onReady })
        mockVisibilityState('hidden')
        document.dispatchEvent(new Event('visibilitychange')) // sets wasHidden
        currentVisibilityState = 'visible'
        document.dispatchEvent(new Event('visibilitychange')) // hidden→visible
        expect(onReady).toHaveBeenCalledTimes(1)
    })
    it('does NOT call onReady again after first visibility fire (idempotent)', () => {
                teardown = installGestureMonitor({ onReady })
        mockVisibilityState('hidden')
        document.dispatchEvent(new Event('visibilitychange'))
        currentVisibilityState = 'visible'
        document.dispatchEvent(new Event('visibilitychange')) // fires
        expect(onReady).toHaveBeenCalledTimes(1)
        // additional hidden→visible cycles
        currentVisibilityState = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        currentVisibilityState = 'visible'
        document.dispatchEvent(new Event('visibilitychange'))
        expect(onReady).toHaveBeenCalledTimes(1)
    })
})
describe('Playwright / test auto-fire', () => {
        let onReady: () => void
    let setTimeoutSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        onReady = vi.fn() as () => void
        setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    })
    afterEach(() => {
        setTimeoutSpy.mockRestore()
    })
    it('schedules setTimeout(handleReady, 0) when window.__PLAYWRIGHT__ is true before install', () => {
        ;(window as any).__PLAYWRIGHT__ = true
                installGestureMonitor({ onReady })
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0)
    })
    it('advancing timers by 1 ms after __PLAYWRIGHT__ install fires onReady', () => {
        ;(window as any).__PLAYWRIGHT__ = true
                installGestureMonitor({ onReady })
        vi.advanceTimersByTime(1)
        expect(onReady).toHaveBeenCalledTimes(1)
    })
    it('schedules setTimeout(handleReady, 0) when navigator.webdriver is true', () => {
        Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
                installGestureMonitor({ onReady })
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0)
    })
    it('advancing timers by 1 ms after webdriver install fires onReady', () => {
        Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
                installGestureMonitor({ onReady })
        vi.advanceTimersByTime(1)
        expect(onReady).toHaveBeenCalledTimes(1)
    })
    it('does NOT schedule setTimeout(handleReady, 0) when neither flag is set', () => {
                installGestureMonitor({ onReady })
        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 0)
    })
})
describe('Teardown', () => {
        let onReady: () => void
    let teardown: () => void
    beforeEach(() => {
        onReady = vi.fn() as () => void
    })
    afterEach(() => {
        if (teardown) teardown()
    })
    it('removeEventListener called for all 4 gesture listeners + visibilitychange', () => {
        const { addSpy, removeSpy } = spyWindowEvents()
        const { addSpy: docAddSpy, removeSpy: docRemoveSpy } = spyDocEvents()
                teardown = installGestureMonitor({ onReady })
        expect(addSpy).toHaveBeenCalledTimes(4)
        expect(docAddSpy).toHaveBeenCalledTimes(1)
        teardown()
        expect(removeSpy).toHaveBeenCalledTimes(4)
        // use type-based check — closure identity is not stable across spy boundaries
                expect(removeSpy.mock.calls.some((call) => (call[0] as string) === 'pointerdown')).toBe(true)
                expect(removeSpy.mock.calls.some((call) => (call[0] as string) === 'wheel')).toBe(true)
                expect(removeSpy.mock.calls.some((call) => (call[0] as string) === 'touchstart')).toBe(true)
                expect(removeSpy.mock.calls.some((call) => (call[0] as string) === 'mousemove')).toBe(true)
        expect(docRemoveSpy.mock.calls.some((call) => (call[0] as string) === 'visibilitychange')).toBe(true)
    })
    it('teardown before any gesture fired does NOT throw', () => {
                teardown = installGestureMonitor({ onReady })
        expect(() => teardown()).not.toThrow()
    })
    it('teardown called twice does NOT throw', () => {
                teardown = installGestureMonitor({ onReady })
        expect(() => {
            teardown()
            teardown()
        }).not.toThrow()
    })
    it('gesture with non-Element target (window) fires onReady — gate returns false', () => {
                teardown = installGestureMonitor({ onReady })
        dispatchGesture('pointerdown', window) // window is EventTarget, not Element
        expect(onReady).toHaveBeenCalledTimes(1)
    })
    it('gesture with Element whose closest(".splash[role="dialog"]") is truthy does NOT fire', () => {
                teardown = installGestureMonitor({ onReady })
        const splash = makeSplashElement()
        dispatchGesture('pointerdown', splash)
        expect(onReady).not.toHaveBeenCalled()
    })
})
