import { state } from '../state.js';
import { normalizeCityForFilter, describeCluster, escapeHtml } from '../utils.js';

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

export function setClusterFilter(cluster) {
    const nextCluster = Number.isFinite(cluster) ? cluster : null;
    if (state.currentSearchSummary) {
        const resultsEl = document.getElementById('search-results');
        const statusEl = document.getElementById('search-status');
        if (typeof window.clearShortSemanticSearchState === 'function') {
            window.clearShortSemanticSearchState(resultsEl, statusEl);
        }
    }
    state.activeClusterFilter = state.activeClusterFilter === nextCluster ? null : nextCluster;
    state.activeStoryPrompt = null;
    if (typeof window.clearSearchGlow === 'function') window.clearSearchGlow();
    if (typeof window.applyFilters === 'function') window.applyFilters();
    if (typeof window.updateUrlState === 'function') window.updateUrlState({}, { reason: 'cluster-filter' });
}

export function clearClusterFilter() {
    state.activeFilters = {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    };
    setClusterFilter(null);
    if (typeof window.updateUrlState === 'function') window.updateUrlState({}, { reason: 'cluster-filter-clear' });
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
