// @ts-check
/**
 * cluster-list-delegate.js
 *
 * Click delegation for the cluster-list semantic neighborhood rail. The
 * `#cluster-list` element lives in static HTML and is dynamically
 * re-populated by `cluster-filter.js:updateClusterList()` via setChildren.
 * The parent node never changes, so a single click listener attached
 * here survives every re-render.
 *
 * Targets:
 *   .cluster-clear-btn      — clear the active cluster filter
 *   .cluster-empty-clear    — clear-all from the empty-state fallback
 *   [data-cluster]          — activate the cluster whose data-cluster attr matches
 *
 * Self-guards: a dataset flag prevents double-binding if init runs more
 * than once.
 */

import { setClusterFilter, clearClusterFilter } from './cluster-filter.js';

const CLUSTER_LIST_ID = 'cluster-list';
const BOUND_FLAG = 'chromeSvelteBound';

/**
 * @param {Event} event
 */
function handleClusterListClick(event) {
    const eventTarget = event.target;
    const target = /** @type {HTMLElement|null} */ (
        eventTarget && typeof eventTarget === 'object' && 'closest' in eventTarget
            ? eventTarget
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
        const clusterIndex = Number(clusterItem.dataset.cluster);
        if (Number.isFinite(clusterIndex)) {
            setClusterFilter(clusterIndex);
        }
    }
}

/**
 * Idempotent. Pass a root to scope the lookup (testability); falls back to
 * the document when no root is provided.
 *
 * @param {ParentNode} [root]
 * @returns {boolean} true if the delegation was bound (or was already bound), false if no cluster list was found
 */
export function bindClusterListDelegation(root) {
    const scope = root || document;
    const clusterList = scope.querySelector
        ? /** @type {HTMLElement|null} */ (scope.querySelector(`#${CLUSTER_LIST_ID}`))
        : null;
    if (!clusterList) return false;
    if (clusterList.dataset[BOUND_FLAG] === 'true') return true;
    clusterList.addEventListener('click', handleClusterListClick);
    clusterList.dataset[BOUND_FLAG] = 'true';
    return true;
}
