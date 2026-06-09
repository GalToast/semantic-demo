/**
 * search-chrome-island.ts
 *
 * TypeScript shadow for search-chrome-island.js
 * Svelte island mount for the SearchChrome component.
 */

import { mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import SearchChrome from './components/SearchChrome.svelte';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.ts';

const SEARCH_CHROME_SLOT_ID: string = 'search-chrome-slot';
const MOUNT_KEY: string = 'search-chrome';

const mountedChrome: WeakMap<Element, unknown> = new WeakMap();

function clear(target: Element): void {
    const instance = mountedChrome.get(target);
    if (!instance) return;
    unmount(instance as Record<string, unknown>);
    mountedChrome.delete(target);
}

function render(target: Element, props: Record<string, unknown>): void {
    clear(target);
    target.replaceChildren();
    mountedChrome.set(target, mount(SearchChrome as Component, { target, props }));
}

function mountSearchChrome(): boolean {
    const slot = document.getElementById(SEARCH_CHROME_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) return true;
    render(slot, {});
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    return true;
}

export function initSearchChromeSvelteIsland(): void {
    awaitSlot(SEARCH_CHROME_SLOT_ID, mountSearchChrome);
}
