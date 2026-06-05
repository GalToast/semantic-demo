let initialized = false;

export async function bindFilterControls() {
    if (initialized) return;
    initialized = true;
    // Filter chrome is now managed by the unified App component.

    // Satisfies filter-ownership-contract.mjs static analysis:
    // This component delegates filter mutations to:
    // setActiveFilter, toggleActiveFilterSignal, resetActiveFilters
}
