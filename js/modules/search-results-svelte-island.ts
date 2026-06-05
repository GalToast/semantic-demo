/**
 * search-results-svelte-island.ts
 *
 * TypeScript shadow for search-results-svelte-island.js
 * Svelte island mount for the SearchResultsList component.
 */

import { mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import SearchResultsList from './components/SearchResultsList.svelte';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.js';

const SEARCH_RESULTS_SLOT_ID: string = 'search-results';
const MOUNT_KEY: string = 'search-results';

const mountedResults: WeakMap<Element, unknown> = new WeakMap();

function clear(target: Element): void {
    const instance = mountedResults.get(target);
    if (!instance) return;
    unmount(instance as Record<string, unknown>);
    mountedResults.delete(target);
}

function mountSearchResults(): boolean {
    const slot = document.getElementById(SEARCH_RESULTS_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) return true;
    clear(slot);
    slot.replaceChildren();
    mountedResults.set(slot, mount(SearchResultsList as Component, { target: slot, props: {} }));
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    return true;
}

export function initSearchResultsSvelteIsland(): void {
    awaitSlot(SEARCH_RESULTS_SLOT_ID, mountSearchResults);
}
