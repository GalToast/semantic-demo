<script lang="ts">
  import { getBusinessRecords } from '@lib/stores/index.svelte.ts';
  import { navStore, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts';
  import type { BusinessRecord } from '@lib/types/business';

  interface Props {
    viewModel: Record<string, any>;
    selectedCity: string;
    idPrefix?: string;
  }

  let { viewModel, selectedCity, idPrefix = '' }: Props = $props();

  // Reactive replacement for selectedPointStore(): the snapshot helper froze at
  // first render (null) because a $derived over a get()-snapshot establishes no
  // reactive dependency, so the Website/Email/Phone badge row (#selected-badges)
  // never re-evaluated on selection. Derive from the reactive nav store so this
  // re-runs whenever the focused index changes, reading the record list at derive
  // time from the same source the helper used.
  const point = $derived.by((): BusinessRecord | null => {
    const idx = $navStore.focusedIndex;
    if (idx == null || idx < 0) return null;
    const records = getBusinessRecords();
    return (records[idx] ?? null) as BusinessRecord | null;
  });

  function handleMapClick(): void {
    // VIEW_CHANGE_REQUESTED has no subscriber, so this button was a dead-end.
    // Switch the view directly, matching the header "Map" chip behaviour.
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' });
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' });
  }
</script>

<div class="selected-hero">
  <div class="selected-hero-main">
    <h3 id="{idPrefix}selected-name" title={viewModel.name} aria-label={viewModel.name}>{viewModel.name}</h3>
    {#if viewModel.showFiledAs}
      <div class="selected-filed-as" id="{idPrefix}selected-filed-as">{viewModel.filedAs}</div>
    {/if}
    <div class="selected-subtitle" id="{idPrefix}selected-what">{viewModel.what}</div>
  </div>
  <div class="selected-role-badge" id="{idPrefix}selected-role-badge">{viewModel.role}</div>
</div>

<!-- Meta strip -->
<div class="selected-meta-strip" id="{idPrefix}selected-meta-strip">
  {#if viewModel.isPopulated}
    <span class="focus-stage-chip">{selectedCity}</span>
    <span class="focus-stage-chip">{viewModel.theme}</span>
    <span class="focus-stage-chip">{viewModel.status}</span>
  {/if}
</div>

<!-- Badge row -->
<div class="badge-row" id="{idPrefix}selected-badges">
  {#if point?.website}
    <span class="signal-badge meta" title="Website">Website</span>
  {/if}
  {#if point?.email}
    <span class="signal-badge fact" title="Email">Email</span>
  {/if}
  {#if point?.phone}
    <span class="signal-badge ai" title="Phone">Phone</span>
  {/if}
</div>

<!-- Facts -->
<div class="selected-facts" id="{idPrefix}selected-facts">
  {#if viewModel.facts.length > 0}
    {#each viewModel.facts as fact, i}
      {#if fact.type === 'link'}
        <a
          href={fact.href}
          target={fact.isExternal ? '_blank' : null}
          rel={fact.isExternal ? 'noopener noreferrer' : null}
          aria-label={fact.isExternal ? `${fact.label} (opens in new tab)` : null}
        >
          {fact.label}
          {#if fact.isExternal}
            <!-- W48-D: visually-hidden but announced by screen readers via the
                 aria-label above. WCAG 2.1 SC 2.4.4 (Link Purpose) + W3C G201
                 (warning users of new windows). -->
            <span class="sr-only" aria-hidden="false">(opens in new tab)</span>
          {/if}
        </a>
      {:else}
        {fact.value}
      {/if}
      {#if i < viewModel.facts.length - 1}
        <span class="fact-sep" aria-hidden="true">·</span>
      {/if}
    {/each}
  {:else}
    <span class="facts-none">No contact info on file</span>
  {/if}
</div>

<!-- Sensitivity -->
<div class="selected-sensitivity" id="{idPrefix}selected-sensitivity" hidden={viewModel.sensitivityBadges.length === 0}>
  {#each viewModel.sensitivityBadges as b}
    <span class="signal-badge {b.class}">{b.text}</span>
  {/each}
</div>

<!-- Match panel -->
<div class="selected-match-panel" id="{idPrefix}selected-match-panel" hidden={!viewModel.showMatchPanel}>
  <div class="selected-match-label" id="{idPrefix}selected-match-label">Why this record</div>
  <div class="selected-match-copy" id="{idPrefix}selected-match-copy">{viewModel.matchNarrative}</div>
</div>

<!-- Action row -->
<div class="selected-action-row" id="{idPrefix}selected-action-row" hidden={!viewModel.isPopulated}>
  <button
    class="action-btn biofield-glow"
    id="{idPrefix}btn-selected-map"
    type="button"
    aria-label="View selected business on map"
    onclick={handleMapClick}
  >
    View on Map
  </button>
</div>

<!-- Relationship context (dominant relationship role + reason for neighbors) -->
{#if viewModel.isPopulated && viewModel.relationshipContext}
  {@const ctx = viewModel.relationshipContext as Record<string, unknown>}
  <div class="selected-relationship-context" id="{idPrefix}selected-relationship-context">
    <div class="selected-relationship-header">
      <span class="selected-relationship-label">Why these neighbors</span>
      <span class="selected-relationship-role" id="{idPrefix}selected-relationship-role">{ctx.roleLabel}</span>
    </div>
    <p class="selected-relationship-reason" id="{idPrefix}selected-relationship-reason">{ctx.roleReason}</p>
    {#if Array.isArray(ctx.distribution) && ctx.distribution.length > 1}
      <ul class="selected-relationship-distribution" aria-label="Relationship types">
        {#each ctx.distribution as item}
          {@const typed = item as Record<string, unknown>}
          <li><span class="rel-count">{typed.count}</span> {typed.label}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<!-- Grid -->
<div class="selected-grid">
  <div class="selected-item">
    <div class="selected-item-label" title="The kind of business this is — what it does, based on similar listings in the area.">Business type</div>
    <div class="selected-item-value" id="{idPrefix}selected-theme">{viewModel.theme}</div>
  </div>
  <div class="selected-item">
    <div class="selected-item-label">Status</div>
    <div class="selected-item-value" id="{idPrefix}selected-status">{viewModel.status}</div>
  </div>
  <div class="selected-item">
    <div class="selected-item-label">Location</div>
    <div class="selected-item-value" id="{idPrefix}selected-map">{viewModel.mapText}</div>
  </div>
  <div class="selected-item">
    <div class="selected-item-label" title="Other similar businesses in the area, ordered by how strongly they relate to this one.">Similar businesses</div>
    <div class="selected-item-value" id="{idPrefix}selected-thread">{viewModel.threadText}</div>
  </div>
</div>

{#if viewModel.showTrivia}
  <div class="selected-trivia" id="{idPrefix}selected-trivia">{viewModel.trivia}</div>
{/if}

<style>
  /*
   * Inner-chip overflow handling lives in this component's <style> block
   * (not css/modules/focus_stage.css) because that file is currently the
   * lane's WIP — touching it would conflict with their pending changes.
   * The override is global because .focus-stage-chip is a class used by
   * multiple surfaces (FocusCard, SelectedBusinessDetails, etc.) and the
   * underlying lane file owns the visual style.
   *
   * Long cluster names (e.g. "Professional Services & Office Support") would
   * otherwise push a single chip past its container's 100% width on mobile.
   * Clamp with ellipsis; the chip's title attribute stays for full disclosure.
   */
  :global(.focus-stage-chip) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* W48 audit fix (PR-W47-g): the phone / website / email fact row used to
     render the separator as raw "&nbsp;|&nbsp;" text. Screen readers read it as
     "vertical bar", and the pipe was unstyled. Switch to a muted middle-dot in
     an aria-hidden span so humans get a clean divider and AT skips it. */
  .fact-sep {
    margin: 0 0.4rem;
    opacity: 0.45;
    color: rgba(var(--color-primary-alt-rgb), 0.9);
  }

  .selected-relationship-context {
    margin: 0.6rem 0 0.4rem;
    padding: 0.6rem 0.75rem;
    background: rgba(7, 16, 24, 0.6);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.15);
    border-radius: 0.4rem;
  }

  .selected-relationship-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .selected-relationship-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(224, 240, 240, 0.7);
  }

  .selected-relationship-role {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: rgba(var(--color-primary-alt-rgb), 0.12);
    color: var(--color-primary-alt);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.3);
  }

  .selected-relationship-reason {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(224, 240, 240, 0.85);
  }

  .selected-relationship-distribution {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.75rem;
    margin: 0.4rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.7);
  }

  .selected-relationship-distribution li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .rel-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1rem;
    padding: 0.05rem 0.25rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    font-weight: 600;
    color: rgba(224, 240, 240, 0.92);
  }
</style>
