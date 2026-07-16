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
    aria-label="Trail navigation"
  >
    <button
      id="btn-focus-path"
      class="focus-stage-action-btn"
      type="button"
      aria-label="Show trail"
      onclick={() => {
        const overlay = document.getElementById('trail-review-overlay');
        if (overlay) overlay.hidden = !overlay.hidden;
      }}
    >
      Show trail
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
    gap: 0.5rem;
    background: rgba(var(--color-surface-chrome-rgb), 0.9);
    backdrop-filter: blur(var(--glass-blur-light));
    border-radius: var(--radius-tight);
    padding: 0.35rem 0.65rem;
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.12);
  }
  .trail-controls.idle {
    opacity: 0.6;
  }
  .trail-context-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
  }
  .trail-context {
    /* Parent of the trail-context-text span; kept unstyled by design so
       the .trail-context-text typography owns the visual treatment. */
    display: contents;
  }
  .trail-context-text {
    font-family: var(--font-body);
    font-size: 0.6rem;
    color: var(--color-text-teal-muted);
    text-align: center;
    line-height: 1.3;
    max-width: 320px;
    /* Wrap instead of ellipsis so the full trail context stays readable.
       Cap at 2 lines to keep the journey chrome height bounded. */
    white-space: normal;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
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
    opacity: 0.8;
  }
  .trail-btn {
    background: none;
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: 0.3rem;
    color: var(--color-primary-alt);
    cursor: pointer;
    padding: 0.25rem 0.6rem;
    font-family: var(--font-body);
    font-size: 0.65rem;
    font-weight: 600;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .trail-btn:disabled {
    opacity: 0.3;
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
