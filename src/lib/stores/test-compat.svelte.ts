/**
 * src/lib/stores/test-compat.svelte.ts
 *
 * Test compatibility store - allows contract tests to inject state
 * for components that need to render specific states for testing.
 * (Svelte 5 runes)
 */
import { get, type Readable, type Subscriber, type Unsubscriber, writable } from 'svelte/store'

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

/** Update test state from body dataset (called by test setup) */
export function syncTestStateFromBody(): void {
    if (typeof document === 'undefined' || !document.body) return

    const body = document.body
    _testCompatWritable.set({
        panelSurface: body.dataset.panelSurface || null,
        focusedNode: body.dataset.focusedNode ? Number(body.dataset.focusedNode) : null,
        activeView: body.dataset.activeView || body.dataset.viewMode || null,
        graphContext: body.dataset.graphContext || null,
        panelSurfaceMode: body.dataset.panelSurface || body.dataset.navSurface || null,
        mapContext: body.dataset.mapContext || null,
        routeExploration: body.dataset.routeExploration || null,
        journeyCompassPhase: body.dataset.journeyCompassPhase || null,
        navMode: body.dataset.navMode || null,
        focusedNodeId: body.dataset.focusedNode || null,
        navSurface: body.dataset.navSurface || null,
        demoPhase: body.dataset.demoPhase || null,
        journeyPhase: body.dataset.journeyPhase || null,
        reducedMotion: body.dataset.reducedMotion || null,
        mode: body.dataset.mode || null,
        compact: body.dataset.compact || null,
        filtersActive: body.dataset.filtersActive || null,
        semanticTrailCue: body.dataset.semanticTrailCue || null,
        loadingPhase: body.dataset.loadingPhase || null,
        loadingOverlay: body.dataset.loadingOverlay || null,
        sceneReady: body.dataset.sceneReady || null,
        viewHandoffActive: body.dataset.viewHandoffActive || null,
        cameraAssist: body.dataset.cameraAssist || null,
        graphicsMode: body.dataset.graphicsMode || null
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
