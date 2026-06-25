import type { AdapterDeps, NeighborCandidate } from '@lib/orchestration/adapters'
import type { ViewName } from '@lib/orchestration/view-controller'
import type { SwitchViewOptions } from '@lib/orchestration/view-controller'
import type { ThreadCandidate, WalkCandidateOptions } from '@lib/journey/thread-model'
import type { BusinessRecord } from '@lib/types/business'
import type { Point } from '@lib/state/state-types'
import { appState } from '@lib/state/app.svelte'
import {
    setSemanticDiveMode,
    hydrateLeadContext as _hydrateLeadContextLifecycle,
    getInterestingBusinessNote,
    buildSelectedMatchNarrative,
    refreshCompositionState
} from '@lib/orchestration/lifecycle'
import { switchView } from '@lib/orchestration/view-controller'
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
    // lastCanvasNodePick/Hover/FocusPick live outside appState's typed surface
    // but are read by the legacy thread-inspector adapter. Direct assignment
    // via the underlying Svelte 5 proxy requires the unknown escape.
    const mutableAppState = appState as unknown as {
        navState?: { focusedIndex?: number | null }
        lastCanvasNodePick: unknown
        lastCanvasNodeHover: unknown
        lastCanvasNodeFocusPick: unknown
    }

    return {
        journeyLifecycle: {
            previewInsideNextThread: (opt?: unknown): void => {
                previewInsideNextThread(opt as Record<string, unknown>)
            },
            getNextWalkCandidateForIndex: (
                currentIndex: number,
                options?: WalkCandidateOptions
            ): ThreadCandidate | null => getNextWalkCandidateForIndex(currentIndex, options) as ThreadCandidate | null,
            setSemanticDiveMode: (mode: unknown) => setSemanticDiveMode(Boolean(mode)),
            getInterestingBusinessNote: (point: Record<string, unknown> | null): string | null =>
                getInterestingBusinessNote(point),
            buildSelectedMatchNarrative: (point: Record<string, unknown> | null): string =>
                buildSelectedMatchNarrative(point),
            hasColdDegradedSemanticFallback,
            getColdDegradedRouteCopy: () => null,
            getSelectedBusinessRoleLabel: (point: unknown) => _getSelectedBusinessRoleLabel(point as Point),
            isFieldNodeFocusContext: () => false,
            revealSelectedBusinessCard,
            describeThreadLensForPoint: (point: unknown) => describeThreadLensForPoint(point as BusinessRecord),
            hydrateLeadContext: (point: unknown) => _hydrateLeadContextLifecycle(point as BusinessRecord | null),
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
        switchView: (view: string, options: SwitchViewOptions = {}): void => switchView(view as ViewName, options),
        journeySelectedCard: {
            getStrandArrivalNote,
            updateTraversalUi,
            hydrateLeadContext: (point: unknown, _options?: Record<string, unknown>): void =>
                _hydrateLeadContextLifecycle(point as BusinessRecord | null)
        },
        threadInspector: {
            summarizeNeighborReason: (candidate: NeighborCandidate): string =>
                summarizeNeighborReason(candidate),
            getInsideRelationshipLabel: (candidate: NeighborCandidate): string =>
                getInsideRelationshipLabel(candidate),
            getCurrentTrailFocusIndex: () => getCurrentTrailFocusIndex(mutableAppState.navState?.focusedIndex ?? null)
        },
        refreshCompositionState,
        isCompactSearchViewport
    }
}
