import { state } from '../state.js';

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

export function setActiveFilter(key, value) {
    if (!FILTER_KEYS.has(key)) return false;
    const filters = ensureActiveFilters();
    filters[key] = value;
    return true;
}

export function toggleActiveFilterSignal(key) {
    if (!SIGNAL_FILTER_KEYS.has(key)) return false;
    const filters = ensureActiveFilters();
    filters[key] = !filters[key];
    return filters[key];
}

export function resetActiveFilters() {
    state.activeFilters = { ...FILTER_DEFAULTS };
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
}

export function restoreActiveClusterFilterFromUrl(params) {
    const requestedCluster = params.get('cluster');
    state.activeClusterFilter = requestedCluster !== null &&
        requestedCluster !== '' &&
        Number.isFinite(Number(requestedCluster))
        ? Number(requestedCluster)
        : null;
}
