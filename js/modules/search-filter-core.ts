/**
 * search-filter-core.ts
 *
 * Core logic for point visibility and dataset filtering.
 * Typed sibling of search-filter-core.js.
 */

import { state } from '../state.ts';
import { getActiveClusterFilter, setActiveClusterFilter } from './filter-state.ts';
import { normalizeCityForFilter } from './utils/geo-data.ts';

// ── Types ──────────────────────────────────────────────────────────────────

interface Point {
    status?: string;
    city?: string;
    website?: string;
    email?: string;
    lat?: number;
    lng?: number;
    cluster?: number;
    visible?: boolean;
    [key: string]: unknown;
}

interface ActiveFilters {
    status?: string;
    city?: string;
    website?: boolean;
    email?: boolean;
    geocoded?: boolean;
    [key: string]: unknown;
}

// ── Functions ──────────────────────────────────────────────────────────────

/**
 * Pure predicate to determine if a point matches current active filters.
 */
export function pointMatchesActiveFilters(point: Point | null | undefined): boolean {
    if (!point) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any;
    const filters: ActiveFilters = s.activeFilters || {};

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
    if (s.activeClusterFilter !== null && s.activeClusterFilter !== undefined) {
        if (point.cluster !== s.activeClusterFilter) return false;
    }

    return true;
}

/**
 * Returns an array of indices for all visible points.
 */
export function getFilteredIndices(): number[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any;
    if (!s.points || !Array.isArray(s.points)) return [];
    const points: Point[] = s.points;
    const indices: number[] = [];
    points.forEach((point: Point, index: number) => {
        if (pointMatchesActiveFilters(point)) {
            indices.push(index);
        }
    });
    return indices;
}

export function getFilteredClusterCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any;
    if (!s.points || !Array.isArray(s.points)) return counts;
    const points: Point[] = s.points;

    const previousCluster = getActiveClusterFilter();
    setActiveClusterFilter(null);
    try {
        points.forEach((point: Point) => {
            if (!pointMatchesActiveFilters(point)) return;
            const cluster = Number.isFinite(point?.cluster) ? point.cluster! : 0;
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
export function applyFilters(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = state as any;
    if (!s.points || !Array.isArray(s.points)) return;
    const points: Point[] = s.points;

    let visibleCount = 0;
    points.forEach((point: Point) => {
        const isVisible = pointMatchesActiveFilters(point);
        point.visible = isVisible;
        if (isVisible) visibleCount += 1;
    });

    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) {
        totalCountEl.textContent = visibleCount.toLocaleString();
    }
}
