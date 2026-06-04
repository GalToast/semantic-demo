// Search chrome bindings are now owned by the Svelte SearchChrome island
// (see js/modules/search-chrome-island.js). The mobile-sheet toggle, input
// debounce, Enter/Escape handling, and the clear button all live in the
// Svelte component. This file remains as the public entry point so older
// imports keep working.

import { initSearchChromeSvelteIsland } from '../search-chrome-island.js';

let initialized = false;

export function bindSearchControls() {
    if (initialized) return;
    initialized = true;
    initSearchChromeSvelteIsland();
}

export function updateHasQuery() {
    // The has-query class is now driven reactively by the SearchChrome
    // Svelte component via setSearchContainerState. This function is kept
    // as a no-op for any legacy callers that still import it.
}
