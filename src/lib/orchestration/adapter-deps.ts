import type { AdapterDeps } from '@lib/orchestration/adapters'
import { appState } from '@lib/state/app.svelte'
import {
    setSemanticDiveMode,
    hydrateLeadContext,
    getInterestingBusinessNote,
    buildSelectedMatchNarrative,
    refreshCompositionState
} from '@lib/orchestration/lifecycle'
import { switchView } from '@lib/orchestration/view-controller'
import { updateUrlState } from '@lib/orchestration/url-state'
import { applyFilters, clearShortSemanticSearchState } from '@lib/orchestration/search-filter-core'
import { clearSearchGlow } from '@lib/stores/search.svelte'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { previewInsideNextThread } from '@lib/journey/thread-settler-adapter'
import { getNextWalkCandidateForIndex, getCurrentTrailFocusIndex } from '@lib/journey/neighborhood'
import { getStrandArrivalNote, summarizeNeighborReason, getInsideRelationshipLabel } from '@lib/journey/thread-settler'
import {
    hasColdDegradedSemanticFallback,
    updateTraversalUi,
    shouldUseFloatingFocusJourneyOnly
} from '@lib/journey/focus-ui'
import { revealSelectedBusinessCard } from '@lib/ui/panel-bindings'
import { describeThreadLensForPoint } from '@lib/journey/thread-lens'
import { _getSelectedBusinessRoleLabel } from '@lib/utils/role-label'

export function buildAdapterDeps(): AdapterDeps {
    const mutableAppState = appState as unknown as {
        navState?: { focusedIndex?: number | null }
        lastCanvasNodePick: unknown
        lastCanvasNodeHover: unknown
        lastCanvasNodeFocusPick: unknown
    }

    return {
        journeyLifecycle: {
            previewInsideNextThread,
            getNextWalkCandidateForIndex: (currentIndex: number, options?: unknown) =>
                getNextWalkCandidateForIndex(currentIndex, options as never) as
                    | import('@lib/journey/thread-model').ThreadCandidate
                    | null,
            setSemanticDiveMode: (mode: unknown) => setSemanticDiveMode(Boolean(mode)),
            getInterestingBusinessNote: (point: unknown) =>
                getInterestingBusinessNote(point as Record<string, unknown> | null),
            buildSelectedMatchNarrative: (point: unknown) =>
                buildSelectedMatchNarrative(point as Record<string, unknown> | null),
            hasColdDegradedSemanticFallback,
            getColdDegradedRouteCopy: () => null,
            getSelectedBusinessRoleLabel: (point: unknown) => _getSelectedBusinessRoleLabel(point as never),
            isFieldNodeFocusContext: () => false,
            revealSelectedBusinessCard,
            describeThreadLensForPoint,
            hydrateLeadContext: (point: unknown) => hydrateLeadContext(point as never),
            shouldUseFloatingFocusJourneyOnly,
            setLastCanvasNodePick: (val: unknown) => {
                mutableAppState.lastCanvasNodePick = val || null
            },
            setLastCanvasNodeHover: (val: unknown) => {
                mutableAppState.lastCanvasNodeHover = val || null
            },
            setLastCanvasNodeFocusPick: (val: unknown) => {
                mutableAppState.lastCanvasNodeFocusPick = val || null
            }
        },
        clusterFilter: {
            applyFilters,
            clearSearchGlow,
            updateUrlState: (extra: Record<string, unknown>, options: Record<string, unknown>) =>
                updateUrlState(extra as Record<string, string | null | undefined>, options as never),
            clearShortSemanticSearchState: (resultsEl: Element | null, statusEl: Element | null) =>
                clearShortSemanticSearchState(resultsEl as HTMLElement | null, statusEl as HTMLElement | null)
        },
        switchView: (view: string) => switchView(view as never),
        journeySelectedCard: {
            getStrandArrivalNote,
            updateTraversalUi,
            hydrateLeadContext: (point: unknown) => hydrateLeadContext(point as never)
        },
        threadInspector: {
            summarizeNeighborReason: (candidate: unknown, point: unknown, focusPoint: unknown) =>
                summarizeNeighborReason(candidate as never, point as never, focusPoint as never),
            getInsideRelationshipLabel: (candidate: unknown, point: unknown, focusPoint: unknown) =>
                getInsideRelationshipLabel(candidate as never, point as never, focusPoint as never),
            getCurrentTrailFocusIndex: () => getCurrentTrailFocusIndex(mutableAppState.navState?.focusedIndex ?? null)
        },
        refreshCompositionState,
        isCompactSearchViewport
    }
}
