<script lang="ts">
  import { tick } from 'svelte';
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
    getPointForIndex: (_idx: number) => { name?: string; city?: string } | null;
    onInspect: (_idx: number) => void;
    onPin: (_idx: number) => void;
    onWalk: (_candidate: CandidateItem) => void;
  }

  let { candidates, getPointForIndex, onInspect, onPin, onWalk }: Props = $props();

  // ── Roving tabindex active index ──────────────────────────────────────
  // Tracks which pill's Walk button is the roving-tabindex target.
  // ArrowDown/Up moves between pills; Tab follows natural DOM order
  // (Walk → Inspect → Pin → next Walk → …).
  let activePillIndex = $state(0);

  /** Focus the Walk button of the pill at the given index. */
  function focusPillWalkButton(targetIndex: number): void {
    const count = candidates.length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(targetIndex, count - 1));
    activePillIndex = clamped;
    void tick().then(() => {
      const list = document.getElementById('focus-stage-neighbor-list');
      const walkBtns = list?.querySelectorAll<HTMLButtonElement>('.focus-stage-neighbor-main');
      walkBtns?.[clamped]?.focus();
    });
  }

  /** Keydown handler on the neighbor list — arrow-key shortcuts. */
  function handleListKeydown(event: KeyboardEvent): void {
    const count = candidates.length;
    if (count === 0) return;

    // Only handle arrow keys when focus is on a Walk button inside this list.
    const target = event.target as HTMLElement;
    if (!target?.closest('.focus-stage-neighbor-list')) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusPillWalkButton(activePillIndex < count - 1 ? activePillIndex + 1 : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusPillWalkButton(activePillIndex > 0 ? activePillIndex - 1 : count - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusPillWalkButton(0);
        break;
      case 'End':
        event.preventDefault();
        focusPillWalkButton(count - 1);
        break;
    }
  }

  /** Sync activePillIndex when a Walk button receives focus via Tab/click.
   *  This keeps the roving index in sync with actual DOM focus so ArrowDown
   *  continues from the right pill after a Tab or mouse click. */
  function syncActiveFromFocus(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (!target?.classList.contains('focus-stage-neighbor-main')) return;
    const pill = target.closest('.focus-stage-neighbor-pill');
    if (!pill) return;
    const list = document.getElementById('focus-stage-neighbor-list');
    if (!list) return;
    const pills = Array.from(list.querySelectorAll('.focus-stage-neighbor-pill'));
    const idx = pills.indexOf(pill);
    if (idx >= 0) activePillIndex = idx;
  }
</script>

<div class="focus-stage-neighbors active" id="focus-stage-neighbors" role="navigation" aria-label="Nearby neighbors">
  <div class="neighbor-count" id="focus-stage-neighbor-count" aria-live="polite">{candidates.length} visible {candidates.length === 1 ? 'neighbor' : 'neighbors'}</div>
  <div class="focus-stage-neighbor-list" id="focus-stage-neighbor-list" role="listbox" tabindex="-1" aria-label="Nearby neighbors" aria-activedescendant={candidates.length > 0 ? `neighbor-pill-${activePillIndex}` : undefined} onkeydown={handleListKeydown} onfocusin={syncActiveFromFocus}>
    {#each candidates as candidate, i}
      {@const idx = candidate.index}
      {@const point = getPointForIndex(idx)}
      {@const name = point?.name ?? 'Nearby business'}
      {@const city = point?.city ?? 'Montgomery County'}
      {@const isNextStop = i === 0}
      {@const relationshipRole = candidate.relationshipRole}
      {@const relationshipLabel = getRelationshipRoleLabel(relationshipRole, 'rail')}
      {@const reasonLabel = getRelationshipRoleLabel(relationshipRole, 'rail') || candidate.reason || 'Neighborhood connection'}
      <div
        class="focus-stage-neighbor-pill"
        class:is-next-stop={isNextStop}
        id={`neighbor-pill-${i}`}
        role="option"
        aria-selected={i === activePillIndex}
        data-index={idx}
        data-relationship-role={relationshipRole}
        data-reason={reasonLabel}
      >
      <button
        class="focus-stage-neighbor-main"
        type="button"
        tabindex={i === activePillIndex ? 0 : -1}
        aria-label={`Walk to ${name}`}
        onclick={() => onWalk(candidate)}
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
      </button>
      <span class="focus-stage-neighbor-actions" aria-label="Strand actions">
        <button
          class="focus-stage-neighbor-action"
          type="button"
          data-neighbor-action="inspect"
          aria-label="Inspect connection"
          onclick={() => onInspect(idx)}
        >Inspect</button>
        <button
          class="focus-stage-neighbor-action primary"
          type="button"
          data-neighbor-action="pin"
          aria-label="Pin connection"
          onclick={() => onPin(idx)}
        >Pin</button>
      </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .focus-stage-neighbors {
    position: relative;
    z-index: 110;
  }
  .neighbor-count {
    /* M6 visual fix (2026-07-10): clipped "5 visibl neighb" — 71px too narrow for mono 9.6px+tracking */
    display: inline-block;
    min-width: 88px;
    white-space: nowrap;
  }
</style>
