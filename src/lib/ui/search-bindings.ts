/**
 * search-bindings.ts
 * Canonical location (ported from js/modules/bindings/search-bindings.ts — W15).
 * Search controls delegation to Svelte island.
 */

let initialized = false;

export async function bindSearchControls(): Promise<void> {
    if (initialized) return;
    initialized = true;
    // Search chrome is now managed by the unified App component.
}

export function resetSearchControlBindings(): void {
    initialized = false;
}

export function updateHasQuery(): void {
    // The has-query class is now driven reactively by the SearchChrome
    // Svelte component.
}
