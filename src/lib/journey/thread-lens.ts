/**
 * @lib/journey/thread-lens.ts — Three-free thread lens description.
 *
 * Extracted from point-color.ts (W45) so the entry chunk's adapter-deps
 * import path no longer pulls `three` via point-color's top-level
 * `new Color()`. describeThreadLensForPoint is pure string logic and has
 * never used Color; the WebGL color functions remain in point-color.ts.
 */
import { appState as state } from '@lib/state/app.svelte'
import type { BusinessRecord } from '@lib/types/business'
import { describeCluster } from '@lib/utils/ui-presentation'
import { formatBusinessName } from '@lib/utils/dom-formatters'

const _state = state

export function describeThreadLensForPoint(point: BusinessRecord): string {
    if (!point) return 'No related businesses yet.'

    const leadId = point.lead_id !== undefined && point.lead_id !== null ? String(point.lead_id).trim() : null

    const neighborRecord =
        leadId && _state.semanticNeighborMapByLeadId ? _state.semanticNeighborMapByLeadId.get(leadId) : null

    if (!neighborRecord) {
        const mode = _state.myceliumMode || 'default'
        const clusterLabel = describeCluster(point.cluster)
        const LENS_BY_MODE: Record<string, string> = {
            bloom: 'Has website and contact info on file',
            bridge: 'Connects different kinds of businesses',
            trail:
                'Showing connections from ' +
                (point.name ? formatBusinessName(point.name) : 'this business'),
            default: clusterLabel
                ? 'Similar to ' + clusterLabel + ' businesses'
                : 'All Montgomery County businesses'
        }
        const base = (LENS_BY_MODE[mode] ?? LENS_BY_MODE.default)!
        if (point.status === 'disqualified') return 'No longer active. Was a ' + base
        return base
    }

    const neighborCount = Array.isArray(neighborRecord.neighbors) ? neighborRecord.neighbors.length : 0
    const clusterLabel = describeCluster(point.cluster)

    if (neighborCount === 0) {
        return 'No similar businesses found.'
    }
    if (neighborCount <= 3) {
        return 'Only ' + neighborCount + ' similar business' + (neighborCount === 1 ? '' : 'es') + '.'
    }
    if (neighborCount >= 20) {
        const anchorWord = clusterLabel ? clusterLabel : 'Montgomery County'
        return 'One of ' + neighborCount + ' similar ' + anchorWord + ' businesses.'
    }
    return neighborCount + ' similar ' + (clusterLabel || 'local') + ' businesses.'
}
