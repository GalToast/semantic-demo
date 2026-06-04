// Filter chrome bindings are now owned by the Svelte FilterChrome island
// (see js/modules/filter-chrome-island.js). The cluster-list click delegation
// is also wired up there because it shares the same lifecycle as the chips.
// This file remains as the public entry point so older imports keep working.

import { initFilterChromeSvelteIsland } from '../filter-chrome-island.js';

let initialized = false;

export function bindFilterControls() {
    if (initialized) return;
    initialized = true;
    initFilterChromeSvelteIsland();
}
