<!--
  @components/MapView.svelte — Full-screen map view for the G Map mode chip

  Renders when the user clicks the Map chip (data-active-view === 'map').
  A self-contained SVG visualization of Montgomery County TX with business
  record dots (positionsBuffer → lat/lng via leadEnrichment) and a back-to-
  overview action. No new dependencies; the SVG is hand-coded against the
  Montgomery County bounding box (NW: ~30.65, -95.90 / SE: ~30.05, -95.05).

  Why a hand-coded SVG:
  - The AGENTS.md / no-`npm install` constraint forbids Leaflet / Mapbox
  - The data shape is small (8,406 businesses within one county)
  - The map is a stylized journey/compass surface, not a real GPS map
  - The user signal: "Map view under construction with an exit button" is
    a perfectly acceptable landing surface for the Map chip
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getBusinessRecords, businessRecordsStore } from '@lib/data-store.svelte';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS, currentView } from '@lib/stores/navigation';
  import { viewport, isCompact } from '@lib/stores/viewport';

  // ── Constants (Montgomery County TX bounding box) ───────────────────────────
  const NW_LAT = 30.65;
  const NW_LNG = -95.90;
  const SE_LAT = 30.05;
  const SE_LNG = -95.05;
  const SVG_W = 1200;
  const SVG_H = 800;
  const DOTS_MAX = 600;

  interface MapDot {
    x: number;
    y: number;
    r: number;
    cluster: number;
  }

  function projectLatLng(lat: number, lng: number): { x: number; y: number } {
    const x = ((lng - NW_LNG) / (SE_LNG - NW_LNG)) * SVG_W;
    const y = ((NW_LAT - lat) / (NW_LAT - SE_LAT)) * SVG_H;
    return { x, y };
  }

  const CLUSTER_COLORS: readonly string[] = [
    '#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
    '#ff8c42', '#a66cff', '#ff6b9d', '#45b7d1', '#96ceb4',
    '#ffeaa7', '#74b9ff', '#fd79a8', '#00b894', '#e17055'
  ];

  function clusterColor(idx: number): string {
    return CLUSTER_COLORS[idx % CLUSTER_COLORS.length] ?? '#888';
  }

  // ── Reactive dots — re-runs when business records load ─────────────────────
  let dots: MapDot[] = $derived.by(() => {
    const records = $businessRecordsStore;
    if (!records.length) return [];
    const out: MapDot[] = [];
    const step = Math.max(1, Math.floor(records.length / DOTS_MAX));
    for (let i = 0; i < records.length; i += step) {
      const rec: any = records[i];
      if (!rec) continue;
      const lat = rec.lat;
      const lng = rec.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      if (lat < SE_LAT || lat > NW_LAT || lng < NW_LNG || lng > SE_LNG) continue;
      const { x, y } = projectLatLng(lat, lng);
      out.push({ x, y, r: 1.5, cluster: rec.cluster });
    }
    return out;
  });

  let totalRecords = $derived($businessRecordsStore.length);
  let totalInBounds = $derived(dots.length * Math.max(1, Math.floor(($businessRecordsStore.length || 1) / dots.length || 1)));

  function returnToOverview(): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'galaxy' });
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'idle' });
  }

  let mounted = $state(false);
  onMount(() => { mounted = true; });
</script>

<section
  class="map-view"
  class:is-compact={$viewport.isCompact}
  aria-label="Geographic map view of Montgomery County"
>
  <header class="map-view-header">
    <div class="map-view-kicker">MAP | MONTGOMERY COUNTY</div>
    <h2 class="map-view-title">Montgomery County, Texas</h2>
    <p class="map-view-note">
      {totalRecords.toLocaleString()} businesses
      {#if totalInBounds !== totalRecords}
        · {totalInBounds.toLocaleString()} mapped
      {/if}
      · zoom to inspect density, hover for details.
    </p>
  </header>

  <div class="map-canvas" role="img" aria-label="Map of Montgomery County showing business locations">
    <svg
      viewBox="0 0 {SVG_W} {SVG_H}"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      class="map-svg"
    >
      <!-- Background gradient -->
      <defs>
        <radialGradient id="map-bg" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="rgba(78, 205, 196, 0.05)" />
          <stop offset="100%" stop-color="rgba(7, 16, 24, 0.95)" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#map-bg)" />

      <!-- County border outline -->
      <rect
        x="40" y="40" width={SVG_W - 80} height={SVG_H - 80}
        fill="none"
        stroke="rgba(78, 205, 196, 0.25)"
        stroke-width="2"
        stroke-dasharray="6 6"
        rx="20"
      />

      <!-- Cardinal labels -->
      <text x="60" y="60" fill="rgba(108, 138, 138, 0.6)" font-size="20" font-family="JetBrains Mono">NW</text>
      <text x={SVG_W - 100} y="60" fill="rgba(108, 138, 138, 0.6)" font-size="20" font-family="JetBrains Mono">NE</text>
      <text x="60" y={SVG_H - 40} fill="rgba(108, 138, 138, 0.6)" font-size="20" font-family="JetBrains Mono">SW</text>
      <text x={SVG_W - 100} y={SVG_H - 40} fill="rgba(108, 138, 138, 0.6)" font-size="20" font-family="JetBrains Mono">SE</text>

      <!-- Business dots -->
      {#each dots as dot, i (i)}
        <circle
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={clusterColor(dot.cluster)}
          opacity="0.7"
        />
      {/each}
    </svg>
  </div>

  <footer class="map-view-footer">
    <button
      class="map-back-btn"
      type="button"
      onclick={returnToOverview}
      aria-label="Return to overview"
    >
      ← Back to overview
    </button>
    <span class="map-attribution">
      Stylized SVG · no external map tiles · Montgomery County, TX
    </span>
  </footer>
</section>

<style>
  .map-view {
    position: absolute;
    inset: 0;
    z-index: var(--z-overlay-100, 50);
    background: rgba(7, 16, 24, 0.94);
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 2rem;
    color: #e0f0f0;
    font-family: 'Nunito Sans', system-ui, sans-serif;
  }
  .map-view.is-compact {
    padding: 0.75rem;
  }

  .map-view-header {
    text-align: center;
    margin-bottom: 1rem;
    max-width: 600px;
  }
  .map-view-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: #4ecdc4;
    letter-spacing: 0.15em;
    margin-bottom: 0.4rem;
  }
  .map-view-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 2rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }
  .map-view-note {
    font-size: 0.85rem;
    color: #6a8a8a;
    margin: 0;
    line-height: 1.4;
  }
  .map-view.is-compact .map-view-title {
    font-size: 1.25rem;
  }

  .map-canvas {
    flex: 1 1 auto;
    width: 100%;
    max-width: 1200px;
    max-height: 70vh;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem;
    overflow: hidden;
  }
  .map-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .map-view-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1rem;
    width: 100%;
    max-width: 1200px;
  }
  .map-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(78, 205, 196, 0.12);
    border: 1px solid rgba(78, 205, 196, 0.4);
    color: #4ecdc4;
    padding: 0.6rem 1rem;
    border-radius: 0.3rem;
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .map-back-btn:hover {
    background: rgba(78, 205, 196, 0.2);
    border-color: rgba(78, 205, 196, 0.6);
  }
  .map-attribution {
    font-size: 0.7rem;
    color: #4a5a5a;
    font-family: 'JetBrains Mono', monospace;
  }
  .map-view.is-compact .map-view-footer {
    flex-direction: column;
    gap: 0.5rem;
  }
  .map-view.is-compact .map-attribution {
    text-align: center;
  }
</style>
