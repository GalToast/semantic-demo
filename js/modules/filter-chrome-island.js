// @ts-check
import { mount, unmount } from 'svelte';
import FilterChrome from './components/FilterChrome.svelte';
import { setClusterFilter, clearClusterFilter } from './cluster-filter.js';
import { EVENTS, publish } from './event-bus.js';

const FILTER_CHROME_SLOT_ID = 'filter-chrome-slot';
const CLUSTER_LIST_ID = 'cluster-list';

function bindClusterList() {
    const clusterList = document.getElementById(CLUSTER_LIST_ID);
    if (!clusterList) return;
    if (clusterList.dataset.chromeSvelteBound === 'true') return;
    clusterList.addEventListener('click', (event) => {
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
    });
    clusterList.dataset.chromeSvelteBound = 'true';
}

/** @type {WeakMap<Element, Record<string, unknown>>} */
const mountedChrome = new WeakMap();

/**
 * @param {Element} target
 */
function clear(target) {
    const instance = mountedChrome.get(target);
    if (!instance) return;
    unmount(instance);
    mountedChrome.delete(target);
}

/**
 * @param {Element} target
 * @param {Record<string, unknown>} props
 */
function render(target, props) {
    clear(target);
    target.replaceChildren();
    mountedChrome.set(target, mount(FilterChrome, {
        target,
        props: {
            /** @param {string} reason */
            requestUrlStateUpdate: (reason) => {
                publish(EVENTS.URL_SYNC_REQUESTED, { params: {}, reason });
            },
            ...props
        }
    }));
}

function mountFilterChrome() {
    const slot = document.getElementById(FILTER_CHROME_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset.svelteMounted === 'filter-chrome') {
        bindClusterList();
        return true;
    }
    render(slot, {});
    slot.dataset.svelteMounted = 'filter-chrome';
    bindClusterList();
    return true;
}

export function initFilterChromeSvelteIsland() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountFilterChrome, { once: true });
    } else {
        mountFilterChrome();
    }
}
