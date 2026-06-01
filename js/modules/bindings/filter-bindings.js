import { state } from '../../state.js';
import { applyFilters, clearSearchGlow, search } from '../search-state.js';
import { syncFilterControls } from '../lifecycle.js';
import { setActiveFilter, toggleActiveFilterSignal, resetActiveFilters } from '../filter-state.js';

export function bindFilterControls(updateUrlState) {
    const refreshActiveSearchResults = () => {
        const searchInput = document.getElementById('search-input');
        const query = searchInput?.value?.trim() || '';
        if (!query) return;
        search(query);
    };

    const handleFilter = (filterFn, updateReason) => {
        state.activeStoryPrompt = null;
        state.filterVersion++;
        if (typeof syncFilterControls === 'function') syncFilterControls();
        clearSearchGlow();
        clearTimeout(state.searchTimeout);
        state.searchTimeout = setTimeout(() => {
            applyFilters();
            if (typeof updateUrlState === 'function') updateUrlState({}, { reason: updateReason });
            refreshActiveSearchResults();
        }, 150);
    };

    document.querySelectorAll('[data-status-filter]').forEach((button) => {
        button.onclick = () => {
            setActiveFilter('status', button.dataset.statusFilter || 'all');
            handleFilter(null, 'status-filter');
        };
    });

    document.querySelectorAll('[data-signal-filter]').forEach((button) => {
        button.onclick = () => {
            const key = button.dataset.signalFilter;
            toggleActiveFilterSignal(key);
            handleFilter(null, 'signal-filter');
        };
    });

    const cityFilter = document.getElementById('city-filter');
    if (cityFilter) {
        cityFilter.onchange = (e) => {
            setActiveFilter('city', e.target.value || 'all');
            handleFilter(null, 'city-filter');
        };
    }

    const cityFilterPills = document.getElementById('city-filter-pills');
    if (cityFilterPills) {
        cityFilterPills.onclick = (e) => {
            const btn = e.target.closest('[data-city-filter]');
            if (!btn) return;
            setActiveFilter('city', btn.dataset.cityFilter || 'all');
            handleFilter(null, 'city-filter-pill');
        };
    }

    const clearFiltersBtn = document.getElementById('filter-clear-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.onclick = () => {
            resetActiveFilters();
            if (typeof updateUrlState === 'function') updateUrlState({}, { reason: 'filter-clear' });
            handleFilter(null, 'filter-clear');
        };
    }
}
