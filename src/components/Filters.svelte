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
    hasActiveFilters,
    activeFilterCount,
    toggleFilter,
    resetFilters,
    getFilterState
  } from '@lib/stores/filter.svelte';
  import { getBusinessRecords } from '@lib/data-store';

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

  // W48-F: build the city list from the actual business records so the
  // dropdown reflects every city in the dataset (32 distinct cities vs. the
  // previous 5 hardcoded options, which silently hid Willis, Cleveland,
  // Houston, Cut And Shoot, and ~25 others). Sorted by record count DESC
  // so the most populous cities appear first — matches the user's
  // intuition about where to look.
  const cityOptions = $derived.by(() => {
    const records = getBusinessRecords()
    if (records.length === 0) return []
    const counts = new Map<string, number>()
    for (const r of records) {
      const city = r.city?.trim()
      if (!city) continue
      counts.set(city, (counts.get(city) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([city, count]) => ({ city, count }))
  })

  function handleCityChange(e: Event): void {
    const target = e.target as HTMLSelectElement;
    toggleFilter('city', target.value);
  }

  function handleReset(): void {
    resetFilters();
  }

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  function handleChipKeydown(event: KeyboardEvent, filterId: string) {
    const chips = Array.from(
      (event.currentTarget as HTMLElement).closest('.filter-group')?.querySelectorAll('.filter-chip') ?? []
    ) as HTMLElement[];
    const idx = chips.findIndex((c) => c.dataset.statusFilter === filterId || c.dataset.contactFilter === filterId);
    if (idx === -1) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = chips[(idx + 1) % chips.length];
      next?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = chips[(idx - 1 + chips.length) % chips.length];
      prev?.focus();
    }
  }
</script>

<details
  class="filters-section rail-section"
  id="filters-section"
  aria-label="Business filters"
  {open}
>
  <summary class="filter-toggle" aria-label="Toggle business filters">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span class="filter-toggle-label">Filters</span>
    {#if $activeFilterCount > 0}
      <span class="filter-badge" aria-label="{$activeFilterCount} active filters">{$activeFilterCount}</span>
    {/if}
  </summary>
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
          onkeydown={(e) => handleChipKeydown(e, filter.id)}
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
          data-contact-filter={filter.id}
          onclick={() => handleContactToggle(filter.id)}
          onkeydown={(e) => handleChipKeydown(e, filter.id)}
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
        aria-label="Filter by city"
        class="city-filter"
        value={getFilterState().city}
        onchange={handleCityChange}
      >
        <option value="">All Cities ({getBusinessRecords().length})</option>
        {#each cityOptions as opt (opt.city)}
          <option value={opt.city}>{opt.city} ({opt.count})</option>
        {/each}
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
    background: rgba(var(--color-surface-chrome-rgb), 0.92);
    backdrop-filter: blur(12px);
    border-radius: var(--radius-tight);
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
    color: var(--color-primary-alt);
    margin-right: 0.3rem;
    font-family: var(--font-display);
    margin: 0;
  }
  .filter-chip {
    padding: 0 0.5rem;
    background: rgba(var(--color-primary-alt-rgb), 0.08);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.15);
    border-radius: 0.3rem;
    color: var(--color-text-teal-muted);
    font-size: 0.65rem;
    font-family: var(--font-body);
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
    border-color: rgba(var(--color-primary-alt-rgb), 0.35);
  }
  .filter-chip.active {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    border-color: var(--color-primary-alt);
    color: var(--color-primary-alt);
  }
  .city-filter {
    padding: 0.3rem 0.5rem;
    background: rgba(var(--color-primary-alt-rgb), 0.08);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.15);
    border-radius: 0.3rem;
    color: var(--color-text-teal-muted);
    font-size: 0.65rem;
    font-family: var(--font-body);
    height: 44px;
    cursor: pointer;
    box-sizing: border-box;
  }
  .city-filter:focus {
    border-color: rgba(var(--color-primary-alt-rgb), 0.5);
    outline: none;
  }
  .city-filter:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
  }
  .filter-reset {
    padding: 0.2rem 0.5rem;
    background: rgba(255, 107, 107, 0.12);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 0.3rem;
    color: var(--status-danger);
    font-size: 0.6rem;
    font-family: var(--font-body);
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
    border-color: var(--status-danger);
  }

  .filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    background: rgba(var(--color-surface-chrome-rgb), 0.85);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.25);
    border-radius: var(--radius-tight);
    cursor: pointer;
    user-select: none;
    /* Hide native <details> disclosure triangle */
    list-style: none;
  }
  /* WebKit legacy: hide the disclosure marker */
  .filter-toggle::-webkit-details-marker {
    display: none;
  }
  .filter-toggle-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-text-teal-light);
  }
  .filter-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 0.3rem;
    background: var(--color-primary-alt);
    color: var(--color-surface-deep);
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 9999px;
    font-family: var(--font-mono);
  }

  /* W50-LAYOUT-1: One-time pulse-glow on the FILTERS pill to boost
     discoverability on first idle splash. Runs once then stops. */
  body[data-panel-surface='idle'] .filters-section:not([open]) .filter-toggle {
    animation: filters-pulse-glow 3.6s ease-in-out 1;
  }
  @keyframes filters-pulse-glow {
    0%, 100% {
      box-shadow: none;
      border-color: rgba(var(--color-primary-alt-rgb), 0.25);
    }
    50% {
      box-shadow: 0 0 14px 4px rgba(var(--color-primary-alt-rgb), 0.35);
      border-color: rgba(var(--color-primary-alt-rgb), 0.6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    body[data-panel-surface='idle'] .filters-section:not([open]) .filter-toggle {
      animation: none;
    }
  }
  @media (max-width: 768px) {
    .filter-toolbar {
      flex-direction: column;
      width: 90vw;
      bottom: 0.5rem;
    }
  }
</style>
