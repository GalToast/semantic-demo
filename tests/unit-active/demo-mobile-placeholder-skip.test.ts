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
 *
 * Fallback-hint coverage (BS-B#5 gap-fill): the skip must NOT silently drop
 * the user with zero guidance — DemoChoreography.svelte schedules
 * showFallbackHint() (a 'Getting started' toast) at FIVE sites, two of which
 * are on the placeholder path (onMount offerHintWhenReady + the attemptStart
 * pre-start backstop). The hint is the observable contract of the skip, so
 * these tests mount the REAL component and assert on the toast store surface:
 *
 *   5. placeholder2d + not force → the fallback hint toast appears (both the
 *      onMount auto path and the replay-driven attemptStart path), and the
 *      10-phase tour NEVER starts (isDemoActive() stays false).
 *   6. webgl (real mobile browser entering 3D) → the tour starts, the hint
 *      does NOT appear.
 *   7. force (?demo=force, the debug path) on placeholder2d → BOTH the skip
 *      AND the hint are bypassed: the tour starts, no hint toast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { get } from 'svelte/store'
import DemoChoreography from '../../src/components/DemoChoreography.svelte'
import {
    shouldRunDemo,
    isPlaceholderSurface,
    isDemoActive,
    cancelAllDemoTimers,
    DEMO_START_DELAY_MS
} from '../../src/lib/stores/demo.svelte.ts'
import { clearToastQueue, toastStore } from '../../src/lib/stores/toast.svelte'
import { sceneReady } from '../../src/lib/stores/scene-ready.svelte'

// The component-mount cases below drive attemptStart(), which reads the
// business corpus via getBusinessRecords() (@lib/data-store). The real store
// never hydrates under the unit runner, so seed a synthetic corpus >= the
// MOCK_CORPUS_MIN=100 guard (DemoChoreography.svelte) with a valid
// SHOWCASE_POOL node at index 50 (name >= 3 chars, not disqualified) —
// otherwise the webgl/force cases would take the empty-corpus retry path
// instead of the tour path under test. Surface mirrors engine-lifecycle.test.ts.
vi.mock('@lib/data-store', async () => {
    const { writable } = await import('svelte/store')
    const records = Array.from({ length: 120 }, (_, i) => ({
        id: `rec-${i}`,
        lead_id: String(i),
        name: i === 50 ? 'Showcase Business' : `Business ${i}`,
        status: 'active'
    }))
    return {
        isDataReady: writable(true),
        businessRecords: writable(records),
        getBusinessRecords: vi.fn(() => records),
        getIsDataReady: vi.fn(() => true),
        positionBuffer: writable(new Float32Array(0)),
        clustersBuffer: writable(new Float32Array(0)),
        leadEnrichment: writable({}),
        pointIndexByLeadId: writable(new Map()),
        semanticNeighborMap: writable(new Map()),
        dataLoadState: writable('ready'),
        graphicsModeStore: writable('webgl'),
        loadingPhaseStore: writable('done'),
        setDataLoadError: vi.fn(),
        setLoadingPhase: vi.fn(),
        initData: vi.fn(),
        setGraphicsMode: vi.fn(),
        setSemanticThreadData: vi.fn(),
        setSemanticThreadFailure: vi.fn(),
        getPointIndexByLeadId: vi.fn(() => 0)
    }
})

/** Component-local delay before the fallback hint toast (DemoChoreography.svelte). */
const FALLBACK_HINT_DELAY_MS = 2500
/** Component-local forced-start delay (?demo=force debug path). */
const FORCED_START_DELAY_MS = 800
/** requestReplay's scene-ready poll interval before attemptStart(). */
const REPLAY_POLL_MS = 300

describe('demo mobile-placeholder skip (BS-B#5)', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        delete document.body.dataset.renderKind
        history.pushState(null, '', '/')
        sceneReady.resetSceneReady()
        clearToastQueue()
        cancelAllDemoTimers()
    })

    afterEach(() => {
        delete document.body.dataset.renderKind
        localStorage.clear()
        sessionStorage.clear()
        sceneReady.resetSceneReady()
        clearToastQueue()
        console.log('PROBE afterEach post-clearToast title=', JSON.stringify(get(toastStore).title), 'active=', get(toastStore).active)
        cancelAllDemoTimers()
        vi.useRealTimers()
        cleanup()
        console.log('PROBE afterEach post-cleanup title=', JSON.stringify(get(toastStore).title), 'active=', get(toastStore).active)
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

describe('demo mobile-placeholder fallback hint (BS-B#5 gap-fill)', () => {
    // All four cases mount the REAL DemoChoreography (fake timers) and read the
    // observable surfaces attemptStart/showFallbackHint update: the toast store
    // (title 'Getting started') and isDemoActive() (the 10-phase tour guard).
    // signalSceneReady() before mount takes every scene-ready poll branch
    // immediately, so no test depends on the 10s SCENE_READY_TIMEOUT_MS path.

    it('placeholder2d auto path: the skip schedules the fallback hint, never the tour', () => {
        document.body.dataset.renderKind = 'placeholder2d'
        vi.useFakeTimers()
        sceneReady.signalSceneReady()
        render(DemoChoreography, { props: { force: false } })
        // onMount suppress branch: offerHintWhenReady → showFallbackHint after
        // FALLBACK_HINT_DELAY_MS. The tour must never claim the guard.
        expect(isDemoActive()).toBe(false)
        vi.advanceTimersByTime(FALLBACK_HINT_DELAY_MS)
        const s = get(toastStore)
        expect(s.active).toBe(true)
        expect(s.title).toBe('Getting started')
        expect(s.copy).toContain('Search for a business type above')
        expect(isDemoActive()).toBe(false)
    })

    it('placeholder2d replay path: attemptStart schedules the fallback hint (BS-B#5 pre-start backstop)', () => {
        document.body.dataset.renderKind = 'placeholder2d'
        vi.useFakeTimers()
        sceneReady.signalSceneReady()
        render(DemoChoreography, { props: { force: false } })
        // Keyboard-help "Replay tour" bypasses shouldRunDemo() — this is the
        // start path the attemptStart placeholder gate exists to backstop.
        // requestReplay() cancels the onMount hint timer, then polls scene
        // readiness (300ms) and calls attemptStart(), which hits the
        // placeholder branch and schedules the hint at +2500ms.
        document.dispatchEvent(new CustomEvent('demo-replay-requested'))
        vi.advanceTimersByTime(REPLAY_POLL_MS)
        expect(isDemoActive()).toBe(false)
        vi.advanceTimersByTime(FALLBACK_HINT_DELAY_MS)
        const s = get(toastStore)
        expect(s.active).toBe(true)
        expect(s.title).toBe('Getting started')
        expect(isDemoActive()).toBe(false)
    })

    it('webgl surface: real mobile 3D still gets the tour, NOT the fallback hint', () => {
        document.body.dataset.renderKind = 'webgl'
        console.log('PROBE-WEBGL pre-mount title=', JSON.stringify(get(toastStore).title), 'active=', get(toastStore).active)
        vi.useFakeTimers()
        sceneReady.signalSceneReady()
        render(DemoChoreography, { props: { force: false } })
        console.log('PROBE-WEBGL post-mount title=', JSON.stringify(get(toastStore).title), 'active=', get(toastStore).active, 'shouldRunDemo=', shouldRunDemo(), 'isPlaceholder=', isPlaceholderSurface())
        // startWhenReady → attemptStart after DEMO_START_DELAY_MS: corpus is
        // seeded above, so the tour claims the start guard (phase OVERVIEW).
        vi.advanceTimersByTime(DEMO_START_DELAY_MS)
        console.log('PROBE-WEBGL after start title=', JSON.stringify(get(toastStore).title), 'active=', get(toastStore).active, 'isDemoActive=', isDemoActive(), 'eligible from doc')
        expect(isDemoActive()).toBe(true)
        // The placeholder gate would fire the hint at attemptStart+2500 — on
        // webgl it must stay silent the whole window.
        vi.advanceTimersByTime(FALLBACK_HINT_DELAY_MS)
        console.log('PROBE-WEBGL after hint window title=', JSON.stringify(get(toastStore).title), 'copy=', JSON.stringify(get(toastStore).copy), 'next=', JSON.stringify(get(toastStore).nextTitle), 'active=', get(toastStore).active)
        const s = get(toastStore)
        expect(s.active).toBe(false)
        expect(s.title).toBe('')
        expect(isDemoActive()).toBe(true)
    })

    it('?demo=force on placeholder2d bypasses BOTH the skip and the hint (debug path unchanged)', () => {
        document.body.dataset.renderKind = 'placeholder2d'
        vi.useFakeTimers()
        sceneReady.signalSceneReady()
        history.pushState(null, '', '/?demo=force')
        render(DemoChoreography, { props: { force: true } })
        // FORCED_START_DELAY_MS → attemptStart: force skips the placeholder
        // gate AND the corpus guard, so the tour starts over the placeholder.
        vi.advanceTimersByTime(FORCED_START_DELAY_MS)
        expect(isDemoActive()).toBe(true)
        // Hint window after start must stay silent — force bypasses the hint.
        vi.advanceTimersByTime(FALLBACK_HINT_DELAY_MS)
        console.log('PROBE title=', JSON.stringify(get(toastStore).title), 'copy=', JSON.stringify(get(toastStore).copy), 'next=', JSON.stringify(get(toastStore).nextTitle))
        const s = get(toastStore)
        expect(s.active).toBe(false)
        expect(s.title).toBe('')
        expect(isDemoActive()).toBe(true)
    })
})
