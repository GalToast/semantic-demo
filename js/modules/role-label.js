import { state } from '../state.js';

/**
 * role-label.js
 *
 * Pure function extracted from bridge-registry.js.
 * Determines the display role label for a business point in the current
 * application context (search anchor, trail step, or generic record).
 *
 * @param {Object} point Business point object
 * @returns {string} Role label
 */
export function _getSelectedBusinessRoleLabel(point) {
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
