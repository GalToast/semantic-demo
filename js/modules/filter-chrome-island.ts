// filter-chrome-island.ts
// TypeScript shadow of filter-chrome-island.js
// Mounts the FilterChrome Svelte component into its slot div.

import { mount, unmount } from 'svelte';
import FilterChrome from './components/FilterChrome.svelte';
import { bindClusterListDelegation } from './cluster-list-delegate.ts';
import { EVENTS, publish } from './event-bus.ts';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.ts';

const FILTER_CHROME_SLOT_ID = 'filter-chrome-slot';
const MOUNT_KEY = 'filter-chrome';

const mountedChrome = new WeakMap<Element, Record<string, unknown>>();

function clear(target: Element): void {
    const instance = mountedChrome.get(target);
    if (!instance) return;
    unmount(instance);
    mountedChrome.delete(target);
}

function render(target: Element, props: Record<string, unknown>): void {
    clear(target);
    target.replaceChildren();
    mountedChrome.set(target, mount(FilterChrome, {
        target,
        props: {
            requestUrlStateUpdate: (reason: string) => {
                publish(EVENTS.URL_SYNC_REQUESTED, { params: {}, reason });
            },
            ...props
        }
    }) as unknown as Record<string, unknown>);
}

function mountFilterChrome(): boolean {
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

export function initFilterChromeSvelteIsland(): void {
    awaitSlot(FILTER_CHROME_SLOT_ID, mountFilterChrome);
}
