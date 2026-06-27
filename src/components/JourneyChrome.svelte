<!--
  @components/JourneyChrome.svelte — Journey UI overlay (trail controls, breadcrumb, neighbor rail)

  Ported from:
 - (updateTraversalUi, updateWalkBreadcrumb, updateFocusNeighborRail)
 - (compass status header)
 - (compass step state integration)

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
  import { getJourneyCompassState } from '@lib/journey/compass-state';
  import { threadInspector, threadInspectorActive, pinThread, updateThreadInspector, focusStore, setPocketRoleFilter } from '@lib/stores/focus.svelte.ts';
  import { getBusinessRecords, selectedPointStore } from '@lib/stores/index.svelte.ts';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { searchSummary, isSearching } from '@lib/stores/search.svelte';
  import { walkThreadNeighbor } from '@lib/journey/thread-settler';
  import { normalizeRelationshipRole, getRelationshipRoleLabel } from '@lib/utils/relationship-roles';
  import type { BusinessRecord } from '@lib/types/business';
  import type { RelationshipRole } from '@lib/utils/relationship-roles';
  import WalkBreadcrumb from '@components/WalkBreadcrumb.svelte';
  import TrailControls from '@components/TrailControls.svelte';
  import NeighborRail from '@components/NeighborRail.svelte';

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

  // ── Relationship role filter ────────────────────────────────────────────

  const ROLE_FILTER_OPTIONS: Array<'all' | 'direct' | 'support' | 'civic'> = ['all', 'direct', 'support', 'civic'];
  const currentRoleFilter = $derived(focusStore().pocketRoleFilter ?? 'all');

  function applyRoleFilter(candidates: NormalizedCandidate[]): NormalizedCandidate[] {
    if (currentRoleFilter === 'all') return candidates;
    return candidates.filter((c) => c.relationshipRole === currentRoleFilter);
  }

  const filteredCandidates = $derived.by(() => {
    const candidates = currentThreadCandidates;
    const focusIdx = currentFocusedIndex;
    return applyRoleFilter(
      candidates.filter((c) => Number.isFinite(c.index) && !(c.index === focusIdx))
    ).slice(0, candidateLimit);
  });

  const showRoleFilters = $derived(
    chromeHasFocus &&
    currentThreadCandidates.some((c) => c.relationshipRole !== 'unclassified')
  );

  const showNeighborRail = $derived(
    chromeHasFocus &&
    filteredCandidates.length > 0 &&
    (!threadInspectorActive() || threadInspector().source === 'rail-hover')
  );

  function selectRoleFilter(filter: 'all' | 'direct' | 'support' | 'civic'): void {
    setPocketRoleFilter(filter);
  }

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
    return getJourneyCompassState();
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
      <WalkBreadcrumb history={dedupedWalkHistory} focusedIndex={currentFocusedIndex} getPointForIndex={getPointForIndex} onWalk={walkToBreadcrumbIndex} />
    {/if}

    <!-- ├─ Trail Controls ──────────────────────────────────────────────────── -->
    <TrailControls
      active={chromeHasFocus || chromeHasTrail}
      canGoBack={canGoBack}
      hasNext={hasNext}
      contextText={trailContextText}
      progressText={progressText}
      nextStopName={nextStopName}
      onPrev={goPrev}
      onNext={goNext}
    />

    <!-- ├─ Role Filter Chips ──────────────────────────────────────────────── -->
    {#if showRoleFilters}
      <div class="focus-role-filters" id="focus-role-filters" role="group" aria-label="Filter neighbors by relationship">
        {#each ROLE_FILTER_OPTIONS as filter}
          {@const label = filter === 'all' ? 'All' : getRelationshipRoleLabel(filter, 'rail')}
          {@const active = currentRoleFilter === filter}
          <button
            class="focus-role-filter-chip"
            class:active
            type="button"
            data-role-filter={filter}
            aria-pressed={active}
            onclick={() => selectRoleFilter(filter)}
          >
            {label}
          </button>
        {/each}
      </div>
    {/if}

    <!-- ├─ Neighbor Rail ───────────────────────────────────────────────────── -->
    {#if showNeighborRail}
      <NeighborRail candidates={filteredCandidates} getPointForIndex={getPointForIndex} onInspect={inspectCandidate} onPin={pinCandidate} onWalk={walkToCandidate} />
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
