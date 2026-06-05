// cluster-filter.ts
// TypeScript shadow of cluster-filter.js
// Cluster filter management, list rendering, city filter, and story prompts.

import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { normalizeCityForFilter } from './utils/geo-data.js';
import { describeCluster } from './utils/ui-presentation.js';
import { el, setChildren } from './utils/dom-builder.js';
import { resetActiveFilters, setActiveFilter, getActiveFilters, getActiveClusterFilter, setActiveClusterFilter, overwriteActiveFilters } from './filter-state.js';
import { applyFilters, clearSearchGlow, updateUrlState, clearShortSemanticSearchState } from './cluster-filter-adapter.js';
import { getFilteredClusterCounts } from './search-filter-core.js';
import { CONFIG } from './config.js';
import { setMyceliumMode } from './lifecycle.js';

export function findClusterByKeyword(keyword: string): number | null {
    const lower = String(keyword || '').toLowerCase();
    const idx = (CONFIG as any).CLUSTER_NAMES.findIndex((name: string) => String(name).toLowerCase().includes(lower));
    return idx >= 0 ? idx : null;
}

export function setClusterFilter(cluster: number | null): void {
    const nextCluster = Number.isFinite(cluster) ? cluster : null;
    if (state.currentSearchSummary) {
        const resultsEl = document.getElementById('search-results');
        const statusEl = document.getElementById('search-status');
        clearShortSemanticSearchState(resultsEl, statusEl);
    }
    setActiveClusterFilter(getActiveClusterFilter() === nextCluster ? null : nextCluster);
    state.activeStoryPrompt = null;
    clearSearchGlow();
    applyFilters();
    updateUrlState({}, { reason: 'cluster-filter' });
    publish(EVENTS.FILTER_CHANGED, { type: 'cluster', value: getActiveClusterFilter() });
}

export function clearClusterFilter(): void {
    resetActiveFilters();
    setClusterFilter(null);
    updateUrlState({}, { reason: 'cluster-filter-clear' });
}

export function updateClusterList(): void {
    const clusterList = document.getElementById('cluster-list');
    if (!clusterList) return;

    const counts = getFilteredClusterCounts();
    const rows = Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]);

    if (!rows.length) {
        setChildren(clusterList,
            el('div', { class: 'cluster-empty-state' },
                el('svg', {
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
        );
        return;
    }

    const maxVisible = 8;
    const showAll = (state as any)._showAllClusters === true;
    const visibleRows = (showAll || rows.length <= maxVisible + 2) ? rows : rows.slice(0, maxVisible);
    const hasMore = rows.length > visibleRows.length;

    const listItems = visibleRows.map(([cluster, count]) => {
        const active = getActiveClusterFilter() !== null && getActiveClusterFilter() === cluster;
        const color = (CONFIG as any).COLORS[cluster % (CONFIG as any).COLORS.length] || '#4ecdc4';

        return el('button', {
            class: `cluster-item${active ? ' active' : ''}`,
            type: 'button',
            dataset: { cluster: String(cluster) },
            'aria-pressed': String(active)
        },
            el('span', { class: 'cluster-copy' },
                el('span', { class: 'cluster-name' },
                    el('span', { class: 'legend-dot', style: { background: color } }),
                    ' ',
                    describeCluster(cluster)
                ),
                el('span', { class: 'cluster-caption' },
                    active ? 'Active neighborhood filter' : 'Filter the graph to this semantic neighborhood'
                )
            ),
            active
                ? el('span', { class: 'cluster-clear-btn', 'aria-hidden': 'true' }, '\u2715')
                : el('span', { class: 'cluster-count' }, count.toLocaleString())
        );
    });

    setChildren(clusterList, ...listItems);

    if (hasMore || showAll) {
        const moreCount = rows.length - visibleRows.length;
        const toggleBtn = el('button', {
            class: 'cluster-list-toggle',
            type: 'button',
            onclick: () => {
                (state as any)._showAllClusters = !showAll;
                updateClusterList();
            }
        }, showAll ? 'Show fewer neighborhoods' : `Show ${moreCount} more neighborhoods...`);
        clusterList.appendChild(toggleBtn);
    }
}

export { getFilteredClusterCounts };

export function syncCityFilterUi(): void {
    const activeCity = (state.activeFilters && state.activeFilters.city) || 'all';
    const select = document.getElementById('city-filter') as HTMLSelectElement | null;
    if (select && select.value !== activeCity) select.value = activeCity;
}

export function populateCityFilter(): void {
    if (!state.points) return;
    const select = document.getElementById('city-filter') as HTMLSelectElement | null;
    const counts = new Map<string, number>();

    state.points.forEach((point: any) => {
        const city = normalizeCityForFilter(point?.city);
        counts.set(city, (counts.get(city) || 0) + 1);
    });

    const cities = Array.from(counts.entries())
        .filter(([city]) => city && city !== 'Other / Unparsed')
        .sort((a, b) => a[0].localeCompare(b[0]));
    if (select) {
        const activeFilters = getActiveFilters();
        const currentCity = activeFilters.city || 'all';
        const options = [
            el('option', { value: 'all' }, 'All Cities'),
            ...cities.map(([city, count]) => el('option', { value: city }, `${city} (${count.toLocaleString()})`))
        ];
        setChildren(select, ...options);
        select.value = cities.some(([city]) => city === currentCity) ? currentCity : 'all';
        setActiveFilter('city', select.value);
    }

    syncCityFilterUi();
}

export function syncFilterControls(): void {
    document.querySelectorAll('[data-status-filter]').forEach((el) => {
        const target = el as HTMLElement;
        const active = ((target as HTMLElement).dataset.statusFilter || 'all') === getActiveFilters().status;
        target.classList.toggle('active', active);
        target.setAttribute('aria-pressed', String(active));
    });

    document.querySelectorAll('[data-signal-filter]').forEach((el) => {
        const target = el as HTMLElement;
        const key = (target as HTMLElement).dataset.signalFilter;
        const active = Boolean((getActiveFilters() as any)[key]);
        target.classList.toggle('active', active);
        target.setAttribute('aria-pressed', String(active));
    });

    const citySelect = document.getElementById('city-filter') as HTMLSelectElement | null;
    if (citySelect) citySelect.value = getActiveFilters().city || 'all';
    if (typeof syncCityFilterUi === 'function') syncCityFilterUi();

    const preview = document.getElementById('filter-preview');
    if (!preview) return;
    const parts: string[] = [];
    const statusLabel: Record<string, string> = { all: 'All Records', active: 'Active', disqualified: 'Archive' };
    if (getActiveFilters().status !== 'all') {
        parts.push(statusLabel[getActiveFilters().status] || getActiveFilters().status);
    }
    if (getActiveFilters().website) parts.push('Website');
    if (getActiveFilters().email) parts.push('Email');
    if (getActiveFilters().geocoded) parts.push('Mapped');
    if (getActiveFilters().city && getActiveFilters().city !== 'all') {
        parts.push(`City: ${getActiveFilters().city}`);
    }

    const clearFiltersBtn = document.getElementById('filter-clear-btn') as HTMLButtonElement | null;
    if (clearFiltersBtn) {
        const hasActiveFilters = parts.length > 0;
        clearFiltersBtn.disabled = !hasActiveFilters;
        clearFiltersBtn.setAttribute('aria-disabled', String(!hasActiveFilters));
    }

    if (parts.length === 0) {
        preview.textContent = 'All clear';
        preview.hidden = true;
    } else {
        preview.textContent = parts.join(' · ');
        preview.hidden = false;
    }
}

export function applyStoryPrompt(story: string | null, options: Record<string, unknown> = {}): void {
    state.activeStoryPrompt = story || null;
    overwriteActiveFilters({ status: 'all', city: 'all', website: false, email: false, geocoded: false });
    setActiveClusterFilter(null);

    if (story === 'signal-rich') {
        setMyceliumMode('bloom', options);
        overwriteActiveFilters({ ...getActiveFilters(), website: true });
    } else if (story === 'bridge-businesses') {
        setMyceliumMode('bridge', options);
    } else if (story === 'mapped-food') {
        setMyceliumMode('default', options);
        overwriteActiveFilters({ ...getActiveFilters(), geocoded: true });
    } else if (story === 'disqualified-ghosts') {
        setMyceliumMode('default', options);
        overwriteActiveFilters({ ...getActiveFilters(), status: 'disqualified' });
    }

    syncFilterControls();
    applyFilters();
}
