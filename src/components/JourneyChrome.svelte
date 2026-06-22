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

  import { navStore, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts';
  import { journeyStore, journeyPhase } from '@lib/stores/journey.svelte.ts';
  import { buildCompassStatus } from '@lib/stores/compass.svelte.ts';
  import { threadInspector, threadInspectorActive, pinThread, updateThreadInspector } from '@lib/stores/focus.svelte.ts';
  import { getBusinessRecords, selectedPointStore } from '@lib/stores/index.svelte.ts';
  import { viewport, isCompact, isMobile, isCompactLandscape, isUltraCompactPortrait } from '@lib/stores/viewport.svelte.ts';
  import { searchSummary, isSearching } from '@lib/stores/search.svelte';
  import { walkThreadNeighbor } from '@lib/journey/thread-settler';
  import { getRelationshipRoleLabel, normalizeRelationshipRole } from '@lib/utils/relationship-roles';
  import type { BusinessRecord } from '@lib/types/business';
  import type { RelationshipRole } from '@lib/utils/relationship-roles';

  type CandidateLike = number | {
    index?: number;
    relationshipRole?: string;
    relationshipAxis?: string;
    roleReason?: string;
    reason?: string;
  };

  type NormalizedCandidate = {
    index: number;
    relationshipRole: RelationshipRole;
    relationshipAxis: string;
    roleReason: string;
    reason: string;
  };

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let hoverTimer: ReturnType<typeof setTimeout> | null = $state(null);

  function valueArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value instanceof Map) return [...value.values()];
    if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
      return [...(value as Iterable<unknown>)];
    }
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }

  function candidateIndex(candidate: CandidateLike | unknown): number | null {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (!candidate || typeof candidate !== 'object') return null;
    const index = Number((candidate as { index?: unknown }).index);
    return Number.isFinite(index) ? index : null;
  }

  function normalizeCandidates(value: unknown): NormalizedCandidate[] {
    return valueArray(value)
      .map((candidate): NormalizedCandidate | null => {
        const index = candidateIndex(candidate);
        if (index === null) return null;
        const detail = candidate && typeof candidate === 'object'
          ? candidate as Record<string, unknown>
          : {};
        return {
          index,
          relationshipRole: normalizeRelationshipRole(String(detail.relationshipRole || '')),
          relationshipAxis: String(detail.relationshipAxis || ''),
          roleReason: String(detail.roleReason || ''),
          reason: String(detail.reason || 'Neighborhood connection')
        };
      })
      .filter((candidate): candidate is NormalizedCandidate => candidate !== null);
  }

  const currentPoint = $derived(selectedPointStore());
  const navSnapshot = $derived($navStore);
  const journeySnapshot = $derived($journeyStore);
  const currentFocusedIndex = $derived(navSnapshot.focusedIndex);
  const currentTrailDepth = $derived(Math.max(navSnapshot.trailDepth ?? 0, journeySnapshot.depth ?? 0));
  const currentWalkHistory = $derived(
    journeySnapshot.trail.length > 0
      ? journeySnapshot.trail.map(t => t.index)
      : navSnapshot.walkHistoryIndices
  );
  const currentThreadCandidates = $derived.by(() => {
    const journeyCandidates = normalizeCandidates(journeySnapshot.threadCandidates);
    return journeyCandidates.length
      ? journeyCandidates
      : normalizeCandidates(navSnapshot.threadCandidates);
  });
  const currentThreadSource = $derived(journeySnapshot.threadSource || navSnapshot.threadSource);
  const isLoading = $derived(false); // Extensible: set true when trail data is loading
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  const chromeHasFocus = $derived(
    navSnapshot.mode === 'focus' ||
    navSnapshot.mode === 'inside' ||
    navSnapshot.mode === 'trail' ||
    currentFocusedIndex != null
  );
  const chromeHasTrail = $derived(currentTrailDepth > 0);

  // ── Idle gate: hide chrome when journey and compass are both idle ───────
  // Per M3 audit (UI-1): journey-chrome was visible in idle state,
  // duplicating content from #journey-compass. Hidden when the journey phase
  // is idle or overview and the compass phase is idle.
  const isJourneyIdle = $derived(
    !chromeHasFocus &&
    (((journeySnapshot.phase ?? 'idle') as string) === 'idle' ||
      ((journeySnapshot.phase ?? 'overview') as string) === 'overview') &&
    ((journeySnapshot.compass?.phase ?? 'idle') as string) === 'idle'
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
        if (prevPos >= 0 && prevPos !== result.length - 1) { // audit-ok: plain function, not transformed
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
    const lastReason = (focusIdx != null && focusIdx >= 0 && focusIdx < getBusinessRecords().length)
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
    if (!first || !Number.isFinite(first.index)) return null;
    const pt = getBusinessRecords()[first.index];
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
    if (!first || !Number.isFinite(first.index)) return;
    walkThreadNeighbor(first.index, {
      surface: 'rail',
      reason: first.roleReason || first.reason || 'nearby business relationship'
    });
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
      // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
      // inverts `!==` to `===`. Use positive equality + negation instead.
      .filter((c) => Number.isFinite(c.index) && !(c.index === focusIdx))
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

  function walkToCandidate(candidate: NormalizedCandidate): void {
    walkThreadNeighbor(candidate.index, {
      surface: 'rail',
      reason: candidate.roleReason || candidate.reason || 'nearby business relationship'
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
    aria-live="polite"
    aria-busy={isLoading ? 'true' : 'false'}
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
          type="button"
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
          type="button"
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
          {#each filteredCandidates as candidate, i}
            {@const idx = candidate.index}
            {@const point = getPointForIndex(idx)}
            {@const name = point?.name ?? 'Nearby business'}
            {@const city = point?.city ?? 'Montgomery County'}
            {@const isNextStop = i === 0}
            {@const relationshipRole = candidate.relationshipRole}
            {@const relationshipLabel = getRelationshipRoleLabel(relationshipRole, 'rail')}
            {@const reasonLabel = candidate.roleReason || candidate.reason || 'Neighborhood connection'}
            <div
              class="focus-stage-neighbor-pill"
              class:is-next-stop={isNextStop}
              data-index={idx}
              data-relationship-role={relationshipRole}
              data-reason={reasonLabel}
            >
              <div
                class="focus-stage-neighbor-main"
                role="button"
                tabindex="0"
                aria-label={`Walk to ${name}`}
                onclick={() => walkToCandidate(candidate)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); walkToCandidate(candidate); } }}
              >
                <span class="focus-stage-neighbor-index">{String(i + 1).padStart(2, '0')}</span>
                <span class="focus-stage-neighbor-copy">
                  <span class="focus-stage-neighbor-name">
                    {name}
                    <span class="focus-stage-neighbor-city">{city}</span>
                    <span class="focus-stage-neighbor-role">{relationshipLabel}</span>
                    {#if isNextStop}
                      <span class="focus-stage-neighbor-next-stop-badge">Next stop</span>
                    {/if}
                  </span>
                  <span class="focus-stage-neighbor-reason">{reasonLabel}</span>
                </span>
              </div>
              <span class="focus-stage-neighbor-actions" aria-label="Strand actions">
                <span
                  class="focus-stage-neighbor-action"
                  role="button"
                  tabindex="0"
                  data-neighbor-action="inspect"
                  aria-label="Inspect connection"
                  onclick={() => inspectCandidate(idx)}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspectCandidate(idx); } }}
                >Inspect</span>
                <span
                  class="focus-stage-neighbor-action primary"
                  role="button"
                  tabindex="0"
                  data-neighbor-action="pin"
                  aria-label="Pin connection"
                  onclick={() => pinCandidate(idx)}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinCandidate(idx); } }}
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

<style src="./JourneyChrome.css"></style>
