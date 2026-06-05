// @ts-check
import { writable } from 'svelte/store';

// ============================================================================
// SVELTE NATIVE STORES
// ============================================================================
// These mirror five fields of the monolithic state object in state.js. Vanilla
// JS writers MUST keep state and the store in sync — see the state ↔ store sync
// contract in state.js for the field/owner map.
//
// Svelte components should subscribe to these directly (e.g. $activeFiltersStore).
// For read+write chrome UI (panel toggles), use the stores directly without a
// state.js field.

/** @type {import('svelte/store').Writable<string>} */
export const currentViewStore = writable('galaxy');

/** @type {import('svelte/store').Writable<string>} */
export const semanticThreadsStatusStore = writable('idle');

// Initialize open on desktop, closed on mobile/narrow viewports
const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
export const isInfoPanelOpenStore = writable(isDesktop);
export const isLegendPanelOpenStore = writable(false);

/** @type {import('svelte/store').Writable<string>} */
export const loadingPhaseKeyStore = writable('records');

/** @type {import('svelte/store').Writable<any>} */
export const activeFiltersStore = writable({
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
});

/** @type {import('svelte/store').Writable<number|null>} */
export const activeClusterFilterStore = writable(null);

// ==== SEARCH STORES ====

/** @type {import('svelte/store').Writable<any[]>} */
export const searchResultsStore = writable([]);

/** @type {import('svelte/store').Writable<any|null>} */
export const searchSummaryStore = writable(null);

/** @type {import('svelte/store').Writable<boolean>} */
export const isSearchingStore = writable(false);

/** @type {import('svelte/store').Writable<any|null>} */
export const searchErrorStore = writable(null);

/** @type {import('svelte/store').Writable<number>} */
export const searchVisibleCountStore = writable(5);

// ==== SELECTION STORES ====

/** @type {import('svelte/store').Writable<any|null>} */
export const selectedPointStore = writable(null);

// ==== COMPOSITION STORES ====

/** @type {import('svelte/store').Writable<any>} */
export const compositionStore = writable({
    activeView: 'galaxy',
    trailState: 'inactive',
    trailDepth: '0',
    graphContext: 'idle',
    mapContext: 'idle',
    semanticDive: 'inactive',
    panelSurface: 'idle',
    panelSurfaceDetail: 'peek',
    searchGlow: 'inactive',
    isActive: false
});

// ==== WEATHER STORES ====

/** @type {import('svelte/store').Writable<any|null>} */
export const weatherStateStore = writable({
    weather: null,
    lastFetch: null,
    fallback: false,
    stalenessMsg: ''
});

// ==== SEMANTIC GUIDE STORES ====

/** @type {import('svelte/store').Writable<any>} */
export const semanticGuideStateStore = writable({
    isVisible: false,
    isSynthesizing: false,
    config: null,
    typeToken: 0,
    buttonMode: 'ready'
});
