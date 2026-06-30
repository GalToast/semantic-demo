<!--
  HoverTooltip.svelte
  Extracted from App.svelte (Phase 2).
-->
<div id="hover-tooltip" class="hover-tooltip" role="tooltip" aria-hidden="true" hidden>
  <div id="tooltip-name" class="tooltip-name"></div>
  <div id="tooltip-what" class="tooltip-what"></div>
  <div id="tooltip-proximity" class="tooltip-proximity"></div>
</div>

<style>
  .tooltip-proximity {
    font-size: 0.65rem;
    color: rgba(var(--color-primary-alt-rgb), 0.75);
    margin-top: 0.35rem;
    line-height: 1.35;
    font-style: italic;
    opacity: 0.85;
  }
  .hover-tooltip {
    position: absolute;
    z-index: var(--z-tooltip, 900);
    pointer-events: none;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.18);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    max-width: 280px;
  }
  .tooltip-name {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text-teal-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tooltip-what {
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.6);
    margin-top: 0.2rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
