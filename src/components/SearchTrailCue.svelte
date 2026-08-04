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
  <div id="search-trail-cue-title" class="search-trail-cue-title">Search found related businesses.</div>
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
    /* W47 audit round 4 (mobile-cue overlap): the original
       `var(--z-toast, 700)` resolved to 1200 (defined in z-layers.css),
       above every other interactive layer including search results at
       z-index: calc(var(--z-search, 100) - 1) = 99. On mobile, where the
       search panel is bottom-anchored at the same screen region as the
       cue, the cue rendered ON TOP of result cards and occluded Match 3
       until the user clicked "Show more". Fix: drop the cue to z-index 50,
       above canvas/threads (z=0/20) but below all interactive chrome
       (panels z=80, results z=99). Search results now win the overlap on
       mobile; the cue remains visible when no result list is on screen
       (intro beat). */
    z-index: var(--z-trail-cue);
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
  /* W48 mobile audit: the search-trail-cue originally anchored to
     bottom: 5rem — the same region as the bottom-anchored search panel
     on mobile. Even though z-index 50 keeps it behind result cards
     (z=99), the result cards have semi-transparent backgrounds and the
     cue text showed through. Instead of hiding the cue entirely,
     reposition it to the top of the viewport so it is genuinely visible
     on mobile without overlapping the bottom search panel or result
     cards. */
  @media (max-width: 768px) {
    .search-trail-cue:not([hidden]) {
      /* W53 vision-refresh issue #10: top:1rem placed the "Search opens a
         trail" title behind the notch / status bar on phones with a
         safe-area-inset-top, clipping the kicker + title text. Offset by
         the safe-area inset so the cue clears the top-of-screen chrome. */
      /* W58 mobile audit 2026-08-05: top:1rem left the cue (kicker y34-46,
         title y50-63, stage y69-87, span x33-358) underneath the header
         chrome — the JourneyCompass "Step Inside" chip (y18-62, right) and
         the SemanticOverlay "Manifold" badge (y68-81, center) rendered
         through the cue text (DOM-verified 12-54px overlaps, vision jury
         flagged garbled header text on mobile search). Offset the cue below
         the header zone (badge bottom ~81px) so it clears both. */
      top: calc(5.5rem + max(0px, env(safe-area-inset-top, 0px)));
      bottom: auto;
    }
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
    color: rgba(224, 240, 240, 0.85); /* caption-text — stronger contrast over the 3D scene */
    line-height: 1.4;
    overflow-wrap: break-word;
  }
</style>
