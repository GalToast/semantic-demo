<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    history: number[];
    focusedIndex: number | null;
    getPointForIndex: (_idx: number) => { name?: string } | null;
    onWalk: (_index: number, _order: number) => void;
  }

  let { history, focusedIndex, getPointForIndex, onWalk }: Props = $props();

  // ── Roving tabindex active index ──────────────────────────────────────
  let activeChipIndex = $state(0);

  function focusChip(targetIndex: number): void {
    const count = history.length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(targetIndex, count - 1));
    activeChipIndex = clamped;
    void tick().then(() => {
      const chips = document.querySelectorAll<HTMLButtonElement>('.walk-breadcrumb-chip');
      chips[clamped]?.focus();
    });
  }

  function handleKeydown(event: KeyboardEvent): void {
    const count = history.length;
    if (count === 0) return;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusChip(activeChipIndex < count - 1 ? activeChipIndex + 1 : 0);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusChip(activeChipIndex > 0 ? activeChipIndex - 1 : count - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusChip(0);
        break;
      case 'End':
        event.preventDefault();
        focusChip(count - 1);
        break;
    }
  }

  function syncActiveFromFocus(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (!target?.classList.contains('walk-breadcrumb-chip')) return;
    const order = Number(target.dataset.walkOrder);
    if (Number.isFinite(order)) activeChipIndex = order;
  }
</script>

<div class="walk-breadcrumb" id="walk-breadcrumb" role="navigation" aria-label="Trail history">
  <span class="walk-breadcrumb-label">Trail</span>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul class="walk-breadcrumb-list" role="list" aria-label="Trail stops" onkeydown={handleKeydown} onfocusin={syncActiveFromFocus}>
    {#each history as idx, i}
      {@const point = getPointForIndex(idx)}
      {@const name = point?.name ?? 'Stop'}
      {@const isCurrent = idx === focusedIndex}
      <li class="walk-breadcrumb-item" role="listitem">
        {#if i > 0}
          <span class="walk-breadcrumb-sep" aria-hidden="true">/</span>
        {/if}
        <button
          class="walk-breadcrumb-chip"
          class:current={isCurrent}
          id={`walk-chip-${i}`}
          type="button"
          tabindex={i === activeChipIndex ? 0 : -1}
          data-walk-index={idx}
          data-walk-order={i}
          aria-current={isCurrent ? 'step' : undefined}
          aria-label={isCurrent ? `Current stop: ${name}` : `Return to ${name}`}
          onclick={() => onWalk(idx, i)}
        >
          {name}
        </button>
      </li>
    {/each}
  </ul>
</div>
