/**
 * @lib/stores/filter.svelte.ts — Filter state store
 *
 * Replaces js/modules/filter-state.js and the filter slice from state.js.
 * Manages status, city, and contact-feature filters for the business network.
 * Canonical owner for filter ↔ state sync.
 */
import { derived, get, writable, type Readable } from 'svelte/store';
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

/**
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` replaces the writable's notifying `set` with the user's custom
 *   setter. In Svelte runtime this works because the render_effect re-reads the
 *   getter after mutations and calls the underlying writable's `set`. But in
 *   jsdom/vitest there is no render_effect, so `store.update()` writes to
 * *   appState but subscribers never wake up — `get(store)` returns stale values.
 *
 *   A plain `writable` + notify wrapper fixes both: runtime subscribers are
 *   notified by the writable's own `.set()`, and test environments get
 *   synchronous notification too. (A3-1 fix pattern.)
 */

/** Version counter — incremented on every filter change. */
export const filterVersion = writable(appState.filterVersion);

/** Color recompute version — incremented when cluster colors should recalc. */
export const filterColorVersion = writable(appState.filterColorVersion);

/** Active cluster filter (null = show all clusters). */
const _activeClusterFilterWritable = writable<string | null>(
  appState.activeClusterFilter !== null ? String(appState.activeClusterFilter) : null // audit-ok: module-level init, evaluated once, not transformed — bundle preserves native !==
);

/** Active cluster filter exposed as a Readable + set action. */
export const activeClusterFilter: Readable<string | null> & { set(value: string | null): void } = {
  subscribe: _activeClusterFilterWritable.subscribe,
  set: (value: string | null) => {
    _activeClusterFilterWritable.set(value);
    appState.withMutation(() => {
      appState.activeClusterFilter = value !== null ? Number(value) : null;
    });
  }
};

/** Alias for compatibility with legacy SearchResultsList. */
export const activeClusterFilterStore = activeClusterFilter;

/** Active filters — the single source of truth for filter state. */
const _filterStateWritable = writable<ActiveFilters>({ ...INITIAL_FILTERS });

/** Push filterState mutations to both writable and appState.
 *  Clones the snapshot before storing so callers cannot accidentally alias
 *  the store value to the legacy state object (see state-store-sync-contract). */
function withFilterStateNotify(updater: (s: ActiveFilters) => ActiveFilters): void {
  const next = updater(get(_filterStateWritable));
  const cloned = { ...next };
  _filterStateWritable.set(cloned);
  appState.withMutation(() => {
    appState.activeFilters = { ...cloned };
  });
}

/** Active filters exposed as a Readable + update/set actions. */
export const filterState: Readable<ActiveFilters> & {
  update(fn: (s: ActiveFilters) => ActiveFilters): void;
  set(value: ActiveFilters): void;
} = {
  subscribe: _filterStateWritable.subscribe,
  update: (updater: (s: ActiveFilters) => ActiveFilters) => withFilterStateNotify(updater),
  set: (value: ActiveFilters) => {
    const cloned = { ...value };
    _filterStateWritable.set(cloned);
    appState.withMutation(() => {
      appState.activeFilters = { ...cloned };
    });
  }
};

// ── Derived Convenience Stores ─────────────────────────────────────────────────

/** True if any filter is active (non-default). */
export const hasActiveFilters: Readable<boolean> = derived(
  filterState,
  ($filterState) =>
    // Note: we use positive form (`=== 'all'` etc.) + negation instead of
    // `!== 'all'` to avoid the Svelte 5 strict-mode bug where `!==`
    // is incorrectly compiled to `===` (see docs/svelte-5-strict-mode-cookbook.md).
    !($filterState.status === 'all') ||
    !($filterState.city === '') ||
    $filterState.website ||
    $filterState.email ||
    $filterState.geocoded
);

/** Number of individually active filters. */
export const activeFilterCount: Readable<number> = derived(filterState, ($filterState) => {
  // Note: using `!==` inside `derived` is affected by the Svelte 5
  // strict-mode bug where `!==` compiles to `===`. We use positive
  // form + negation as the workaround (see cookbook Pattern 2).
  let count = 0;
  const isAll = $filterState.status === 'all';
  const isEmpty = $filterState.city === '';
  if (!isAll) count++;
  if (!isEmpty) count++;
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
      f.status !== 'all' || f.city !== '' || f.website || f.email || f.geocoded; // audit-ok: plain function, not transformed
    document.body.dataset.filtersActive = String(active);
  }
}

/** Set a single filter field without toggle semantics. */
export function setFilter<K extends keyof ActiveFilters>(type: K, value: ActiveFilters[K]): void {
  filterState.update((current) => ({ ...current, [type]: value }));
  incrementFilterVersion();
  bumpFilterColorVersion();
}

/** Increment the public filter version counter. */
export function incrementFilterVersion(): number {
  let next = 0;
  filterVersion.update((v) => {
    next = v + 1;
    return next;
  });
  return next;
}

/** Increment the public filter color version counter. */
export function bumpFilterColorVersion(): number {
  let next = 0;
  filterColorVersion.update((v) => {
    next = v + 1;
    return next;
  });
  return next;
}

/** Set the active cluster filter. */
export function setClusterFilter(cluster: string | null): void {
  activeClusterFilter.set(cluster);
}

/** Backward-compatible alias used by retired js/modules/filter-state.ts consumers. */
export function setActiveClusterFilter(cluster: string | number | null): void {
  setClusterFilter(cluster === null ? null : String(cluster));
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

  if (f.status !== 'all' && point.status !== f.status) return false; // audit-ok: plain function pointMatchesActiveFilters, not transformed
  if (f.city !== '' && normalizeCityForFilter(point.city) !== normalizeCityForFilter(f.city)) return false; // audit-ok: plain function, not transformed
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

/** Backwards-compatible alias for getFilterState. */
export function getActiveFilters(): ActiveFilters {
  return getFilterState();
}

/** Backwards-compatible getter for the active cluster filter. */
export function getActiveClusterFilter(): number | null {
  const value = get(activeClusterFilter);
  const numericValue = value !== null ? Number(value) : null;
  return Number.isFinite(numericValue) ? numericValue : null;
}

const FILTER_KEYS = new Set<keyof ActiveFilters>(['status', 'city', 'website', 'email', 'geocoded']);

/** Backwards-compatible owner API from retired js/modules/filter-state.ts. */
export function setActiveFilter<K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]): boolean {
  if (!FILTER_KEYS.has(key)) return false;
  setFilter(key, value);
  return true;
}

/** Backwards-compatible boolean signal toggle from retired js/modules/filter-state.ts. */
export function toggleActiveFilterSignal(key: string): boolean {
  if (key !== 'website' && key !== 'email' && key !== 'geocoded') return false;
  const filters = getFilterState();
  setFilter(key, !filters[key]);
  return true;
}

/** Backwards-compatible reset alias from retired js/modules/filter-state.ts. */
export const resetActiveFilters = resetFilters;

/** Restore filters from URL params using the canonical filter store owner. */
export function restoreActiveFiltersFromUrl(params: URLSearchParams): void {
  const status = params.get('status');
  const city = params.get('city');
  const website = params.get('website');
  const email = params.get('email');
  const geocoded = params.get('geocoded');

  if (status) setActiveFilter('status', status);
  if (city !== null) setActiveFilter('city', city === 'all' ? '' : city);
  if (website !== null) setActiveFilter('website', website === '1' || website === 'true');
  if (email !== null) setActiveFilter('email', email === '1' || email === 'true');
  if (geocoded !== null) setActiveFilter('geocoded', geocoded === '1' || geocoded === 'true'); // audit-ok: plain function, not transformed

  const cityFilter = typeof document !== 'undefined'
    ? document.getElementById('city-filter') as HTMLSelectElement | null
    : null;
  if (cityFilter && city !== null) cityFilter.value = city; // audit-ok: plain function, not transformed
}

/** Restore cluster filter from URL params using the canonical filter store owner. */
export function restoreActiveClusterFilterFromUrl(params: URLSearchParams): void {
  const cluster = params.get('cluster');
  setActiveClusterFilter(cluster);
}
