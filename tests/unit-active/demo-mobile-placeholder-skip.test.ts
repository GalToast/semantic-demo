/**
 * demo-mobile-placeholder-skip.test.ts — BS-B#5 (Wave-10) regression test.
 *
 * The 10-phase demo tour narrates a WebGL camera journey and must NOT start
 * while the static 2D placeholder is the active surface (data-render-kind=
 * "placeholder2d") — the choreography cannot render there, so the tour would
 * degrade into ~10s of disembodied captions over the placeholder.
 *
 * Contract under test:
 *   1. isPlaceholderSurface() reflects the body data-render-kind attribute
 *      (unset / SSR / unit default → NOT placeholder → permissive).
 *   2. shouldRunDemo() returns false on the placeholder2d surface.
 *   3. shouldRunDemo() behavior is UNCHANGED on webgl (desktop) and when the
 *      attribute is unset (unit/SSR default) — desktop journey tests keep
 *      their demo contract.
 *   4. ?demo=force still bypasses the placeholder gate (debug escape hatch,
 *      mirroring the existing force-wins-first ordering in shouldRunDemo).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { shouldRunDemo, isPlaceholderSurface } from '../../src/lib/stores/demo.svelte.ts'

describe('demo mobile-placeholder skip (BS-B#5)', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        delete document.body.dataset.renderKind
    })

    afterEach(() => {
        delete document.body.dataset.renderKind
        localStorage.clear()
        sessionStorage.clear()
    })

    it('isPlaceholderSurface() is false when data-render-kind is unset (SSR/unit default)', () => {
        expect(isPlaceholderSurface()).toBe(false)
    })

    it('isPlaceholderSurface() is true when body data-render-kind says placeholder2d', () => {
        document.body.dataset.renderKind = 'placeholder2d'
        expect(isPlaceholderSurface()).toBe(true)
    })

    it('isPlaceholderSurface() is false when body data-render-kind says webgl (3D surface)', () => {
        document.body.dataset.renderKind = 'webgl'
        expect(isPlaceholderSurface()).toBe(false)
    })

    it('shouldRunDemo() skips on the placeholder2d surface (no 3D tour over the static placeholder)', () => {
        document.body.dataset.renderKind = 'placeholder2d'
        expect(shouldRunDemo()).toBe(false)
    })

    it('shouldRunDemo() still returns true on the webgl surface (desktop behavior unchanged)', () => {
        document.body.dataset.renderKind = 'webgl'
        expect(shouldRunDemo()).toBe(true)
    })

    it('shouldRunDemo() still returns true when the attr is unset (unit/SSR default)', () => {
        expect(shouldRunDemo()).toBe(true)
    })

    it('?demo=force bypasses the placeholder gate (debug escape hatch)', () => {
        document.body.dataset.renderKind = 'placeholder2d'
        history.pushState(null, '', '/?demo=force')
        expect(shouldRunDemo()).toBe(true)
        history.pushState(null, '', '/')
    })
})
