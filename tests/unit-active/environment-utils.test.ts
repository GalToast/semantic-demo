import { describe, it, expect, vi } from 'vitest'
import {
    getViewportSize,
    isMobileViewport,
    isCompactFocusStage,
    prefersReducedMotion,
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
