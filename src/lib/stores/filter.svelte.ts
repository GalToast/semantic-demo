/**
 * @lib/stores/filter.svelte.ts — Filter state store
 *
 * Replaces js/modules/filter-state.js and the filter slice from state.js.
 * Manages status, city, and contact-feature filters for the business network.
 * Canonical owner for filter ↔ state sync.
 */
import { derived, type Readable } from 'svelte/store';
import { toStore } from 'svelte/store';
import { appState } from '@lib/state/app.svelte.ts';
import type { ActiveFilters } from '@lib/types/state';

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FILTERS: ActiveFilters = {
  status: 'all',
  city: '',
  website: false,
  email: false,
  geocoded: false
};

// ── Core Stores ───────────────────────────────────────────────────────────────

/** Version counter — incremented on every filter change. */
export const filterVersion = toStore(
  () => appState.filterVersion,
  (v) => appState.withMutation(() => { appState.filterVersion = v; })
);

/** Color recompute version — incremented when cluster colors should recalc. */
export const filterColorVersion = toStore(
  () => appState.filterColorVersion,
  (v) => appState.withMutation(() => { appState.filterColorVersion = v; })
);

/** Active cluster filter (null = show all clusters). */
export const activeClusterFilter = toStore(
  () => appState.activeClusterFilter !== null ? String(appState.activeClusterFilter) : null,
  (v) => appState.withMutation(() => { appState.activeClusterFilter = v !== null ? Number(v) : null; })
);

/** Alias for compatibility with legacy SearchResultsList. */
export const activeClusterFilterStore = activeClusterFilter;

/** Active filters — the single source of truth for filter state. */
export const filterState = toStore(
  () => ({ ...appState.activeFilters }),
  (val) => appState.withMutation(() => { appState.activeFilters = val; })
);

// ── Derived Convenience Stores ─────────────────────────────────────────────────

/** True if any filter is active (non-default). */
export const hasActiveFilters: Readable<boolean> = derived(
  filterState,
  ($filterState) =>
    $filterState.status !== 'all' ||
    $filterState.city !== '' ||
    $filterState.website ||
    $filterState.email ||
    $filterState.geocoded
);

/** Number of individually active filters. */
export const activeFilterCount: Readable<number> = derived(filterState, ($filterState) => {
  let count = 0;
  if ($filterState.status !== 'all') count++;
  if ($filterState.city !== '') count++;
  if ($filterState.website) count++;
  if ($filterState.email) count++;
  if ($filterState.geocoded) count++;
  return count;
});

/** The current status filter value. */
export const statusFilter: Readable<string> = derived(filterState, ($filterState) => $filterState.status);

/** The current city filter value. */
export const cityFilter: Readable<string> = derived(filterState, ($filterState) => $filterState.city);

/** Contact-related filter flags as a derived object. */
export const contactFilters: Readable<{ website: boolean; email: boolean; geocoded: boolean }> = derived(
  filterState,
  ($filterState) => ({
    website: $filterState.website,
    email: $filterState.email,
    geocoded: $filterState.geocoded
  })
);

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
  filterState.update((current) => {
    const next = { ...current };
    switch (type) {
      case 'status': {
        next.status = next.status === value ? 'all' : (value as string);
        break;
      }
      case 'city': {
        // Normalize 'all' sentinel from legacy to '' so city='all' is not counted active.
        next.city = (value === 'all') ? '' : (value as string);
        break;
      }
      case 'website':
        next.website = value as boolean;
        break;
      case 'email':
        next.email = value as boolean;
        break;
      case 'geocoded':
        next.geocoded = value as boolean;
        break;
    }
    return next;
  });

  // Bump versions
  filterVersion.update((v) => v + 1);
  filterColorVersion.update((v) => v + 1);

  // Sync body data attribute for CSS
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.filtersActive = 'false';
    // Note: hasActiveFilters requires subscription, so we set a reactive value instead
    // by re-reading after update.
    filterState.subscribe((f) => {
      const active =
        f.status !== 'all' || f.city !== '' || f.website || f.email || f.geocoded;
      document.body.dataset.filtersActive = String(active);
    })();
  }
}

/**
 * Overwrite all filters at once (from legacy filter-state.js).
 * Bumps versions and syncs body attribute.
 */
export function overwriteActiveFilters(filters: ActiveFilters): void {
  // Normalize 'all' sentinel from legacy to '' so city='all' is not counted active.
  filterState.set({
    status: filters.status,
    city: filters.city === 'all' ? '' : filters.city,
    website: filters.website,
    email: filters.email,
    geocoded: filters.geocoded
  });
  filterVersion.update((v) => v + 1);
  filterColorVersion.update((v) => v + 1);

  if (typeof document !== 'undefined' && document.body) {
    const f = filters;
    const active =
      f.status !== 'all' || f.city !== '' || f.website || f.email || f.geocoded;
    document.body.dataset.filtersActive = String(active);
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
  let result = { ...INITIAL_FILTERS };
  const unsub = filterState.subscribe((v) => { result = v; });
  unsub();
  return result;
}

/** Check if a specific point matches the active filters. */
export function pointMatchesActiveFilters(
  point: { status?: string; city?: string; website?: string | null; email?: string | null; geocoded?: boolean } | null,
  filters?: ActiveFilters
): boolean {
  if (!point) return false;
  const f = filters ?? getFilterState();

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
