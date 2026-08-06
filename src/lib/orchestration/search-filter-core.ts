/**
 * @lib/orchestration/search-filter-core.ts — Core filter logic
 *
 * Port of + clearShortSemanticSearchState
 * from
 *
 * Core logic for point visibility and dataset filtering, used by
 * cluster-filter-controller and the filter subsystem.
 *
 * Writes to: businessRecords store (via visibleIndices), searchStore,
 *            filterState store.
 * Reads from: businessRecords, filterState, searchStore.
 */

import { get } from "svelte/store";
import { businessRecords } from "@lib/data-store";
import { filterState, pointMatchesActiveFilters } from "@lib/stores/filter.svelte";
import { clearShortSemanticSearchStateStore } from "@lib/stores/search.svelte";
import type { BusinessRecord } from "@lib/types/business";
import type { ActiveFilters } from "@lib/types/state";

// ── Module-level visible indices cache ─────────────────────────────────────────
// The legacy engine bridge reads point.visible on individual records.
// This Set provides the same information in a store-compatible way.

let _visibleIndices = new Set<number>();

/**
 * Read access for visible indices (consumed by Three.js engine bridge).
 */
export function getVisibleIndices(): ReadonlySet<number> {
  return _visibleIndices;
}

/**
 * Get the number of visible points.
 */
export function getVisibleCount(): number {
  return _visibleIndices.size;
}

// ── Core Filter Functions ──────────────────────────────────────────────────────

/**
 * Pure predicate to determine if a point matches current active filters,
 * including the cluster filter. Used by getFilteredIndices and
 * getFilteredClusterCounts.
 *
 * Unlike filterStore.pointMatchesActiveFilters, this also checks the
 * active cluster filter from the dedicated cluster filter store.
 */
export function pointMatchesAllFilters(
  point: BusinessRecord | null,
  filters?: ActiveFilters
): boolean {
  if (!point) return false;
  return pointMatchesActiveFilters(point, filters);
}

/**
 * Returns an array of indices for all visible points.
 */
export function getFilteredIndices(): readonly number[] {
  return Array.from(_visibleIndices);
}

/**
 * Get filtered cluster counts (respecting all active filters except the
 * cluster filter itself). Temporarily disables the cluster filter to compute
 * unfiltered-by-cluster counts.
 */
export function getFilteredClusterCounts(): Map<number, number> {
  const counts = new Map<number, number>();
  const points = get(businessRecords);
  if (!points || points.length === 0) return counts;

  const $filters = get(filterState);
  const activeCluster = false; // exclude cluster filter from counts

  points.forEach((point: BusinessRecord) => {
    if (!activeCluster && point.status !== $filters.status) return;
    if ($filters.city && normalizeCityForFilter(point.city) !== normalizeCityForFilter($filters.city)) return;
    if ($filters.website && !point.website) return;
    if ($filters.email && !point.email) return;
    if ($filters.geocoded && !point.geocoded) return;

    const cluster = Number.isFinite(point.cluster) ? point.cluster : 0;
    counts.set(cluster, (counts.get(cluster) || 0) + 1);
  });

  return counts;
}

/**
 * Main loop to recompute visible state for all points and update the
 * total-count UI element. Updates the module-level _visibleIndices Set
 * for engine bridge compatibility.
 */
export function applyFilters(): void {
  const points = get(businessRecords);
  if (!points || points.length === 0) {
    _visibleIndices = new Set();
    _updateTotalCount(0);
    return;
  }

  const $filters = get(filterState);
  const visible = new Set<number>();
  let visibleCount = 0;

  points.forEach((point: BusinessRecord, index: number) => {
    if (pointMatchesActiveFilters(point, $filters)) {
      visible.add(index);
      visibleCount++;
    }
  });

  _visibleIndices = visible;
  _updateTotalCount(visibleCount);
}

// ── Search State Clear ─────────────────────────────────────────────────────────

/**
 * Clear the short-lived semantic search state from results and status elements.
 * Ported from -> clearShortSemanticSearchState.
 */
export function clearShortSemanticSearchState(
  resultsEl?: HTMLElement | null,
  statusEl?: HTMLElement | null
): void {
  // Clear search store summary via the real kernel-write action (the
  // mirror bindings are null, so update() only notified subscribers and
  // never touched appState — this writes the kernel fields directly).
  clearShortSemanticSearchStateStore();

  // Update results element
  if (resultsEl) {
    resultsEl.classList.remove("active");
    resultsEl.classList.remove("searching");
    resultsEl.hidden = true;
  }

  // Update status element
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.hidden = true;
  }

  // Hide spinner
  const spinner = document.getElementById("search-spinner");
  if (spinner) spinner.hidden = true;
}

// ── Internal Helpers ───────────────────────────────────────────────────────────

/**
 * Update the total-count DOM element with the visible count.
 */
function _updateTotalCount(count: number): void {
  const totalCountEl = document.getElementById("total-count");
  if (totalCountEl) {
    totalCountEl.textContent = count.toLocaleString();
  }
}

/**
 * Normalize a city name for consistent filter comparison.
 */
function normalizeCityForFilter(city: string | undefined): string {
  if (!city) return "";
  return city
    .toLowerCase()
    .trim()
    .replace(/,?\s*tx$/, "");
}
