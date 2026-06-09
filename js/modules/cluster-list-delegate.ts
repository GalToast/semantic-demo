// cluster-list-delegate.ts
// TypeScript shadow of cluster-list-delegate.js
// Click delegation for the cluster-list semantic neighborhood rail.

import { setClusterFilter, clearClusterFilter } from './cluster-filter.js';

const CLUSTER_LIST_ID = 'cluster-list';
const BOUND_FLAG = 'chromeSvelteBound';

function handleClusterListClick(event: Event): void {
    const eventTarget = event.target;
    const target = (
        eventTarget && typeof eventTarget === 'object' && 'closest' in eventTarget
            ? eventTarget as Element
            : null
    );
    if (!target) return;

    const clearBtn = target.closest('.cluster-clear-btn');
    if (clearBtn) {
        event.stopPropagation();
        clearClusterFilter();
        return;
    }
    const emptyClear = target.closest('.cluster-empty-clear');
    if (emptyClear) {
        clearClusterFilter();
        return;
    }
    const clusterItem = target.closest('[data-cluster]');
    if (clusterItem instanceof HTMLElement) {
        const clusterIndex = Number((clusterItem as HTMLElement).dataset.cluster);
        if (Number.isFinite(clusterIndex)) {
            setClusterFilter(clusterIndex);
        }
    }
}

/**
 * Idempotent. Pass a root to scope the lookup; falls back to the document.
 */
export function bindClusterListDelegation(root?: ParentNode): boolean {
    const scope = root || document;
    const clusterList = scope.querySelector
        ? (scope.querySelector(`#${CLUSTER_LIST_ID}`) as HTMLElement | null)
        : null;
    if (!clusterList) return false;
    if (clusterList.dataset[BOUND_FLAG] === 'true') return true;
    clusterList.addEventListener('click', handleClusterListClick);
    clusterList.dataset[BOUND_FLAG] = 'true';
    return true;
}
