// @ts-check
import { mount, unmount } from 'svelte';
import SelectedBusinessDetails from './components/SelectedBusinessDetails.svelte';
import { awaitSlot, MOUNT_FLAG } from './island-mount-helper.js';

const SELECTED_DETAILS_SLOT_ID = 'selected-details';
const MOUNT_KEY = 'selected-details';

const mountedDetails = new WeakMap();

/** @param {Element} target */
function clear(target) {
    const instance = mountedDetails.get(target);
    if (!instance) return;
    unmount(instance);
    mountedDetails.delete(target);
}

function mountSelectedDetails() {
    const slot = document.getElementById(SELECTED_DETAILS_SLOT_ID);
    if (!slot) return false;
    if (slot.dataset[MOUNT_FLAG] === MOUNT_KEY) return true;
    clear(slot);
    slot.replaceChildren();
    mountedDetails.set(slot, mount(SelectedBusinessDetails, { target: slot, props: {} }));
    slot.dataset[MOUNT_FLAG] = MOUNT_KEY;
    return true;
}

export function initSelectedDetailsSvelteIsland() {
    awaitSlot(SELECTED_DETAILS_SLOT_ID, mountSelectedDetails);
}
