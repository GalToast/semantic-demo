// Search chrome bindings are now owned by the Svelte SearchChrome island
// (see js/modules/search-chrome-island.js). The mobile-sheet toggle, input
// debounce, Enter/Escape handling, and the clear button all live in the
// Svelte component. This file remains as the public entry point so older
// imports keep working.

let initialized = false;

export async function bindSearchControls() {
    if (initialized) return;
    initialized = true;
    const { initSearchChromeSvelteIsland } = await import('../search-chrome-island.js');
    initSearchChromeSvelteIsland();
}

export function resetSearchControlBindings() {
    initialized = false;
}

export function updateHasQuery() {
    // The has-query class is now driven reactively by the SearchChrome
    // Svelte component via setSearchContainerState. This function is kept
    // as a no-op for any legacy callers that still import it.
}
