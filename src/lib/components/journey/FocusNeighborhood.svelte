<!--
  @lib/components/journey/FocusNeighborhood.svelte — Extracted from JourneyChrome.svelte (W54).
  Encapsulates role filter chips, NeighborRail, and empty-state fallback.
  Receives pre-normalized candidates as a prop; owns role-filter state
  and interaction handlers via stores.
-->
<script lang="ts">
  import { focusStore, pinThread, updateThreadInspector, threadInspector, threadInspectorActive, setPocketRoleFilter } from '@lib/stores/focus.svelte.ts';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { walkThreadNeighbor } from '@lib/journey/thread-settler';
  import { roleToFilterBucket } from '@lib/journey/role-filter-bucket';
  import { normalizeRelationshipRole, getRelationshipRoleLabel } from '@lib/utils/relationship-roles';
  import type { BusinessRecord } from '@lib/types/business';
  import type { RelationshipRole } from '@lib/utils/relationship-roles';
  import NeighborRail from '@components/NeighborRail.svelte';

  import './FocusNeighborhood.css';

  interface CandidateItem {
    index: number;
    relationshipRole: RelationshipRole;
    relationshipAxis: string;
    roleReason: string;
    reason: string;
  }

  interface Props {
    chromeHasFocus: boolean;
    threadCandidates: CandidateItem[];
    focusedIndex: number | null;
    getPointForIndex: (idx: number) => BusinessRecord | null;
  }

  let { chromeHasFocus, threadCandidates, focusedIndex, getPointForIndex }: Props = $props();

  // ── Candidate limit (responsive) ───────────────────────────────────────

  const candidateLimit = $derived.by(() => {
    if ($viewport.isCompact && !$viewport.isUltraCompactPortrait) return 1;
    if ($viewport.isCompactLandscape || $viewport.isUltraCompactPortrait) return 2;
    if ($viewport.isMobile && $viewport.isCompact) return 4;
    return 5;
  });

  // ── Role filter state ─────────────────────────────────────────────────

  const ROLE_FILTER_OPTIONS: Array<'all' | 'direct' | 'support' | 'civic'> = ['all', 'direct', 'support', 'civic'];
  const currentRoleFilter = $derived(focusStore().pocketRoleFilter ?? 'all');

  function selectRoleFilter(filter: 'all' | 'direct' | 'support' | 'civic'): void {
    setPocketRoleFilter(filter);
  }

  // ── Role filter counts per bucket ─────────────────────────────────────

  const roleFilterCounts = $derived.by(() => {
    const counts: Record<'direct' | 'support' | 'civic', number> = { direct: 0, support: 0, civic: 0 };
    const focusIdx = focusedIndex;
    for (const c of threadCandidates) {
      if (!Number.isFinite(c.index) || c.index === focusIdx) continue;
      counts[roleToFilterBucket(normalizeRelationshipRole(c.relationshipRole))]++;
    }
    return counts;
  });

  // ── Candidate filtering ───────────────────────────────────────────────

  function applyRoleFilter(candidates: CandidateItem[]): CandidateItem[] {
    if (currentRoleFilter === 'all') return candidates;
    return candidates.filter(
      (c) => roleToFilterBucket(normalizeRelationshipRole(c.relationshipRole)) === currentRoleFilter
    );
  }

  const filteredCandidates = $derived.by(() => {
    const candidates = threadCandidates;
    const focusIdx = focusedIndex;
    return applyRoleFilter(
      candidates.filter((c) => Number.isFinite(c.index) && !(c.index === focusIdx))
    ).slice(0, candidateLimit);
  });

  const showRoleFilters = $derived(
    chromeHasFocus &&
    threadCandidates.some((c) => c.relationshipRole !== 'unclassified')
  );

  const showNeighborRail = $derived(
    chromeHasFocus &&
    filteredCandidates.length > 0 &&
    (!threadInspectorActive() || threadInspector().source === 'rail-hover')
  );

  // ── Interaction handlers ──────────────────────────────────────────────

  function inspectCandidate(idx: number): void {
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

  function walkToCandidate(candidate: CandidateItem): void {
    walkThreadNeighbor(candidate.index, {
      surface: 'rail',
      reason: getRelationshipRoleLabel(normalizeRelationshipRole(candidate.relationshipRole)) || candidate.reason || 'nearby business relationship'
    });
  }
</script>

<!-- ├─ Role Filter Chips ──────────────────────────────────────────────── -->
{#if showRoleFilters}
  <div class="focus-role-filters" id="focus-role-filters" role="group" aria-label="Filter neighbors by relationship">
    {#each ROLE_FILTER_OPTIONS as filter}
      {@const label = filter === 'all' ? 'All' : getRelationshipRoleLabel(filter, 'rail')}
      {@const active = currentRoleFilter === filter}
      {@const count = filter === 'all' ? null : roleFilterCounts[filter]}
      {@const isEmpty = count !== null && count === 0}
      <button
        class="focus-role-filter-chip"
        class:active
        class:empty={isEmpty}
        type="button"
        data-role-filter={filter}
        aria-pressed={active}
        aria-label={count !== null ? `${label} (${count})` : label}
        onclick={() => selectRoleFilter(filter)}
      >
        {label}{#if count !== null}<span class="filter-count" aria-hidden="true"> {count}</span>{/if}
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
