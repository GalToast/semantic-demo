/**
 * @lib/orchestration/test-globals.ts — Test-only window globals
 *
 * Replaces the old window-test-bridge.ts. The bridge exposed 26 named
 * action wrappers (window.__APP_ACTIONS__.X(args)) for Playwright tests
 * to drive the app. After W49b migration, tests migrated to direct
 * store/lifecycle imports and the action bag is no longer needed.
 *
 * What remains is a smaller set of globals that surface-contract-check.mjs
 * (the Node-based Playwright verification tool) needs to drive the app.
 * Surface-contract runs in Node, not Vite — it can't resolve @lib/...
 * aliases — so it needs concrete JS functions on window.
 *
 * Globals exposed:
 *   - __navStore__  →  navStore (writable Svelte store)
 *   - __focusStore__ → focusStore (writable Svelte store)
 *   - __navActions__ → { setSurface, setFocusedIndex, switchView, returnToOverview,
 *                        clearSearch, setSemanticDiveMode, setTrailDepth,
 *                        setTrailFromSeed, refreshCompositionState,
 *                        resetExplorationFocus, resetExperienceState, search }
 *   - __dataLoadState__ → dataLoadState writable + helpers (.set/.error/.reset)
 *     used by journey tests to drive the boot-time load failure state.
 *   - __publishCameraNodeFocused__ → publish CAMERA_NODE_FOCUSED for tests
 *     that want to drive the focused-business preview without routing through
 *     the legacy focusOnNode orchestrator (which goes through normalization,
 *     surface guards, etc. that aren't relevant to "does the preview appear?").
 *
 * surface-contract-check.mjs calls these directly via page.evaluate:
 *   await page.evaluate(() => window.__navActions__.setSurface('focus'))
 */

// No runtime THREE dependency needed here — the window.THREE reference in
// the docs below was never implemented, and pulling 'three' into this boot-
// installed module drags the three chunk into the mobile critical path.

import { navStore, writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { isPlaywrightEnvironment } from '@lib/app/app-lifecycle.ts'
import { focusStore } from '@lib/stores/focus.svelte'
import { searchStore } from '@lib/stores/search.svelte'
import { dataLoadState } from '@lib/data-store'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { journeyStore } from '@lib/stores/journey.svelte'
import {
    switchView,
    returnToOverview,
    refreshCompositionState,
    setSemanticDiveMode,
    resetExplorationFocus,
    resetExperienceState,
    focusOnNode
} from '@lib/orchestration/lifecycle'
import { setTrailDepth } from '@lib/stores/journey.svelte'
import { setTrailFromSeed } from '@lib/journey/neighborhood'
import { setFocusedIndex, setSurface } from '@lib/stores/navigation.svelte'
import { inspectThreadNeighbor } from '@lib/journey/thread-inspector-state'
import { search } from '@lib/search/state'
import { applyLocalNeighborhoodFocus } from '@lib/journey/focus-pocket'

interface NavActions {
    setSurface: typeof setSurface
    setFocusedIndex: typeof setFocusedIndex
    switchView: typeof switchView
    returnToOverview: typeof returnToOverview
    clearSearch: () => void
    setSemanticDiveMode: typeof setSemanticDiveMode
    setTrailDepth: typeof setTrailDepth
    setTrailFromSeed: typeof setTrailFromSeed
    refreshCompositionState: typeof refreshCompositionState
    resetExplorationFocus: typeof resetExplorationFocus
    resetExperienceState: typeof resetExperienceState
    search: typeof search
    focusOnNode: typeof focusOnNode
    inspectThreadNeighbor: typeof inspectThreadNeighbor
    applyLocalNeighborhoodFocus: typeof applyLocalNeighborhoodFocus
    writeNavStateMirror: typeof writeNavStateMirror
}

declare global {
    interface Window {
        __navStore__?: typeof navStore
        __focusStore__?: typeof focusStore
        __journeyStore__?: typeof journeyStore
        __searchStore__?: typeof searchStore
        __navActions__?: NavActions
        __publishCameraNodeFocused__?: (index: number | null) => void
        __dataLoadState__?: {
            store: typeof dataLoadState
            set: typeof dataLoadState.set
            error: (message?: string) => void
            reset: () => void
            value: () => Parameters<typeof dataLoadState.set>[0]
        }
    }
}

export function installTestStoreGlobals(): () => void {
    if (typeof window === 'undefined') return () => {}

    // Expose the bundled THREE build so that Playwright page.evaluate blocks
    // can reuse the same math classes the app uses (Vector3, Matrix4, Color,
    // etc.). Many .spec.js and .mjs tests project node positions onto screen
    // coordinates using window.THREE.Vector3.
    // P3-LCP (2026-08-21): only install in Playwright/test runs, and via a
    // dynamic import — real users never read window.THREE. A static
    // `import * as THREE` here pulled the Three.js graph onto the cold boot
    // path of the mobile 2D surface.
    if (isPlaywrightEnvironment()) {
        import('three')
            .then((t) => {
                window.THREE = t
            })
            .catch(() => {})
    }

    const navActions: NavActions = {
        setSurface,
        setFocusedIndex,
        switchView,
        returnToOverview,
        // clearSearch is an alias for returnToOverview (was in old bridge);
        // surfaced separately so test code reads naturally.
        clearSearch: returnToOverview,
        setSemanticDiveMode,
        setTrailDepth,
        setTrailFromSeed,
        refreshCompositionState,
        resetExplorationFocus,
        resetExperienceState,
        search,
        focusOnNode,
        inspectThreadNeighbor,
        applyLocalNeighborhoodFocus,
        writeNavStateMirror
    }

    window.__navStore__ = navStore
    window.__focusStore__ = focusStore
    window.__journeyStore__ = journeyStore
    window.__searchStore__ = searchStore
    window.__navActions__ = navActions

    // ── Data load state — used by journey tests to drive the boot-time load
    //    failure transition so LoadingOverlay's role=alert path can be tested
    //    without depending on the PHP backend returning an actual error.
    const dataLoadStateApi = {
        store: dataLoadState,
        set: dataLoadState.set,
        error: (message = 'Test forced error (dataLoadState.__error())'): void => {
            dataLoadState.set({
                status: 'error',
                businessLoaded: false,
                threadsLoaded: false,
                error: message
            })
        },
        reset: (): void => {
            dataLoadState.set({
                status: 'loading',
                businessLoaded: false,
                threadsLoaded: false,
                error: null
            })
        },
        value: (): Parameters<typeof dataLoadState.set>[0] => {
            // Snapshot of the current state (used by tests that need to
            // restore the pre-test value). Subscribe + immediately unsub.
            let snapshot: Parameters<typeof dataLoadState.set>[0]
            const unsub = dataLoadState.subscribe((s) => {
                snapshot = s
            })
            unsub()
            return snapshot!
        }
    }
    window.__dataLoadState__ = dataLoadStateApi

    // W48-B: drive the canvas-hover-preview subscription directly. The
    // legacy focusOnNode orchestrator routes through CAMERA_NODE_FOCUSED
    // but also runs surface guards + data normalization; for a journey test
    // focused on "does the focused-business preview appear?", driving the
    // event directly is both faster and more deterministic.
    window.__publishCameraNodeFocused__ = (index: number | null): void => {
        if (typeof index === 'number' && Number.isFinite(index)) {
            publish(EVENTS.CAMERA_NODE_FOCUSED, { index, point: null })
        } else {
            publish(EVENTS.CAMERA_NODE_FOCUSED, { point: null })
        }
    }

    return () => {
        delete window.__navStore__
        delete window.__focusStore__
        delete window.__journeyStore__
        delete window.__searchStore__
        delete window.__navActions__
        delete window.__dataLoadState__
        delete window.__publishCameraNodeFocused__
        delete window.THREE
    }
}
