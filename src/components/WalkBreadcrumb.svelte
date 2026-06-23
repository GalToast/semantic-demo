<script lang="ts">
  interface Props {
    history: number[];
    focusedIndex: number | null;
    getPointForIndex: (idx: number) => { name?: string } | null;
    onWalk: (index: number, order: number) => void;
  }

  let { history, focusedIndex, getPointForIndex, onWalk }: Props = $props();
</script>

<div class="walk-breadcrumb" id="walk-breadcrumb" role="navigation" aria-label="Trail history">
  <span class="walk-breadcrumb-label">Trail</span>
  {#each history as idx, i}
    {#if i > 0}
      <span class="walk-breadcrumb-sep" aria-hidden="true">/</span>
    {/if}
    {@const point = getPointForIndex(idx)}
    {@const name = point?.name ?? 'Stop'}
    {@const isCurrent = idx === focusedIndex}
    <button
      class="walk-breadcrumb-chip"
      class:current={isCurrent}
      type="button"
      data-walk-index={idx}
      data-walk-order={i}
      aria-current={isCurrent ? 'step' : undefined}
      aria-label={isCurrent ? `Current stop: ${name}` : `Return to ${name}`}
      onclick={() => onWalk(idx, i)}
    >
      {name}
    </button>
  {/each}
</div>
