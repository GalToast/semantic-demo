<!--
  @components/SearchInput.svelte — Search input box

  Ported from:
    - js/modules/search-state.js (query tokenization, debounce)
    - js/modules/bindings/search.js (input event wiring)

  Extracted from SearchBar.svelte as the input-only component.
  Drives the search store with debounced queries.

  DOM ids/classes expected by contract tests:
    #search-input, .search-input-wrap, #search-clear-btn,
    .search-icon, #semantic-lane-pill
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    searchState,
    setSearchQuery,
    setSearchStatus,
    setSearchResults,
    setSearchError
  } from '@lib/stores/search.svelte';
  import { performSearch } from '@lib/search-engine';
  import {
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS
  } from '@lib/stores/navigation.svelte.ts';

  interface Props {
    /** Placeholder text for the input */
    placeholder?: string;
    /** Debounce delay in ms before dispatching the search action */
    debounceMs?: number;
    /** Whether the input is visually expanded */
    expanded?: boolean;
  }

  let {
    placeholder = 'Search (press /)',
    debounceMs = 300,
    expanded = false
  }: Props = $props();

  // ── Local state ───────────────────────────────────────────────────────────────

  let queryInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;
  let surfaceSwitchedToSearch = false;

  // ── Derived ───────────────────────────────────────────────────────────────────

  let status = $derived($searchState.status);
  let showLoading = $derived(status === 'searching');
  let hasQuery = $derived(queryInput.trim().length > 0);
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  let _activeResultId = $derived(
    $searchState.activeResultId != null
      ? `search-result-${Number($searchState.activeResultId)}`
      : undefined
  );

  $effect(() => {
    const storeQuery = $searchState.query ?? '';
    if (queryInput !== storeQuery) {
      queryInput = storeQuery;
    }
  });

  // ── Search dispatch ───────────────────────────────────────────────────────────

  function dispatchSearch(query: string): void {
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }

    const trimmed = query.trim();

    if (trimmed.length === 0) {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
      surfaceSwitchedToSearch = false;
      return;
    }

    if (trimmed.length < 2) {
      setSearchStatus('idle');
      if (surfaceSwitchedToSearch) {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'idle' });
        surfaceSwitchedToSearch = false;
      }
      return;
    }

    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;
    setSearchStatus('searching');
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' });
    surfaceSwitchedToSearch = true;

    performSearch(trimmed, signal)
      .then((results) => {
        if (searchAbortController !== null && signal === searchAbortController.signal) {
          setSearchResults(results);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (searchAbortController !== null && signal === searchAbortController.signal) {
          setSearchError(trimmed, err);
        }
      });
  }

  function debounceDispatch(query: string): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      dispatchSearch(query);
    }, debounceMs);
  }

  // ── Event handlers ────────────────────────────────────────────────────────────

  function handleInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    queryInput = target.value;
    setSearchQuery(queryInput);
    debounceDispatch(queryInput);
  }

  function handleClear(): void {
    queryInput = '';
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    surfaceSwitchedToSearch = false;
    requestAnimationFrame(() => {
      document.getElementById('search-input')?.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && queryInput.length > 0) {
      handleClear();
    } else if (e.key === 'ArrowDown') {
      // Move focus to first search result if results are visible
      const list = document.getElementById('search-result-list');
      if (list) {
        const first = list.querySelector('[data-order="0"]') as HTMLElement | null;
        first?.focus();
      }
    }
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      // Preserve a pending debounce across the intentional idle -> search
      // remount; the search store is global and should still settle.
    };
  });

  onMount(() => {
    const query = new URLSearchParams(window.location.search || '').get('q')?.trim();
    if (!query || query.length < 2) return;
    const storeQuery = ($searchState.query ?? '').trim();
    if (storeQuery === query && ['searching', 'results', 'error'].includes($searchState.status)) {
      queryInput = query;
      return;
    }
    queryInput = query;
    setSearchQuery(query);
    dispatchSearch(query);
  });
</script>

<div
  class="search-input-container"
  class:expanded
  class:has-query={hasQuery}
  class:searching={showLoading}
>
  <!-- Semantic lane pill (health indicator) -->
  <div id="semantic-lane-pill" class="semantic-lane-pill" data-state="healthy">
    <span class="lane-pill-dot"></span>
  </div>

  <!-- Search label -->
  <span class="search-label-text">Search</span>

  <!-- Input row -->
  <div class="search-input-wrap">
    <!-- Back button (visible only in search state) -->
    <button
      class="search-back-btn"
      onclick={handleClear}
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
    <input
      id="search-input"
      aria-label="Search businesses"
      type="search"
      class="search-input"
      {placeholder}
      value={queryInput}
      oninput={handleInput}
      onkeydown={handleKeydown}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      role="combobox"
      aria-controls="search-result-list"
      aria-haspopup="listbox"
      aria-expanded={hasQuery}
      aria-activedescendant={_activeResultId}
    />
    <kbd class="search-shortcut-hint" aria-hidden="true">/</kbd>
    {#if hasQuery}
      <button class="search-clear" id="search-clear-btn" onclick={handleClear} aria-label="Clear search" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>

  <div class="search-status search-hint" id="search-status" role="status" aria-live="polite" hidden={status === 'idle' || status === 'results' || $searchState.results.length > 0}>
    <span class="search-spinner" id="search-spinner" aria-hidden={status !== 'searching'}></span> <!-- audit-ok: template attribute, not transformed — bundle preserves native !== -->
    {status === 'searching'
      ? 'Searching semantic field...'
      : status === 'error'
        ? 'Search is unavailable right now.'
        : status === 'empty'
          ? 'No matching businesses found.'
          : ''}
  </div>
</div>

<style>
  /*
   * The .search-container wrapper in SearchBar.svelte already provides
   * position: absolute; z-index: var(--z-search). The input container
   * flows inside it; only the input field itself needs to be above the
   * canvas, not the status/label chrome. Decoupling lets the result
   * dropdown sit in the same flow as the input without being painted
   * over by a sibling stacking context.
   */
  .search-input-container {
    position: relative;
    z-index: var(--z-search, 100);
    width: min(420px, 90vw);
    font-family: 'Nunito Sans', system-ui, sans-serif;
  }

  /* ── Semantic lane pill ───────────────────────────────────────────────────── */
  .semantic-lane-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.4rem;
    background: rgba(78, 205, 196, 0.08);
    border-radius: 0.25rem;
    margin-bottom: 0.25rem;
    /* lane pill is decorative; don't intercept pointer events from the
     * result list that visually sits below it. */
    pointer-events: none;
  }
  .lane-pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ecdc4;
  }

  /* ── Search label ─────────────────────────────────────────────────────────── */
  .search-label-text {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(78, 205, 196, 0.5);
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
    /* label is decorative; let clicks fall through to whatever sits below */
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
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .search-input-wrap:focus-within {
    border-color: rgba(78, 205, 196, 0.6);
    box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.18);
  }
  .searching .search-input-wrap {
    border-color: rgba(78, 205, 196, 0.35);
  }

  .search-icon {
    color: #4ecdc4;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .search-input {
    flex: 1;
    min-height: 44px;
    background: none;
    border: none;
    outline: none;
    color: #e0f0f0;
    font-family: inherit;
    font-size: 0.875rem;
    min-width: 0;
  }
  .search-input:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.6);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }
  .search-input::placeholder {
    color: rgba(224, 240, 240, 0.35);
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  /* ── Shortcut hint chip ──────────────────────────────────────────────────── */
  .search-shortcut-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.55);
    font-family: 'Bricolage Grotesque', monospace;
    font-size: 12px;
    font-weight: 600;
    margin-left: auto;
    pointer-events: none;
    flex-shrink: 0;
    transition: opacity 0.2s ease;
  }
  .search-input-wrap:focus-within .search-shortcut-hint {
    opacity: 0;
  }

  .search-clear {
    background: none;
    border: none;
    color: rgba(224, 240, 240, 0.5);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }
  .search-clear:hover {
    color: #ff6b6b;
  }

  /* ── Back button (visible only in search state) ──────────────────────────── */
  .search-back-btn {
    display: none;               /* hidden in idle */
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: rgba(78, 205, 196, 0.1);
    border: 1px solid rgba(78, 205, 196, 0.25);
    border-radius: 0.375rem;
    color: #4ecdc4;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .search-back-btn:hover {
    background: rgba(78, 205, 196, 0.2);
    border-color: rgba(78, 205, 196, 0.5);
  }
  .search-back-btn:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.6);
    outline-offset: 2px;
  }
  .search-back-btn svg {
    width: 14px;
    height: 14px;
  }
  /* Show back button only in search state */
  :global(body[data-panel-surface='search']) .search-back-btn {
    display: inline-flex;
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
    color: #4ecdc4;
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
    border: 2px solid rgba(78, 205, 196, 0.2);
    border-top-color: #4ecdc4;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
