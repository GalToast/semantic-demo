let initialized = false;

export async function bindSearchControls() {
    if (initialized) return;
    initialized = true;
    // Search chrome is now managed by the unified App component.
}

export function resetSearchControlBindings() {
    initialized = false;
}

export function updateHasQuery() {
    // The has-query class is now driven reactively by the SearchChrome
    // Svelte component.
}
