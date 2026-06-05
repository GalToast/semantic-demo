/**
 * @lib/stores/filter.ts — Filter state store
 *
 * Replaces the filter slice from js/modules/filter-state.js.
 * Manages status and contact filters for the business network.
 */
import { writable, derived, get } from 'svelte/store';
import type { ActiveFilters } from '@lib/types/state';

// ── Initial State ─────────────────────────────────────────────────────────────

const INITIAL_FILTERS: ActiveFilters = {
  status: 'all',
  city: '',
  website: false,
  email: false,
  geocoded: false
};

// ── Core Store ────────────────────────────────────────────────────────────────

export const filterState = writable<ActiveFilters>({ ...INITIAL_FILTERS });

// ── Derived Convenience Stores ────────────────────────────────────────────────

/** True if any filter is active (non-default). */
export const hasActiveFilters = derived(filterState, ($f) => {
  return (
    $f.status !== 'all' ||
    $f.city !== '' ||
    $f.website ||
    $f.email ||
    $f.geocoded
  );
});

/** Number of individually active filters. */
export const activeFilterCount = derived(filterState, ($f) => {
  let count = 0;
  if ($f.status !== 'all') count++;
  if ($f.city !== '') count++;
  if ($f.website) count++;
  if ($f.email) count++;
  if ($f.geocoded) count++;
  return count;
});

/** The current status filter value. */
export const statusFilter = derived(filterState, ($f) => $f.status);

/** The current city filter value. */
export const cityFilter = derived(filterState, ($f) => $f.city);

/** Contact-related filter flags as a derived object. */
export const contactFilters = derived(filterState, ($f) => ({
  website: $f.website,
  email: $f.email,
  geocoded: $f.geocoded
}));

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Toggle a filter value.
 *
 * - For `status`: cycles through 'all' -> value -> 'all' (radio-style).
 *   Tapping the already-active status resets to 'all'.
 * - For `website`, `email`, `geocoded`: boolean toggle.
 * - For `city`: sets the city string (pass empty string to clear).
 */
export function toggleFilter(type: 'status', value: string): void;
export function toggleFilter(type: 'website' | 'email' | 'geocoded', value: boolean): void;
export function toggleFilter(type: 'city', value: string): void;
export function toggleFilter(
  type: keyof ActiveFilters,
  value: string | boolean
): void {
  filterState.update((f) => {
    switch (type) {
      case 'status': {
        // Radio behavior: re-tapping active filter resets to 'all'
        const next = f.status === value ? 'all' : (value as string);
        return { ...f, status: next };
      }
      case 'city':
        return { ...f, city: value as string };
      case 'website':
        return { ...f, website: value as boolean };
      case 'email':
        return { ...f, email: value as boolean };
      case 'geocoded':
        return { ...f, geocoded: value as boolean };
      default:
        return f;
    }
  });
}

/** Reset all filters to their initial (inactive) state. */
export function resetFilters(): void {
  filterState.set({ ...INITIAL_FILTERS });
}

/** Synchronous snapshot of the current filter state. */
export function getFilterState(): ActiveFilters {
  return get(filterState);
}
