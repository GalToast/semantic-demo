<script lang="ts">
  /**
   * @lib/components/focus/SelectedMatchNarrative.svelte — Selected match narrative panel
   *
   * Renders the "Why this listing" narrative shown when a business is selected via
   * search or focus. Extracted from SelectedBusinessDetails.svelte for component
   * separation and contract-test ownership boundaries.
   *
   * DOM ids/classes expected by contract tests:
   *   #selected-match-panel, #selected-match-label, #selected-match-copy
   *   (prefixed with idPrefix when used from SelectedBusinessDetails)
   */

  interface Props {
    /** Narrative text explaining why this listing matched the search/focus */
    matchNarrative: string;
    /** Whether to show the panel (hidden when empty) */
    showMatchPanel: boolean;
    /** Prefix for DOM ids to support multiple instances (e.g. "selected-" vs "focus-") */
    idPrefix?: string;
  }

  let { matchNarrative = '', showMatchPanel = false, idPrefix = '' }: Props = $props();
</script>

{#if showMatchPanel && matchNarrative}
  <div
    class="selected-match-panel"
    id="{idPrefix}selected-match-panel"
  >
    <div class="selected-match-label" id="{idPrefix}selected-match-label">Why this listing</div>
    <div class="selected-match-copy" id="{idPrefix}selected-match-copy">{matchNarrative}</div>
  </div>
{/if}

<style>
  /* Mobile responsive overrides (<=768px).
     Desktop styles live in css/progressive_disclosure.css and css/layout_base.css
     as global selectors (body.surface-* .selected-match-panel, etc.).
     This scoped block only handles mobile typography and spacing. */
  @media (max-width: 768px) {
    .selected-match-panel {
      padding: var(--space-3);
    }

    .selected-match-label {
      font-size: var(--mobile-type-kicker);
    }

    .selected-match-copy {
      font-size: var(--mobile-type-body);
      line-height: var(--mobile-line-relaxed);
    }
  }
</style>