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
    /** Optional kicker pill (e.g. "Retry needed"). Card and overlay variants. */
    kicker?: string;
    /** Optional heading above the note (overlay variant only). */
    heading?: string;
    /** Optional footer text below the retry button (overlay variant only). */
    footer?: string;
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
    /** Visual variant: 'card' (search results), 'map' (map status bar), or 'overlay' (loading overlay). */
    variant?: 'card' | 'map' | 'overlay';
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
    technicalTestId,
    heading,
    footer
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
{:else if variant === 'overlay'}
  <!-- LoadingOverlay error branch: renders the exact DOM contract expected by
       contract tests (#loading-error-message, .loading-error-technical,
       .loading-retry-btn, .loading-foot) while centralizing the surface on
       the shared ErrorState component. -->
  {#if kicker}
    <div class="loading-kicker">{kicker}</div>
  {/if}
  {#if heading}
    <div class="loading-title">{heading}</div>
  {/if}
  <p id="loading-error-message" class="loading-note" role="alert" aria-live="assertive">
    <strong>{title}</strong>
    {#if detail}
      <br />{detail}
    {/if}
  </p>
  {#if technical}
    <details class="loading-error-technical">
      <summary>Technical details</summary>
      <code>{technical}</code>
    </details>
  {/if}
  <button class="loading-retry-btn" type="button" onclick={onRetry}>
    {retryLabel}
  </button>
  {#if footer}
    <p class="loading-foot">{footer}</p>
  {/if}
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

  /* LoadingOverlay error styling — moved here alongside the overlay variant so
     the extracted error DOM keeps the same look and scoped hover/focus states. */
  .loading-note {
    color: var(--status-danger, #ff6b6b);
  }
  .loading-retry-btn {
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--color-primary-alt, var(--color-primary-alt));
    border-radius: 0.375rem;
    background: transparent;
    color: var(--color-primary-alt, var(--color-primary-alt));
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .loading-error-technical {
    font-size: 0.7rem;
    color: rgba(255, 230, 230, 0.85);
    margin: 0.25rem 0 0.5rem;
  }
  .loading-error-technical summary {
    cursor: pointer;
    user-select: none;
    margin-bottom: 0.25rem;
  }
  .loading-error-technical code {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    color: rgba(255, 230, 230, 0.85); /* a11y-ok: technical-only, rendered inside <details> collapsed by default */
    word-break: break-word;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 0.25rem;
  }
  .loading-retry-btn:hover {
    background: var(--color-primary-alt, var(--color-primary-alt));
    color: #071018;
  }
  .loading-retry-btn:focus-visible {
    outline: 2px solid var(--color-primary-alt, var(--color-primary-alt));
    outline-offset: 2px;
  }
</style>
