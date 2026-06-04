// @ts-check
import { mount, unmount } from 'svelte';
import SearchChrome from './components/SearchChrome.svelte';

const SEARCH_CHROME_SLOT_ID = 'search-chrome-slot';

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
    mountedChrome.set(target, mount(SearchChrome, { target, props }));
}

function mountSearchChrome() {
    const slot = document.getElementById(SEARCH_CHROME_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset.svelteMounted === 'search-chrome') return true;
    render(slot, {});
    slot.dataset.svelteMounted = 'search-chrome';
    return true;
}

export function initSearchChromeSvelteIsland() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountSearchChrome, { once: true });
    } else {
        mountSearchChrome();
    }
}
