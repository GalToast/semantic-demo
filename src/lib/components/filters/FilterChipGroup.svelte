<!--
  @lib/components/filters/FilterChipGroup.svelte — Reusable filter chip group
  Extracted from Filters.svelte to reduce LOC and enable reuse.
  Renders a .filter-group with title and chip buttons.
-->
<script lang="ts">
  interface Props {
    /** Section heading (e.g., "Status", "Contact") */
    title: string;
    /** Array of filter options */
    options: Array<{ id: string; label: string }>;
    /** Data attribute name for chips (e.g., 'status-filter', 'contact-filter') */
    dataAttr: string;
    /** Check if a given filter id is currently active */
    isActive: (_id: string) => boolean;
    /** Callback when a filter chip is toggled */
    onToggle: (_id: string) => void;
  }

  let { title, options, dataAttr, isActive, onToggle }: Props = $props();

  /** Convert kebab-case data attribute to camelCase dataset key. */
  function datasetKey(attr: string): string {
    return attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  const dsKey = $derived(datasetKey(dataAttr));

  /** Keyboard navigation within the chip group. */
  function handleChipKeydown(event: KeyboardEvent, filterId: string) {
    const chips = Array.from(
      (event.currentTarget as HTMLElement).closest('.filter-group')?.querySelectorAll('.filter-chip') ?? []
    ) as HTMLElement[];
    const idx = chips.findIndex((c) => (c.dataset as Record<string, string>)[dsKey] === filterId);
    if (idx === -1) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = chips[(idx + 1) % chips.length];
      next?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = chips[(idx - 1 + chips.length) % chips.length];
      prev?.focus();
    }
  }
</script>

<div class="filter-group">
  <h4 class="filter-group-title">{title}</h4>
  {#each options as filter (filter.id)}
    <button
      class="filter-chip"
      class:active={isActive(filter.id)}
      {...{[`data-${dataAttr}`]: filter.id}}
      onclick={() => onToggle(filter.id)}
      onkeydown={(e) => handleChipKeydown(e, filter.id)}
      aria-pressed={isActive(filter.id) ? 'true' : 'false'}
      type="button"
    >
      {filter.label}
    </button>
  {/each}
</div>

<style>
  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .filter-group-title {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary-alt);
    margin-right: 0.3rem;
    font-family: var(--font-display);
    margin: 0;
  }
  .filter-chip {
    padding: 0 0.5rem;
    background: rgba(var(--color-primary-alt-rgb), 0.08);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.15);
    border-radius: 0.3rem;
    color: var(--color-text-teal-muted);
    font-size: 0.65rem;
    font-family: var(--font-body);
    cursor: pointer;
    transition: all 0.15s;
    height: 44px;
    min-width: 44px;
    width: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    line-height: 44px;
  }
  .filter-chip:hover {
    border-color: rgba(var(--color-primary-alt-rgb), 0.35);
  }
  .filter-chip.active {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    border-color: var(--color-primary-alt);
    color: var(--color-primary-alt);
  }
</style>
