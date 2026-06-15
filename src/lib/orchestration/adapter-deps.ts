import type { AdapterDeps } from '@lib/orchestration/adapters';
import { appState } from '@lib/state/app.svelte';
import {
  setSemanticDiveMode,
  hydrateLeadContext,
  getInterestingBusinessNote,
  buildSelectedMatchNarrative,
  refreshCompositionState,
} from '@lib/orchestration/lifecycle';
import { switchView } from '@lib/orchestration/view-controller';
import { updateUrlState } from '@lib/orchestration/url-state';
import { applyFilters, clearShortSemanticSearchState } from '@lib/orchestration/search-filter-core';
import { clearSearchGlow } from '@lib/stores/search.svelte';
import { applyLocalNeighborhoodFocus } from '@lib/focus/pocket';
import { getFocusThreadCurvePoint } from '@lib/focus/geometry';
import { isCompactSearchViewport } from '@lib/utils/ui-presentation';
import { previewInsideNextThread } from '@lib/journey/thread-settler-adapter';
import { getNextWalkCandidateForIndex, getCurrentTrailFocusIndex } from '@lib/engine/journey-neighborhood-bridge';
import { getStrandArrivalNote, summarizeNeighborReason, getInsideRelationshipLabel } from '@lib/engine/journey-thread-settler-bridge';
import { hasColdDegradedSemanticFallback, updateTraversalUi, shouldUseFloatingFocusJourneyOnly } from '@lib/engine/journey-focus-ui-bridge';
import { revealSelectedBusinessCard } from '@lib/engine/lifecycle-bridge';
import { describeThreadLensForPoint } from '@lib/engine/journey-point-color-bridge';
import { state as legacyState } from '@lib/engine/state-bridge';
import type { BusinessRecord } from '@lib/types/business';

/**
 * Role label for a business point in the current application context
 * (search anchor, trail step, or generic record). Inlined from
 * `js/modules/role-label.ts` to remove the cross-layer import — the
 * function is pure and reads from the global `state` object via the
 * state-bridge. Consumers in `js/modules/` still work because the
 * original `js/modules/role-label.ts` is unchanged.
 */
function getSelectedBusinessRoleLabel(point: BusinessRecord): string {
    const _s = legacyState as unknown as {
        points?: BusinessRecord[] | unknown[];
        currentSearchSummary?: { anchorIndex?: number; topIndex?: number; resultIndices?: number[] } | null;
        navState?: { mode?: string; walkHistoryIndices?: number[] };
    };
    const points = Array.isArray(_s.points) ? (_s.points as BusinessRecord[]) : [];
    let index = points.indexOf(point);
    if (index < 0 && point?.lead_id !== undefined && point?.lead_id !== null) {
        const leadId = String(point.lead_id);
        index = points.findIndex((candidate) => String(candidate?.lead_id) === leadId);
    }
    if (index >= 0 && _s.currentSearchSummary) {
        const summary = _s.currentSearchSummary;
        if (summary.anchorIndex === index || summary.topIndex === index) {
            return 'Search Anchor';
        }
        if ((summary.resultIndices || []).includes(index)) {
            return 'Trail Step';
        }
    }
    if (
        index >= 0
        && _s.navState?.mode === 'trail'
        && (_s.navState.walkHistoryIndices || []).includes(index)
    ) {
        return 'Trail Step';
    }
    return 'Record';
}

export function buildAdapterDeps(): AdapterDeps {
  const mutableAppState = appState as unknown as {
    navState?: { focusedIndex?: number | null };
    lastCanvasNodePick: unknown;
    lastCanvasNodeHover: unknown;
    lastCanvasNodeFocusPick: unknown;
  };

  return {
    journeyLifecycle: {
      previewInsideNextThread,
      getNextWalkCandidateForIndex: (currentIndex: number, options?: unknown) =>
        getNextWalkCandidateForIndex(currentIndex, options as never),
      applyLocalNeighborhoodFocus: (...args: unknown[]) => applyLocalNeighborhoodFocus(Number(args[0])),
      setSemanticDiveMode: (mode: unknown) => setSemanticDiveMode(Boolean(mode)),
      getInterestingBusinessNote: (point: unknown) => getInterestingBusinessNote(point as Record<string, unknown> | null),
      buildSelectedMatchNarrative: (point: unknown) => buildSelectedMatchNarrative(point as Record<string, unknown> | null),
      hasColdDegradedSemanticFallback,
      getColdDegradedRouteCopy: () => null,
      getSelectedBusinessRoleLabel: (point: unknown) => getSelectedBusinessRoleLabel(point as BusinessRecord),
      isFieldNodeFocusContext: () => false,
      revealSelectedBusinessCard,
      describeThreadLensForPoint,
      hydrateLeadContext: (point: unknown) => hydrateLeadContext(point as never),
      shouldUseFloatingFocusJourneyOnly,
      setLastCanvasNodePick: (val: unknown) => { mutableAppState.lastCanvasNodePick = val || null; },
      setLastCanvasNodeHover: (val: unknown) => { mutableAppState.lastCanvasNodeHover = val || null; },
      setLastCanvasNodeFocusPick: (val: unknown) => { mutableAppState.lastCanvasNodeFocusPick = val || null; },
    },
    clusterFilter: {
      applyFilters,
      clearSearchGlow,
      updateUrlState: (extra: Record<string, unknown>, options: Record<string, unknown>) =>
        updateUrlState(extra as Record<string, string | null | undefined>, options as never),
      clearShortSemanticSearchState: (resultsEl: Element | null, statusEl: Element | null) =>
        clearShortSemanticSearchState(resultsEl as HTMLElement | null, statusEl as HTMLElement | null),
    },
    switchView: (view: string) => switchView(view as never),
    journeySelectedCard: {
      getStrandArrivalNote,
      updateTraversalUi,
    },
    threadInspector: {
      summarizeNeighborReason: (candidate: unknown, point: unknown, focusPoint: unknown) =>
        summarizeNeighborReason(candidate as never, point as never, focusPoint as never),
      getInsideRelationshipLabel: (candidate: unknown, point: unknown, focusPoint: unknown) =>
        getInsideRelationshipLabel(candidate as never, point as never, focusPoint as never),
      getCurrentTrailFocusIndex: () => getCurrentTrailFocusIndex(mutableAppState.navState?.focusedIndex ?? null),
      getFocusThreadCurvePoint: (edge: unknown, t: number) => getFocusThreadCurvePoint(edge as never, t),
    },
    refreshCompositionState,
    isCompactSearchViewport,
  };
}
