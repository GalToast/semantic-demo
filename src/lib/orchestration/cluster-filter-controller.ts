/**
 * @lib/orchestration/cluster-filter-controller.ts — Cluster/Filter subsystem controller
 *
 *
 *
 * Owns cluster filtering, filter control sync, story prompt application,
 * and filter-driven mycelium mode switching.
 * Decoupled from lifecycle.ts per Phase 5 migration plan.
 */

import { get } from 'svelte/store'
import {
    filterState,
    activeClusterFilter,
    overwriteActiveFilters,
    setClusterFilter as storeSetClusterFilter,
    resetFilters
} from '@lib/stores/filter.svelte'
import { searchStore, clearSearchGlow } from '@lib/stores/search.svelte'
import { writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus'
import { setMyceliumMode } from '@lib/stores/lifecycle'
import {
    applyFilters,
    clearShortSemanticSearchState,
    getFilteredClusterCounts
} from '@lib/orchestration/search-filter-core'
import { updateUrlState } from '@lib/orchestration/url-state'
import { describeCluster } from '@lib/utils/ui-presentation'
import { el, setChildren } from '@lib/utils/dom-builder'
import type { ActiveFilters } from '@lib/types/state'

// ── Configuration (ported from ) ───────────────────────────

// Canonical cluster taxonomy is now sourced from cluster-metadata.ts.
// Imported here for use by internal functions in this file, and
// re-exported so existing consumers of @lib/orchestration/cluster-
// filter-controller continue to work without import path changes.
import { CLUSTER_COLORS, CLUSTER_NAMES } from './cluster-metadata'
export { CLUSTER_COLORS, CLUSTER_NAMES }

const MAX_VISIBLE_CLUSTERS = 8

// ── Module state ───────────────────────────────────────────────────────────────

let _showAllClusters = false

// ── Cluster Filter Actions ────────────────────────────────────────────────────

/**
 * Find a cluster index by keyword (case-insensitive partial match).
 */
export function findClusterByKeyword(keyword: string): number | null {
    const lower = String(keyword || '').toLowerCase()
    const idx = CLUSTER_NAMES.findIndex((name) => String(name).toLowerCase().includes(lower))
    return idx >= 0 ? idx : null
}

/**
 * Set the active cluster filter. Toggles off if the same cluster is already active.
 */
export function setClusterFilter(cluster: number | null): void {
    const nextCluster = Number.isFinite(cluster) ? cluster : null

    if (get(searchStore).summary) {
        const resultsEl = document.getElementById('search-results')
        const statusEl = document.getElementById('search-status')
        clearShortSemanticSearchState(resultsEl, statusEl)
    }

    const currentCluster = get(activeClusterFilter)
    const toggledClusterStr = nextCluster !== null ? String(nextCluster) : null
    const toggledCluster = currentCluster === toggledClusterStr ? null : nextCluster

    storeSetClusterFilter(toggledCluster !== null ? String(toggledCluster) : null)

    // appState.activeClusterFilter is mirrored by ActiveClusterFilterState.set()
    // in @lib/stores/filter.svelte (the P0-5 legacy-engine sync); the
    // storeSetClusterFilter call above already writes it.

    // Clear story prompt when cluster filter changes
    writeNavStateMirror({ activeStoryPrompt: null })

    clearSearchGlow()
    applyFilters()
    updateUrlState({}, { reason: 'cluster-filter' })
    publish(EVENTS.FILTER_CHANGED, { type: 'cluster', value: get(activeClusterFilter) })
}

/**
 * Clear the cluster filter and all active filters.
 */
export function clearClusterFilter(): void {
    resetFilters()
    storeSetClusterFilter(null)
    updateUrlState({}, { reason: 'cluster-filter-clear' })
}

/**
 * Get filtered cluster counts.
 * Delegates to search-filter-core.
 */
export { getFilteredClusterCounts } from '@lib/orchestration/search-filter-core'

// ── UI Sync Functions ──────────────────────────────────────────────────────────

/**
 * Update the cluster list DOM with filtered counts.
 * Called after filter changes.
 */
export async function updateClusterList(): Promise<void> {
    const clusterList = document.getElementById('cluster-list')
    if (!clusterList) return

    const counts = getFilteredClusterCounts()

    const rows = Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])

    if (!rows.length) {
        setChildren(
            clusterList,
            el(
                'div',
                { class: 'cluster-empty-state' },
                el(
                    'svg',
                    {
                        class: 'cluster-empty-icon',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': '1.5',
                        'aria-hidden': 'true'
                    },
                    el('circle', { cx: '11', cy: '11', r: '7' }),
                    el('path', { d: 'M16.5 16.5L21 21' })
                ),
                el('p', { class: 'cluster-empty-title' }, 'No businesses match this combination'),
                el('button', { class: 'cluster-empty-clear', type: 'button' }, 'Clear filters')
            )
        )
        return
    }

    const showAll = _showAllClusters === true
    const visibleRows = showAll || rows.length <= MAX_VISIBLE_CLUSTERS + 2 ? rows : rows.slice(0, MAX_VISIBLE_CLUSTERS)
    const hasMore = rows.length > visibleRows.length

    const listItems = visibleRows.map(([cluster, count]) => {
        const active = get(activeClusterFilter) !== null && get(activeClusterFilter) === String(cluster)
        const color = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length] || '#4ecdc4'

        return el(
            'button',
            {
                class: `cluster-item${active ? ' active' : ''}`,
                type: 'button',
                dataset: { cluster: String(cluster) },
                'aria-pressed': String(active)
            },
            el(
                'span',
                { class: 'cluster-copy' },
                el(
                    'span',
                    { class: 'cluster-name' },
                    el('span', { class: 'legend-dot', style: { background: color } }),
                    ' ',
                    describeCluster(cluster)
                ),
                el(
                    'span',
                    { class: 'cluster-caption' },
                    active ? 'Active neighborhood filter' : 'Filter the graph to this neighborhood'
                )
            ),
            active
                ? el('span', { class: 'cluster-clear-btn', 'aria-hidden': 'true' }, '\u2715')
                : el('span', { class: 'cluster-count' }, count.toLocaleString())
        )
    })

    setChildren(clusterList, ...listItems)

    if (hasMore || showAll) {
        const moreCount = rows.length - visibleRows.length
        const toggleBtn = el(
            'button',
            {
                class: 'cluster-list-toggle',
                type: 'button',
                onclick: () => {
                    _showAllClusters = !showAll
                    updateClusterList()
                }
            },
            showAll ? 'Show fewer neighborhoods' : `Show ${moreCount} more neighborhoods...`
        )
        clusterList.appendChild(toggleBtn)
    }
}

/**
 * Sync the city filter select element with the active city filter.
 */
export function syncCityFilterUi(): void {
    const activeCity = get(filterState).city || 'all'
    const select = document.getElementById('city-filter') as HTMLSelectElement | HTMLInputElement | null
    if (select && select.value !== activeCity) select.value = activeCity
}

/**
 * @deprecated Dead code (w11 MED-2): the city filter select is populated
 * reactively by Filters.svelte's $derived.by block, and the old body's
 * unconditional `toggleFilter('city', select.value)` bumped filterVersion on
 * every sync even when the city never changed. Retained as a no-op export
 * because tests/cluster-filter-contract.mjs and tests/unit-active/
 * w46-c3-orchestration-bulk-fill.test.ts pin the export surface
 * (`export async function populateCityFilter(`). Do not delete while pinned.
 */
export async function populateCityFilter(): Promise<void> {
    // Intentionally a no-op — see @deprecated note.
}

/**
 * Sync all filter control UI elements with the current filter state.
 * Updates status filter buttons, signal filter buttons, city select, and filter preview.
 */
export function syncFilterControls(): void {
    // Status filter buttons
    document.querySelectorAll<HTMLElement>('[data-status-filter]').forEach((el) => {
        const active = (el.dataset.statusFilter || 'all') === get(filterState).status
        el.classList.toggle('active', active)
        el.setAttribute('aria-pressed', String(active))
    })

    // Signal filter buttons (website, email, geocoded)
    document.querySelectorAll<HTMLElement>('[data-signal-filter]').forEach((el) => {
        const key = el.dataset.signalFilter as keyof ActiveFilters
        const active = Boolean(get(filterState)[key])
        el.classList.toggle('active', active)
        el.setAttribute('aria-pressed', String(active))
    })

    // City filter select
    const citySelect = document.getElementById('city-filter') as HTMLSelectElement | HTMLInputElement | null
    if (citySelect) citySelect.value = get(filterState).city || 'all'
    syncCityFilterUi()

    // Filter preview
    const preview = document.getElementById('filter-preview')
    if (!preview) return

    const parts: string[] = []
    const statusLabel: Record<string, string> = { all: 'All Records', active: 'Active', disqualified: 'Archive' }
    const f = get(filterState)

    if (f.status !== 'all') {
        parts.push(statusLabel[f.status] || f.status)
    }
    if (f.website) parts.push('Website')
    if (f.email) parts.push('Email')
    if (f.geocoded) parts.push('Mapped')
    if (f.city && f.city !== 'all') {
        parts.push(`City: ${f.city}`)
    }

    const clearFiltersBtn = document.getElementById('filter-clear-btn') as HTMLButtonElement | null
    if (clearFiltersBtn) {
        const hasActiveFilters = parts.length > 0
        clearFiltersBtn.disabled = !hasActiveFilters
        clearFiltersBtn.setAttribute('aria-disabled', String(!hasActiveFilters))
    }

    if (parts.length === 0) {
        preview.textContent = 'All clear'
        preview.hidden = true
    } else {
        preview.textContent = parts.join(' \u00b7 ')
        preview.hidden = false
    }
}

/**
 * Apply a story prompt (guided exploration mode).
 * Sets mycelium mode and filters based on the story.
 */
export function applyStoryPrompt(story: string | null, _options: Record<string, unknown> = {}): void {
    writeNavStateMirror({ activeStoryPrompt: story || null })

    overwriteActiveFilters({ status: 'all', city: 'all', website: false, email: false, geocoded: false })
    storeSetClusterFilter(null)

    if (story === 'signal-rich') {
        setMyceliumMode('bloom')
        overwriteActiveFilters({ ...get(filterState), website: true })
    } else if (story === 'bridge-businesses') {
        setMyceliumMode('bridge')
    } else if (story === 'mapped-food') {
        setMyceliumMode('default')
        overwriteActiveFilters({ ...get(filterState), geocoded: true })
    } else if (story === 'disqualified-ghosts') {
        setMyceliumMode('default')
        overwriteActiveFilters({ ...get(filterState), status: 'disqualified' })
    }

    syncFilterControls()
    applyFilters()
}

// ── Legacy Adapter Re-exports ──────────────────────────────────────────────────
// These re-exports satisfy importers that previously depended on
// The adapter was an injection
// boundary for circular-dependency avoidance; the controller already
// imports the real implementations directly.

export { applyFilters, clearShortSemanticSearchState } from '@lib/orchestration/search-filter-core'
export { updateUrlState } from '@lib/orchestration/url-state'
export { clearSearchGlow } from '@lib/stores/search.svelte'

// ── Event Subscriptions ────────────────────────────────────────────────────────

// Registered through `registerClusterFilterEventListeners()` so the unsubscribe
// handle is captured (previously dropped on the floor → leak on HMR / module
// re-evaluation). Idempotent within a module instance; auto-invoked once at
// module load to preserve prior registration timing. main.ts holds the teardown.
let _clusterFilterEventTeardown: (() => void) | null = null

export function registerClusterFilterEventListeners(): () => void {
    if (_clusterFilterEventTeardown) return _clusterFilterEventTeardown
    const unsubscribers = [
        subscribe(EVENTS.FILTER_CHANGED, () => {
            syncFilterControls()
            updateClusterList()
        })
    ]
    _clusterFilterEventTeardown = () => {
        for (const unsub of unsubscribers) unsub()
        _clusterFilterEventTeardown = null
    }
    return _clusterFilterEventTeardown
}

// Preserve prior module-load registration behavior.
registerClusterFilterEventListeners()
