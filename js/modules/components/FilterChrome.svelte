<script lang="ts">
    import { onDestroy } from 'svelte';
    import { state as appState } from '../../state.js';
    import { activeFiltersStore } from '../stores.js';
    import { publish, EVENTS } from '@lib/orchestration/event-bus';
    import { applyFilters, clearSearchGlow } from '../search-state.ts';
    import {
        setActiveFilter,
        toggleActiveFilterSignal,
        resetActiveFilters,
        incrementFilterVersion
    } from '../filter-state.js';
    import { normalizeCityForFilter } from '../utils/geo-data.js';
    import { FILTER_DEBOUNCE_MS } from '@lib/utils/chrome-timing';

    interface FilterChromeProps {
        debounceMs?: number;
        onFiltersChanged?: ((filters: ActiveFilters) => void) | null;
        requestUrlStateUpdate?: ((reason: string) => void) | null;
    }

    interface ActiveFilters {
        status: string;
        city: string;
        website: boolean;
        email: boolean;
        geocoded: boolean;
    }

    let {
        debounceMs = FILTER_DEBOUNCE_MS,
        onFiltersChanged = null,
        requestUrlStateUpdate = null
    }: FilterChromeProps = $props();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const hasAnyFilter = $derived(
        $activeFiltersStore.status !== 'all'
        || $activeFiltersStore.city !== 'all'
        || $activeFiltersStore.website
        || $activeFiltersStore.email
        || $activeFiltersStore.geocoded
    );

    let cities: [string, number][] = $derived(
        Array.from(
            ((appState as { points?: Array<{ city?: string }> }).points || []).reduce((acc: Map<string, number>, point: { city?: string }) => {
                const c = normalizeCityForFilter(point?.city);
                if (c && c !== 'Other / Unparsed') acc.set(c, (acc.get(c) || 0) + 1);
                return acc;
            }, new Map<string, number>())
        ).sort((a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]))
    );

    $effect(() => {
        const preview = document.getElementById('filter-preview');
        if (preview) {
            const parts: string[] = [];
            const af: ActiveFilters = $activeFiltersStore;
            if (af.status !== 'all') {
                parts.push(af.status.charAt(0).toUpperCase() + af.status.slice(1));
            }
            if (af.website) parts.push('Website');
            if (af.email) parts.push('Email');
            if (af.city && af.city !== 'all') parts.push(af.city);

            if (parts.length > 0) {
                preview.textContent = parts.join(' · ');
                preview.hidden = false;
            } else {
                preview.textContent = 'All clear';
                preview.hidden = true;
            }
        }
    });

    function fireFilter(reason: string): void {
        (appState as { activeStoryPrompt: null }).activeStoryPrompt = null;
        incrementFilterVersion();
        if (typeof clearSearchGlow === 'function') clearSearchGlow();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (typeof applyFilters === 'function') applyFilters();
            if (typeof requestUrlStateUpdate === 'function') {
                requestUrlStateUpdate(reason);
            }
            if (typeof onFiltersChanged === 'function') onFiltersChanged($activeFiltersStore);
            publish(EVENTS.FILTER_CHANGED, { type: 'general', reason });
        }, debounceMs);
    }

    function handleStatusClick(event: MouseEvent): void {
        const button = event.currentTarget as HTMLElement;
        const value = button.dataset.statusFilter || 'all';
        setActiveFilter('status', value);
        fireFilter('status-filter');
    }

    function handleSignalClick(event: MouseEvent): void {
        const button = event.currentTarget as HTMLElement;
        const key = button.dataset.signalFilter;
        if (!key) return;
        toggleActiveFilterSignal(key);
        fireFilter('signal-filter');
    }

    function handleCityChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value || 'all';
        setActiveFilter('city', value);
        fireFilter('city-filter');
    }

    function handleClearFilters(): void {
        resetActiveFilters();
        if (typeof requestUrlStateUpdate === 'function') {
            requestUrlStateUpdate('filter-clear');
        }
        fireFilter('filter-clear');
    }

    onDestroy((): void => {
        if (debounceTimer) clearTimeout(debounceTimer);
    });
</script>

<div class="filter-toolbar" aria-label="Dataset filters">
    <div class="filter-row" id="status-filter-row">
        <button
            class="filter-chip"
            class:active={$activeFiltersStore.status === 'all'}
            type="button"
            data-status-filter="all"
            aria-pressed={$activeFiltersStore.status === 'all'}
            onclick={handleStatusClick}
        >All Records</button>
        <button
            class="filter-chip"
            class:active={$activeFiltersStore.status === 'active'}
            type="button"
            data-status-filter="active"
            aria-pressed={$activeFiltersStore.status === 'active'}
            onclick={handleStatusClick}
        >Active</button>
    </div>
    <div class="filter-row" id="signal-filter-row">
        <button
            class="filter-chip"
            class:active={$activeFiltersStore.website}
            type="button"
            data-signal-filter="website"
            aria-pressed={$activeFiltersStore.website}
            onclick={handleSignalClick}
        >Has Website</button>
        <button
            class="filter-chip"
            class:active={$activeFiltersStore.email}
            type="button"
            data-signal-filter="email"
            aria-pressed={$activeFiltersStore.email}
            onclick={handleSignalClick}
        >Has Email</button>
    </div>
    <select
        class="filter-select"
        id="city-filter"
        aria-label="Filter by city"
        value={$activeFiltersStore.city}
        onchange={handleCityChange}
    >
        <option value="all">All Cities</option>
        {#each cities as [city, count]}
            <option value={city}>{city} ({count.toLocaleString()})</option>
        {/each}
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
