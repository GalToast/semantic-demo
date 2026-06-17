<script lang="ts">
  import { onMount } from 'svelte';
  import { businessRecordsStore } from '@lib/data-store.svelte';
  import { hasActiveFilters, activeClusterFilter } from '@lib/stores/filter.svelte';
  import { initLegendEventBusSubscriptions } from '@lib/journey/legend-ui';
  // The full filter pipeline lives in cluster-filter-controller; the
  // stub in @lib/stores/filter only writes the writable without clearing
  // search glow, applying the filter to the mycelium, or updating the URL.
  // Calling that stub leaves the canvas unchanged — this is what made
  // P0-5 "category toggle doesn't filter" reproduce.
  import { setClusterFilter as applyClusterFilter } from '@lib/orchestration/cluster-filter-controller';

  interface Props {
    open?: boolean;
    mapView?: boolean;
    /** When true, Legend is hidden to avoid bottom-left collision with JourneyChrome/MapSummary in focus states */
    concealedByFocus?: boolean;
  }

  let { open = false, mapView = false, concealedByFocus = false }: Props = $props();
  let activeLegendButtonIndex = $state(0);
  let legendButtons: HTMLButtonElement[] = $state([]);

  /** 15-entry cluster names matching CLUSTER_NAMES from state.js / InfoPanel.svelte */
  const CLUSTER_NAMES: string[] = [
    'Food & Dining',
    'Professional Services',
    'Retail & Shopping',
    'Health & Medical',
    'Home & Garden',
    'Automotive',
    'Education & Childcare',
    'Entertainment & Events',
    'Construction & Trades',
    'Real Estate',
    'Nonprofit & Civic',
    'Technology',
    'Manufacturing & Industrial',
    'Financial Services',
    'Agriculture & Land',
  ];

  const CLUSTER_COLORS: string[] = [
    '#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
    '#ff8c42', '#a66cff', '#ff6b9d', '#45b7d1', '#96ceb4',
    '#ffeaa7', '#74b9ff', '#fd79a8', '#00b894', '#e17055',
  ];

  interface ClusterEntry {
    index: number;
    name: string;
    count: number;
    color: string;
  }

  let clusterEntries: ClusterEntry[] = $derived.by(() => {
    const records = $businessRecordsStore;
    if (!records.length) {
      return CLUSTER_NAMES.map((name, i) => ({
        index: i,
        name,
        count: 0,
        color: CLUSTER_COLORS[i] ?? '#888',
      }));
    }

    // Count records per cluster index
    const counts = new Map<number, number>();
    for (const rec of records) {
      const idx = rec.cluster;
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }

    // Build entries for all clusters, filtering out zero-count
    const entries: ClusterEntry[] = [];
    for (let i = 0; i < CLUSTER_NAMES.length; i++) {
      const count = counts.get(i) ?? 0;
      if (count > 0) {
        entries.push({
          index: i,
          name: CLUSTER_NAMES[i] ?? `Cluster ${i}`,
          count,
          color: CLUSTER_COLORS[i] ?? '#888',
        });
      }
    }
    return entries;
  });

  let filtered = $derived($hasActiveFilters);

  $effect(() => {
    if (activeLegendButtonIndex >= clusterEntries.length) {
      activeLegendButtonIndex = Math.max(0, clusterEntries.length - 1);
    }
  });

  function focusLegendButton(index: number): void {
    if (!clusterEntries.length) return;
    const nextIndex = (index + clusterEntries.length) % clusterEntries.length;
    activeLegendButtonIndex = nextIndex;
    legendButtons[nextIndex]?.focus();
  }

  function handleLegendKeydown(event: KeyboardEvent, index: number): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        focusLegendButton(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        focusLegendButton(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusLegendButton(0);
        break;
      case 'End':
        event.preventDefault();
        focusLegendButton(clusterEntries.length - 1);
        break;
    }
  }

  function toggleCluster(_name: string, index: number): void {
    // activeClusterFilter is stored as the cluster index (number-as-string)
    // so the engine's isPointVisible(pointCluster, activeClusterFilter)
    // comparison can match. The old code wrote the name string and the
    // engine silently ignored it because it never equaled any cluster id.
    const current = $activeClusterFilter;
    const isActive = current !== null && Number(current) === index;
    applyClusterFilter(isActive ? null : index);
  }

  onMount(() => {
    initLegendEventBusSubscriptions();
  });
</script>

<aside
  class="legend"
  class:open
  class:map-view={mapView}
  class:concealed-by-focus={concealedByFocus}
  aria-hidden={!open || concealedByFocus}
  aria-label="Business category legend"
  id="legend-panel"
>
  <h3 class="legend-title">Categories</h3>
  {#if filtered}
    <span class="legend-filtered-badge">filtered</span>
  {/if}
  <div class="legend-list" role="group" aria-label="Business categories. Use arrow keys to move between categories.">
    {#each clusterEntries as entry, i (entry.name)}
      <button
        bind:this={legendButtons[i]}
        class="legend-item"
        class:inactive={$activeClusterFilter != null && Number($activeClusterFilter) === entry.index}
        onclick={() => toggleCluster(entry.name, entry.index)}
        onfocus={() => {
          activeLegendButtonIndex = i;
        }}
        onkeydown={(event) => handleLegendKeydown(event, i)}
        type="button"
        tabindex={open && !concealedByFocus && i === activeLegendButtonIndex ? 0 : -1}
        aria-pressed={$activeClusterFilter != null && Number($activeClusterFilter) === entry.index}
      >
        <span
          class="legend-swatch"
          style="background-color: {entry.color}"
        ></span>
        <span class="legend-label">{entry.name}</span>
        <span class="legend-count">{entry.count}</span>
      </button>
    {/each}
  </div>
</aside>

<style>
  .legend {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    z-index: var(--z-legend);
    background: rgba(7, 16, 24, 0.88);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.75rem;
    max-height: 60vh;
    overflow-y: auto;
    transform: translateX(-120%);
    transition: transform 0.3s ease;
  }
  .legend.map-view {
    left: auto;
    right: 1rem;
    bottom: calc(122px + env(safe-area-inset-bottom, 0px));
    max-height: 38vh;
  }
  .legend.open {
    transform: translateX(0);
  }
  .legend.concealed-by-focus {
    display: none;
  }
  .legend-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .legend-list {
    list-style: none;
    padding: 0;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem 0;
    font-size: 0.7rem;
    color: #b0d0d0;
  }
  .legend-swatch {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .legend-item.inactive {
    opacity: 0.35;
  }
  .legend-item.inactive .legend-swatch {
    filter: grayscale(0.8);
  }
  .legend-item {
    cursor: pointer;
    user-select: none;
  }
  .legend-filtered-badge {
    display: inline-block;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.55rem;
    color: #ffd93d;
    background: rgba(255, 217, 61, 0.12);
    border: 1px solid rgba(255, 217, 61, 0.25);
    border-radius: 0.25rem;
    padding: 0.05rem 0.35rem;
    margin-bottom: 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .legend-count {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: rgba(176, 208, 208, 0.75);
    flex-shrink: 0;
  }
</style>
