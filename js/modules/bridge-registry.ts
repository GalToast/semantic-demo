/**
 * js/modules/bridge-registry.ts
 *
 * TypeScript shadow of bridge-registry.js.
 * Compatibility layer for legacy global window assignments.
 */
import { state } from '../state.js';

export function _getSelectedBusinessRoleLabel(point: any): string {
    let index = state.points && Array.isArray(state.points) ? state.points.indexOf(point) : -1;
    if (index < 0 && point?.lead_id !== undefined && point?.lead_id !== null) {
        const leadId = String(point.lead_id);
        index = (state.points && Array.isArray(state.points))
            ? state.points.findIndex((candidate: any) => String(candidate.lead_id) === leadId)
            : -1;
    }
    if (index >= 0 && state.currentSearchSummary) {
        const summary = state.currentSearchSummary as any;
        if (summary.anchorIndex === index || summary.topIndex === index) {
            return 'Search Anchor';
        }
        if ((summary.resultIndices || []).includes(index)) {
            return 'Trail Step';
        }
    }
    if (
        index >= 0
        && state.navState?.mode === 'trail'
        && (state.navState.walkHistoryIndices || []).includes(index)
    ) {
        return 'Trail Step';
    }
    return 'Record';
}

export function initBridgeRegistry(actions: Record<string, any> = {}): void {
    if (typeof window === 'undefined') return;

    // 1. App State Bridges
    (window as any).__APP_STATE__ = state;
    (window as any).__TEST_STATE__ = state;

    // 2. Action Namespace
    (window as any).__APP_ACTIONS__ = {
        search: actions.search,
        clearSearch: actions.clearSearch,
        switchView: actions.switchView,
        focusOnNode: actions.focusOnNode,
        setTrailFromSeed: actions.setTrailFromSeed,
        setTrailDepth: actions.setTrailDepth,
        setSemanticDiveMode: actions.setSemanticDiveMode,
        returnToOverview: actions.returnToOverview,
        resetExperienceState: actions.resetExperienceState,
        resetExplorationFocus: actions.resetExplorationFocus,
        refreshCompositionState: actions.refreshCompositionState,
        traverseNeighbor: actions.traverseNeighbor,
        inspectThreadNeighbor: actions.inspectThreadNeighbor,
        pinThreadNeighbor: actions.pinThreadNeighbor,
        unpinThreadInspection: actions.unpinThreadInspection,
        clearThreadInspection: actions.clearThreadInspection,
        walkThreadNeighbor: actions.walkThreadNeighbor
    };

    // 3. Export internal helper to window if needed for compatibility
    (window as any)._getSelectedBusinessRoleLabel = _getSelectedBusinessRoleLabel;
}
