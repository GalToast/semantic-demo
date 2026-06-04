import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { normalizeCityForFilter } from './utils/geo-data.js';
import { describeCluster } from './utils/ui-presentation.js';
import { el, setChildren } from './utils/dom-builder.js';
import { resetActiveFilters, setActiveFilter } from './filter-state.js';
import { getActiveFilters, getActiveClusterFilter, setActiveClusterFilter } from './filter-state.js';
import { applyFilters, clearSearchGlow, updateUrlState, clearShortSemanticSearchState } from './cluster-filter-adapter.js';
import { getFilteredClusterCounts } from './search-filter-core.js';
import { CONFIG } from './config.js';

export function findClusterByKeyword(keyword) {
    const lower = String(keyword || '').toLowerCase();
    const idx = CONFIG.CLUSTER_NAMES.findIndex((name) => String(name).toLowerCase().includes(lower));
    return idx >= 0 ? idx : null;
}

export function setClusterFilter(cluster) {
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

export function clearClusterFilter() {
    resetActiveFilters();
    setClusterFilter(null);
    updateUrlState({}, { reason: 'cluster-filter-clear' });
}

export function updateClusterList() {
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
    const showAll = state._showAllClusters === true;
    const visibleRows = (showAll || rows.length <= maxVisible + 2) ? rows : rows.slice(0, maxVisible);
    const hasMore = rows.length > visibleRows.length;

    const listItems = visibleRows.map(([cluster, count]) => {
        const active = getActiveClusterFilter() !== null && getActiveClusterFilter() === cluster;
        const color = CONFIG.COLORS[cluster % CONFIG.COLORS.length] || '#4ecdc4';

        return el('button', {
            class: `cluster-item${active ? ' active' : ''}`,
            type: 'button',
            dataset: { cluster },
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
                state._showAllClusters = !showAll;
                updateClusterList();
            }
        }, showAll ? 'Show fewer neighborhoods' : `Show ${moreCount} more neighborhoods...`);
        clusterList.appendChild(toggleBtn);
    }
}

// Event delegation has been moved to bindings/filter-bindings.js

export { getFilteredClusterCounts };

export function syncCityFilterUi() {
    const activeCity = (state.activeFilters && state.activeFilters.city) || 'all';
    const select = document.getElementById('city-filter');
    if (select && select.value !== activeCity) select.value = activeCity;
}

export function populateCityFilter() {
    if (!state.points) return;
    const select = document.getElementById('city-filter');
    const counts = new Map();

    state.points.forEach((point) => {
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

export function syncFilterControls() {
    document.querySelectorAll('[data-status-filter]').forEach((el) => {
        const active = (el.dataset.statusFilter || 'all') === getActiveFilters().status;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });

    document.querySelectorAll('[data-signal-filter]').forEach((el) => {
        const key = el.dataset.signalFilter;
        const active = Boolean(getActiveFilters()[key]);
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });

    const citySelect = document.getElementById('city-filter');
    if (citySelect) citySelect.value = getActiveFilters().city || 'all';
    if (typeof syncCityFilterUi === 'function') syncCityFilterUi();

    const preview = document.getElementById('filter-preview');
    if (!preview) return;
    const parts = [];
    const statusLabel = { all: 'All Records', active: 'Active', disqualified: 'Archive' };
    if (getActiveFilters().status !== 'all') {
        parts.push(statusLabel[getActiveFilters().status] || getActiveFilters().status);
    }
    if (getActiveFilters().website) parts.push('Website');
    if (getActiveFilters().email) parts.push('Email');
    if (getActiveFilters().geocoded) parts.push('Mapped');
    if (getActiveFilters().city && getActiveFilters().city !== 'all') {
        parts.push(`City: ${getActiveFilters().city}`);
    }

    const clearFiltersBtn = document.getElementById('filter-clear-btn');
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
