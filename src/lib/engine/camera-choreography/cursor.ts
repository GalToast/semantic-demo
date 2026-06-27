/**
 * @lib/engine/camera-choreography/cursor.ts — Focus node orchestrator (focusOnNode)
 *
 * Ported from:
 *
 * Orchestrates the full focus-on-node flow: dispatches navigation transitions,
 * syncs DOM attributes, publishes events, updates journey/compass state, and
 * triggers the camera animation (delegated to focus.ts).
 */

import { appState } from '@lib/state/app.svelte.ts'
import type { Point } from '@lib/state/state-types'
import type { PanelSurface } from '@lib/types/state'

import { isMobile } from '@lib/utils/environment'
import { refreshMapRouteEmbodiment } from '@lib/engine/map-state'
import {
    refreshCompositionState,
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
    setTrailDepth,
    setMyceliumMode,
    updateExplorationUi
} from '@lib/orchestration/lifecycle'
import { syncSearchStatusForFocus } from '@lib/ui/ui-feedback'
import { updateJourneyCompass } from '@lib/orchestration/compass-controller'
import { currentSurface } from '@lib/stores/navigation.svelte'
import { applyParityAttributes, computeParityAttributes } from '@lib/orchestration/parity-attrs.svelte'
import { syncFocusStage, updateSelectedBusiness } from '@lib/journey/selected-card'
import { unpinThreadInspection } from '@lib/journey/thread-inspector-state'
import { syncSemanticDiveUi } from '@lib/journey/semantic-dive'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { clearRouteExploration } from '../camera-controls-core'
import { setFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode'
import { animateCameraToNode } from './focus'

// W6-T5: Track pending parity-attr timeouts so rapid focusOnNode calls
// don't stack up deferred DOM mutations.
const parityTimeoutHandles: ReturnType<typeof setTimeout>[] = []
function clearParityTimeouts(): void {
    for (const t of parityTimeoutHandles) clearTimeout(t)
    parityTimeoutHandles.length = 0
}

// Narrow local alias for onboarding-hint dynamic properties (matches onboarding-bindings.ts pattern)
type OnboardingHint = HTMLElement & {
    _dismissedThisSession?: boolean
    _autoHideTimer?: ReturnType<typeof setTimeout> | null
}

// Local options interface matching runtime usage across all callers
export interface FocusOnNodeOptions {
    preserveMode?: boolean
    fromTraversal?: boolean
    fromCanvasNode?: boolean
    fromSearchResult?: boolean
    appendHistory?: boolean
    restoreHistory?: boolean
    skipUrlSync?: boolean
    historyMode?: string
    [key: string]: unknown
}

// -----------------------------------------------------------------------------
// FOCUS NODE ORCHESTRATOR — focusOnNode
// -----------------------------------------------------------------------------

export function focusOnNode(index: number, options: FocusOnNodeOptions = {}): boolean {
    const points = appState.points as Point[]
    if (!Number.isFinite(index) || index < 0 || !points || index >= points.length) return false
    const point = points[index]
    if (!point) return false
    const suppressCanvasFocusUntil = Number(appState.suppressCanvasFocusUntil) || 0
    if (options.fromCanvasNode && typeof performance !== 'undefined' && performance.now() < suppressCanvasFocusUntil) {
        return false
    }

    appState.hoverHighlightIndex = -1
    unpinThreadInspection()
    updateSelectedBusiness(point, { revealCard: true })

    // Preserve the 'focus-search' surface that the SEARCH_FOCUS_REQUESTED
    // subscriber (triggers.ts:176-203) sets just before this orchestrator
    // runs, AND across any subsequent focus call (canvas click, thread
    // traversal, breadcrumb click, thread inspector explore) — not just the
    // direct fromSearchResult path. The dispatchNavTransition FOCUS_NODE
    // branch defaults surface to 'focus' when the payload omits it, which
    // clobbers the search context and leaves body data-attrs
    // (panelSurface, navSurface, mode) reading as "idle" / "overview".
    //
    // The original W15 fix only handled fromSearchResult: true. This W15+
    // supersede reads the current Svelte 5 surface (with legacy fallback)
    // before dispatching, so canvas/traversal/breadcrumb/thread-inspector
    // callers preserve the user's existing focus-search context. Closes
    // the surface clobber class identified in
    // tmp/canvas-node-audit-2026-06-17.md (4 HIGH-risk call sites:
    // canvas-interaction.ts:107, thread-settler.ts:243, focus-ui.ts:368,
    // thread-inspector.ts:491).
    //
    // See tmp/w15-body-attr-gap-2026-06-17.md for the original diagnosis
    // and tmp/w15-live-probe-finding-2026-06-17.md for the live-browser
    // verification of the remaining parity-attrs gap.
    const currentNavSurface = currentSurface()
    const focusSurface: PanelSurface = options.fromSearchResult
        ? 'focus-search'
        : currentNavSurface === 'focus-search'
          ? 'focus-search'
          : 'focus'

    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
        index,
        surface: focusSurface,
        preserveMode: !!options.preserveMode,
        fromTraversal: !!options.fromTraversal,
        fromCanvasNode: !!options.fromCanvasNode,
        appendHistory: !!options.appendHistory,
        restoreHistory: !!options.restoreHistory
    })

    if (appState.trailDepth === 0) {
        setTrailDepth(1, { skipUrlSync: true })
    }

    if (appState.navState?.mode === 'trail' && appState.myceliumMode !== 'trail') {
        setMyceliumMode('trail', { skipUrlSync: true })
    }

    document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'))

    document.getElementById('onboarding-hint')?.classList.remove('visible')
    const hint = document.getElementById('onboarding-hint') as OnboardingHint | null
    if (hint) {
        hint._dismissedThisSession = true
        if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer)
    }
    document.body.dataset.focusOrigin = options.fromCanvasNode
        ? 'field-node'
        : options.fromSearchResult
          ? 'search-result'
          : options.fromTraversal
            ? 'trail-walk'
            : 'programmatic'
    if (options.fromCanvasNode) {
        setFocusPanelMode(FOCUS_PANEL_MODE.FIELD_NODE)
    }

    if (isMobile()) {
        const storySection = document.getElementById('story-section') as HTMLDetailsElement | null
        const clusterSection = document.getElementById('cluster-section') as HTMLDetailsElement | null
        if (storySection) storySection.open = false
        if (clusterSection) clusterSection.open = false
    }

    publish(EVENTS.CAMERA_MOVED, { reason: 'focus-node', index })
    publish(EVENTS.CAMERA_NODE_FOCUSED, { index, point, options })

    import('@lib/journey/point-color').then((m) => m.applyPointFilterColors())
    updateExplorationUi()

    syncFocusStage(point)
    refreshMapRouteEmbodiment()

    clearRouteExploration(options.fromTraversal ? 'trail-walk' : options.fromCanvasNode ? 'field-node-focus' : 'focus')

    syncSearchStatusForFocus(point, {
        fromTraversal: !!options.fromTraversal,
        fromSearchResult: !!options.fromSearchResult
    })

    animateCameraToNode(index, {
        transitionStyle: options.fromTraversal ? 'walk' : options.fromSearchResult ? 'search' : 'focus'
    })

    syncSemanticDiveUi()
    refreshCompositionState()
    if (!options.skipUrlSync) {
        publish(EVENTS.URL_SYNC_REQUESTED, {
            params: { record: point.lead_id || null },
            mode: options.historyMode || 'push',
            reason: 'focus'
        })
    }
    updateJourneyCompass()
    // W15+ parity-attrs fix: re-write parity attributes after updateJourneyCompass
    // and any deferred legacy subscribers. The legacy updateJourneyCompass in
    // dist/svelte/assets/panel-bindings-* still writes data-journeyPhase from
    // journey.phase (legacy state, never updated to 'focus'). A full fix requires
    // rebuilding the Svelte bundle (npm run build:svelte) so the legacy code
    // no longer overwrites the parity attrs.
    queueMicrotask(() => applyParityAttributes(computeParityAttributes()))
    clearParityTimeouts()
    parityTimeoutHandles.push(setTimeout(() => applyParityAttributes(computeParityAttributes()), 50))
    parityTimeoutHandles.push(setTimeout(() => applyParityAttributes(computeParityAttributes()), 250))
    return true
}
