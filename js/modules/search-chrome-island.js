// @ts-check
import { mount, unmount } from 'svelte';
import SearchChrome from './components/SearchChrome.svelte';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.js';

const SEARCH_CHROME_SLOT_ID = 'search-chrome-slot';
const MOUNT_KEY = 'search-chrome';

const mountedChrome = new WeakMap();

function clear(target) {
    const instance = mountedChrome.get(target);
    if (!instance) return;
    unmount(instance);
    mountedChrome.delete(target);
}

function render(target, props) {
    clear(target);
    target.replaceChildren();
    mountedChrome.set(target, mount(SearchChrome, { target, props }));
}

function mountSearchChrome() {
    const slot = document.getElementById(SEARCH_CHROME_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) return true;
    render(slot, {});
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    return true;
}

export function initSearchChromeSvelteIsland() {
    awaitSlot(SEARCH_CHROME_SLOT_ID, mountSearchChrome);
}
