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
  import { hasFocus, focusedIndex, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { walkHistoryIndices, threadCandidates, trailDepth, journeyPhase, threadSource } from '@lib/stores/journey';
  import { buildCompassStatus, JOURNEY_ACTIONS } from '@lib/stores/compass';
  import { threadInspectorActive, clearThreadInspector, pinThread, updateThreadInspector } from '@lib/stores/focus';
  import { getBusinessRecords, selectedPointStore } from '@lib/stores';
  import { isCompact, isMobile, isCompactLandscape, isUltraCompactPortrait } from '@lib/stores/viewport';
  import { searchSummary, isSearching } from '@lib/stores/search';
  import type { BusinessRecord } from '@lib/types/business';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let neighborIndex = $state(0);
  let hoverTimer: ReturnType<typeof setTimeout> | null = $state(null);
  let inspectedIndex = $state<number | null>(null);

  const currentPoint = $derived(selectedPointStore());
  const currentName = $derived(currentPoint?.name ?? '');

  // ── Walk breadcrumb ────────────────────────────────────────────────────────

  const dedupedWalkHistory = $derived.by(() => {
    const indices = walkHistoryIndices();
    const seen = new Set<number>();
    const result: number[] = [];
    for (const idx of indices) {
      if (!Number.isFinite(idx)) continue;
      if (idx === focusedIndex() && result.length > 0 && result[result.length - 1] === idx) {
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
    hasFocus() && walkHistoryIndices().length > 1
  );

  function walkToBreadcrumbIndex(targetIndex: number, targetOrder: number): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_THREAD, {
      index: targetIndex
    });
  }

  // ── Trail controls ────────────────────────────────────────────────────────

  const canGoBack = $derived(walkHistoryIndices().length > 1);
  const neighborCount = $derived(threadCandidates().length);
  const hasNext = $derived(neighborCount > 0);

  const trailContextText = $derived.by(() => {
    if (!hasFocus() || !currentPoint) return '';
    const name = currentPoint?.name || 'this business';
    const walkLen = walkHistoryIndices().length;
    const focusIdx = focusedIndex();
    const lastReason = (focusIdx !== null && focusIdx >= 0 && focusIdx < getBusinessRecords().length)
      ? (getBusinessRecords()[focusIdx] as BusinessRecord)?.name ?? ''
      : '';
    if (trailDepth() >= 1 && walkLen >= 1) {
      return `Stop ${walkLen + 1}: ${name}. ${lastReason ? `Source: ${threadSource()}` : ''}`;
    }
    if (neighborCount === 0 && threadSource() === 'semantic') {
      return `Semantic connections exist around ${name}, but none survive the current slice.`;
    }
    return `${neighborCount} candidate steps around ${name}.`;
  });

  const progressText = $derived.by(() => {
    if (!hasFocus()) return 'Pick a business, then explore its nearby neighbors.';
    if (trailDepth() >= 1 && walkHistoryIndices().length >= 0) {
      return `Stop ${walkHistoryIndices().length + 1} of ${neighborCount}`;
    }
    return neighborCount
      ? `${neighborCount} nearby ready`
      : `Start exploring.`;
  });

  const nextStopName = $derived.by(() => {
    if (!hasFocus() || neighborCount === 0) return null;
    const first = threadCandidates()[0];
    if (first == null || !Number.isFinite(first)) return null;
    const pt = getBusinessRecords()[first];
    return pt?.name ?? null;
  });

  function goPrev(): void {
    if (!hasFocus() || !canGoBack) return;
    const history = walkHistoryIndices();
    if (history.length <= 1) return;
    const prevIdx = history[history.length - 2];
    if (!Number.isFinite(prevIdx)) return;
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: prevIdx });
  }

  function goNext(): void {
    if (!hasFocus() || !hasNext) return;
    const first = threadCandidates()[0];
    if (first == null || !Number.isFinite(first)) return;
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: first });
  }

  // ── Neighbor rail ─────────────────────────────────────────────────────────

  const candidateLimit = $derived.by(() => {
    if (isCompact() && !isUltraCompactPortrait()) return 1;
    if (isCompactLandscape() || isUltraCompactPortrait()) return 2;
    if (isMobile() && isCompact()) return 4;
    return 5;
  });

  const filteredCandidates = $derived.by(() => {
    const candidates = threadCandidates();
    const focusIdx = focusedIndex();
    return candidates
      .filter((c) => c != null && Number.isFinite(c) && c !== focusIdx)
      .slice(0, candidateLimit);
  });

  const showNeighborRail = $derived(
    hasFocus() &&
    filteredCandidates.length > 0 &&
    !threadInspectorActive()
  );

  function getPointForIndex(idx: number): BusinessRecord | null {
    if (idx < 0 || idx >= getBusinessRecords().length) return null;
    return (getBusinessRecords()[idx] as BusinessRecord | undefined) ?? null;
  }

  function scheduleInspection(idx: number): void {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      inspectedIndex = idx;
      updateThreadInspector({
        active: true,
        inspectedIndex: idx,
        source: 'rail-hover',
        segmentCount: 1,
        braidCount: 0,
        endpointCount: 2
      });
    }, 80);
  }

  function cancelInspection(): void {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (inspectedIndex !== null) {
      clearThreadInspector();
      inspectedIndex = null;
    }
  }

  function inspectCandidate(idx: number): void {
    if (hoverTimer) clearTimeout(hoverTimer);
    inspectedIndex = idx;
    updateThreadInspector({
      active: true,
      inspectedIndex: idx,
      source: 'rail-inspect',
      segmentCount: 1,
      braidCount: 0,
      endpointCount: 2
    });
  }

  function pinCandidate(idx: number): void {
    pinThread(idx);
  }

  function walkToCandidate(idx: number): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
      index: idx,
      reason: 'neighbor-rail'
    });
  }

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
    const isFocus = hasFocus();
    const journeyPh = journeyPhase();
    const insideActive = journeyPh === 'inside' && isFocus;
    const walkLen = walkHistoryIndices().length;

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
      isSearchAnchor: summary?.anchorIndex != null && focusedIndex() === summary.anchorIndex,
      isTrailStop: walkLen > 1,
      hasAnchor: !!summary,
      clusterName,
      routeCount: walkHistoryIndices().length,
      nextPointName: nextStopName,
      idleNote: 'Start wide, then search by need or clue to open one trail through the network.',
      isDiscovery: false,
      isSemanticDegraded: false
    });
  });
</script>

{#if visible}
  <div class="journey-chrome" id="journey-chrome" aria-label="Journey navigation">
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
    <div class="focus-stage-journey" id="focus-stage-journey" class:active={hasFocus()}>
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
          {@const isCurrent = idx === focusedIndex()}
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
    {#if hasFocus()}
      <div class="trail-controls" id="trail-controls" role="toolbar" aria-label="Trail navigation">
        <button
          class="trail-btn"
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
          class="trail-btn"
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
      <div class="trail-controls idle" id="trail-controls">
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
              role="button"
              tabindex="0"
              data-index={idx}
              aria-label={isNextStop ? `Next stop: ${name}` : `Explore ${name}`}
              onmouseenter={() => scheduleInspection(idx)}
              onmouseleave={cancelInspection}
              onfocus={() => scheduleInspection(idx)}
              onblur={cancelInspection}
              onclick={() => walkToCandidate(idx)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); walkToCandidate(idx); } }}
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
    {:else if hasFocus() && filteredCandidates.length === 0 && !threadInspectorActive()}
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
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
