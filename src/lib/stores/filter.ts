/**
 * @lib/stores/filter.ts — Filter state store
 *
 * Replaces js/modules/filter-state.js and the filter slice from state.js.
 * Manages status, city, and contact-feature filters for the business network.
 * Canonical owner for filter ↔ state sync.
 */
import { writable, derived, get } from 'svelte/store';
import type { ActiveFilters } from '@lib/types/state';

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FILTERS: ActiveFilters = {
  status: 'all',
  city: '',
  website: false,
  email: false,
  geocoded: false
};

// ── Core Store ───────────────────────────────────────────────────────────────

/** Version counter — incremented on every filter change. */
export const filterVersion = writable(0);

/** Color recompute version — incremented when cluster colors should recalc. */
export const filterColorVersion = writable(0);

/** Active cluster filter (null = show all clusters). */
export const activeClusterFilter = writable<string | null>(null);

/** Alias for compatibility with legacy SearchResultsList. */
export const activeClusterFilterStore = activeClusterFilter;

/** Active filters — the single source of truth for filter state. */
export const filterState = writable<ActiveFilters>({ ...INITIAL_FILTERS });

// ── Derived Convenience Stores ───────────────────────────────────────────────

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

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Toggle a filter value.
 *
 * - For `status`: cycles through 'all' -> value -> 'all' (radio-style).
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
        const next = f.status === value ? 'all' : (value as string);
        return { ...f, status: next };
      }
      case 'city': {
        // Normalize 'all' sentinel from legacy to '' so city='all' is not counted active.
        const normalized = (value === 'all') ? '' : (value as string);
        return { ...f, city: normalized };
      }
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

  // Bump versions
  filterVersion.update((v) => v + 1);
  filterColorVersion.update((v) => v + 1);

  // Sync body data attribute for CSS
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.filtersActive = String(get(hasActiveFilters));
  }
}

/**
 * Overwrite all filters at once (from legacy filter-state.js).
 * Bumps versions and syncs body attribute.
 */
export function overwriteActiveFilters(filters: ActiveFilters): void {
  // Normalize 'all' sentinel from legacy to '' so city='all' is not counted active.
  const normalized = { ...filters };
  if (normalized.city === 'all') normalized.city = '';
  filterState.set(normalized);
  filterVersion.update((v) => v + 1);
  filterColorVersion.update((v) => v + 1);

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.filtersActive = String(
      filters.status !== 'all' ||
      filters.city !== '' ||
      filters.website ||
      filters.email ||
      filters.geocoded
    );
  }
}

/** Set the active cluster filter. */
export function setClusterFilter(cluster: string | null): void {
  activeClusterFilter.set(cluster);
}

/** Reset all filters to their initial (inactive) state. */
export function resetFilters(): void {
  filterState.set({ ...INITIAL_FILTERS });
  activeClusterFilter.set(null);
  filterVersion.update((v) => v + 1);
  filterColorVersion.update((v) => v + 1);

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.filtersActive = 'false';
  }
}

/** Synchronous snapshot of the current filter state. */
export function getFilterState(): ActiveFilters {
  return get(filterState);
}

/** Check if a specific point matches the active filters. */
export function pointMatchesActiveFilters(
  point: { status?: string; city?: string; website?: string | null; email?: string | null; geocoded?: boolean } | null,
  filters?: ActiveFilters
): boolean {
  if (!point) return false;
  const f = filters ?? get(filterState);

  if (f.status !== 'all' && point.status !== f.status) return false;
  if (f.city !== '' && normalizeCityForFilter(point.city) !== normalizeCityForFilter(f.city)) return false;
  if (f.website && !point.website) return false;
  if (f.email && !point.email) return false;
  if (f.geocoded && !point.geocoded) return false;

  return true;
}

/**
 * Normalize a city name for consistent filter comparison.
 * Lowercases, trims, removes trailing " tx" or ", tx" suffixes.
 */
function normalizeCityForFilter(city: string | undefined): string {
  if (!city) return '';
  return city
    .toLowerCase()
    .trim()
    .replace(/,?\s*tx$/, '');
}
