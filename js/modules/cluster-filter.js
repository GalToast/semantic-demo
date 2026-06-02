import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { normalizeCityForFilter } from './utils/geo-data.js';
import { describeCluster } from './utils/ui-presentation.js';
import { escapeHtml } from './utils/dom-formatters.js';
import { resetActiveFilters, setActiveFilter } from './filter-state.js';
import { applyFilters, clearSearchGlow, updateUrlState, clearShortSemanticSearchState } from './cluster-filter-adapter.js';

function pointMatchesActiveFilters(point) {
    if (!point) return false;
    if (state.activeFilters.status !== 'all' && point.status !== state.activeFilters.status) return false;
    if (state.activeFilters.city !== 'all' && normalizeCityForFilter(point.city) !== state.activeFilters.city) return false;
    if (state.activeFilters.website && !point.website) return false;
    if (state.activeFilters.email && !point.email) return false;
    if (state.activeFilters.geocoded && !(Number.isFinite(point.lat) && Number.isFinite(point.lng))) return false;
    return true;
}

function getFilteredClusterCounts() {
    if (!state.points) return new Map();
    const counts = new Map();
    state.points.forEach((point) => {
        if (!pointMatchesActiveFilters(point)) return;
        const cluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
        counts.set(cluster, (counts.get(cluster) || 0) + 1);
    });
    return counts;
}

export function findClusterByKeyword(keyword) {
    const lower = String(keyword || '').toLowerCase();
    const idx = state.CLUSTER_NAMES.findIndex((name) => String(name).toLowerCase().includes(lower));
    return idx >= 0 ? idx : null;
}

export function setClusterFilter(cluster) {
    const nextCluster = Number.isFinite(cluster) ? cluster : null;
    if (state.currentSearchSummary) {
        const resultsEl = document.getElementById('search-results');
        const statusEl = document.getElementById('search-status');
        clearShortSemanticSearchState(resultsEl, statusEl);
    }
    state.activeClusterFilter = state.activeClusterFilter === nextCluster ? null : nextCluster;
    state.activeStoryPrompt = null;
    clearSearchGlow();
    applyFilters();
    updateUrlState({}, { reason: 'cluster-filter' });
    publish(EVENTS.FILTER_CHANGED, { type: 'cluster', value: state.activeClusterFilter });
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
        clusterList.innerHTML = `
            <div class="cluster-empty-state">
                <svg class="cluster-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <circle cx="11" cy="11" r="7"/>
                    <path d="M16.5 16.5L21 21"/>
                </svg>
                <p class="cluster-empty-title">No businesses match this combination</p>
                <button class="cluster-empty-clear" type="button">Clear filters</button>
            </div>
        `;
        clusterList.querySelector('.cluster-empty-clear')?.addEventListener('click', clearClusterFilter);
        return;
    }

    const maxVisible = 8;
    const showAll = state._showAllClusters === true;
    const visibleRows = (showAll || rows.length <= maxVisible + 2) ? rows : rows.slice(0, maxVisible);
    const hasMore = rows.length > visibleRows.length;

    clusterList.innerHTML = visibleRows.map(([cluster, count]) => {
        const active = state.activeClusterFilter !== null && state.activeClusterFilter === cluster;
        const color = state.COLORS[cluster % state.COLORS.length] || '#4ecdc4';
        return `
            <button class="cluster-item${active ? ' active' : ''}" type="button" data-cluster="${cluster}" aria-pressed="${String(active)}">
                <span class="cluster-copy">
                    <span class="cluster-name"><span class="legend-dot" style="background:${escapeHtml(color)}"></span> ${escapeHtml(describeCluster(cluster))}</span>
                    <span class="cluster-caption">${active ? 'Active neighborhood filter' : 'Filter the graph to this semantic neighborhood'}</span>
                </span>
                ${active ? `<span class="cluster-clear-btn" aria-hidden="true">&#x2715;</span>` : `<span class="cluster-count">${count.toLocaleString()}</span>`}
            </button>
        `;
    }).join('');

    if (hasMore || showAll) {
        const moreCount = rows.length - visibleRows.length;
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'cluster-list-toggle';
        toggleBtn.type = 'button';
        toggleBtn.textContent = showAll ? 'Show fewer neighborhoods' : `Show ${moreCount} more neighborhoods...`;
        toggleBtn.onclick = () => {
            state._showAllClusters = !showAll;
            updateClusterList();
        };
        clusterList.appendChild(toggleBtn);
    }

    clusterList.querySelectorAll('[data-cluster]').forEach((item) => {
        item.addEventListener('click', (e) => {
            if (!e?.target || e.target.classList.contains('cluster-clear-btn')) return;
            setClusterFilter(Number(item.dataset.cluster));
        });
    });

    clusterList.querySelectorAll('.cluster-clear-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearClusterFilter();
        });
    });
}

export { getFilteredClusterCounts };

export function syncCityFilterUi() {
    const activeCity = state.activeFilters.city || 'all';
    const select = document.getElementById('city-filter');
    if (select && select.value !== activeCity) select.value = activeCity;

    const summary = document.getElementById('city-filter-summary');
    if (summary) summary.textContent = activeCity === 'all' ? 'All cities' : activeCity;

    document.querySelectorAll('[data-city-filter]').forEach((button) => {
        const active = (button.dataset.cityFilter || 'all') === activeCity;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

export function populateCityFilter() {
    if (!state.points) return;
    const select = document.getElementById('city-filter');
    const pills = document.getElementById('city-filter-pills');
    const note = document.getElementById('city-filter-note');
    const counts = new Map();

    state.points.forEach((point) => {
        const city = normalizeCityForFilter(point?.city);
        counts.set(city, (counts.get(city) || 0) + 1);
    });

    const cities = Array.from(counts.entries())
        .filter(([city]) => city && city !== 'Other / Unparsed')
        .sort((a, b) => a[0].localeCompare(b[0]));

    if (select) {
        const current = state.activeFilters.city || 'all';
        select.innerHTML = [
            '<option value="all">All Cities</option>',
            ...cities.map(([city, count]) => `<option value="${escapeHtml(city)}">${escapeHtml(city)} (${count.toLocaleString()})</option>`)
        ].join('');
        select.value = cities.some(([city]) => city === current) ? current : 'all';
        setActiveFilter('city', select.value);
    }

    if (pills) {
        const topCities = Array.from(counts.entries())
            .filter(([city]) => city && city !== 'Other / Unparsed')
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6);
        pills.innerHTML = [
            '<button class="city-filter-pill" type="button" data-city-filter="all" aria-pressed="false"><span>All</span><b>all</b></button>',
            ...topCities.map(([city, count]) => `
                <button class="city-filter-pill" type="button" data-city-filter="${escapeHtml(city)}" aria-pressed="false">
                    <span>${escapeHtml(city)}</span><b>${count.toLocaleString()}</b>
                </button>
            `)
        ].join('');
    }

    if (note) {
        note.textContent = cities.length
            ? `${cities.length.toLocaleString()} city filters available; graph positions still preserve semantic context.`
            : 'City filters become available after county records load.';
    }

    syncCityFilterUi();
}

export function syncFilterControls() {
    document.querySelectorAll('[data-status-filter]').forEach((el) => {
        const active = (el.dataset.statusFilter || 'all') === state.activeFilters.status;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });

    document.querySelectorAll('[data-signal-filter]').forEach((el) => {
        const key = el.dataset.signalFilter;
        const active = Boolean(state.activeFilters[key]);
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });

    const citySelect = document.getElementById('city-filter');
    if (citySelect) citySelect.value = state.activeFilters.city || 'all';
    if (typeof syncCityFilterUi === 'function') syncCityFilterUi();

    const preview = document.getElementById('filter-preview');
    if (!preview) return;
    const parts = [];
    const statusLabel = { all: 'All Records', active: 'Active', disqualified: 'Archive' };
    if (state.activeFilters.status !== 'all') {
        parts.push(statusLabel[state.activeFilters.status] || state.activeFilters.status);
    }
    if (state.activeFilters.website) parts.push('Website');
    if (state.activeFilters.email) parts.push('Email');
    if (state.activeFilters.geocoded) parts.push('Mapped');
    if (state.activeFilters.city && state.activeFilters.city !== 'all') {
        parts.push(`City: ${state.activeFilters.city}`);
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
