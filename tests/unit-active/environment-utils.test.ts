import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    getViewportSize,
    isMobileViewport,
    isCompactFocusStage,
    prefersReducedMotion,
    getReducedMotionMQL,
    hasCoarsePointer,
    isCompactLandscape,
    isUltraCompactPortrait,
    getDevicePixelRatio,
    getPanelSurface,
    isMapSummarySurface,
    isSemanticDiveSurface,
    matchMedia,
    getLocation,
    getCurrentUrl,
    requestAnimationFrame,
    cancelAnimationFrame
} from '../../src/lib/utils/environment'

describe('environment utils', () => {
    it('getViewportSize returns window dimensions in jsdom', () => {
        const size = getViewportSize()
        expect(size.width).toBe(window.innerWidth)
        expect(size.height).toBe(window.innerHeight)
    })

    it('isMobileViewport reflects window width', () => {
        expect(typeof isMobileViewport()).toBe('boolean')
    })

    it('isCompactFocusStage mirrors isMobileViewport', () => {
        expect(isCompactFocusStage()).toBe(isMobileViewport())
    })

    it('prefersReducedMotion returns boolean', () => {
        expect(typeof prefersReducedMotion()).toBe('boolean')
    })

    it('hasCoarsePointer returns boolean', () => {
        expect(typeof hasCoarsePointer()).toBe('boolean')
    })

    it('isCompactLandscape checks width and height', () => {
        const result = isCompactLandscape()
        expect(typeof result).toBe('boolean')
    })

    it('isUltraCompactPortrait checks dimensions', () => {
        const result = isUltraCompactPortrait()
        expect(typeof result).toBe('boolean')
    })

    it('getDevicePixelRatio returns a positive number', () => {
        expect(getDevicePixelRatio()).toBeGreaterThan(0)
    })

    it('getPanelSurface reads body data attribute', () => {
        const original = document.body.dataset.panelSurface
        document.body.dataset.panelSurface = 'test-surface'
        expect(getPanelSurface()).toBe('test-surface')
        document.body.dataset.panelSurface = original ?? ''
    })

    it('isMapSummarySurface returns true for correct surface', () => {
        const original = document.body.dataset.panelSurface
        document.body.dataset.panelSurface = 'map-focus-search'
        expect(isMapSummarySurface()).toBe(true)
        document.body.dataset.panelSurface = 'other'
        expect(isMapSummarySurface()).toBe(false)
        document.body.dataset.panelSurface = original ?? ''
    })

    it('isSemanticDiveSurface returns true for correct surface', () => {
        const original = document.body.dataset.panelSurface
        document.body.dataset.panelSurface = 'semantic-dive'
        expect(isSemanticDiveSurface()).toBe(true)
        document.body.dataset.panelSurface = 'other'
        expect(isSemanticDiveSurface()).toBe(false)
        document.body.dataset.panelSurface = original ?? ''
    })

    it('matchMedia returns a MediaQueryList for valid query', () => {
        const mql = matchMedia('(min-width: 1px)')
        expect(mql).not.toBeNull()
        expect(typeof mql?.matches).toBe('boolean')
    })

    it('getLocation returns window.location', () => {
        expect(getLocation()).toBe(window.location)
    })

    it('getCurrentUrl returns a string', () => {
        expect(typeof getCurrentUrl()).toBe('string')
    })

    it('requestAnimationFrame schedules a callback', () => {
        const fn = vi.fn()
        const id = requestAnimationFrame(fn)
        expect(id).toBeGreaterThan(0)
        cancelAnimationFrame(id)
    })

    it('cancelAnimationFrame is callable', () => {
        // No error thrown
        cancelAnimationFrame(999)
    })
})

// ── Reduced-motion MQL caching ────────────────────────────────────────────────

describe('prefersReducedMotion caching', () => {
    const QUERY = '(prefers-reduced-motion: reduce)'
    let originalMatchMedia: typeof window.matchMedia

    beforeEach(() => {
        originalMatchMedia = window.matchMedia
    })

    afterEach(() => {
        window.matchMedia = originalMatchMedia
    })

    it('reuses one MediaQueryList and registers one change listener', () => {
        const addEventListener = vi.fn()
        const created = vi.fn().mockReturnValue({
            matches: false,
            media: QUERY,
            addEventListener,
            removeEventListener: vi.fn()
        })
        window.matchMedia = created as any

        const first = getReducedMotionMQL()
        const second = getReducedMotionMQL()

        expect(first).not.toBeNull()
        expect(first).toBe(second)
        expect(first?.media).toBe(QUERY)
        expect(created).toHaveBeenCalledTimes(1)
        expect(created).toHaveBeenCalledWith(QUERY)
        expect(addEventListener).toHaveBeenCalledTimes(1)
        expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('returns false when matchMedia is unavailable', () => {
        window.matchMedia = undefined as any

        expect(getReducedMotionMQL()).toBeNull()
        expect(prefersReducedMotion()).toBe(false)
    })

    it('caches the value and updates it from the MQL change listener', () => {
        let onChange: ((event: MediaQueryListEvent) => void) | undefined
        const addEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
            onChange = listener
        })
        const created = vi.fn().mockReturnValue({
            matches: false,
            media: QUERY,
            addEventListener,
            removeEventListener: vi.fn()
        })
        window.matchMedia = created as any

        expect(prefersReducedMotion()).toBe(false)
        expect(prefersReducedMotion()).toBe(false)
        expect(created).toHaveBeenCalledTimes(1)

        onChange?.({ matches: true } as MediaQueryListEvent)
        expect(prefersReducedMotion()).toBe(true)
        expect(created).toHaveBeenCalledTimes(1)
    })

    it('rebuilds the cache when window.matchMedia is replaced', () => {
        const first = vi.fn().mockReturnValue({
            matches: false,
            media: QUERY,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        })
        window.matchMedia = first as any
        expect(prefersReducedMotion()).toBe(false)

        const second = vi.fn().mockReturnValue({
            matches: true,
            media: QUERY,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        })
        window.matchMedia = second as any

        expect(prefersReducedMotion()).toBe(true)
        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledWith(QUERY)
    })
})
