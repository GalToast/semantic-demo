// filter-state.ts
// TypeScript shadow of filter-state.js
// Canonical filter state management with Svelte store sync.

import { state, type ActiveFilters } from '../state.ts';
import { activeClusterFilterStore, activeFiltersStore } from './stores.ts';

const FILTER_DEFAULTS: ActiveFilters = Object.freeze({
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
});

const FILTER_KEYS = new Set<string>(Object.keys(FILTER_DEFAULTS) as Array<keyof ActiveFilters>);
const SIGNAL_FILTER_KEYS = new Set<string>(['website', 'email', 'geocoded']);
const STATUS_FILTER_VALUES = new Set<string>(['all', 'active', 'disqualified']);

function ensureActiveFilters(): ActiveFilters {
    if (!state.activeFilters || typeof state.activeFilters !== 'object') {
        state.activeFilters = { ...FILTER_DEFAULTS };
    }
    return state.activeFilters;
}

function syncActiveFiltersStore(): void {
    activeFiltersStore.set({ ...ensureActiveFilters() });
}

function syncActiveClusterFilterStore(): void {
    activeClusterFilterStore.set(getActiveClusterFilter());
}

export function getActiveFilters(): ActiveFilters {
    return ensureActiveFilters();
}

export function overwriteActiveFilters(nextFilters: Partial<ActiveFilters> = {}): ActiveFilters {
    state.activeFilters = { ...FILTER_DEFAULTS, ...nextFilters };
    syncActiveFiltersStore();
    return state.activeFilters;
}

export function setActiveFilter(key: string, value: unknown): boolean {
    if (!FILTER_KEYS.has(key)) return false;
    const filters = ensureActiveFilters();
    (filters as any)[key] = value;
    syncActiveFiltersStore();
    return true;
}

export function toggleActiveFilterSignal(key: string): boolean | undefined {
    if (!SIGNAL_FILTER_KEYS.has(key)) return false;
    const filters = ensureActiveFilters();
    (filters as any)[key] = !(filters as any)[key];
    syncActiveFiltersStore();
    return (filters as any)[key];
}

export function resetActiveFilters(): void {
    state.activeFilters = { ...FILTER_DEFAULTS };
    syncActiveFiltersStore();
}

export function getActiveClusterFilter(): number | null {
    return Number.isFinite(state.activeClusterFilter) ? state.activeClusterFilter : null;
}

export function setActiveClusterFilter(cluster: number | null): number | null {
    state.activeClusterFilter = Number.isFinite(cluster) ? cluster : null;
    syncActiveClusterFilterStore();
    return state.activeClusterFilter;
}

export function incrementFilterVersion(): number {
    state.filterVersion = Number(state.filterVersion || 0) + 1;
    return state.filterVersion;
}

export function restoreActiveFiltersFromUrl(params: URLSearchParams): void {
    const filters = ensureActiveFilters();
    const status = params.get('status');
    filters.status = STATUS_FILTER_VALUES.has(status ?? '') ? (status as string) : 'all';
    filters.website = params.get('website') === '1';
    filters.email = params.get('email') === '1';
    filters.geocoded = params.get('geocoded') === '1';
    filters.city = params.get('city') || 'all';

    const citySelect = document.getElementById('city-filter') as HTMLSelectElement | null;
    if (citySelect) citySelect.value = filters.city;
    syncActiveFiltersStore();
}

export function restoreActiveClusterFilterFromUrl(params: URLSearchParams): void {
    const requestedCluster = params.get('cluster');
    state.activeClusterFilter = requestedCluster !== null &&
        requestedCluster !== '' &&
        Number.isFinite(Number(requestedCluster))
        ? Number(requestedCluster)
        : null;
    syncActiveClusterFilterStore();
}
