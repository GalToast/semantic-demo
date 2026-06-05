import { state } from '../state.js';
import { activeClusterFilterStore, activeFiltersStore } from './stores.js';

const FILTER_DEFAULTS = Object.freeze({
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
});

const FILTER_KEYS = new Set(Object.keys(FILTER_DEFAULTS));
const SIGNAL_FILTER_KEYS = new Set(['website', 'email', 'geocoded']);
const STATUS_FILTER_VALUES = new Set(['all', 'active', 'disqualified']);

function ensureActiveFilters() {
    if (!state.activeFilters || typeof state.activeFilters !== 'object') {
        state.activeFilters = { ...FILTER_DEFAULTS };
    }
    return state.activeFilters;
}

function syncActiveFiltersStore() {
    activeFiltersStore.set({ ...ensureActiveFilters() });
}

function syncActiveClusterFilterStore() {
    activeClusterFilterStore.set(getActiveClusterFilter());
}

export function getActiveFilters() {
    return ensureActiveFilters();
}

export function overwriteActiveFilters(nextFilters = {}) {
    state.activeFilters = { ...FILTER_DEFAULTS, ...nextFilters };
    syncActiveFiltersStore();
    return state.activeFilters;
}

export function setActiveFilter(key, value) {
    if (!FILTER_KEYS.has(key)) return false;
    const filters = ensureActiveFilters();
    filters[key] = value;
    syncActiveFiltersStore();
    return true;
}

export function toggleActiveFilterSignal(key) {
    if (!SIGNAL_FILTER_KEYS.has(key)) return false;
    const filters = ensureActiveFilters();
    filters[key] = !filters[key];
    syncActiveFiltersStore();
    return filters[key];
}

export function resetActiveFilters() {
    state.activeFilters = { ...FILTER_DEFAULTS };
    syncActiveFiltersStore();
}

export function getActiveClusterFilter() {
    return Number.isFinite(state.activeClusterFilter) ? state.activeClusterFilter : null;
}

export function setActiveClusterFilter(cluster) {
    state.activeClusterFilter = Number.isFinite(cluster) ? cluster : null;
    syncActiveClusterFilterStore();
    return state.activeClusterFilter;
}

export function incrementFilterVersion() {
    state.filterVersion = Number(state.filterVersion || 0) + 1;
    return state.filterVersion;
}

export function restoreActiveFiltersFromUrl(params) {
    const filters = ensureActiveFilters();
    const status = params.get('status');
    filters.status = STATUS_FILTER_VALUES.has(status) ? status : 'all';
    filters.website = params.get('website') === '1';
    filters.email = params.get('email') === '1';
    filters.geocoded = params.get('geocoded') === '1';
    filters.city = params.get('city') || 'all';

    const citySelect = document.getElementById('city-filter');
    if (citySelect) citySelect.value = filters.city;
    syncActiveFiltersStore();
}

export function restoreActiveClusterFilterFromUrl(params) {
    const requestedCluster = params.get('cluster');
    state.activeClusterFilter = requestedCluster !== null &&
        requestedCluster !== '' &&
        Number.isFinite(Number(requestedCluster))
        ? Number(requestedCluster)
        : null;
    syncActiveClusterFilterStore();
}
