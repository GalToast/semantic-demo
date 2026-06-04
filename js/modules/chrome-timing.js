/**
 * chrome-timing.js
 *
 * Centralized timing constants for the filter + search chrome. The Svelte
 * chrome components use these as the default value for their `debounceMs`
 * prop so global timing tweaks (slow-network simulation, contract-test
 * reproducibility) can be made in one place.
 *
 * Per-component `debounceMs` props still win when a caller passes an
 * override; these constants are just the defaults.
 */

export const SEARCH_INPUT_DEBOUNCE_MS = 300;
export const FILTER_DEBOUNCE_MS = 150;
