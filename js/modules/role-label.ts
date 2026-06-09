import { state } from '../state.ts';
import type { Point, SemanticState } from '../../types/state';

/**
 * role-label.js
 *
 * Pure function extracted from bridge-registry.js.
 * Determines the display role label for a business point in the current
 * application context (search anchor, trail step, or generic record).
 */
export function _getSelectedBusinessRoleLabel(point: Point): string {
    const _s = state as unknown as SemanticState;
    let index = _s.points && Array.isArray(_s.points) ? _s.points.indexOf(point) : -1;
    if (index < 0 && point?.lead_id !== undefined && point?.lead_id !== null) {
        const leadId = String(point.lead_id);
        index = (_s.points && Array.isArray(_s.points))
            ? _s.points.findIndex((candidate) => String(candidate.lead_id) === leadId)
            : -1;
    }
    if (index >= 0 && _s.currentSearchSummary) {
        const summary = _s.currentSearchSummary as { anchorIndex?: number; topIndex?: number; resultIndices?: number[] };
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
