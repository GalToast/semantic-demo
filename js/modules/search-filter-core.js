import { state } from '../state.js';
import { getActiveClusterFilter, setActiveClusterFilter } from './filter-state.js';
import { normalizeCityForFilter } from './utils/geo-data.js';

/**
 * search-filter-core.js
 *
 * Core logic for point visibility and dataset filtering.
 * Extracted/reconstructed to satisfy modular search-state and contract tests.
 */

/**
 * Pure predicate to determine if a point matches current active filters.
 */
export function pointMatchesActiveFilters(point) {
    if (!point) return false;
    const filters = state.activeFilters || {};

    // Status filter
    if (filters.status && filters.status !== 'all' && point.status !== filters.status) return false;

    // City filter
    if (filters.city && filters.city !== 'all') {
        if (normalizeCityForFilter(point.city) !== filters.city) return false;
    }

    // Signal filters
    if (filters.website && !point.website) return false;
    if (filters.email && !point.email) return false;
    if (filters.geocoded && !(Number.isFinite(point.lat) && Number.isFinite(point.lng))) return false;

    // Cluster filter
    if (state.activeClusterFilter !== null && state.activeClusterFilter !== undefined) {
        if (point.cluster !== state.activeClusterFilter) return false;
    }

    return true;
}

/**
 * Returns an array of indices for all visible points.
 */
export function getFilteredIndices() {
    if (!state.points || !Array.isArray(state.points)) return [];
    const indices = [];
    state.points.forEach((point, index) => {
        if (pointMatchesActiveFilters(point)) {
            indices.push(index);
        }
    });
    return indices;
}

export function getFilteredClusterCounts() {
    const counts = new Map();
    if (!state.points || !Array.isArray(state.points)) return counts;

    const previousCluster = getActiveClusterFilter();
    setActiveClusterFilter(null);
    try {
        state.points.forEach((point) => {
            if (!pointMatchesActiveFilters(point)) return;
            const cluster = Number.isFinite(point?.cluster) ? point.cluster : 0;
            counts.set(cluster, (counts.get(cluster) || 0) + 1);
        });
    } finally {
        setActiveClusterFilter(previousCluster);
    }

    return counts;
}

/**
 * Main loop to update the 'visible' state of all points and refresh the total-count UI.
 */
export function applyFilters() {
    if (!state.points || !Array.isArray(state.points)) return;

    let visibleCount = 0;
    state.points.forEach((point) => {
        const isVisible = pointMatchesActiveFilters(point);
        point.visible = isVisible;
        if (isVisible) visibleCount += 1;
    });

    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) {
        totalCountEl.textContent = visibleCount.toLocaleString();
    }
}
