<!--
  @components/JourneyChrome.svelte — Journey UI overlay (trail controls, breadcrumb, neighbor rail)

  Ported from:
    - js/modules/journey-focus-ui.js (updateTraversalUi, updateWalkBreadcrumb, updateFocusNeighborRail)
    - js/modules/journey-compass-state.js (compass status header)
    - js/modules/journey-compass-controller.js (compass step state integration)

  Features:
    - Compass status header (kicker + note)
    - Walk breadcrumb with clickable history chips
    - Trail controls: prev/next navigation, context text, progress indicator
    - Neighbor rail with viewport-aware candidate filtering, inspect/pin actions,
      hover preview, next-stop badge, and relationship labels
-->
<script lang="ts">

  import { navStore, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { journeyStore, journeyPhase } from '@lib/stores/journey';
  import { buildCompassStatus } from '@lib/stores/compass';
  import { threadInspector, threadInspectorActive, pinThread, updateThreadInspector } from '@lib/stores/focus';
  import { getBusinessRecords, selectedPointStore } from '@lib/stores';
  import { viewport, isCompact, isMobile, isCompactLandscape, isUltraCompactPortrait } from '@lib/stores/viewport';
  import { searchSummary, isSearching } from '@lib/stores/search';
  import type { BusinessRecord } from '@lib/types/business';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let hoverTimer: ReturnType<typeof setTimeout> | null = $state(null);

  const currentPoint = $derived(selectedPointStore());
  const navSnapshot = $derived($navStore);
  const journeySnapshot = $derived($journeyStore);
  const currentFocusedIndex = $derived(navSnapshot.focusedIndex);
  const currentTrailDepth = $derived(Math.max(navSnapshot.trailDepth ?? 0, journeySnapshot.trailDepth ?? 0));
  const currentWalkHistory = $derived(
    journeySnapshot.walkHistoryIndices.length > 0
      ? journeySnapshot.walkHistoryIndices
      : navSnapshot.walkHistoryIndices
  );
  const currentThreadCandidates = $derived(
    journeySnapshot.threadCandidates.length > 0
      ? journeySnapshot.threadCandidates
      : navSnapshot.threadCandidates
  );
  const currentThreadSource = $derived(journeySnapshot.threadSource || navSnapshot.threadSource);
  const chromeHasFocus = $derived(
    navSnapshot.mode === 'focus' ||
    navSnapshot.mode === 'inside' ||
    navSnapshot.mode === 'trail' ||
    currentFocusedIndex !== null
  );
  const chromeHasTrail = $derived(currentTrailDepth > 0);

  // ── Idle gate: hide chrome when journey and compass are both idle ───────
  // Per M3 audit (UI-1): journey-chrome was visible in idle state,
  // duplicating content from #journey-compass. Hidden when both
  // data-journey-phase and data-journey-compass are 'idle'.
  const isJourneyIdle = $derived(
    (journeySnapshot.phase ?? 'idle') === 'idle' &&
    (journeySnapshot.compass?.phase ?? 'idle') === 'idle'
  );

  // ── Walk breadcrumb ────────────────────────────────────────────────────────

  const dedupedWalkHistory = $derived.by(() => {
    const indices = currentWalkHistory;
    const seen = new Set<number>();
    const result: number[] = [];
    for (const idx of indices) {
      if (!Number.isFinite(idx)) continue;
      if (idx === currentFocusedIndex && result.length > 0 && result[result.length - 1] === idx) {
        continue;
      }
      if (seen.has(idx)) {
        const prevPos = result.lastIndexOf(idx);
        if (prevPos >= 0 && prevPos !== result.length - 1) {
          result.splice(prevPos, 1);
        }
      }
      seen.add(idx);
      result.push(idx);
    }
    return result;
  });

  const showBreadcrumb = $derived(
    chromeHasFocus && currentWalkHistory.length > 1
  );

  function walkToBreadcrumbIndex(targetIndex: number, _targetOrder: number): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_THREAD, {
      index: targetIndex
    });
  }

  // ── Trail controls ────────────────────────────────────────────────────────

  const canGoBack = $derived(currentWalkHistory.length > 1);
  const neighborCount = $derived(currentThreadCandidates.length);
  const hasNext = $derived(neighborCount > 0);

  const trailContextText = $derived.by(() => {
    if (!chromeHasFocus || !currentPoint) return '';
    const name = currentPoint?.name || 'this business';
    const walkLen = currentWalkHistory.length;
    const focusIdx = currentFocusedIndex;
    const lastReason = (focusIdx !== null && focusIdx >= 0 && focusIdx < getBusinessRecords().length)
      ? (getBusinessRecords()[focusIdx] as BusinessRecord)?.name ?? ''
      : '';
    if (currentTrailDepth >= 1 && walkLen >= 1) {
      return `Stop ${walkLen + 1}: ${name}. ${lastReason ? `Source: ${currentThreadSource}` : ''}`;
    }
    if (neighborCount === 0 && currentThreadSource === 'semantic') {
      return `Semantic connections exist around ${name}, but none survive the current slice.`;
    }
    return `${neighborCount} candidate steps around ${name}.`;
  });

  const progressText = $derived.by(() => {
    if (!chromeHasFocus) return 'Pick a business, then explore its nearby neighbors.';
    if (currentTrailDepth >= 1 && currentWalkHistory.length >= 0) {
      return `Stop ${currentWalkHistory.length + 1} of ${neighborCount}`;
    }
    return neighborCount
      ? `${neighborCount} nearby ready`
      : `Start exploring.`;
  });

  const nextStopName = $derived.by(() => {
    if (!chromeHasFocus || neighborCount === 0) return null;
    const first = currentThreadCandidates[0];
    if (first == null || !Number.isFinite(first)) return null;
    const pt = getBusinessRecords()[first];
    return pt?.name ?? null;
  });

  function goPrev(): void {
    if (!chromeHasFocus || !canGoBack) return;
    const history = currentWalkHistory;
    if (history.length <= 1) return;
    const prevIdx = history[history.length - 2];
    if (!Number.isFinite(prevIdx)) return;
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: prevIdx });
  }

  function goNext(): void {
    if (!chromeHasFocus || !hasNext) return;
    const first = currentThreadCandidates[0];
    if (first == null || !Number.isFinite(first)) return;
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: first });
  }

  // ── Neighbor rail ─────────────────────────────────────────────────────────

  // Use $viewport auto-subscription so the derived re-runs on viewport changes.
  // (Calling isCompact()/isMobile()/etc. in a $derived.by is a snapshot read
  // in Svelte 5 runes mode — they don't track the store.) See the audit at
  // qa-screenshots/AUDIT.md for the full pattern.
  const candidateLimit = $derived.by(() => {
    if ($viewport.isCompact && !$viewport.isUltraCompactPortrait) return 1;
    if ($viewport.isCompactLandscape || $viewport.isUltraCompactPortrait) return 2;
    if ($viewport.isMobile && $viewport.isCompact) return 4;
    return 5;
  });

  const filteredCandidates = $derived.by(() => {
    const candidates = currentThreadCandidates;
    const focusIdx = currentFocusedIndex;
    return candidates
      .filter((c) => c != null && Number.isFinite(c) && c !== focusIdx)
      .slice(0, candidateLimit);
  });

  const showNeighborRail = $derived(
    chromeHasFocus &&
    filteredCandidates.length > 0 &&
    (!threadInspectorActive() || threadInspector().source === 'rail-hover')
  );

  function getPointForIndex(idx: number): BusinessRecord | null {
    if (idx < 0 || idx >= getBusinessRecords().length) return null;
    return (getBusinessRecords()[idx] as BusinessRecord | undefined) ?? null;
  }

  // scheduleInspection / cancelInspection removed — neighbor pill
  // no longer has hover-to-inspect; use inner Inspect button instead.

  function inspectCandidate(idx: number): void {
    if (hoverTimer) clearTimeout(hoverTimer);
    updateThreadInspector({
      active: true,
      inspectedIndex: idx,
      source: 'rail-inspect',
      segmentCount: 1,
      braidCount: 0,
      endpointCount: 2
    });
  }

  // inspectCandidateFromEvent removed — neighbor pill no longer has
  // outer click handler; inner buttons handle their own events.

  function stopRailSurfaceEvent(event: Event): void {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function pinCandidate(idx: number): void {
    pinThread(idx);
  }

  // walkToCandidate removed — neighbor rail uses inspectCandidate instead

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      if (hoverTimer) clearTimeout(hoverTimer);
    };
  });

  // ── Compass status header ─────────────────────────────────────────────────

  const compassStatus = $derived.by(() => {
    const summary = searchSummary() as ({ query?: string; anchorIndex?: number | null; resultCount?: number } | null);
    const summaryRec = summary as Record<string, unknown> | null;
    const queryLabel = summaryRec?.query ? `"${String(summaryRec.query)}"` : 'semantic search';
    const isFocus = chromeHasFocus;
    const journeyPh = journeyPhase();
    const insideActive = journeyPh === 'inside' && isFocus;
    const walkLen = currentWalkHistory.length;

    const currentPtName = currentPoint?.name || 'this business';
    const clusterNames = ['Food & Dining', 'Professional Services', 'Retail & Shopping', 'Health & Medical', 'Other'];
    const clusterIdx = currentPoint?.cluster ?? -1;
    const clusterName = clusterIdx >= 0 && clusterIdx < clusterNames.length ? (clusterNames[clusterIdx] ?? 'County') : 'County';

    return buildCompassStatus({
      currentView: 'galaxy',
      focusedName: currentPtName,
      queryLabel,
      isSearching: isSearching(),
      isFocusing: false,
      hasSearch: !!summary,
      hasFocus: isFocus,
      insideActive,
      resultCount: summary?.resultCount ?? 0,
      walkDepth: walkLen,
      isSearchFocus: !!summary && walkLen === 0,
      isSearchAnchor: summary?.anchorIndex != null && currentFocusedIndex === summary.anchorIndex,
      isTrailStop: walkLen > 1,
      hasAnchor: !!summary,
      clusterName,
      routeCount: currentWalkHistory.length,
      nextPointName: nextStopName,
      idleNote: 'Start wide, then search by need or clue to open one trail through the network.',
      isDiscovery: false,
      isSemanticDegraded: false
    });
  });
</script>

{#if visible && !isJourneyIdle}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="journey-chrome"
    id="journey-chrome"
    role="group"
    tabindex="-1"
    aria-label="Journey navigation"
    onpointerdown={stopRailSurfaceEvent}
    onpointerup={stopRailSurfaceEvent}
    onmousedown={stopRailSurfaceEvent}
    onmouseup={stopRailSurfaceEvent}
    onclick={stopRailSurfaceEvent}
    onkeydown={stopRailSurfaceEvent}
  >
    <!-- ├─ Compass Status Header ────────────────────────────────────────────── -->
    <div class="journey-header" id="journey-header">
      <span class="journey-kicker">{compassStatus.kicker}</span>
      {#if compassStatus.title}
        <span class="journey-title">{compassStatus.title}</span>
      {/if}
      {#if compassStatus.note}
        <span class="journey-note">{compassStatus.note}</span>
      {/if}
    </div>

    <!-- ├─ Journey inner container (activation wrapper) ─────────────────────── -->
    <div class="focus-stage-journey" id="focus-stage-journey" class:active={chromeHasFocus}>
    <!-- ├─ Walk Breadcrumb ─────────────────────────────────────────────────── -->
    {#if showBreadcrumb}
      <div class="walk-breadcrumb" id="walk-breadcrumb" class:visible={showBreadcrumb} role="navigation" aria-label="Trail history">
        <span class="walk-breadcrumb-label">Trail</span>
        {#each dedupedWalkHistory as idx, i}
          {#if i > 0}
            <span class="walk-breadcrumb-sep" aria-hidden="true">/</span>
          {/if}
          {@const point = getPointForIndex(idx)}
          {@const name = point?.name ?? 'Stop'}
          {@const isCurrent = idx === currentFocusedIndex}
          <button
            class="walk-breadcrumb-chip"
            class:current={isCurrent}
            type="button"
            data-walk-index={idx}
            data-walk-order={i}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={isCurrent ? `Current stop: ${name}` : `Return to ${name}`}
            onclick={() => walkToBreadcrumbIndex(idx, i)}
          >
            {name}
          </button>
        {/each}
      </div>
    {/if}

    <!-- ├─ Trail Controls ──────────────────────────────────────────────────── -->
    {#if chromeHasFocus || chromeHasTrail}
      <div
        class="trail-controls focus-stage-actions"
        id="trail-controls"
        class:active={chromeHasFocus || chromeHasTrail}
        role="toolbar"
        aria-label="Trail navigation"
      >
        <button
          id="btn-focus-path"
          class="focus-stage-action-btn"
          type="button"
          aria-label="Show trail"
          onclick={() => {
            const overlay = document.getElementById('trail-review-overlay');
            if (overlay) overlay.hidden = !overlay.hidden;
          }}
        >
          Show trail
        </button>

        <button
          class="trail-btn focus-stage-action-btn biofield-glow"
          id="btn-prev-node"
          disabled={!canGoBack}
          aria-disabled={!canGoBack}
          title={!canGoBack ? 'No previous stops in this walk history' : 'Previous stop'}
          onclick={goPrev}
        >
          &larr; Prev
        </button>

        <div class="trail-context-wrapper">
          <div class="trail-context" id="trail-context">
            <span class="trail-context-text">{trailContextText}</span>
          </div>
          <div class="trail-progress" id="focus-stage-progress">
            <span class="progress-text">{progressText}</span>
          </div>
          {#if nextStopName}
            <div class="trail-next" id="focus-stage-next">
              <span class="next-label">Next: {nextStopName}</span>
            </div>
          {/if}
        </div>

        <button
          class="trail-btn focus-stage-action-btn biofield-glow"
          id="btn-next-node"
          disabled={!hasNext}
          aria-disabled={!hasNext}
          title={!hasNext ? 'No nearby stops to continue to' : 'Next stop'}
          onclick={goNext}
        >
          Next &rarr;
        </button>
      </div>

      <div class="route-state" id="focus-stage-route" data-state={neighborCount ? 'walking' : 'empty'}></div>
    {:else}
      <div class="trail-controls focus-stage-actions idle" id="trail-controls">
        <div class="trail-context" id="trail-context">
          <span class="trail-context-text">Pick a business, then explore its nearby neighbors.</span>
        </div>
      </div>
    {/if}

    <!-- ├─ Neighbor Rail ───────────────────────────────────────────────────── -->
    {#if showNeighborRail}
      <div class="focus-stage-neighbors active" id="focus-stage-neighbors" role="navigation" aria-label="Nearby neighbors">
        <div class="neighbor-count" id="focus-stage-neighbor-count" aria-live="polite">{filteredCandidates.length} visible {filteredCandidates.length === 1 ? 'neighbor' : 'neighbors'}</div>
        <div class="focus-stage-neighbor-list" id="focus-stage-neighbor-list">
          {#each filteredCandidates as idx, i}
            {@const point = getPointForIndex(idx)}
            {@const name = point?.name ?? 'Nearby business'}
            {@const city = point?.city ?? 'Montgomery County'}
            {@const isNextStop = i === 0}
            <div
              class="focus-stage-neighbor-pill"
              class:is-next-stop={isNextStop}
              data-index={idx}
              role="button"
              tabindex="0"
              aria-label={`Inspect connection to ${name}`}
              onclick={() => inspectCandidate(idx)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspectCandidate(idx); } }}
            >
              <span class="focus-stage-neighbor-main">
                <span class="focus-stage-neighbor-index">{String(i + 1).padStart(2, '0')}</span>
                <span class="focus-stage-neighbor-copy">
                  <span class="focus-stage-neighbor-name">
                    {name}
                    <span class="focus-stage-neighbor-city">{city}</span>
                    {#if isNextStop}
                      <span class="focus-stage-neighbor-next-stop-badge">Next stop</span>
                    {/if}
                  </span>
                  <span class="focus-stage-neighbor-reason">Neighborhood connection</span>
                </span>
              </span>
              <span class="focus-stage-neighbor-actions" aria-label="Strand actions">
                <span
                  class="focus-stage-neighbor-action"
                  role="button"
                  tabindex="0"
                  data-neighbor-action="inspect"
                  aria-label="Inspect connection"
                  onclick={(e) => { e.stopPropagation(); inspectCandidate(idx); }}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); inspectCandidate(idx); } }}
                >Inspect</span>
                <span
                  class="focus-stage-neighbor-action primary"
                  role="button"
                  tabindex="0"
                  data-neighbor-action="pin"
                  aria-label="Pin connection"
                  onclick={(e) => { e.stopPropagation(); pinCandidate(idx); }}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pinCandidate(idx); } }}
                >Pin</span>
              </span>
            </div>
          {/each}
        </div>
      </div>
    {:else if chromeHasFocus && filteredCandidates.length === 0 && !threadInspectorActive()}
      <div class="focus-stage-neighbors" id="focus-stage-neighbors">
        <div class="neighbor-count" id="focus-stage-neighbor-count">0 visible neighbors</div>
        <div class="focus-stage-neighbor-list" id="focus-stage-neighbor-list">
          <div class="empty-state">No neighboring stops found in this area.</div>
        </div>
      </div>
    {/if}
    </div><!-- /focus-stage-journey -->
  </div>
{/if}

<style>
  .journey-chrome {
    position: absolute;
    bottom: 4.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-journey-chrome);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
    width: auto;
    max-width: min(90vw, 640px);
  }

  /* ── Compass Status Header ──────────────────────────────────────────────── */
  .focus-stage-journey {
    display: contents;
  }

  .journey-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    background: rgba(7, 16, 24, 0.88);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.35rem 0.85rem;
    border: 1px solid rgba(78, 205, 196, 0.1);
  }
  .journey-kicker {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    color: #4ecdc4;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .journey-title {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.75rem;
    color: #e0f0f0;
    font-weight: 600;
  }
  .journey-note {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    color: #8aaeae;
    max-width: 400px;
    text-align: center;
    line-height: 1.3;
  }

  /* ── Walk Breadcrumb ────────────────────────────────────────────────────── */
  .walk-breadcrumb {
    display: none;
    align-items: center;
    gap: 0.3rem;
    background: rgba(7, 16, 24, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.35rem 0.65rem;
    font-size: 0.7rem;
    color: #b0d0d0;
    border: 1px solid rgba(78, 205, 196, 0.1);
  }
  .walk-breadcrumb.visible {
    display: flex;
  }
  .walk-breadcrumb-label {
    font-size: 0.55rem;
    font-weight: 600;
    color: #6a8a8a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: 0.2rem;
  }
  .walk-breadcrumb-chip {
    background: none;
    border: none;
    color: #8aaeae;
    cursor: pointer;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    transition: all 0.15s;
  }
  .walk-breadcrumb-chip:hover {
    color: #e0f0f0;
    background: rgba(78, 205, 196, 0.1);
  }
  .walk-breadcrumb-chip.current {
    color: #4ecdc4;
    font-weight: 600;
    cursor: default;
  }
  .walk-breadcrumb-chip.current:hover {
    background: none;
  }
  .walk-breadcrumb-sep {
    color: #4a6a6a;
    font-size: 0.6rem;
    opacity: 0.5;
  }

  /* ── Trail Controls ─────────────────────────────────────────────────────── */
  .trail-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(7, 16, 24, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.35rem 0.65rem;
    border: 1px solid rgba(78, 205, 196, 0.12);
  }
  :global(.trail-controls.focus-stage-actions),
  :global(#trail-controls) {
    display: grid;
    grid-auto-flow: column;
  }
  /* Override legacy CSS that hides #trail-controls in focus-search/field-node mode.
     Higher specificity than the legacy rule to ensure grid display wins. */
  :global(body.is-active[data-panel-surface='focus-search'] #trail-controls.focus-stage-actions) {
    display: grid;
  }
  :global(body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node'] .focus-stage-actions) {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .trail-controls.idle {
    opacity: 0.6;
  }
  .trail-btn {
    background: none;
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.3rem;
    color: #4ecdc4;
    cursor: pointer;
    padding: 0.25rem 0.6rem;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .trail-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .trail-btn:not(:disabled):hover {
    background: rgba(78, 205, 196, 0.1);
    border-color: rgba(78, 205, 196, 0.4);
  }
  .trail-context-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
  }
  .trail-context-text {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    color: #b0d0d0;
    text-align: center;
    line-height: 1.3;
    max-width: 320px;
    /* Wrap instead of ellipsis so the full trail context stays readable.
       Cap at 2 lines to keep the journey chrome height bounded. */
    white-space: normal;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .progress-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #6a8a8a;
  }
  .next-label {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.55rem;
    color: #4ecdc4;
    opacity: 0.8;
  }
  .route-state {
    display: none;
  }

  /* ── Neighbor Rail ──────────────────────────────────────────────────────── */
  .focus-stage-neighbors {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
  }
  .focus-stage-neighbors.active {
    display: flex;
  }
  .neighbor-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #6a8a8a;
  }
  .focus-stage-neighbor-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    max-height: min(40vh, 280px);
    overflow-y: auto;
  }
  .focus-stage-neighbor-pill {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(78, 205, 196, 0.12);
    border-radius: 0.4rem;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Nunito Sans', sans-serif;
    text-align: left;
    width: 100%;
  }
  .focus-stage-neighbor-pill:hover {
    background: rgba(78, 205, 196, 0.08);
    border-color: rgba(78, 205, 196, 0.25);
  }
  .focus-stage-neighbor-pill.is-next-stop {
    border-color: rgba(78, 205, 196, 0.3);
    background: rgba(78, 205, 196, 0.05);
  }
  .focus-stage-neighbor-main {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    flex: 1;
  }
  .focus-stage-neighbor-index {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    color: #6a8a8a;
    min-width: 1.2rem;
  }
  .focus-stage-neighbor-copy {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    min-width: 0;
  }
  .focus-stage-neighbor-name {
    font-size: 0.65rem;
    color: #e0f0f0;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .focus-stage-neighbor-city {
    font-size: 0.55rem;
    color: #6a8a8a;
    font-weight: 400;
  }
  .focus-stage-neighbor-next-stop-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.12);
    padding: 0.05rem 0.3rem;
    border-radius: 0.2rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .focus-stage-neighbor-reason {
    font-size: 0.55rem;
    color: #8aaeae;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .focus-stage-neighbor-actions {
    display: flex;
    gap: 0.2rem;
    flex-shrink: 0;
  }
  .focus-stage-neighbor-action {
    background: none;
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.2rem;
    color: #8aaeae;
    cursor: pointer;
    padding: 0.15rem 0.35rem;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.55rem;
    transition: all 0.15s;
  }
  .focus-stage-neighbor-action:hover {
    background: rgba(78, 205, 196, 0.1);
    border-color: rgba(78, 205, 196, 0.4);
    color: #4ecdc4;
  }
  .focus-stage-neighbor-action.primary {
    color: #4ecdc4;
    border-color: rgba(78, 205, 196, 0.3);
  }
  .focus-stage-neighbor-action.primary:hover {
    background: rgba(78, 205, 196, 0.2);
  }
  .empty-state {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    color: #6a8a8a;
    padding: 0.5rem;
    text-align: center;
  }

  /* ── Mobile / Compact ───────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .journey-chrome {
      bottom: 3.5rem;
      max-width: 95vw;
      /* Cap height so the neighbor rail cannot grow upward into the
         FocusCard zone at the top (top: 3.5rem). Leave 56px + 8px
         breathing room above and below. */
      max-height: calc(100dvh - 7.5rem);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
    }
    .journey-chrome::-webkit-scrollbar {
      display: none;
    }
    .journey-note {
      max-width: 260px;
    }
    .trail-controls {
      padding: 0.25rem 0.4rem;
      gap: 0.3rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .trail-btn {
      font-size: 0.6rem;
      padding: 0.2rem 0.4rem;
    }
    .trail-context-text {
      max-width: 180px;
      font-size: 0.55rem;
    }
    .focus-stage-neighbor-main {
      gap: 0.25rem;
    }
    .focus-stage-neighbor-index {
      min-width: 0.9rem;
    }
    .focus-stage-neighbor-name {
      font-size: 0.6rem;
    }
    .focus-stage-neighbor-reason {
      max-width: 140px;
    }
    .focus-stage-neighbor-actions {
      flex-direction: column;
      gap: 0.15rem;
    }
  }
</style>
