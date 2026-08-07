<script lang="ts">
  import { onMount } from 'svelte';
  import { parityMap, getBypassAttr } from '@lib/orchestration/parity-attrs.svelte';
  import { businessRecords } from '@lib/data-store';
  import { hasActiveFilters, activeClusterFilter } from '@lib/stores/filter.svelte';
  import { initLegendEventBusSubscriptions } from '@lib/journey/legend-ui';
  import { initLegendKeyboardShortcut } from '@lib/stores/legend-panel.svelte';
  // The full filter pipeline lives in cluster-filter-controller; the
  // stub in @lib/stores/filter only writes the writable without clearing
  // search glow, applying the filter to the mycelium, or updating the URL.
  // Calling that stub leaves the canvas unchanged — this is what made
  // P0-5 "category toggle doesn't filter" reproduce.
  import { setClusterFilter as applyClusterFilter } from '@lib/orchestration/cluster-filter-controller';
  import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';
  import { CLUSTER_COLORS } from '@lib/utils/design-tokens';

  import { legendOpen } from '@lib/stores/legend.svelte';
  import { DisposableRegistry } from '@lib/utils/disposable-registry';
  import LegendClusterList from '@lib/components/LegendClusterList.svelte';

  interface Props {
    open?: boolean;
    mapView?: boolean;
    /** When true, Legend is hidden to avoid bottom-left collision with JourneyChrome/MapSummary in focus states */
    concealedByFocus?: boolean;
  }

  let { open = false, mapView = false, concealedByFocus = false }: Props = $props();
  const legendRegistry = new DisposableRegistry({ label: 'Legend', warnAfterDispose: false });

  /**
   * Auto-hide the category legend after 10s of inactivity.
   * Mirrors the ProximityLegend behavior: users who want to keep reading
   * can hover / focus the panel to reset the timer; otherwise the panel
   * closes automatically so it doesn't overlap the canvas.
   */
  function scheduleLegendAutoHide(): void {
    legendRegistry.dispose();
    legendRegistry.schedule(10000, () => {
      legendOpen.set(false);
    });
  }

  function resetLegendAutoHide(): void {
    scheduleLegendAutoHide();
  }

  $effect(() => {
    if (open && !concealedByFocus) {
      scheduleLegendAutoHide();
    } else {
      legendRegistry.dispose();
    }
  });

  // ── Body state for CSS class derivation ────────────────────────────────────
  // panelSurface is mirrored by parity-attrs.svelte.ts:installParityAttributeSync()
  // and read reactively via parityMap (Svelte 5 tracks reads inside $derived).
  let bodyPanelSurface = $derived(parityMap.panelSurface || '');
  // renderKind is a bypass attr owned by parity-attrs.svelte.ts — read reactively
  // via getBypassAttr() instead of a local MutationObserver mirror.
  let bodyRenderKind = $derived(getBypassAttr('renderKind') ?? '');

  /** 21-entry cluster names + 30-entry colors, both imported from the canonical
   * sources (ui-presentation for names, design-tokens for colors). The previous
   * hardcoded 15-entry list was a stale snapshot of an older taxonomy:
   *  - Showed wrong names (e.g. index 0 was "Food & Dining" but the data is
   *    actually "General Business").
   *  - Silently dropped 6+ categories: Churches, Faith Ministries, Community
   *    Nonprofits, Foundations, Arts & Culture, Economic Development, Public
   *    Agencies, Enterprise Brands. Businesses in those clusters had no
   *    legend swatch at all.
   *  - The clusterEntries loop `for (let i = 0; i < CLUSTER_NAMES.length; i++)`
   *    only iterated over the hardcoded 15, so any business with cluster > 14
   *    was invisible in the legend.
   * Now using the same canonical lists that Placeholder2D and ProximityLegend
   * already use. */

  interface ClusterEntry {
    index: number;
    name: string;
    count: number;
    color: string;
  }

  let clusterEntries: ClusterEntry[] = $derived.by(() => {
    const records = Array.isArray($businessRecords) ? $businessRecords : [];
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
          name: CLUSTER_NAMES[i] ?? `Category ${i}`,
          count,
          color: CLUSTER_COLORS[i] ?? '#888',
        });
      }
    }
    return entries;
  });

  let filtered = $derived($hasActiveFilters);

  // Surface a "scroll for more" hint when the legend panel's max-height
  // clips its inner list. Without this, a 21-entry legend at desktop shows
  // only ~6 entries with no clue that the other 15 are scrollable. The
  // scroll container is the .legend aside itself (overflow-y: auto +
  // max-height), not the .legend-list div — measure the aside so the
  // comparison is between actual clip region and total content height.
  let panelEl: HTMLElement | null = $state(null);
  let panelScrollHeight = $state(0);
  let panelClientHeight = $state(0);
  let panelScrollTop = $state(0);
  let hasOverflow = $derived(panelScrollHeight > panelClientHeight + 1);
  let approxVisibleCount = $derived.by(() => {
    if (!hasOverflow) return clusterEntries.length;
    const firstVisible = Math.floor(panelScrollTop / 50);
    const lastVisible = Math.min(Math.ceil((panelScrollTop + panelClientHeight) / 50), clusterEntries.length);
    return Math.max(1, lastVisible - firstVisible);
  });

  $effect(() => {
    if (!panelEl) return;
    const measure = () => {
      panelScrollHeight = panelEl?.scrollHeight ?? 0;
      panelClientHeight = panelEl?.clientHeight ?? 0;
    };
    // Defer the first layout read off the render critical path. Reading
    // scrollHeight/clientHeight synchronously inside this effect forces a
    // synchronous reflow (layout flush) on every reactive render. Scheduling
    // the initial measure in requestAnimationFrame lets the browser batch it
    // before paint; the ResizeObserver below also re-measures (after layout)
    // whenever the panel's box changes, so steady-state output is identical.
    const rafId = requestAnimationFrame(measure);
    const onScroll = () => {
      panelScrollTop = panelEl?.scrollTop ?? 0;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(panelEl);
    window.addEventListener('resize', measure);
    panelEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      panelEl?.removeEventListener('scroll', onScroll);
    };
  });

  function resetClusterFilter(): void {
    applyClusterFilter(null);
  }

  function toggleCluster(_name: string, index: number): void {
    // activeClusterFilter is stored as the cluster index (number-as-string)
    // so the engine's isPointVisible(pointCluster, activeClusterFilter)
    // comparison can match. The old code wrote the name string and the
    // engine silently ignored it because it never equaled any cluster id.
    const current = $activeClusterFilter;
    const isActive = current !== null && Number(current) === index; // audit-ok: plain function, not transformed
    applyClusterFilter(isActive ? null : index);
  }

  onMount(() => {
    initLegendEventBusSubscriptions();
    const cleanup = initLegendKeyboardShortcut();
    return () => {
      cleanup();
      legendRegistry.dispose();
    };
  });
</script>

<aside
  bind:this={panelEl}
  class="legend"
  class:open
  class:map-view={mapView}
  class:concealed-by-focus={concealedByFocus}
  class:surface-search={bodyPanelSurface === 'search'}
  class:surface-focus-search={bodyPanelSurface === 'focus-search'}
  class:render-placeholder2d={bodyRenderKind === 'placeholder2d'}
  aria-hidden={!open || concealedByFocus}
  aria-label="Business category legend"
  id="legend-panel"
  onpointerenter={resetLegendAutoHide}
  onfocusin={resetLegendAutoHide}
  onpointerdown={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  <h2 class="legend-title" aria-label="The 12 categories are color-coded in the legend.">Categories</h2>
  <LegendClusterList
      {clusterEntries}
      activeClusterFilter={$activeClusterFilter}
      isFocusable={open && !concealedByFocus}
      {filtered}
      onSelect={toggleCluster}
      onReset={resetClusterFilter}
    />
  {#if hasOverflow}
    <div class="legend-overflow-indicator" aria-live="polite" data-testid="legend-overflow">
      <span class="legend-overflow-text">
        {approxVisibleCount} of {clusterEntries.length} shown
      </span>
      <span class="legend-overflow-hint" aria-hidden="true">scroll for more ↓</span>
    </div>
  {/if}
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
    overscroll-behavior: contain;
    touch-action: pan-y;
    transform: translateX(-120%);
    transition: transform 0.3s ease;
  }
  /* W56: styled scrollbar for the categories panel now lives in
   * css/layout_base.css (retargeted from the legacy `.legend-panel`
   * class to the actual `.legend` class). The scoped rules were
   * removed to keep a single source of truth for the shared panel
   * scrollbar system. */
  .legend.map-view {
    left: auto;
    right: 1rem;
    bottom: calc(122px + env(safe-area-inset-bottom, 0px));
    max-height: 38vh;
  }
  @media (max-width: 768px) {
    .legend,
    .legend.open {
      /* Leave room for the bottom-center toast / status pills so the legend
         does not overlap them on mobile. The legend remains scrollable. */
      bottom: 5.5rem;
      max-height: 45vh;
    }
  }
  .legend.open {
    transform: translateX(0);
  }
  .legend.concealed-by-focus {
    display: none;
  }
  .legend.surface-search,
  .legend.surface-focus-search {
    display: none;
  }
  /* W46-F1: hide the legend while the mobile 2D placeholder is showing
     so it doesn't cover the "Enter 3D Scene" CTA. The legend reappears
     once the user enters the 3D scene and renderKind flips to 'webgl'. */
  .legend.render-placeholder2d {
    display: none;
  }
  .legend-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-primary-alt);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  /* D: "N of M shown" overflow affordance. The legend list has
   * max-height: 38vh in map mode (60vh elsewhere) — at ~50px per
   * item, a 21-entry dataset shows ~6 entries and hides ~15 with no
   * visible scrollbar affordance. Sticky bottom inside the .legend
   * scroll container pins the cue to the panel's bottom edge so it
   * stays visible as the user scrolls. */
  .legend-overflow-indicator {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0.5rem -0.75rem -0.5rem;
    padding: 0.5rem 0.75rem 0.5rem;
    background: linear-gradient(180deg, rgba(7, 16, 24, 0) 0%, rgba(7, 16, 24, 0.92) 35%, rgba(7, 16, 24, 0.96) 100%);
    border-top: 1px solid rgba(var(--color-primary-rgb), 0.18);
    color: rgba(176, 208, 208, 0.85);
    backdrop-filter: blur(2px);
  }
  .legend-overflow-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    font-weight: 700;
    color: rgba(126, 231, 219, 0.92);
    letter-spacing: 0.04em;
  }
  .legend-overflow-hint {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.65rem;
    color: rgba(176, 208, 208, 0.78);
    text-align: center;
  }

  /* Reduced-motion: the slide-in transition is decorative; disable it for
     users who prefer reduced motion. Steady-state layout is unchanged. */
  @media (prefers-reduced-motion: reduce) {
    .legend {
      transition: none;
    }
  }
</style>
