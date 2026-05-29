import { state } from '../state.js';
import { normalizeCityForFilter } from '../utils.js';

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

/**
 * Main loop to update the 'visible' state of all points and refresh the total-count UI.
 */
export function applyFilters() {
    if (!state.points || !Array.isArray(state.points)) return;

    let visibleCount = 0;
    state.points.forEach((point, index) => {
        const isVisible = pointMatchesActiveFilters(point);
        point.visible = isVisible;
        if (isVisible) visibleCount += 1;
    });

    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) {
        totalCountEl.textContent = visibleCount.toLocaleString();
    }
}
