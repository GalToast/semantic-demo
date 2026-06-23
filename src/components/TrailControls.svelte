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
