/**
 * trail-review-overlay-contract.test.ts — behavioral contract for the
 * trail-review overlay (showExploreTrailReview / hideExploreTrailReview)
 *
 * @vitest-environment jsdom
 *
 * CONVERTED 2026-08-08 from tests/trail-review-focus-contract.mjs (raw Node
 * script). The .mjs ran static source-inspection assertions (which passed),
 * then CRASHED at the runtime import of lifecycle.ts with
 * ERR_MODULE_NOT_FOUND for navigation.svelte — Node cannot resolve Vite's
 * `.svelte.ts` extension aliases — and exited 0 anyway: a silent false-green.
 * The behavioral half of that contract (R1–R5) NEVER executed. This suite
 * converts the same contract into real jsdom DOM assertions that actually
 * run under vitest's include pattern (tests/unit-active/**).
 *
 * Mock strategy (copied from a3-2-empty-state-renders.test.ts +
 * search-dispatch.test.ts + focus-trap-stack.test.ts — no new pattern):
 *   - vi.mock() every store module lifecycle.ts imports at module load
 *     (navigation/focus/search/journey stores, app state, event-bus,
 *     point-color, focus-trap-bindings, parity-attrs) with vi.hoisted refs,
 *     exactly like the sibling store tests — the module graph resolves
 *     without loading the full Svelte 5 snapshot machinery.
 *   - Stores are hand-rolled subscribe/set/update objects (search-dispatch
 *     pattern) so svelte/store.get() and searchStore.update() both work.
 *   - DOM is REAL jsdom (focus-trap-stack.test.ts pattern): the overlay is
 *     built as a real element on document.body and lifecycle.ts's DOM calls
 *     (getElementById / createElement / querySelector / classList / append /
 *     insertBefore / focus) run against it. document.addEventListener and
 *     document.removeEventListener are spied to assert the one-time Escape
 *     wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks (must be registered before lifecycle.ts is imported) ──────

const mocks = vi.hoisted(() => {
    function makeStore<T>(initial: T) {
        let value = initial
        const subscribers = new Set<(v: T) => void>()
        return {
            subscribe(run: (v: T) => void): () => void {
                subscribers.add(run)
                run(value)
                return () => subscribers.delete(run)
            },
            set(next: T): void {
                value = next
                subscribers.forEach((run) => run(value))
            },
            update(fn: (v: T) => T): void {
                this.set(fn(value))
            }
        }
    }

    return {
        navStore: makeStore<{ focusedIndex: number | null; mode: string }>({ focusedIndex: null, mode: 'idle' }),
        focusStore: makeStore<{ selectedBusiness: unknown }>({ selectedBusiness: null }),
        searchStore: makeStore<{ glowActive: boolean; summary: unknown }>({ glowActive: false, summary: null }),
        journeyStore: makeStore<{ trailDepth: number }>({ trailDepth: 0 }),
        // applyCompositionState writes into legacyState on hide (via
        // refreshCompositionState); provide the exact sub-shapes it touches.
        legacyState: {
            focusedNode: null as unknown,
            trailDepth: 0,
            semanticDiveMode: false,
            focusState: { selectedPoint: null },
            navState: { focusedIndex: null, mode: 'idle' }
        },
        registerOpenDialog: vi.fn(),
        unregisterOpenDialog: vi.fn(),
        publish: vi.fn(),
        clearSearchGlow: vi.fn(),
        applyPointFilterColors: vi.fn(),
        computeParityAttributes: vi.fn(() => ({})),
        applyParityAttributes: vi.fn(),
        updateNavState: vi.fn(),
        writeNavStateMirror: vi.fn(),
        switchView: vi.fn(),
        currentView: vi.fn(),
        setMyceliumMode: vi.fn(),
        setSemanticDiveMode: vi.fn(),
        resetFocus: vi.fn(),
        clearSearch: vi.fn(),
        setSearchStatus: vi.fn(),
        resetJourney: vi.fn(),
        setTrailDepth: vi.fn()
    }
})

// Mock keys match the a3-2-empty-state-renders.test.ts / search-dispatch
// proven set for lifecycle.ts's import graph.
vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: mocks.navStore,
    updateNavState: mocks.updateNavState,
    writeNavStateMirror: mocks.writeNavStateMirror,
    switchView: mocks.switchView,
    currentView: mocks.currentView,
    setMyceliumMode: mocks.setMyceliumMode
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    legacyState: mocks.legacyState
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    setSemanticDiveMode: mocks.setSemanticDiveMode,
    focusStore: mocks.focusStore,
    resetFocus: mocks.resetFocus
}))

vi.mock('@lib/stores/search.svelte', () => ({
    searchStore: mocks.searchStore,
    clearSearch: mocks.clearSearch,
    clearSearchGlow: mocks.clearSearchGlow,
    setSearchStatus: mocks.setSearchStatus
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    resetJourney: mocks.resetJourney,
    setTrailDepth: mocks.setTrailDepth,
    journeyStore: mocks.journeyStore
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: mocks.publish,
    EVENTS: { COMPOSITION_UPDATED: 'composition:updated' }
}))

vi.mock('@lib/journey/point-color', () => ({
    applyPointFilterColors: mocks.applyPointFilterColors
}))

vi.mock('@lib/utils/focus-trap-bindings', () => ({
    registerOpenDialog: mocks.registerOpenDialog,
    unregisterOpenDialog: mocks.unregisterOpenDialog
}))

vi.mock('@lib/orchestration/parity-attrs.svelte.ts', () => ({
    computeParityAttributes: mocks.computeParityAttributes,
    applyParityAttributes: mocks.applyParityAttributes
}))

// Import AFTER the mocks so lifecycle.ts sees the stubbed graph.
import { showExploreTrailReview, hideExploreTrailReview } from '@lib/stores/lifecycle'

// ── DOM fixtures ─────────────────────────────────────────────────────────────

const OVERLAY_ID = 'trail-review-overlay'
let overlay: HTMLElement
let previouslyFocused: HTMLButtonElement

function keydownCalls(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.filter(([type]) => type === 'keydown')
}

beforeEach(() => {
    vi.clearAllMocks()
    // Pristine store defaults (hide() mutates searchStore on every close).
    mocks.searchStore.set({ glowActive: false, summary: null })
    mocks.navStore.set({ focusedIndex: null, mode: 'idle' })
    mocks.focusStore.set({ selectedBusiness: null })

    // Real jsdom overlay shell (mirrors App.svelte's empty
    // <div class="trail-review-overlay" id="trail-review-overlay" role="dialog">).
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    overlay.setAttribute('role', 'dialog')
    document.body.appendChild(overlay)

    // A real focusable element standing in for the "Show walk" trigger button.
    previouslyFocused = document.createElement('button')
    previouslyFocused.textContent = 'Show walk'
    document.body.appendChild(previouslyFocused)
    previouslyFocused.focus()
})

afterEach(() => {
    // If a test left the overlay open, close it so the module-level
    // _trailReviewEscHandler is removed and the next test starts clean.
    // hide() is idempotent, so this is safe after a test that already hid.
    if (document.getElementById(OVERLAY_ID)) {
        hideExploreTrailReview()
    }
    overlay?.remove()
    previouslyFocused?.remove()
    vi.restoreAllMocks()
})

// ── Contract ─────────────────────────────────────────────────────────────────

describe('trail-review overlay contract (show/hideExploreTrailReview)', () => {
    it('show() injects .trail-review-content with an h2 "Walk review" + guidance paragraph', () => {
        showExploreTrailReview()

        const content = overlay.querySelector('.trail-review-content') as HTMLElement | null
        expect(content, '.trail-review-content must be injected').not.toBeNull()

        const heading = content.querySelector('h2#trail-review-title')
        expect(heading).not.toBeNull()
        expect(heading?.textContent).toBe('Walk review')

        const guidance = content.querySelector('.trail-review-guidance')
        expect(guidance).not.toBeNull()
        expect(guidance?.textContent).toMatch(/step through this business walk/)
        expect(guidance?.textContent).toMatch(/Escape/)

        // The modal must be labeled by its heading (aria-labelledby wiring).
        expect(overlay.getAttribute('aria-labelledby')).toBe('trail-review-title')
    })

    it('show() sets aria-modal="true" + registers the overlay as an open nested dialog', () => {
        showExploreTrailReview()

        expect(overlay.getAttribute('aria-modal')).toBe('true')
        expect(mocks.registerOpenDialog).toHaveBeenCalledWith(OVERLAY_ID)
    })

    it('show() injects a close button with aria-label="Close trail review" and focuses it', () => {
        showExploreTrailReview()

        const closeBtn = overlay.querySelector('.trail-review-close') as HTMLElement | null
        expect(closeBtn).not.toBeNull()
        expect(closeBtn?.getAttribute('aria-label')).toBe('Close trail review')
        expect(closeBtn?.getAttribute('type')).toBe('button')

        // Legacy .mjs contract: the close button receives focus on open.
        expect(document.activeElement).toBe(closeBtn)
    })

    it('show() also mirrors the legacy .mjs visibility contract (aria-hidden/hidden/.visible)', () => {
        showExploreTrailReview()

        expect(overlay.getAttribute('aria-hidden')).toBe('false')
        expect(overlay.hidden).toBe(false)
        expect(overlay.classList.contains('visible')).toBe(true)

        hideExploreTrailReview()

        expect(overlay.getAttribute('aria-hidden')).toBe('true')
        expect(overlay.hidden).toBe(true)
        expect(overlay.classList.contains('visible')).toBe(false)
    })

    it('Escape keydown triggers hide (aria-modal removed, dialog unregistered, focus restored)', () => {
        vi.spyOn(document, 'removeEventListener')
        showExploreTrailReview()
        const closeBtn = overlay.querySelector('.trail-review-close') as HTMLElement
        expect(document.activeElement).toBe(closeBtn)

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

        expect(overlay.hidden).toBe(true)
        expect(overlay.getAttribute('aria-modal')).toBe('false')
        expect(mocks.unregisterOpenDialog).toHaveBeenCalledWith(OVERLAY_ID)
        // Focus returns to the element that was active before show().
        expect(document.activeElement).toBe(previouslyFocused)
        // The one-time Escape listener is removed on close.
        expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function))
    })

    it('hide() removes aria-modal + unregisters the dialog + restores focus (legacy .mjs R5)', () => {
        // Focus the trigger button before show() so the restore target is set.
        expect(document.activeElement).toBe(previouslyFocused)
        showExploreTrailReview()
        expect(document.activeElement).not.toBe(previouslyFocused)

        hideExploreTrailReview()

        expect(overlay.getAttribute('aria-modal')).toBe('false')
        expect(mocks.unregisterOpenDialog).toHaveBeenCalledWith(OVERLAY_ID)
        expect(document.activeElement).toBe(previouslyFocused)
        // The captured activeElement is nulled after restore — a second hide
        // must not throw (legacy .mjs R4: double-hide idempotency).
        expect(() => hideExploreTrailReview()).not.toThrow()
    })

    it('repeated show() does NOT double-register the Escape handler or duplicate injected content', () => {
        const addSpy = vi.spyOn(document, 'addEventListener')
        const removeSpy = vi.spyOn(document, 'removeEventListener')

        showExploreTrailReview()
        showExploreTrailReview()

        // One keydown listener for the visible lifetime of the overlay.
        expect(keydownCalls(addSpy)).toHaveLength(1)
        expect(removeSpy).not.toHaveBeenCalled()

        // Content and close button are injected idempotently (single copy).
        expect(overlay.querySelectorAll('.trail-review-content')).toHaveLength(1)
        expect(overlay.querySelectorAll('h2#trail-review-title')).toHaveLength(1)
        expect(overlay.querySelectorAll('.trail-review-close')).toHaveLength(1)

        // One keydown still closes the overlay exactly once.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        expect(overlay.hidden).toBe(true)
        expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })
})
