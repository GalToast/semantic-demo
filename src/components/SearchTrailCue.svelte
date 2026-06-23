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
  <div class="search-trail-cue-kicker">Connection cue</div>
  <div class="search-trail-cue-title">Search opens a trail.</div>
  <div class="search-trail-cue-stage" aria-hidden="true">
    <span class="search-trail-cue-step" data-cue-stage="query">Query</span>
    <span class="search-trail-cue-step" data-cue-stage="anchor">Anchor</span>
    <span class="search-trail-cue-step" data-cue-stage="walk">Explore</span>
  </div>
  <div class="search-trail-cue-note">
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
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .search-trail-cue-kicker {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #4ecdc4;
  }
  .search-trail-cue-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #e0f0f0;
  }
  .search-trail-cue-stage {
    display: flex;
    gap: 0.4rem;
  }
  .search-trail-cue-step {
    font-size: 0.6rem;
    padding: 0.15rem 0.4rem;
    border-radius: 0.2rem;
    background: rgba(78, 205, 196, 0.1);
    color: #b0d0d0;
  }
  .search-trail-cue-note {
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.5);
    line-height: 1.4;
    overflow-wrap: break-word;
  }
</style>
