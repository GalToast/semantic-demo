<script lang="ts">
    import { activeFiltersStore } from '../stores.js';

    interface ActiveFilters {
        status: string;
        city: string;
        website: boolean;
        email: boolean;
        geocoded: boolean;
    }

    const activeFilters = $derived<ActiveFilters>($activeFiltersStore);
    const hasActiveFilters = $derived(
        activeFilters.status !== 'all' || 
        activeFilters.city !== 'all' || 
        activeFilters.website || 
        activeFilters.email || 
        activeFilters.geocoded
    );
</script>

<section class="info-panel-surface info-panel-surface-discovery" data-surface-owner="discovery-filters" data-ownership-lane="surface interaction content" aria-label="Discovery filters surface">
    <details class="rail-section cluster-section" id="cluster-section">
        <summary>
            <span class="summary-text">
                <span class="summary-title">Semantic Neighborhoods</span>
            </span>
        </summary>
        <div class="rail-section-body">
            <ul class="cluster-list" id="cluster-list" role="group" aria-label="Semantic neighborhood filters"></ul>
        </div>
    </details>

    <details class="rail-section" id="filters-section">
        <summary>
            <span class="summary-text">
                <span class="summary-title">Filters</span>
            </span>
            <span class="filter-preview" id="filter-preview" hidden={!hasActiveFilters}>
                {#if hasActiveFilters}
                    Active
                {:else}
                    All clear
                {/if}
            </span>
        </summary>
        <div class="rail-section-body">
            <div class="filter-chrome-slot" id="filter-chrome-slot"></div>
        </div>
    </details>
</section>
