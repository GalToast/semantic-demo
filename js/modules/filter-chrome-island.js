// @ts-check
import { mount, unmount } from 'svelte';
import FilterChrome from './components/FilterChrome.svelte';
import { bindClusterListDelegation } from './cluster-list-delegate.js';
import { EVENTS, publish } from './event-bus.js';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.js';

const FILTER_CHROME_SLOT_ID = 'filter-chrome-slot';
const MOUNT_KEY = 'filter-chrome';

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
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) {
        bindClusterListDelegation();
        return true;
    }
    render(slot, {});
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    bindClusterListDelegation();
    return true;
}

export function initFilterChromeSvelteIsland() {
    awaitSlot(FILTER_CHROME_SLOT_ID, mountFilterChrome);
}
