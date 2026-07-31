<script lang="ts">
  interface Props {
    active: boolean;
    canGoBack: boolean;
    hasNext: boolean;
    contextText: string;
    progressText: string;
    nextStopName: string | null;
    onPrev: () => void;
    onNext: () => void;
  }

  let { active, canGoBack, hasNext, contextText, progressText, nextStopName, onPrev, onNext }: Props = $props();
</script>

{#if active}
  <div
    class="trail-controls focus-stage-actions"
    id="trail-controls"
    class:active={active}
    role="toolbar"
    aria-label="Walk controls"
  >
    <button
      id="btn-focus-path"
      class="focus-stage-action-btn"
      type="button"
      aria-label="Show walk"
      onclick={() => {
        const overlay = document.getElementById('trail-review-overlay');
        if (overlay) overlay.hidden = !overlay.hidden;
      }}
    >
      Show walk
    </button>

    <button
      class="trail-btn focus-stage-action-btn biofield-glow"
      id="btn-prev-node"
      disabled={!canGoBack}
      aria-disabled={!canGoBack}
      title={!canGoBack ? 'No previous stops in this walk history' : 'Previous stop'}
      onclick={onPrev}
      type="button"
    >
      &larr; Prev
    </button>

    <div class="trail-context-wrapper">
      <div class="trail-context" id="trail-context">
        <span class="trail-context-text">{contextText}</span>
      </div>
      <div class="trail-progress" id="focus-stage-progress">
        <span class="progress-text">{progressText}</span>
      </div>
      {#if nextStopName}
        <div class="trail-next" id="focus-stage-next">
          <span class="next-label">Next: {nextStopName}</span>
        </div>
      {/if}
    </div>

    <button
      class="trail-btn focus-stage-action-btn biofield-glow"
      id="btn-next-node"
      disabled={!hasNext}
      aria-disabled={!hasNext}
      title={!hasNext ? 'No nearby stops to continue to' : 'Next stop'}
      onclick={onNext}
      type="button"
    >
      Next &rarr;
    </button>
  </div>

  <div class="route-state" id="focus-stage-route" data-state={hasNext ? 'walking' : 'empty'}></div>
{:else}
  <div class="trail-controls focus-stage-actions idle" id="trail-controls">
    <div class="trail-context" id="trail-context">
      <span class="trail-context-text">Pick a business, then explore its nearby neighbors.</span>
    </div>
  </div>
{/if}

<style>
  /* PR-E2: These styles were originally in JourneyChrome.css, but Svelte's
     scoped CSS prevented them from applying to elements owned by this
     child component. Moved here so the trail-context text gets the intended
     0.6rem / muted-teal treatment instead of the default 16px fallback. */

  .trail-controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(var(--color-surface-chrome-rgb), 0.92);
    backdrop-filter: blur(var(--glass-blur-light));
    border-radius: var(--radius-tight);
    padding: 0.45rem 0.75rem;
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
  }
  .trail-controls.idle {
    opacity: 0.6;
  }

  /* W53 vision-refresh issue #9: "Show walk" (#btn-focus-path) carries only
     .focus-stage-action-btn and inherited the faint global styling, reading
     as a low-contrast outline (~3.2:1) on the 0.92-alpha chrome panel. Give
     it the same visible-button treatment as Prev/Next: a 0.1 fill, 0.45
     border, teal-light text, and the 44px touch floor. */
  #btn-focus-path {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    padding: 0.25rem 0.7rem;
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.45);
    border-radius: 0.3rem;
    color: var(--color-text-teal-light);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.65rem;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
  #btn-focus-path:hover {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    border-color: rgba(var(--color-primary-alt-rgb), 0.65);
  }
  #btn-focus-path:focus-visible,
  .trail-btn:focus-visible {
    outline: 2px solid var(--color-primary-alt);
    outline-offset: 2px;
  }
  .trail-context-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
    flex: 1 1 auto;
  }
  .trail-context {
    /* Parent of the trail-context-text span; kept unstyled by design so
       the .trail-context-text typography owns the visual treatment. */
    display: contents;
  }
  .trail-context-text {
    font-family: var(--font-body);
    font-size: 0.6rem;
    color: var(--color-text-teal-light);
    text-align: center;
    line-height: 1.3;
    max-width: 320px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
  }
  .progress-text {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--color-text-teal-dark);
  }
  .next-label {
    font-family: var(--font-body);
    font-size: 0.55rem;
    color: var(--color-primary-alt);
    opacity: 0.9;
  }
  .trail-btn {
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.45);
    border-radius: 0.3rem;
    color: var(--color-primary-alt);
    cursor: pointer;
    padding: 0.25rem 0.6rem;
    min-width: 72px;
    min-height: 44px;
    font-family: var(--font-body);
    font-size: 0.65rem;
    font-weight: 600;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .trail-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .trail-btn:not(:disabled):hover {
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    border-color: rgba(var(--color-primary-alt-rgb), 0.4);
  }

  /* Reduced-motion: the trail-button state transition is decorative; disable
     it for users who prefer reduced motion. Steady-state layout is unchanged. */
  @media (prefers-reduced-motion: reduce) {
    .trail-btn {
      transition: none;
    }
  }
</style>
