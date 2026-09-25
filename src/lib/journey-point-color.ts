/**
 * src/lib/journey-point-color.ts
 *
 * Thread lens description for selected business cards.
 * Shadow of js/modules/journey-point-color.js
 */

import { describeCluster } from './utils';

interface BusinessPoint {
    lead_id?: string | number;
    name?: string;
    cluster?: number;
    status?: string;
    myceliumMode?: string;
    semanticNeighborMapByLeadId?: Map<string, { neighbors: unknown[] }>;
}

const LENS_BY_MODE: Record<string, string> = {
    bloom: 'Signal-rich — surfaced for businesses with a website plus email or phone',
    bridge: 'Between neighborhoods — highlighted for businesses linking neighborhoods',
    trail: 'Connection Trail — focused on semantic neighbors of {name}',
    default: '{cluster} neighborhood'
};

export function describeThreadLensForPoint(point: BusinessPoint | null | undefined): string {
    if (!point) return 'Waiting for a semantic thread.';

    const leadId = point.lead_id !== undefined && point.lead_id !== null
        ? String(point.lead_id).trim()
        : null;

    const neighborRecord = leadId && point.semanticNeighborMapByLeadId
        ? point.semanticNeighborMapByLeadId.get(leadId)
        : null;

    if (!neighborRecord) {
        const mode = point.myceliumMode || 'default';
        const clusterLabel = describeCluster(point.cluster);
        const name = point.name ? `the focused business` : 'this business';

        const base = LENS_BY_MODE[mode] || 'County View';
        const result = base.replace('{name}', name).replace('{cluster}', clusterLabel || 'County');
        
        if (point.status === 'disqualified') return 'Archive layer — ' + result;
        return result;
    }

    const neighborCount = Array.isArray((neighborRecord as any).neighbors) ? (neighborRecord as any).neighbors.length : 0;
    const clusterLabel = describeCluster(point.cluster);

    if (neighborCount === 0) {
        return 'Isolated node — no semantic connections yet.';
    }
    if (neighborCount <= 3) {
        return `Sparse node — only ${neighborCount} connection${neighborCount === 1 ? '' : 's'}.`;
    }
    if (neighborCount >= 20) {
        const anchorWord = clusterLabel ? clusterLabel : 'County';
        return `Strong anchor in ${anchorWord} cluster with ${neighborCount} semantic neighbors.`;
    }
    return `Connected node — ${neighborCount} semantic neighbors in ${clusterLabel || 'local'} cluster.`;
}