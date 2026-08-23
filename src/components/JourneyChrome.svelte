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
  import { journeyStore } from '@lib/stores/journey.svelte.ts';
  import { getJourneyCompassState } from '@lib/journey/compass-state';
  import { getBusinessRecords } from '@lib/stores/index.svelte.ts';
  import { useParityAttrs, isFocusSurfaceActive } from '@lib/ui/use-parity-attrs.svelte';

  import { walkThreadNeighbor } from '@lib/journey/thread-settler';
  import { normalizeRelationshipRole, getRelationshipRoleLabel } from '@lib/utils/relationship-roles';
  import { formatThreadSourceLabel } from '@lib/utils/dom-formatters';
  import type { BusinessRecord } from '@lib/types/business';
  import type { RelationshipRole } from '@lib/utils/relationship-roles';
  import WalkBreadcrumb from '@components/WalkBreadcrumb.svelte';
  import TrailControls from '@components/TrailControls.svelte';
  import FocusNeighborhood from '@lib/components/journey/FocusNeighborhood.svelte';

  // CSS side-effect import. Required because Svelte 5 does NOT support
  // `<style src="./X.css">` (silently dropped — file ends up outside
  // Vite's graph). The component is lazy-loaded via createLazyComponent()
  // in App.svelte, so Vite emits a per-component CSS chunk that this
  // import wires into the dynamic-import dependency map.
  import './JourneyChrome.css';

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

  // Reactive replacement for selectedPointStore(): a $derived over a get()-
  // snapshot freezes at first render (null), so currentPoint was permanently
  // stale. Derive from the already-reactive currentFocusedIndex so this updates
  // on every selection.
  const currentPoint = $derived.by((): BusinessRecord | null => {
    const idx = currentFocusedIndex;
    if (idx == null || idx < 0) return null;
    const records = getBusinessRecords();
    return (records[idx] ?? null) as BusinessRecord | null;
  });
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
  // Thread computation is synchronous (walkThreadNeighbor → WalkResult | null), so there is no
  // async trail-loading state to surface here. Removed the dead `isLoading` derived value and
  // its hardcoded aria-busy="false" attribute (w23 a11y M2) — a static "false" misleads screen
  // readers into thinking a busy state exists when nothing is loading. Re-instate a dynamic
  // aria-busy only when trail loading becomes async.
  // W53 trail-button widening: mirror the W49-c widening of `focusActive` at
  // App.svelte:211. Without these parity predicates here, JourneyChrome can
  // mount (via `focusActive`) while `chromeHasFocus` stays false — e.g. when
  // navSnapshot.focusedIndex == null from a bridge race even though
  // parity.panelSurface === 'focus-search'. That gate-mismatch makes
  // TrailControls.active false → #btn-focus-path never renders → the
  // map-trail surface contract times out at `#btn-focus-path` (30s).
  const parity = useParityAttrs();

  const chromeHasFocus = $derived(isFocusSurfaceActive(navSnapshot.mode, currentFocusedIndex ?? null, parity));
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
    if (currentTrailDepth >= 1 && walkLen >= 1) {
      const sourceLabel = currentThreadSource ? formatThreadSourceLabel(currentThreadSource) : '';
      return `Exploring ${name}${sourceLabel ? `. Matched by ${sourceLabel}` : ''}`;
    }
    if (neighborCount === 0 && currentThreadSource === 'semantic') {
      return `Related businesses are near ${name}, but none are visible with the current filters.`;
    }
    return `${neighborCount} related businesses near ${name}.`;
  });

  const progressText = $derived.by(() => {
    if (!chromeHasFocus) return 'Pick a business, then explore its nearby neighbors.';
    if (currentTrailDepth >= 1 && currentWalkHistory.length >= 0) {
      // W48 audit (parallel to focus-ui.ts:566-570): the original `Stop N of ${neighborCount}`
      // rendered "Stop 2 of 0" when neighborCount was 0 because the branch fired whenever
      // currentTrailDepth >= 1. Guard the "of ${neighborCount}" total so the progress line
      // never shows a total smaller than the current stop, and route to the "No more visible
      // stops in this slice." copy that already exists in the focus-ui.ts twin.
      // Step-counter stability fix (2026-08-22): the "of ${neighborCount}" total mixed two
      // dimensions — steps TAKEN vs next-hop candidates from the CURRENT stop — so the same
      // anchor showed "1 of 17" / "1 of 18" / "1 of 1" depending on which candidate pipeline
      // (triggers.ts manifest vs setTrailFromSeed cache, semantic vs geometric fallback) won
      // the race. The focus-ui.ts twin never showed a total ("Stop N."); align with it and let
      // the Next line carry availability instead of a contradictory total.
      // Zero-walk guard: fresh deep links (?surface=inside) have an empty
      // walkHistory until the user picks a stop — "Stop 0." read like a bug.
      // Invite instead (copy rules: give a next step).
      if (currentWalkHistory.length === 0) {
        return neighborCount > 0 ? 'Choose a nearby stop to begin.' : 'No visible stops with these filters.';
      }
      return neighborCount > 0
        ? `Stop ${currentWalkHistory.length}.`
        : `Stop ${currentWalkHistory.length}. No more visible stops with these filters.`;
    }    return neighborCount
      ? `${neighborCount} nearby to explore`
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
      reason: getRelationshipRoleLabel(normalizeRelationshipRole(first.relationshipRole)) || first.reason || 'nearby business relationship'
    });
  }


  function getPointForIndex(idx: number): BusinessRecord | null {
    if (idx < 0 || idx >= getBusinessRecords().length) return null;
    return (getBusinessRecords()[idx] as BusinessRecord | undefined) ?? null;
  }

  // ── Event guard for journey-chrome surface ─────────────────────────────

  function stopRailSurfaceEvent(event: Event): void {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

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

    <!-- ├─ Focus Neighborhood (role filters, neighbor rail, empty state) ── -->
    <FocusNeighborhood
      chromeHasFocus={chromeHasFocus}
      threadCandidates={currentThreadCandidates}
      focusedIndex={currentFocusedIndex}
      getPointForIndex={getPointForIndex}
    />

    {#if chromeHasFocus && currentThreadCandidates.length === 0}
      <div class="empty-state journey-empty-state" role="status" aria-live="polite">
        <p class="journey-empty-title">No neighboring stops</p>
        <p class="journey-empty-note">Pick a business with visible connections to explore.</p>
      </div>
    {/if}
    </div><!-- /focus-stage-journey -->
  </div>
{/if}

<!--
  Svelte 5 does NOT support `<style src="./X.css">` (Svelte 4 directive that
  is silently dropped). The CSS for this component is loaded via the
  side-effect `import './JourneyChrome.css'` in the script block above.
-->
