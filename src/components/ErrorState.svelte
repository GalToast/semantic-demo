<!--
  @components/ErrorState.svelte — shared presentational error surface

  Extracted from the duplicated error UI previously inlined in
  SearchResults.svelte (card variant) and MapView.svelte (map variant).

  It is purely presentational: it receives already-normalized error text
  (title / detail / technical) plus retry / dismiss handlers. It does NOT
  derive errors, own state, or publish events — callers keep that ownership.

  Visual contract:
    - card variant renders the `.search-error-*` class names that the global
      `css/search.css` rules style (identical to the previous SearchResults
      inline block). No scoped CSS is needed for the card variant.
    - map variant renders the `.map-status-*` class names and ships its own
      scoped CSS (moved here from MapView.svelte) so the dark-theme look is
      byte-for-byte identical to the previous MapView error branch.
-->
<script lang="ts">
  interface Props {
    /** Error title (required). */
    title: string;
    /** Optional secondary message under the title (null and undefined both treated as absent). */
    detail?: string | null;
    /** Optional technical detail string shown in a collapsible <details> (null/undefined treated as absent). */
    technical?: string | null;
    /** Optional kicker pill (e.g. "Retry needed"). Card variant only. */
    kicker?: string;
    /** Retry button label. */
    retryLabel?: string;
    /** Retry button click handler. */
    onRetry?: () => void;
    /** Optional dismiss/clear button label. Omit onRetry/onDismiss to hide. */
    dismissLabel?: string;
    /** Retry button aria-label (when the visible label alone is not enough). */
    retryAriaLabel?: string;
    /** Dismiss button aria-label. */
    dismissAriaLabel?: string;
    /** Dismiss/clear button click handler. Omit to hide the second button. */
    onDismiss?: () => void;
    /** Adds the `.compact` modifier to the retry button (card variant). */
    compact?: boolean;
    /** Visual variant: 'card' (search results) or 'map' (map status bar). */
    variant?: 'card' | 'map';
    /** Optional data-testid on the technical <details> block. */
    technicalTestId?: string;
  }

  let {
    title,
    detail,
    technical,
    kicker,
    retryLabel = 'Retry',
    onRetry,
    dismissLabel,
    retryAriaLabel,
    dismissAriaLabel,
    onDismiss,
    compact = false,
    variant = 'card',
    technicalTestId
  }: Props = $props();
</script>

{#if variant === 'map'}
  <!-- MapView error branch: two siblings so .map-status flex layout (in
       MapView.svelte) treats them exactly like the previous inline markup. -->
  <div class="map-status-text">
    <strong>{title}</strong>
    {#if detail}
      <div class="map-status-detail">{detail}</div>
    {/if}
    {#if technical}
      <details class="map-status-technical">
        <summary>Technical details</summary>
        <code>{technical}</code>
      </details>
    {/if}
  </div>
  <button class="map-retry-btn" type="button" onclick={onRetry}>{retryLabel}</button>
{:else}
  <div class="search-error-state">
    {#if kicker}
      <span class="search-error-kicker">{kicker}</span>
    {/if}
    <div class="search-error-text">
      <strong>{title}</strong>
      {#if detail}
        <div class="search-error-detail-message">{detail}</div>
      {/if}
    </div>
    {#if technical}
      <details class="search-error-technical" data-testid={technicalTestId}>
        <summary>Technical details</summary>
        <code>{technical}</code>
      </details>
    {/if}
    <div class="search-error-actions">
      <button class="search-error-retry-btn" class:compact type="button" aria-label={retryAriaLabel} onclick={onRetry}>
        {retryLabel}
      </button>
      {#if onDismiss}
        <button class="search-error-dismiss-btn" type="button" aria-label={dismissAriaLabel} onclick={onDismiss}>
          {dismissLabel ?? 'Clear'}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* MapView error styling — moved here from MapView.svelte so the extracted
     error DOM keeps its exact dark-theme appearance. Scoped to this component
     because Svelte's scoped CSS cannot reach across the component boundary
     into MapView.svelte's <style> block. */

  .map-status-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    text-align: left;
  }

  .map-status-detail {
    font-size: 0.78rem;
    color: rgba(255, 225, 209, 0.85);
    font-weight: 400;
  }

  .map-status-technical {
    font-size: 0.65rem;
    margin-top: 0.25rem;
  }

  .map-status-technical summary {
    cursor: pointer;
    user-select: none;
    color: rgba(255, 225, 209, 0.85);
  }

  .map-status-technical code {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 0.6rem;
    color: rgba(255, 225, 209, 0.85); /* a11y-ok: technical-only, rendered inside <details> collapsed by default */
    word-break: break-word;
    margin-top: 0.2rem;
  }

  .map-retry-btn {
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid rgba(126, 231, 219, 0.35);
    border-radius: 8px;
    background: rgba(10, 23, 29, 0.78);
    color: #eafffb;
    font: inherit;
    font-size: 0.84rem;
    font-weight: 800;
    letter-spacing: 0;
    cursor: pointer;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      transform 0.16s ease;
  }

  .map-retry-btn:hover {
    background: rgba(17, 41, 47, 0.92);
    border-color: rgba(126, 231, 219, 0.64);
    transform: translateY(-1px);
  }
</style>
