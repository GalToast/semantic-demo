<!--
  SearchTrailCue.svelte
  Extracted from App.svelte (Phase 2).
  Displays the search trail cue overlay.
-->
<div
  id="search-trail-cue"
  class="search-trail-cue"
  role="status"
  aria-live="polite"
  hidden
>
  <div id="search-trail-cue-kicker" class="search-trail-cue-kicker">Connection cue</div>
  <div id="search-trail-cue-title" class="search-trail-cue-title">Search opens a trail.</div>
  <div class="search-trail-cue-stage" aria-hidden="true">
    <span class="search-trail-cue-step" data-cue-stage="query">Query</span>
    <span class="search-trail-cue-step" data-cue-stage="anchor">Anchor</span>
    <span class="search-trail-cue-step" data-cue-stage="explore">Explore</span>
  </div>
  <div id="search-trail-cue-note" class="search-trail-cue-note">
    The first strong match becomes the anchor; from there you can center it and explore the neighborhood.
  </div>
</div>

<style>
  .search-trail-cue {
    position: absolute;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast, 700);
    width: min(90vw, 400px);
    background: rgba(7, 16, 24, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.25);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(var(--color-primary-alt-rgb), 0.12);
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  /* Restore native `hidden` behavior: the base rule sets `display: flex`,
     which overrides the browser's default `[hidden] { display: none }`. This
     rule makes the cue genuinely hidden when the renderer/JS removes it. */
  .search-trail-cue[hidden] {
    display: none;
  }
  /* When the renderer marks the cue as active (search/focus states), it must
     stay visible even if Svelte re-applies the static `hidden` attribute or a
     surface body class sets `display: none`. */
  :global(.search-trail-cue.active) {
    display: flex !important;
  }
  .search-trail-cue-kicker {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary-alt);
  }
  .search-trail-cue-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text-teal-light);
  }
  .search-trail-cue-stage {
    display: flex;
    gap: 0.4rem;
  }
  .search-trail-cue-step {
    font-size: 0.6rem;
    padding: 0.15rem 0.4rem;
    border-radius: 0.2rem;
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    color: var(--color-text-teal-muted);
  }
  .search-trail-cue-note {
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.72); /* caption-text — stronger contrast over the 3D scene */
    line-height: 1.4;
    overflow-wrap: break-word;
  }
</style>
