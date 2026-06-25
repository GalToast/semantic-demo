/**
 * @lib/journey/thread-lens.ts — Three-free thread lens description.
 *
 * Extracted from point-color.ts (W45) so the entry chunk's adapter-deps
 * import path no longer pulls `three` via point-color's top-level
 * `new Color()`. describeThreadLensForPoint is pure string logic and has
 * never used Color; the WebGL color functions remain in point-color.ts.
 */
import { appState as state } from '@lib/state/app.svelte'
import { describeCluster } from '@lib/utils/ui-presentation'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import type { BusinessRecord } from '@lib/types/business'

const _state = state

export function describeThreadLensForPoint(point: BusinessRecord): string {
    if (!point) return 'Waiting for a semantic thread.'

    const leadId = point.lead_id !== undefined && point.lead_id !== null ? String(point.lead_id).trim() : null

    const neighborRecord =
        leadId && _state.semanticNeighborMapByLeadId ? _state.semanticNeighborMapByLeadId.get(leadId) : null

    if (!neighborRecord) {
        const mode = _state.myceliumMode || 'default'
        const clusterLabel = describeCluster(point.cluster)
        const LENS_BY_MODE: Record<string, string> = {
            bloom: 'Signal-rich — surfaced for businesses with a website plus email or phone',
            bridge: 'Between neighborhoods — highlighted for businesses linking neighborhoods',
            trail:
                'Connection Trail — focused on semantic neighbors of ' +
                (point.name ? formatBusinessName(point.name) : 'the focused business'),
            default: clusterLabel ? clusterLabel + ' neighborhood' : 'County View'
        }
        const base = (LENS_BY_MODE[mode] ?? LENS_BY_MODE.default)!
        if (point.status === 'disqualified') return 'Archive layer — ' + base
        return base
    }

    const neighborCount = Array.isArray(neighborRecord.neighbors) ? neighborRecord.neighbors.length : 0
    const clusterLabel = describeCluster(point.cluster)

    if (neighborCount === 0) {
        return 'Isolated node — no semantic connections yet.'
    }
    if (neighborCount <= 3) {
        return 'Sparse node — only ' + neighborCount + ' connection' + (neighborCount === 1 ? '' : 's') + '.'
    }
    if (neighborCount >= 20) {
        const anchorWord = clusterLabel ? clusterLabel : 'County'
        return 'Strong anchor in ' + anchorWord + ' cluster with ' + neighborCount + ' semantic neighbors.'
    }
    return 'Connected node — ' + neighborCount + ' semantic neighbors in ' + (clusterLabel || 'local') + ' cluster.'
}
