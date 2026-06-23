<script lang="ts">
  import { selectedPointStore } from '@lib/stores/index.svelte.ts';
  import { publish, EVENTS } from '@lib/orchestration/event-bus';

  interface Props {
    viewModel: Record<string, any>;
    selectedCity: string;
  }

  let { viewModel, selectedCity }: Props = $props();

  const point = $derived(selectedPointStore());

  function handleMapClick(): void {
    publish(EVENTS.VIEW_CHANGE_REQUESTED, { view: 'map' });
  }
</script>

<div class="selected-hero">
  <div class="selected-hero-main">
    <h3 id="selected-name">{viewModel.name}</h3>
    {#if viewModel.showFiledAs}
      <div class="selected-filed-as" id="selected-filed-as">{viewModel.filedAs}</div>
    {/if}
    <div class="selected-subtitle" id="selected-what">{viewModel.what}</div>
  </div>
  <div class="selected-role-badge" id="selected-role-badge">{viewModel.role}</div>
</div>

<!-- Meta strip -->
<div class="selected-meta-strip" id="selected-meta-strip">
  {#if viewModel.isPopulated}
    <span class="focus-stage-chip">{selectedCity}</span>
    <span class="focus-stage-chip">{viewModel.theme}</span>
    <span class="focus-stage-chip">{viewModel.status}</span>
  {/if}
</div>

<!-- Badge row -->
<div class="badge-row" id="selected-badges">
  {#if point?.website}
    <span class="signal-badge meta" title="Website present">Website present</span>
  {/if}
  {#if point?.email}
    <span class="signal-badge fact" title="Email present">Email present</span>
  {/if}
  {#if point?.phone}
    <span class="signal-badge ai" title="Phone present">Phone present</span>
  {/if}
</div>

<!-- Facts -->
<div class="selected-facts" id="selected-facts">
  {#if viewModel.facts.length > 0}
    {#each viewModel.facts as fact, i}
      {#if fact.type === 'link'}
        <a href={fact.href} target={fact.isExternal ? '_blank' : null} rel={fact.isExternal ? 'noopener noreferrer' : null}>{fact.label}</a>
      {:else}
        {fact.value}
      {/if}
      {#if i < viewModel.facts.length - 1} &nbsp;|&nbsp; {/if}
    {/each}
  {:else}
    <span class="facts-none">No contact info on file</span>
  {/if}
</div>

<!-- Sensitivity -->
<div class="selected-sensitivity" id="selected-sensitivity" hidden={viewModel.sensitivityBadges.length === 0}>
  {#each viewModel.sensitivityBadges as b}
    <span class="signal-badge {b.class}">{b.text}</span>
  {/each}
</div>

<!-- Match panel -->
<div class="selected-match-panel" id="selected-match-panel" hidden={!viewModel.showMatchPanel}>
  <div class="selected-match-label" id="selected-match-label">Why this record</div>
  <div class="selected-match-copy" id="selected-match-copy">{viewModel.matchNarrative}</div>
</div>

<!-- Action row -->
<div class="selected-action-row" id="selected-action-row" hidden={!viewModel.isPopulated}>
  <button
    class="action-btn biofield-glow"
    id="btn-selected-map"
    type="button"
    aria-label="View selected business on map"
    onclick={handleMapClick}
  >
    View on Map
  </button>
</div>

<!-- Grid -->
<div class="selected-grid">
  <div class="selected-item">
    <div class="selected-item-label">Semantic Neighborhood</div>
    <div class="selected-item-value" id="selected-theme">{viewModel.theme}</div>
  </div>
  <div class="selected-item">
    <div class="selected-item-label">Record Status</div>
    <div class="selected-item-value" id="selected-status">{viewModel.status}</div>
  </div>
  <div class="selected-item">
    <div class="selected-item-label">Map Coordinates</div>
    <div class="selected-item-value" id="selected-map">{viewModel.mapText}</div>
  </div>
  <div class="selected-item">
    <div class="selected-item-label">Related Thread</div>
    <div class="selected-item-value" id="selected-thread">{viewModel.threadText}</div>
  </div>
</div>

{#if viewModel.showTrivia}
  <div class="selected-trivia" id="selected-trivia">{viewModel.trivia}</div>
{/if}
