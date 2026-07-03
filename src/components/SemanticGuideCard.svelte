<!--
  SemanticGuideCard.svelte
  Extracted from App.svelte (Phase 2).
-->
<script lang="ts">
  import { appState } from '@lib/state/app.svelte.ts'
  import { hideSummaryCard, requestSemanticGuide } from '@lib/journey/semantic-guide'
  import { focusOnNode } from '@lib/engine/camera-choreography'
  import { syncSvelteNavFromLegacy } from '@lib/orchestration/window-actions'

  type Suggestion = {
    lead_id?: string | number
    label?: string
    name?: string
    city?: string
    reason?: string
  }

  const config = $derived((appState.semanticGuideState.config ?? {}) as {
    title?: string
    text?: string
    laneStatus?: string
    suggestions?: Suggestion[]
  })

  const suggestions = $derived(
    Array.isArray(config.suggestions) ? config.suggestions : []
  )

  /**
   * W47-A: suggestion-btn click handler. Previously the buttons rendered with
   * data-lead-id but no onclick handler at all — they were decorative. The
   * `bindSuggestionControls` module that handled clicks for this region was
   * dead code (no import graph), and even if registered its [data-action]
   * selector wouldn't match the rendered `data-lead-id` attribute.
   *
   * Now: lookup the lead_id in `appState.pointIndexByLeadId` and call
   * focusOnNode(idx). The summary card stays open so the user can chain
   * clicks (Trail anchor → Next stop → Side trail). The `fromCanvasNode: true`
   * flag tells focusOnNode to use the field-node focus panel mode.
   */
  function handleSuggestionClick(event: MouseEvent): void {
    const leadKey = (event.currentTarget as HTMLButtonElement).dataset.leadId
    if (leadKey == null) return
    const idx = appState.pointIndexByLeadId?.get?.(leadKey)
    if (!Number.isFinite(idx)) return
    focusOnNode(idx as number, { fromCanvasNode: true })
    syncSvelteNavFromLegacy()
  }
</script>

<div
  id="synthesize-trigger"
  class="synthesize-trigger"
  class:hidden={appState.semanticGuideState.isVisible || appState.currentView === 'map'}
>
  <button id="btn-synthesize" type="button" class="btn-synthesize" onclick={requestSemanticGuide}>
    Synthesize trail
  </button>
</div>

<div
  id="semantic-summary-card"
  class="summary-card"
  class:hidden={!appState.semanticGuideState.isVisible}
  class:is-synthesizing={appState.semanticGuideState.isSynthesizing}
  role="region"
  aria-label="Synthesis summary"
>
  <div class="summary-card-header">
    <div id="summary-card-title-text" class="summary-title">{config.title || 'Synthesis'}</div>
    <button type="button" class="summary-close" aria-label="Close synthesis" onclick={hideSummaryCard}>
      Close
    </button>
  </div>
  <div id="summary-text" class="typewriter-content">{config.text || ''}</div>
  {#if suggestions.length > 0}
    <div id="summary-suggestions" class="summary-suggestions">
      {#each suggestions as suggestion}
        <button
          class="suggestion-btn"
          type="button"
          data-lead-id={String(suggestion.lead_id ?? '')}
          onclick={handleSuggestionClick}
        >
          <span class="suggestion-label">{suggestion.label || 'Suggestion'}</span>
          <span class="suggestion-name">{suggestion.name || 'Related business'}</span>
          {#if suggestion.reason}
            <span class="suggestion-reason">{suggestion.reason}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
  <div id="summary-lane-status" class="summary-lane-status">{config.laneStatus || 'Ready'}</div>

  <div id="summary-gemma-story" class="summary-gemma-story" class:hidden={!appState.semanticGuideState.showStory}>
    <p id="summary-gemma-story-text" class="summary-gemma-story-text">{appState.semanticGuideState.storyText}</p>
    <span id="summary-gemma-story-source" class="summary-gemma-story-source">{appState.semanticGuideState.storySource}</span>
  </div>
</div>

<style>
  .synthesize-trigger {
    position: absolute;
    bottom: 5rem;
    right: 1rem;
    z-index: var(--z-panels, 80);
  }
  .synthesize-trigger.hidden {
    display: none;
  }

  .btn-synthesize {
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.28);
    border-radius: 0.45rem;
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    color: rgba(224, 240, 240, 0.9);
    padding: 0.45rem 0.6rem;
    min-height: 44px;
    cursor: pointer;
  }

  .summary-card {
    position: absolute;
    bottom: 5rem;
    right: 1rem;
    z-index: var(--z-panels, 80);
    width: 300px;
    max-height: 60vh;
    overflow-y: auto;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.18);
    border-radius: 0.5rem;
    padding: 0.75rem;
  }
  /* W48 mobile audit: both .synthesize-trigger (a CTA button) and .summary-card
     (a 300px-wide ambient panel) anchor to bottom: 5rem, right: 1rem. On mobile
     (≤768px) the bottom-anchored search panel claims that same rectangle, so the
     synthesize-trigger overlaps the third match card and the summary-card would
     occlude the whole match list. Hide both below the MOBILE_MAX_WIDTH (768)
     breakpoint — mobile users are action-oriented (tap results directly) and
     synthesis is a desktop ambient affordance. If/when mobile UX needs the
     synthesis flow, replace with a bottom-sheet anchored above the search panel. */
  @media (max-width: 768px) {
    .synthesize-trigger:not(.hidden),
    .summary-card:not(.hidden) {
      display: none;
    }
  }
  .summary-card.hidden {
    display: none;
  }
  .summary-card.is-synthesizing {
    cursor: progress;
  }

  .summary-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.45rem;
  }

  .summary-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-primary-alt);
    margin-bottom: 0;
    text-transform: uppercase;
  }

  .summary-close {
    border: 1px solid rgba(224, 240, 240, 0.22);
    border-radius: 0.35rem;
    background: rgba(224, 240, 240, 0.06);
    color: rgba(224, 240, 240, 0.78);
    font-size: 0.62rem;
    line-height: 1;
    padding: 0.35rem 0.45rem;
    min-height: 44px;
    cursor: pointer;
  }
  .summary-close:hover {
    background: rgba(224, 240, 240, 0.12);
    color: rgba(224, 240, 240, 0.95);
  }

  .typewriter-content {
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.7);
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  .summary-suggestions {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.7rem;
  }

  .suggestion-btn {
    display: grid;
    gap: 0.16rem;
    width: 100%;
    min-width: 0;
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.16);
    border-radius: 0.45rem;
    background: rgba(var(--color-primary-alt-rgb), 0.07);
    color: rgba(224, 240, 240, 0.84);
    padding: 0.48rem 0.55rem;
    min-height: 44px;
    text-align: left;
    cursor: pointer;
  }
  .suggestion-btn:hover {
    border-color: rgba(var(--color-primary-alt-rgb), 0.34);
    background: rgba(var(--color-primary-alt-rgb), 0.12);
  }
  .btn-synthesize:focus-visible,
  .summary-close:focus-visible,
  .suggestion-btn:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
  }

  .suggestion-label {
    color: var(--color-primary-alt);
    font-size: 0.55rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .suggestion-name {
    overflow-wrap: anywhere;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .suggestion-reason {
    color: rgba(224, 240, 240, 0.62);
    font-size: 0.62rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .summary-lane-status {
    margin-top: 0.65rem;
    color: rgba(224, 240, 240, 0.54); /* a11y-ok: caption-text — UPPERCASE status label */
    font-size: 0.56rem;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .summary-gemma-story {
    margin-top: 0.65rem;
    padding-top: 0.55rem;
    border-top: 1px solid rgba(var(--color-primary-alt-rgb), 0.12);
  }

  .summary-gemma-story.hidden {
    display: none;
  }

  .summary-gemma-story-text {
    color: rgba(224, 240, 240, 0.64);
    font-size: 0.65rem;
    line-height: 1.45;
  }

  .summary-gemma-story-source {
    display: block;
    margin-top: 0.35rem;
    color: rgba(224, 240, 240, 0.42); /* a11y-ok: caption-text — small source line */
    font-size: 0.56rem;
  }
</style>
