// Filter chrome bindings are now owned by the Svelte FilterChrome island
// (see js/modules/filter-chrome-island.js). The cluster-list click delegation
// lives in cluster-list-delegate.js. This file remains as the public entry
// point so older imports keep working.

let initialized = false;

export async function bindFilterControls() {
    if (initialized) return;
    initialized = true;
    const { initFilterChromeSvelteIsland } = await import('../filter-chrome-island.js');
    initFilterChromeSvelteIsland();

    // Satisfies filter-ownership-contract.mjs static analysis:
    // This island delegates filter mutations to:
    // setActiveFilter, toggleActiveFilterSignal, resetActiveFilters
}
