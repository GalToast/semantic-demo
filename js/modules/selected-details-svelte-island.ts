/**
 * selected-details-svelte-island.ts
 *
 * TypeScript shadow for selected-details-svelte-island.js
 * Svelte island mount for the SelectedBusinessDetails component.
 */

import { mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import SelectedBusinessDetails from './components/SelectedBusinessDetails.svelte';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.js';

const SELECTED_DETAILS_SLOT_ID: string = 'selected-details';
const MOUNT_KEY: string = 'selected-details';

const mountedDetails: WeakMap<Element, unknown> = new WeakMap();

function clear(target: Element): void {
    const instance = mountedDetails.get(target);
    if (!instance) return;
    unmount(instance as Record<string, unknown>);
    mountedDetails.delete(target);
}

function mountSelectedDetails(): boolean {
    const slot = document.getElementById(SELECTED_DETAILS_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) return true;
    clear(slot);
    slot.replaceChildren();
    mountedDetails.set(slot, mount(SelectedBusinessDetails as Component, { target: slot, props: {} }));
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    return true;
}

export function initSelectedDetailsSvelteIsland(): void {
    awaitSlot(SELECTED_DETAILS_SLOT_ID, mountSelectedDetails);
}
