import { appState } from '@lib/state/app.svelte'
import type { Point } from '@lib/state/state-types'

/**
 * role-label.ts
 *
 * Pure function: determines the display role label for a business point in the
 * current application context (search anchor, trail step, or generic record).
 * Ported from — no side-effects.
 */
export function _getSelectedBusinessRoleLabel(point: Point): string {
    const points = appState.points
    let index = Array.isArray(points) ? points.indexOf(point) : -1

    if (index < 0 && point?.lead_id !== undefined && point?.lead_id !== null) {
        const leadId = String(point.lead_id)
        index = Array.isArray(points)
            ? points.findIndex((candidate: Point) => String(candidate.lead_id) === leadId)
            : -1
    }

    if (index >= 0 && appState.currentSearchSummary) {
        const summary = appState.currentSearchSummary
        if (summary.anchorIndex === index || summary.topIndex === index) {
            return 'Search Anchor'
        }
        if ((summary.resultIndices || []).includes(index)) {
            return 'Trail Step'
        }
    }

    if (
        index >= 0 &&
        appState.navState?.mode === 'trail' &&
        (appState.navState.walkHistoryIndices || []).includes(index)
    ) {
        return 'Trail Step'
    }

    return 'Record'
}
