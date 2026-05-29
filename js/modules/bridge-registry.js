import { state } from '../state.js';

/**
 * bridge-registry.js
 *
 * Compatibility layer for legacy global window assignments.
 * Consolidates all window.* hooks used by tests, devtools, and third-party scripts.
 */

/**
 * Internal helper for determining business role labels in the action namespace.
 */
function _getSelectedBusinessRoleLabel(point) {
    let index = state.points && Array.isArray(state.points) ? state.points.indexOf(point) : -1;
    if (index < 0 && point?.lead_id !== undefined && point?.lead_id !== null) {
        const leadId = String(point.lead_id);
        index = (state.points && Array.isArray(state.points))
            ? state.points.findIndex((candidate) => String(candidate.lead_id) === leadId)
            : -1;
    }
    if (index >= 0 && state.currentSearchSummary) {
        if (state.currentSearchSummary.anchorIndex === index || state.currentSearchSummary.topIndex === index) {
            return 'Search Anchor';
        }
        if ((state.currentSearchSummary.resultIndices || []).includes(index)) {
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

/**
 * Registers all application bridges and action aliases.
 * Called once during application bootstrap.
 */
export function initBridgeRegistry(actions = {}) {
    if (typeof window === 'undefined') return;

    // 1. App State Bridges
    window.__APP_STATE__ = state;
    window.__TEST_STATE__ = state; // Legacy fallback

    // 2. Action Namespace (Consumers: Playwright, visual-audit)
    window.__APP_ACTIONS__ = {
        search: actions.search,
        clearSearch: actions.clearSearch,
        focusOnNode: actions.focusOnNode,
        setTrailFromSeed: actions.setTrailFromSeed,
        setTrailDepth: actions.setTrailDepth,
        setSemanticDiveMode: actions.setSemanticDiveMode,
        returnToOverview: actions.returnToOverview,
        resetExperienceState: actions.resetExperienceState,
        resetExplorationFocus: actions.resetExplorationFocus,
        refreshCompositionState: actions.refreshCompositionState
    };

    // 3. Export internal helper to window if needed for compatibility
    window._getSelectedBusinessRoleLabel = _getSelectedBusinessRoleLabel;
}
