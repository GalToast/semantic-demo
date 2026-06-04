<script>
    import { onMount, onDestroy } from 'svelte';
    import { state as appState } from '../../state.js';
    import { publish, subscribe, EVENTS } from '../event-bus.js';
    import { applyFilters, clearSearchGlow } from '../search-state.js';
    import {
        setActiveFilter,
        toggleActiveFilterSignal,
        resetActiveFilters,
        incrementFilterVersion
    } from '../filter-state.js';
    import { syncFilterControls } from '../lifecycle.js';

    let {
        debounceMs = 150,
        onFiltersChanged = null,
        requestUrlStateUpdate = null
    } = $props();

    let activeFilters = $state(readActiveFilters());
    let debounceTimer = null;
    let unsubscribers = [];

    function readActiveFilters() {
        const filters = appState.activeFilters || {};
        return {
            status: filters.status ?? 'all',
            city: filters.city ?? 'all',
            website: Boolean(filters.website),
            email: Boolean(filters.email),
            geocoded: Boolean(filters.geocoded)
        };
    }

    function syncFromState() {
        activeFilters = readActiveFilters();
    }

    const hasAnyFilter = $derived(
        activeFilters.status !== 'all'
        || activeFilters.city !== 'all'
        || activeFilters.website
        || activeFilters.email
        || activeFilters.geocoded
    );

    function fireFilter(reason) {
        appState.activeStoryPrompt = null;
        incrementFilterVersion();
        if (typeof syncFilterControls === 'function') syncFilterControls();
        if (typeof clearSearchGlow === 'function') clearSearchGlow();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (typeof applyFilters === 'function') applyFilters();
            if (typeof requestUrlStateUpdate === 'function') {
                requestUrlStateUpdate(reason);
            }
            if (typeof onFiltersChanged === 'function') onFiltersChanged(activeFilters);
            publish(EVENTS.FILTER_CHANGED, { type: 'general', reason });
        }, debounceMs);
    }

    function handleStatusClick(event) {
        const button = event.currentTarget;
        const value = button.dataset.statusFilter || 'all';
        setActiveFilter('status', value);
        activeFilters = readActiveFilters();
        fireFilter('status-filter');
    }

    function handleSignalClick(event) {
        const button = event.currentTarget;
        const key = button.dataset.signalFilter;
        if (!key) return;
        toggleActiveFilterSignal(key);
        activeFilters = readActiveFilters();
        fireFilter('signal-filter');
    }

    function handleCityChange(event) {
        const value = event.target.value || 'all';
        setActiveFilter('city', value);
        activeFilters = readActiveFilters();
        fireFilter('city-filter');
    }

    function handleClearFilters() {
        resetActiveFilters();
        activeFilters = readActiveFilters();
        if (typeof requestUrlStateUpdate === 'function') {
            requestUrlStateUpdate('filter-clear');
        }
        fireFilter('filter-clear');
    }

    onMount(() => {
        unsubscribers.push(
            subscribe(EVENTS.FILTER_CHANGED, () => syncFromState()),
            subscribe(EVENTS.URL_SYNC_REQUESTED, () => syncFromState())
        );
    });

    onDestroy(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        while (unsubscribers.length) {
            const unsub = unsubscribers.pop();
            if (typeof unsub === 'function') unsub();
        }
    });
</script>

<div class="filter-toolbar" aria-label="Dataset filters">
    <div class="filter-row" id="status-filter-row">
        <button
            class="filter-chip"
            class:active={activeFilters.status === 'all'}
            type="button"
            data-status-filter="all"
            aria-pressed={activeFilters.status === 'all'}
            onclick={handleStatusClick}
        >All Records</button>
        <button
            class="filter-chip"
            class:active={activeFilters.status === 'active'}
            type="button"
            data-status-filter="active"
            aria-pressed={activeFilters.status === 'active'}
            onclick={handleStatusClick}
        >Active</button>
    </div>
    <div class="filter-row" id="signal-filter-row">
        <button
            class="filter-chip"
            class:active={activeFilters.website}
            type="button"
            data-signal-filter="website"
            aria-pressed={activeFilters.website}
            onclick={handleSignalClick}
        >Has Website</button>
        <button
            class="filter-chip"
            class:active={activeFilters.email}
            type="button"
            data-signal-filter="email"
            aria-pressed={activeFilters.email}
            onclick={handleSignalClick}
        >Has Email</button>
    </div>
    <select
        class="filter-select"
        id="city-filter"
        aria-label="Filter by city"
        value={activeFilters.city}
        onchange={handleCityChange}
    >
        <option value="all">All Cities</option>
    </select>
    <button
        class="filter-clear-btn"
        id="filter-clear-btn"
        type="button"
        disabled={!hasAnyFilter}
        aria-disabled={!hasAnyFilter}
        onclick={handleClearFilters}
    >Clear filters</button>
</div>
