/**
 * src/lib/stores/test-compat.svelte.ts
 *
 * Test compatibility store - allows contract tests to inject state
 * for components that need to render specific states for testing.
 * (Svelte 5 runes)
 */
import { get, type Readable, type Subscriber, type Unsubscriber, writable } from 'svelte/store'
import { computeParityAttributes } from '@lib/orchestration/parity-attrs.svelte'

export interface TestCompatState {
    panelSurface: string | null
    focusedNode: number | null
    activeView: string | null
    graphContext: string | null
    panelSurfaceMode: string | null
    mapContext: string | null
    routeExploration: string | null
    journeyCompassPhase: string | null
    navMode: string | null
    focusedNodeId: string | null
    navSurface: string | null
    demoPhase: string | null
    journeyPhase: string | null
    reducedMotion: string | null
    mode: string | null
    compact: string | null
    filtersActive: string | null
    semanticTrailCue: string | null
    loadingPhase: string | null
    loadingOverlay: string | null
    sceneReady: string | null
    viewHandoffActive: string | null
    cameraAssist: string | null
    graphicsMode: string | null
}

const initialTestState: TestCompatState = {
    panelSurface: null,
    focusedNode: null,
    activeView: null,
    graphContext: null,
    panelSurfaceMode: null,
    mapContext: null,
    routeExploration: null,
    journeyCompassPhase: null,
    navMode: null,
    focusedNodeId: null,
    navSurface: null,
    demoPhase: null,
    journeyPhase: null,
    reducedMotion: null,
    mode: null,
    compact: null,
    filtersActive: null,
    semanticTrailCue: null,
    loadingPhase: null,
    loadingOverlay: null,
    sceneReady: null,
    viewHandoffActive: null,
    cameraAssist: null,
    graphicsMode: null
}

const _testCompatWritable = writable<TestCompatState>({ ...initialTestState })

// ── TestCompatStore API ────────────────────────────────────────────────────
// testCompatStore is a hybrid: callable as testCompatStore() for Svelte 5 rune consumers,
// and satisfies Readable<TestCompatState> for svelte/store get() compatibility.

/** TestCompatStore type: callable function that also satisfies Readable. */
export type TestCompatStoreApi = (() => TestCompatState) & Readable<TestCompatState>

function _createTestCompatStore(): TestCompatStoreApi {
    const fn = (() => get(_testCompatWritable)) as TestCompatStoreApi

    // Satisfy Readable<TestCompatState> so get(testCompatStore) from svelte/store works.
    fn.subscribe = (listener: Subscriber<TestCompatState>): Unsubscriber => {
        return _testCompatWritable.subscribe(listener)
    }

    return fn
}

/** Single reactive instance of the test compat state. */
export const testCompatStore: TestCompatStoreApi = _createTestCompatStore()

/** Update test state from parity attribute computation (called by test setup)
 *
 * Most fields read from computeParityAttributes() which derives values
 * directly from source-of-truth stores (navStore, journeyStore, focusStore,
 * filterState, viewport, etc.). The only exception is semanticTrailCue,
 * which is bypass-owned and still reads from body.dataset.
 */
export function syncTestStateFromBody(): void {
    if (typeof document === 'undefined' || !document.body) return

    const body = document.body

    // Parity attributes (source-of-truth store values) — used as fallback when
    // body.dataset is not set by test setup.  Body.dataset wins so tests can
    // inject values without wiring every store manually.
    let parity: Record<string, string | null>
    try {
        parity = computeParityAttributes()
    } catch {
        // Some test suites mock stores incompletely; fall back to empty parity
        // (body.dataset fallbacks in _testCompatWritable.set below still work).
        parity = {}
    }

    _testCompatWritable.set({
        panelSurface: body.dataset.panelSurface || parity.panelSurface || null,
        focusedNode: body.dataset.focusedNode
            ? Number(body.dataset.focusedNode)
            : parity.focusedNode
              ? Number(parity.focusedNode)
              : null,
        activeView: body.dataset.activeView || body.dataset.viewMode || parity.activeView || null,
        graphContext: body.dataset.graphContext || parity.graphContext || null,
        panelSurfaceMode: body.dataset.panelSurface || body.dataset.navSurface || parity.panelSurfaceMode || null,
        mapContext: body.dataset.mapContext || parity.mapContext || null,
        routeExploration: body.dataset.routeExploration || parity.routeExploration || null,
        journeyCompassPhase: body.dataset.journeyCompassPhase || parity.journeyCompassPhase || null,
        navMode: body.dataset.navMode || parity.navMode || null,
        focusedNodeId: body.dataset.focusedNode || parity.focusedNode || null,
        navSurface: body.dataset.navSurface || parity.navSurface || null,
        demoPhase: body.dataset.demoPhase || parity.demoPhase || null,
        journeyPhase: body.dataset.journeyPhase || parity.journeyPhase || null,
        reducedMotion: body.dataset.reducedMotion || parity.reducedMotion || null,
        mode: body.dataset.mode || parity.mode || null,
        compact: body.dataset.compact || parity.compact || null,
        filtersActive: body.dataset.filtersActive || parity.filtersActive || null,
        loadingPhase: body.dataset.loadingPhase || parity.loadingPhase || null,
        loadingOverlay: body.dataset.loadingOverlay || parity.loadingOverlay || null,
        sceneReady: body.dataset.sceneReady || parity.sceneReady || null,
        viewHandoffActive: body.dataset.viewHandoffActive || parity.viewHandoffActive || null,
        cameraAssist: body.dataset.cameraAssist || parity.cameraAssist || null,
        graphicsMode: body.dataset.graphicsMode || parity.graphicsMode || null,

        // --- Bypass-owned attr (not in parity; no source store identified) ---
        semanticTrailCue: body.dataset.semanticTrailCue || null
    })
}

// Auto-sync when body data-attributes change (for contract tests)
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.attributeName?.startsWith('data-'))) {
            syncTestStateFromBody()
        }
    })
    observer.observe(document.body, { attributes: true })
}

// Expose for contract tests that set body dataset without firing observers
if (typeof window !== 'undefined') {
    window.syncTestStateFromBody = syncTestStateFromBody
}

/** Sync body dataset from test store (for components that write to body) */
export function syncBodyFromTestState(): void {
    if (typeof document === 'undefined' || !document.body) return

    const body = document.body
    const currentState = get(_testCompatWritable)
    Object.entries(currentState).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            // Convert camelCase to kebab-case for data attributes
            const attr = key.replace(/([A-Z])/g, '-$1').toLowerCase()
            body.dataset[attr] = String(value)
        }
    })
}

/** Reset test state to initial */
export function resetTestState(): void {
    _testCompatWritable.set({ ...initialTestState })
}
