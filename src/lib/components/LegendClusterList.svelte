<script lang="ts">
  /**
   * LegendClusterList — renders the category/cluster filter buttons
   * (swatch + name + count) inside the category legend panel.
   *
   * Extracted from Legend.svelte to shrink the ~434 LOC parent and to
   * isolate the keyboard-navigation + render concern.
   *
   * DOM contract (ids / classes expected by unit + contract tests):
   *   .legend-filtered-badge  — shown when non-cluster filters are active
   *   .legend-list[role="group"][aria-label="Business categories. …"]
   *   button.legend-item      — one per cluster entry
   *     .legend-swatch        — colour dot (inline background-color)
   *     .legend-label         — cluster name
   *     .legend-count         — record count
   *   button.legend-item      — [type="button"], [aria-pressed], class:inactive
   */

  interface ClusterEntry {
    index: number;
    name: string;
    count: number;
    color: string;
  }

  interface Props {
    /** Cluster entries to render (pre-computed by parent). */
    clusterEntries: ClusterEntry[];
    /** Currently selected cluster filter (null = all shown). */
    activeClusterFilter: string | null;
    /** When true the list is reachable via keyboard (panel is open and not concealed). */
    isFocusable: boolean;
    /** Whether non-cluster filters are active (shows the "filtered" badge). */
    filtered: boolean;
    /** Called when a cluster button is clicked. */
    onSelect: (name: string, index: number) => void;
    /** Called when the "All" or "Reset" button is clicked. */
    onReset: () => void;
  }

  let {
    clusterEntries,
    activeClusterFilter,
    isFocusable,
    filtered,
    onSelect,
    onReset,
  }: Props = $props();

  let activeButtonIndex = $state(0);
  let buttons: HTMLButtonElement[] = $state([]);

  $effect(() => {
    if (activeButtonIndex >= clusterEntries.length) {
      activeButtonIndex = Math.max(0, clusterEntries.length - 1);
    }
  });

  function focusButton(index: number): void {
    if (!clusterEntries.length) return;
    const next = (index + clusterEntries.length) % clusterEntries.length;
    activeButtonIndex = next;
    buttons[next]?.focus();
  }

  function handleKeydown(event: KeyboardEvent, index: number): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        focusButton(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        focusButton(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusButton(0);
        break;
      case 'End':
        event.preventDefault();
        focusButton(clusterEntries.length - 1);
        break;
    }
  }
</script>

{#if filtered}
  <span class="legend-filtered-badge">filtered</span>
{/if}

<div class="legend-controls">
  <button
    class="legend-control-btn"
    class:active={activeClusterFilter === null}
    onclick={() => onReset()}
    type="button"
    aria-label="Show all categories"
  >All</button>
  {#if filtered}
    <button
      class="legend-control-btn legend-control-reset"
      onclick={() => onReset()}
      type="button"
      aria-label="Reset all filters"
    >Reset</button>
  {/if}
</div>

<div
  class="legend-list"
  role="group"
  aria-label="Business categories. Use arrow keys to move between categories."
>
  {#each clusterEntries as entry, i (entry.name)}
    <button
      bind:this={buttons[i]}
      class="legend-item"
      class:inactive={activeClusterFilter != null && Number(activeClusterFilter) === entry.index}
      onclick={() => onSelect(entry.name, entry.index)}
      onfocus={() => { activeButtonIndex = i; }}
      onkeydown={(event) => handleKeydown(event, i)}
      type="button"
      tabindex={isFocusable && i === activeButtonIndex ? 0 : -1}
      aria-pressed={activeClusterFilter != null && Number(activeClusterFilter) === entry.index}
    >
      <span
        class="legend-swatch"
        style="background-color: {entry.color}"
        title="A group of businesses with a similar category or industry. The 12 categories are color-coded in the legend."
      ></span>
      <span class="legend-label">{entry.name}</span>
      <span class="legend-count">{entry.count}</span>
    </button>
  {/each}
</div>

<style>
  /* ── list ──────────────────────────────────────────────────────────────── */
  .legend-list {
    list-style: none;
    padding: 0;
  }

  /* ── items ─────────────────────────────────────────────────────────────── */
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem 0;
    min-height: 44px;
    font-size: 0.7rem;
    color: var(--color-text-teal-muted);
    cursor: pointer;
    user-select: none;
    width: 100%;
    background: none;
    border: none;
    border-radius: 0;
    text-align: left;
    font-family: inherit;
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

  .legend-count {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: rgba(176, 208, 208, 0.75);
    flex-shrink: 0;
  }

  .legend-item.inactive {
    opacity: 0.35;
  }

  .legend-item.inactive .legend-swatch {
    filter: grayscale(0.8);
  }

  .legend-item:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
    border-radius: 0.25rem;
  }

  /* ── filtered badge ────────────────────────────────────────────────────── */
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

  /* ── All / Reset controls ──────────────────────────────────────────────── */
  .legend-controls {
    display: flex;
    gap: 0.35rem;
    margin-bottom: 0.4rem;
  }

  .legend-control-btn {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    color: var(--color-text-teal-muted);
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: 0.25rem;
    padding: 0.1rem 0.45rem;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: background 0.15s, color 0.15s;
    line-height: 1.5;
  }

  .legend-control-btn:hover,
  .legend-control-btn:focus-visible {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    color: var(--color-primary-alt);
  }

  .legend-control-btn.active {
    background: rgba(var(--color-primary-alt-rgb), 0.25);
    color: var(--color-primary-alt);
    border-color: rgba(var(--color-primary-alt-rgb), 0.4);
  }
</style>
