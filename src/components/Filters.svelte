<!--
  @components/Filters.svelte — Filter toolbar rail

  Mirrors the legacy #filters-section DOM structure for contract test compat.
  Uses <details> element with id="filters-section" and .open attribute.

  DOM ids/classes expected by contract tests:
    #filters-section, .filter-toolbar, .filter-chip,
    #city-filter, #filter-clear-btn,
    data-status-filter, data-signal-filter
-->
<script lang="ts">
  import {
    filterState,
    hasActiveFilters,
    activeFilterCount,
    toggleFilter,
    resetFilters,
    getFilterState
  } from '@lib/stores/filter';

  interface Props {
    /** Whether the filter panel is open */
    open?: boolean;
  }

  let { open = false }: Props = $props();

  interface FilterOption {
    id: string;
    label: string;
  }

  const statusFilters: FilterOption[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' }
  ];

  const contactFilters: FilterOption[] = [
    { id: 'website', label: 'Has Website' },
    { id: 'email', label: 'Has Email' },
    { id: 'geocoded', label: 'Geocoded' }
  ];

  /** Check whether a status filter is the currently active one. */
  function isStatusActive(id: string): boolean {
    return getFilterState().status === id;
  }

  /** Check whether a contact filter is currently on. */
  function isContactActive(id: string): boolean {
    const fs = getFilterState();
    switch (id) {
      case 'website':
        return fs.website;
      case 'email':
        return fs.email;
      case 'geocoded':
        return fs.geocoded;
      default:
        return false;
    }
  }

  function handleStatusToggle(id: string): void {
    toggleFilter('status', id);
  }

  function handleContactToggle(id: string): void {
    const fs = getFilterState();
    switch (id) {
      case 'website':
        toggleFilter('website', !fs.website);
        break;
      case 'email':
        toggleFilter('email', !fs.email);
        break;
      case 'geocoded':
        toggleFilter('geocoded', !fs.geocoded);
        break;
    }
  }

  function handleCityChange(e: Event): void {
    const target = e.target as HTMLSelectElement;
    toggleFilter('city', target.value);
  }

  function handleReset(): void {
    resetFilters();
  }
</script>

<details
  class="filters-section rail-section"
  id="filters-section"
  aria-label="Business filters"
  {open}
>
  <div class="filter-toolbar">
    <!-- Status filter chips -->
    <div class="filter-group">
      <h4 class="filter-group-title">Status</h4>
      {#each statusFilters as filter (filter.id)}
        <button
          class="filter-chip"
          class:active={isStatusActive(filter.id)}
          data-status-filter={filter.id}
          onclick={() => handleStatusToggle(filter.id)}
          aria-pressed={isStatusActive(filter.id)}
          type="button"
        >
          {filter.label}
        </button>
      {/each}
    </div>

    <!-- Contact/signal filter chips -->
    <div class="filter-group">
      <h4 class="filter-group-title">Contact</h4>
      {#each contactFilters as filter (filter.id)}
        <button
          class="filter-chip"
          class:active={isContactActive(filter.id)}
          data-signal-filter={filter.id}
          onclick={() => handleContactToggle(filter.id)}
          aria-pressed={isContactActive(filter.id)}
          type="button"
        >
          {filter.label}
        </button>
      {/each}
    </div>

    <!-- City filter select -->
    <div class="filter-group">
      <h4 class="filter-group-title">City</h4>
      <select
        id="city-filter"
        class="city-filter"
        value={$filterState.city}
        onchange={handleCityChange}
      >
        <option value="">All Cities</option>
        <option value="Conroe">Conroe</option>
        <option value="The Woodlands">The Woodlands</option>
        <option value="Spring">Spring</option>
        <option value="Magnolia">Magnolia</option>
        <option value="Montgomery">Montgomery</option>
      </select>
    </div>

    <!-- Reset button (always rendered for contract test parity) -->
    <button
      class="filter-reset"
      id="filter-clear-btn"
      onclick={handleReset}
      aria-label="Reset all filters"
      type="button"
      disabled={!$hasActiveFilters}
    >
      Reset ({$activeFilterCount})
    </button>
  </div>
</details>

<style>
  .filters-section {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-controls, 50);
  }
  .filter-toolbar {
    display: flex;
    gap: 1rem;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .filter-group-title {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #4ecdc4;
    margin-right: 0.3rem;
    font-family: 'Bricolage Grotesque', sans-serif;
    margin: 0;
  }
  .filter-chip {
    padding: 0 0.5rem;
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.3rem;
    color: #b0d0d0;
    font-size: 0.65rem;
    font-family: 'Nunito Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    height: 44px;
    min-width: 44px;
    width: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    line-height: 44px;
  }
  .filter-chip:hover {
    border-color: rgba(78, 205, 196, 0.35);
  }
  .filter-chip.active {
    background: rgba(78, 205, 196, 0.2);
    border-color: #4ecdc4;
    color: #4ecdc4;
  }
  .city-filter {
    padding: 0.3rem 0.5rem;
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.3rem;
    color: #b0d0d0;
    font-size: 0.65rem;
    font-family: 'Nunito Sans', sans-serif;
    height: 44px;
    cursor: pointer;
    box-sizing: border-box;
  }
  .city-filter:focus {
    border-color: rgba(78, 205, 196, 0.5);
    outline: none;
  }
  .city-filter:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.6);
    outline-offset: 2px;
  }
  .filter-reset {
    padding: 0.2rem 0.5rem;
    background: rgba(255, 107, 107, 0.12);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 0.3rem;
    color: #ff6b6b;
    font-size: 0.6rem;
    font-family: 'Nunito Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .filter-reset:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .filter-reset:hover:not(:disabled) {
    background: rgba(255, 107, 107, 0.22);
    border-color: #ff6b6b;
  }

  @media (max-width: 768px) {
    .filter-toolbar {
      flex-direction: column;
      width: 90vw;
      bottom: 0.5rem;
    }
  }
</style>
