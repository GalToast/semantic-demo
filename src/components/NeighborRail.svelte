<script lang="ts">
  import { getRelationshipRoleLabel } from '@lib/utils/relationship-roles';
  import type { RelationshipRole } from '@lib/utils/relationship-roles';

  interface CandidateItem {
    index: number;
    relationshipRole: RelationshipRole;
    relationshipAxis: string;
    roleReason: string;
    reason: string;
  }

  interface Props {
    candidates: CandidateItem[];
    getPointForIndex: (idx: number) => { name?: string; city?: string } | null;
    onInspect: (idx: number) => void;
    onPin: (idx: number) => void;
    onWalk: (candidate: CandidateItem) => void;
  }

  let { candidates, getPointForIndex, onInspect, onPin, onWalk }: Props = $props();
</script>

<div class="focus-stage-neighbors active" id="focus-stage-neighbors" role="navigation" aria-label="Nearby neighbors">
  <div class="neighbor-count" id="focus-stage-neighbor-count" aria-live="polite">{candidates.length} visible {candidates.length === 1 ? 'neighbor' : 'neighbors'}</div>
  <div class="focus-stage-neighbor-list" id="focus-stage-neighbor-list">
    {#each candidates as candidate, i}
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
          onclick={() => onWalk(candidate)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onWalk(candidate); } }}
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
            onclick={() => onInspect(idx)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInspect(idx); } }}
          >Inspect</span>
          <span
            class="focus-stage-neighbor-action primary"
            role="button"
            tabindex="0"
            data-neighbor-action="pin"
            aria-label="Pin connection"
            onclick={() => onPin(idx)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPin(idx); } }}
          >Pin</span>
        </span>
      </div>
    {/each}
  </div>
</div>
