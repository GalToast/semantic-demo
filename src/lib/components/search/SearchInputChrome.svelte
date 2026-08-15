<!--
  @lib/components/search/SearchInputChrome.svelte — Search input chrome (icon, pills, buttons, status)
  Extracted from SearchInput.svelte to separate chrome from input logic.
  All DOM ids/classes preserved for contract test compatibility:
    .search-label, #semantic-lane-pill, .search-label-text, .search-back-btn,
    .search-icon, .search-shortcut-hint, #search-clear-btn,
    #search-cancel-btn, #search-status, #search-spinner, .search-input-wrap
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Snippet that renders the <input> element (owned by parent) */
    children: Snippet;
    /** Whether a non-empty query exists */
    hasQuery: boolean;
    /** Whether a search is in-flight (status === 'searching') */
    showLoading: boolean;
    /** Current search status: 'idle' | 'searching' | 'results' | 'error' | 'empty' */
    status: string;
    /** Whether results list has items (for status div hidden logic) */
    hasResults: boolean;
    /** Whether search surface is active (drives back-button visibility) */
    searchActive: boolean;
    /** Clear handler — aborts search + returns to overview */
    onClear: () => void;
    /** Clear query handler — wipes query but keeps input focused */
    onClearQuery: () => void;
    /** Cancel handler — aborts in-flight search, preserves query */
    onCancel: () => void;
  }

  let {
    children,
    hasQuery = false,
    showLoading = false,
    status = 'idle',
    hasResults = false,
    searchActive = false,
    onClear = () => {},
    onClearQuery = () => {},
    onCancel = () => {}
  }: Props = $props();
</script>

<!-- Search label row owns the mobile sheet toggle and the lane status affordance. -->
<div class="search-label">
  <span class="search-label-text">Search</span>
  <div id="semantic-lane-pill" class="semantic-lane-pill" data-state="healthy">
    <span class="lane-pill-dot"></span>
  </div>
</div>

<!-- Input row: back button, icon, input (via snippet), shortcut hint, clear, cancel -->
<div class="search-input-wrap" class:searching={showLoading} class:search-active={searchActive}>
  <button
    class="search-back-btn"
    onclick={onClear}
    aria-label="Back to overview"
    type="button"
    tabindex="0"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5M12 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
  <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="m15 15 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
  {@render children()}
  <kbd class="search-shortcut-hint" aria-hidden="true">/</kbd>
  <button
    class="search-clear"
    id="search-clear-btn"
    onclick={onClearQuery}
    aria-label="Clear query"
    type="button"
    hidden={!hasQuery}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  </button>
  {#if showLoading}
    <button class="search-cancel" id="search-cancel-btn" onclick={onCancel} aria-label="Cancel search" type="button">
      Cancel
    </button>
  {/if}
</div>

<!-- Status messages -->
<div class="search-status search-hint" id="search-status" role="status" aria-live="polite" hidden={status === 'idle' || status === 'results' || hasResults}>
  <span class="search-spinner" id="search-spinner" aria-hidden={status !== 'searching'}></span> <!-- audit-ok: template attribute, not transformed — bundle preserves native !== -->
  {#if status === 'error'}
    Search is unavailable right now.
  {:else if status === 'empty'}
    No matching businesses found.
  {:else if status === 'searching'}
    <!-- The search-trail cue overlay supplies the narrative "Scanning..." message. Keep the spinner here for local feedback without duplicating the announcement. -->
  {/if}
</div>

<style>
  /* ── Semantic lane pill ───────────────────────────────────────────────────── */
  .semantic-lane-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.4rem;
    background: rgba(var(--color-primary-alt-rgb), 0.08);
    border-radius: 0.25rem;
    margin-bottom: 0.25rem;
    /* lane pill is decorative; don't intercept pointer events from the
     * result list that visually sits below it. */
    pointer-events: none;
  }
  :global(.semantic-lane-pill[data-state='stuck']) {
    pointer-events: auto;
    cursor: pointer;
  }
  :global(.semantic-lane-pill[data-state='stuck']:focus-visible) {
    outline: 2px solid var(--color-primary-alt);
    outline-offset: 2px;
  }
  .lane-pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-primary-alt);
  }

  /* ── Search label ─────────────────────────────────────────────────────────── */
  .search-label-text {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(var(--color-primary-alt-rgb), 0.5);
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* label is decorative; let clicks fall through to whatever sits below */
    pointer-events: none;
  }

  :global(body.surface-focus-search .search-container .search-label) {
    display: none;
    visibility: hidden;
    pointer-events: none;
  }

  /* ── Input wrapper ────────────────────────────────────────────────────────── */
  .search-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .search-input-wrap:focus-within {
    border-color: rgba(var(--color-primary-alt-rgb), 0.6);
    box-shadow: 0 0 0 3px rgba(var(--color-primary-alt-rgb), 0.18);
  }
  /* Searching state — parent propagates via showLoading prop, applied as class on wrapper */
  .search-input-wrap.searching {
    border-color: rgba(var(--color-primary-alt-rgb), 0.35);
  }

  .search-icon {
    color: var(--color-primary-alt);
    flex-shrink: 0;
    opacity: 0.7;
  }

  /* ── Shortcut hint chip ──────────────────────────────────────────────────── */
  .search-shortcut-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    /* W48-UX: a bordered + filled box that visually echoed the search input
       border created a "3 stacked search boxes" reading on the search
       panel. Drop the border + fill so the hint reads as a typographic
       label, not a separate input. The kbd is still a11y-decorative
       (aria-hidden="true"). */
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.85); /* a11y-ok: decorative kbd hint, aria-hidden="true", pointer-events: none */
    font-family: 'Bricolage Grotesque', monospace;
    font-size: 11px;
    font-weight: 600;
    margin-left: auto;
    pointer-events: none;
    flex-shrink: 0;
    transition: opacity 0.2s ease;
  }
  .search-input-wrap:focus-within .search-shortcut-hint {
    opacity: 0;
  }
  /* Active search exposes back/clear/cancel controls. The shortcut is
     decorative here, and opacity: 0 alone would still reserve flex space on
     narrow screens. */
  .search-input-wrap.search-active .search-shortcut-hint {
    display: none;
  }

  /* Touch target 44px / WCAG 2.5.8 */
  .search-clear {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: none;
    color: rgba(224, 240, 240, 0.85); /* a11y-ok: decorative icon, aria-label on button */
    cursor: pointer;
    padding: 0;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }
  .search-clear:hover {
    color: var(--status-danger);
  }

  /* ── Back button (visible only in search state) ──────────────────────────── */
  /* Touch target 44px / WCAG 2.5.8 */
  .search-back-btn {
    display: none;               /* hidden in idle */
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.25);
    border-radius: 0.375rem;
    color: var(--color-primary-alt);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .search-back-btn:hover {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    border-color: rgba(var(--color-primary-alt-rgb), 0.5);
  }
  .search-back-btn:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
  }
  .search-back-btn svg {
    width: 14px;
    height: 14px;
  }
  /* Show back button only in search state — class applied to wrapper via searchActive prop */
  .search-input-wrap.search-active .search-back-btn {
    display: inline-flex;
  }

  /* ── Cancel button (visible only when searching) ────────────────────────── */
  .search-cancel {
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.4);
    color: var(--color-primary-alt);
    cursor: pointer;
    padding: 0.25rem 0.6rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: inherit;
    flex-shrink: 0;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .search-cancel:hover {
    background: rgba(var(--color-primary-alt-rgb), 0.12);
    border-color: rgba(var(--color-primary-alt-rgb), 0.7);
  }
  .search-cancel:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
  }

  /* ── Status messages ──────────────────────────────────────────────────────── */
  .search-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    text-align: center;
    padding: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-primary-alt);
    margin-top: 0.35rem;
    /* status is a11y-only (aria-live); clicks should fall through to the
     * result list which sits in the same visual region once the user has
     * a query. */
    pointer-events: none;
  }

  /* ── Spinner ──────────────────────────────────────────────────────────────── */
  .search-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-top-color: var(--color-primary-alt);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .search-spinner { animation: none; }
  }
</style>
