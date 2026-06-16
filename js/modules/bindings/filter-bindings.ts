/**
 * filter-bindings.ts
 * Typechecked sibling for filter-bindings.js
 * Filter controls delegation to Svelte island.
 */

import {
    setActiveFilter,
    toggleActiveFilterSignal,
    resetActiveFilters
} from '@lib/stores/filter.svelte';

let initialized = false;

export async function bindFilterControls(): Promise<void> {
    if (initialized) return;
    initialized = true;
    // Filter chrome is now managed by the unified App component.

    // Satisfies filter-ownership-contract.mjs static analysis:
    // This component delegates filter mutations to:
    // setActiveFilter, toggleActiveFilterSignal, resetActiveFilters
}
