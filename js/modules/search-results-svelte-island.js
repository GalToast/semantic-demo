// @ts-check
import { mount, unmount } from 'svelte';
import SearchResultsList from './components/SearchResultsList.svelte';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.js';

const SEARCH_RESULTS_SLOT_ID = 'search-results';
const MOUNT_KEY = 'search-results';

const mountedResults = new WeakMap();

function clear(target) {
    const instance = mountedResults.get(target);
    if (!instance) return;
    unmount(instance);
    mountedResults.delete(target);
}

function mountSearchResults() {
    const slot = document.getElementById(SEARCH_RESULTS_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) return true;
    clear(slot);
    slot.replaceChildren();
    mountedResults.set(slot, mount(SearchResultsList, { target: slot, props: {} }));
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    return true;
}

export function initSearchResultsSvelteIsland() {
    awaitSlot(SEARCH_RESULTS_SLOT_ID, mountSearchResults);
}
