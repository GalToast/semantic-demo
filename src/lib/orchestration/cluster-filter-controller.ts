/**
 * @lib/orchestration/cluster-filter-controller.ts — Cluster/Filter subsystem controller
 *
 * Replaces js/modules/cluster-filter.js.
 *
 * Owns cluster filtering, city filter population, filter control sync,
 * story prompt application, and filter-driven mycelium mode switching.
 * Decoupled from lifecycle.ts per Phase 5 migration plan.
 */

import { get } from "svelte/store";
import { filterState, activeClusterFilter, toggleFilter, overwriteActiveFilters, setClusterFilter as storeSetClusterFilter, resetFilters } from "@lib/stores/filter.svelte";
import { searchStore, clearSearchGlow } from "@lib/stores/search.svelte";
import { navStore } from "@lib/stores/navigation";
import { publish, subscribe, EVENTS } from "@lib/orchestration/event-bus";
import { setMyceliumMode } from "@lib/stores/lifecycle";
import { businessRecords } from "@lib/data-store";
import { applyFilters, clearShortSemanticSearchState, getFilteredClusterCounts } from "@lib/orchestration/search-filter-core";
import { updateUrlState } from "@lib/orchestration/url-state";
import { normalizeCityForFilter } from "@lib/utils/geo-data";
import { describeCluster } from "@lib/utils/ui-presentation";
import { el, setChildren } from "@lib/utils/dom-builder";
import { state as legacyState, withStateMutation } from '@lib/engine/state-bridge';
import type { BusinessRecord } from "@lib/types/business";
import type { ActiveFilters } from "@lib/types/state";

// ── Configuration (ported from js/modules/config.js) ───────────────────────────

export const CLUSTER_COLORS: readonly string[] = [
  "#4ecdc4", "#ff6b6b", "#ffe66d", "#a8e6cf", "#ffd3b6",
  "#c7ceea", "#f8b500", "#7dd3fc", "#fda4af", "#a5f3fc",
  "#fdba74", "#bfdbfe", "#fecaca", "#d8b4fe", "#bbf7d0",
  "#fef08a", "#fecaca", "#e9d5ff", "#fde68a", "#fed7aa"
] as const;

export const CLUSTER_NAMES: readonly string[] = [
  "General Business", "Professional Services", "Food & Hospitality", "Construction & Trades",
  "Retail & Shops", "Beauty & Wellness", "Real Estate & Property", "Industrial & Logistics",
  "Agriculture & Ranching", "Automotive", "Healthcare & Medical", "Therapy & Counseling",
  "Education & Childcare", "Churches", "Faith Ministries", "Community Nonprofits",
  "Foundations", "Arts & Culture", "Economic Development", "Public Agencies", "Enterprise Brands"
] as const;

const MAX_VISIBLE_CLUSTERS = 8;

// ── Module state ───────────────────────────────────────────────────────────────

let _showAllClusters = false;

// ── Cluster Filter Actions ────────────────────────────────────────────────────

/**
 * Find a cluster index by keyword (case-insensitive partial match).
 */
export function findClusterByKeyword(keyword: string): number | null {
  const lower = String(keyword || "").toLowerCase();
  const idx = CLUSTER_NAMES.findIndex((name) => String(name).toLowerCase().includes(lower));
  return idx >= 0 ? idx : null;
}

/**
 * Set the active cluster filter. Toggles off if the same cluster is already active.
 */
export function setClusterFilter(cluster: number | null): void {
  const nextCluster = Number.isFinite(cluster) ? cluster : null;
  
  if (get(searchStore).summary) {
    const resultsEl = document.getElementById("search-results");
    const statusEl = document.getElementById("search-status");
    clearShortSemanticSearchState(resultsEl, statusEl);
  }

  const currentCluster = get(activeClusterFilter);
  const toggledClusterStr = nextCluster !== null ? String(nextCluster) : null;
  const toggledCluster = currentCluster === toggledClusterStr ? null : nextCluster;
  
  storeSetClusterFilter(toggledCluster !== null ? String(toggledCluster) : null);

  // Mirror to legacy state — the WebGL engine (map-state.ts, three-engine.js)
  // reads isPointVisible(state.points, state.activeClusterFilter, ...) from
  // js/state.js. Without this sync the cluster filter is set in the Svelte
  // store but the canvas keeps rendering every cluster as if no filter were
  // active. This was the visible half of P0-5: legend click would dim the
  // legend row but leave the mycelium field untouched.
  withStateMutation(() => {
    legacyState.activeClusterFilter = toggledCluster;
  });

  // Clear story prompt when cluster filter changes
  navStore.update((s) => ({ ...s, activeStoryPrompt: null }));
  
  clearSearchGlow();
  applyFilters();
  updateUrlState({}, { reason: "cluster-filter" });
  publish(EVENTS.FILTER_CHANGED, { type: "cluster", value: get(activeClusterFilter) });
}

/**
 * Clear the cluster filter and all active filters.
 */
export function clearClusterFilter(): void {
  resetFilters();
  storeSetClusterFilter(null);
  updateUrlState({}, { reason: "cluster-filter-clear" });
}

/**
 * Get filtered cluster counts.
 * Delegates to search-filter-core.
 */
export { getFilteredClusterCounts } from "@lib/orchestration/search-filter-core";

// ── UI Sync Functions ──────────────────────────────────────────────────────────

/**
 * Update the cluster list DOM with filtered counts.
 * Called after filter changes.
 */
export async function updateClusterList(): Promise<void> {
  const clusterList = document.getElementById("cluster-list");
  if (!clusterList) return;

  const counts = getFilteredClusterCounts();
  
  const rows = Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);

  if (!rows.length) {
    setChildren(clusterList,
      el("div", { class: "cluster-empty-state" },
        el("svg", {
          class: "cluster-empty-icon",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "1.5",
          "aria-hidden": "true"
        },
          el("circle", { cx: "11", cy: "11", r: "7" }),
          el("path", { d: "M16.5 16.5L21 21" })
        ),
        el("p", { class: "cluster-empty-title" }, "No businesses match this combination"),
        el("button", { class: "cluster-empty-clear", type: "button" }, "Clear filters")
      )
    );
    return;
  }

  const showAll = _showAllClusters === true;
  const visibleRows = (showAll || rows.length <= MAX_VISIBLE_CLUSTERS + 2) ? rows : rows.slice(0, MAX_VISIBLE_CLUSTERS);
  const hasMore = rows.length > visibleRows.length;

  const listItems = visibleRows.map(([cluster, count]) => {
    const active = get(activeClusterFilter) !== null && get(activeClusterFilter) === String(cluster);
    const color = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length] || "#4ecdc4";

    return el("button", {
      class: `cluster-item${active ? " active" : ""}`,
      type: "button",
      dataset: { cluster: String(cluster) },
      "aria-pressed": String(active)
    },
      el("span", { class: "cluster-copy" },
        el("span", { class: "cluster-name" },
          el("span", { class: "legend-dot", style: { background: color } }),
          " ",
          describeCluster(cluster)
        ),
        el("span", { class: "cluster-caption" },
          active ? "Active neighborhood filter" : "Filter the graph to this semantic neighborhood"
        )
      ),
      active
        ? el("span", { class: "cluster-clear-btn", "aria-hidden": "true" }, "\u2715")
        : el("span", { class: "cluster-count" }, count.toLocaleString())
    );
  });

  setChildren(clusterList, ...listItems);

  if (hasMore || showAll) {
    const moreCount = rows.length - visibleRows.length;
    const toggleBtn = el("button", {
      class: "cluster-list-toggle",
      type: "button",
      onclick: () => {
        _showAllClusters = !showAll;
        updateClusterList();
      }
    }, showAll ? "Show fewer neighborhoods" : `Show ${moreCount} more neighborhoods...`);
    clusterList.appendChild(toggleBtn);
  }
}

/**
 * Sync the city filter select element with the active city filter.
 */
export function syncCityFilterUi(): void {
  const activeCity = (get(filterState).city) || "all";
  const select = document.getElementById("city-filter") as HTMLSelectElement | HTMLInputElement | null;
  if (select && select.value !== activeCity) select.value = activeCity;
}

/**
 * Populate the city filter select with unique cities from business data.
 */
export async function populateCityFilter(): Promise<void> {
  const points = get(businessRecords);
  if (!points) return;
  
  const select = document.getElementById("city-filter") as HTMLSelectElement | null;
  if (!select) return;

  const counts = new Map<string, number>();

  points.forEach((point: BusinessRecord) => {
    const city = normalizeCityForFilter(point?.city);
    counts.set(city, (counts.get(city) || 0) + 1);
  });

  const cities = Array.from(counts.entries())
    .filter(([city]) => city && city !== "Other / Unparsed")
    .sort((a, b) => a[0].localeCompare(b[0]));

  const activeFilters = get(filterState);
  const currentCity = activeFilters.city || "all";
  
  const options = [
    el("option", { value: "all" }, "All Cities"),
    ...cities.map(([city, count]) => el("option", { value: city }, `${city} (${count.toLocaleString()})`))
  ];
  
  setChildren(select, ...options);
  select.value = cities.some(([city]) => city === currentCity) ? currentCity : "all";
  toggleFilter("city", select.value);

  syncCityFilterUi();
}

/**
 * Sync all filter control UI elements with the current filter state.
 * Updates status filter buttons, signal filter buttons, city select, and filter preview.
 */
export function syncFilterControls(): void {
  // Status filter buttons
  document.querySelectorAll<HTMLElement>("[data-status-filter]").forEach((el) => {
    const active = (el.dataset.statusFilter || "all") === get(filterState).status;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });

  // Signal filter buttons (website, email, geocoded)
  document.querySelectorAll<HTMLElement>("[data-signal-filter]").forEach((el) => {
    const key = el.dataset.signalFilter as keyof ActiveFilters;
    const active = Boolean(get(filterState)[key]);
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });

  // City filter select
  const citySelect = document.getElementById("city-filter") as HTMLSelectElement | HTMLInputElement | null;
  if (citySelect) citySelect.value = get(filterState).city || "all";
  syncCityFilterUi();

  // Filter preview
  const preview = document.getElementById("filter-preview");
  if (!preview) return;
  
  const parts: string[] = [];
  const statusLabel: Record<string, string> = { all: "All Records", active: "Active", disqualified: "Archive" };
  const f = get(filterState);
  
  if (f.status !== "all") {
    parts.push(statusLabel[f.status] || f.status);
  }
  if (f.website) parts.push("Website");
  if (f.email) parts.push("Email");
  if (f.geocoded) parts.push("Mapped");
  if (f.city && f.city !== "all") {
    parts.push(`City: ${f.city}`);
  }

  const clearFiltersBtn = document.getElementById("filter-clear-btn") as HTMLButtonElement | null;
  if (clearFiltersBtn) {
    const hasActiveFilters = parts.length > 0;
    clearFiltersBtn.disabled = !hasActiveFilters;
    clearFiltersBtn.setAttribute("aria-disabled", String(!hasActiveFilters));
  }

  if (parts.length === 0) {
    preview.textContent = "All clear";
    preview.hidden = true;
  } else {
    preview.textContent = parts.join(" \u00b7 ");
    preview.hidden = false;
  }
}

/**
 * Apply a story prompt (guided exploration mode).
 * Sets mycelium mode and filters based on the story.
 */
export function applyStoryPrompt(story: string | null, options: Record<string, unknown> = {}): void {
  navStore.update((s) => ({ ...s, activeStoryPrompt: story || null }));
  
  overwriteActiveFilters({ status: "all", city: "all", website: false, email: false, geocoded: false });
  storeSetClusterFilter(null);

  if (story === "signal-rich") {
    setMyceliumMode("bloom");
    overwriteActiveFilters({ ...get(filterState), website: true });
  } else if (story === "bridge-businesses") {
    setMyceliumMode("bridge");
  } else if (story === "mapped-food") {
    setMyceliumMode("default");
    overwriteActiveFilters({ ...get(filterState), geocoded: true });
  } else if (story === "disqualified-ghosts") {
    setMyceliumMode("default");
    overwriteActiveFilters({ ...get(filterState), status: "disqualified" });
  }

  syncFilterControls();
  applyFilters();
}

// ── Event Subscriptions ────────────────────────────────────────────────────────

subscribe(EVENTS.FILTER_CHANGED, () => {
  syncFilterControls();
  updateClusterList();
});
