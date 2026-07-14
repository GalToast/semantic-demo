<!--
  @components/SearchInput.svelte — Search input box

  Ported from:
 - (query tokenization, debounce)
 - (input event wiring)

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
    runSearch,
    requestSearchInputFocus,
    consumeSearchInputFocusIntent
  } from '@lib/stores/search.svelte';
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { requestEntryFocus } from '@lib/focus/focus-coordinator';
  import { pendingSearch } from '@lib/stores/pending-search.svelte';
  import {
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS
  } from '@lib/stores/navigation.svelte.ts';
  import { publish, EVENTS } from '@lib/orchestration/event-bus';
  import { showExperienceToast } from '@lib/orchestration/toast';
  import { debugWarn } from '@lib/utils/debug';

  interface Props {
    /** Placeholder text for the input */
    placeholder?: string;
    /** Debounce delay in ms before dispatching the search action */
    debounceMs?: number;
    /** Whether the input is visually expanded */
    expanded?: boolean;
    /** Current nav surface — drives CSS instead of body attribute reads */
    surface?: string;
  }

  let {
    placeholder = 'Search (press /)',
    debounceMs = 300,
    expanded = false,
    surface = 'idle'
  }: Props = $props();

  // ── Local state ───────────────────────────────────────────────────────────────

  let queryInput = $state('');
  let inputEl: HTMLInputElement | undefined = undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;
  let searchStartTime = 0;
  let surfaceSwitchedToSearch = false;
  let _pendingEnterFocus = $state(false);

  // ── Exported actions ────────────────────────────────────────────────────────
  export function focusInput(): void {
    inputEl?.focus();
  }

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

  // ── Deferred splash-search fulfillment ───────────────────────────────────────
  // This component mounts early (during the idle-surface splash phase) but must
  // not run a search until the user opts in via the gate. The Splash component
  // stages an intent here on submit; once engineReady flips true we fulfill it
  // through the normal dispatch path. onMount's one-shot `?q=` read already ran
  // at boot, so the URL param alone is not enough for the splash-submit case.
  $effect(() => {
    const staged = pendingSearch.value;
    if (!engineReady.value || !staged) return;
    pendingSearch.consume();
    if (staged.length < 2) return;
    queryInput = staged;
    setSearchQuery(staged);
    dispatchSearch(staged);
    requestEntryFocus(() => inputEl, { signal: 'scene-ready' });
  });

  // ── Deferred Enter-focus fulfillment ───────────────────────────────────────-
  // W48-G (fix): previously the Enter handler synchronously focused the first
  // result via document.getElementById('search-result-list'). The list does
  // not exist yet because the search is async, so the focus call hit a
  // null list and silently did nothing. Defer the focus until the store
  // reports 'results' with at least one row, then focus the first item.
  $effect(() => {
    if (!_pendingEnterFocus) return;
    const status = $searchState.status;
    const results = $searchState.results;
    if (status === 'results' && results.length > 0) {
      _pendingEnterFocus = false;
      requestAnimationFrame(() => {
        const list = document.getElementById('search-result-list');
        if (list) {
          const first = list.querySelector('[data-order="0"]') as HTMLElement | null;
          first?.focus();
        }
      });
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
    searchStartTime = performance.now();
    const signal = searchAbortController.signal;
    setSearchStatus('searching');
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' });
    surfaceSwitchedToSearch = true;

    // Route through runSearch (the URL-hydration gateway) instead of calling
    // performSearch directly. This unifies the two call paths so that during
    // `?q=` URL hydration the same query doesn't fire two separate
    // performSearch invocations: the url-state path calls runSearch, and the
    // SearchInput input event handler now also calls runSearch. The
    // performSearch cache + pending-request layer still dedups the index
    // scan, but routing through one gateway keeps the state-update side
    // effects (setSearchResults, event bus publish) consistent across
    // entry points. PR-O5.
    runSearch(trimmed, signal)
      .catch((err: unknown) => {
        // runSearch already handles AbortError + setSearchError internally;
        // only catch non-AbortError so a hung promise doesn't hang the
        // dispatch chain. The intent here is to keep the Svelte store's
        // status updated by runSearch's own error path.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        debugWarn('SearchInput.dispatchSearch runSearch failed:', err);
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
    const value = target.value;
    // Defense-in-depth: if the input value already matches the store
    // query (e.g. url-state restored `?q=` while we're still mounted),
    // the reactive sync will update `queryInput` from the store and
    // the search has already been kicked off. Skip the redundant
    // setSearchQuery + debounceDispatch to avoid a second `runSearch`
    // call. See PR-O5 followup + tmp/performsearch-dup-audit-2026-07-01.md.
    if (value === ($searchState.query ?? '')) {
      queryInput = value;
      return;
    }
    queryInput = value;
    // User is typing — flag that the next mount (idle→search-surface swap)
    // must reclaim focus so the keystroke stream isn't interrupted.
    requestSearchInputFocus();
    setSearchQuery(queryInput);
    debounceDispatch(queryInput);
  }

  function handleClearQuery(): void {
    queryInput = '';
    setSearchQuery('');
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    setSearchStatus('idle');
    requestAnimationFrame(() => {
      inputEl?.focus();
    });
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
    // W52-UX-esc: Escape behavior is contextual:
    //  - If a search is currently in-flight (`showLoading` true), abort it
    //    AND keep the typed query so the user can edit and retry without
    //    re-typing. This matches the cancel button affordance.
    //  - Otherwise, clear the query via the standard wipe flow.
    if (e.key === 'Escape') {
      if (showLoading) {
        e.preventDefault();
        handleCancel();
        return;
      }
      if (queryInput.length > 0) {
        handleClear();
      }
    } else if (e.key === 'Enter') {
      // W48-G: pressing Enter in the search input used to do nothing (the
      // input isn't wrapped in a form). The 300ms debounce handles auto-fire
      // on typing, but impatient users who type-then-Enter saw no immediate
      // action. Fire the search immediately AND move focus to the first
      // result so the user can navigate with Enter / ArrowDown as in the
      // WAI-ARIA combobox/listbox pattern.
      e.preventDefault()
      const q = queryInput.trim()
      if (q.length > 0) {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        _pendingEnterFocus = true
        dispatchSearch(q)
      }
    } else if (e.key === 'ArrowDown') {
      // Move focus to first search result if results are visible
      const list = document.getElementById('search-result-list');
      if (list) {
        const first = list.querySelector('[data-order="0"]') as HTMLElement | null;
        first?.focus();
      }
    }
  }

  function handleCancel(): void {
    const cancelledQuery = queryInput.trim();
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const durationMs = searchStartTime > 0 ? Math.round(performance.now() - searchStartTime) : 0;
    setSearchStatus('idle');
    publish(EVENTS.SEARCH_CANCELLED, { query: cancelledQuery, durationMs });
    searchStartTime = 0;
    // W52-UX-cancel: surface a transient toast so the user has visible feedback
    // that their cancel took effect. Without this, the spinner + cancel button
    // both vanish in the same frame and the user is left wondering whether
    // anything happened. Only show if a query was actually in flight —
    // avoids noisy toasts on a stray Escape / click.
    if (cancelledQuery.length > 0) {
      showExperienceToast(
        'Search cancelled',
        'Cancelled mid-search. Try a different term or refine the query.'
      );
    }
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      // Cleanup runs on both remix-mount AND full unmount. The author-intent
      // note about preserving debounce across view swaps conflicts with the
      // reality of component destruction — be conservative here and clear.
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      searchAbortController?.abort();
    };
  });

  onMount(() => {
    // Restore focus if this input was just remounted mid-typing (the
    // idle→search-surface swap destroys the previously-focused input).
    if (consumeSearchInputFocusIntent()) {
      requestAnimationFrame(() => inputEl?.focus());
    }
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
  class:search-active={surface === 'search' || surface === 'focus-search'}
>
  <!-- Semantic lane pill (health indicator) -->
  <div id="semantic-lane-pill" class="semantic-lane-pill" data-state="healthy">
    <span class="lane-pill-dot"></span>
  </div>

  <!-- Search label (only shown when query is active) -->
  {#if hasQuery}
    <span class="search-label-text">Search</span>
  {/if}

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
      bind:this={inputEl}
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
      <button class="search-clear" id="search-clear-btn" onclick={handleClearQuery} aria-label="Clear query" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
    {#if showLoading}
      <button
        class="search-cancel"
        id="search-cancel-btn"
        onclick={handleCancel}
        aria-label="Cancel search"
        type="button"
      >
        Cancel
      </button>
    {/if}
  </div>

  <div class="search-status search-hint" id="search-status" role="status" aria-live="polite" hidden={status === 'idle' || status === 'results' || $searchState.results.length > 0}>
    <span class="search-spinner" id="search-spinner" aria-hidden={status !== 'searching'}></span> <!-- audit-ok: template attribute, not transformed — bundle preserves native !== -->
    {#if status === 'error'}
      Search is unavailable right now.
    {:else if status === 'empty'}
      No matching businesses found.
    {:else if status === 'searching'}
      <!-- The search-trail cue overlay supplies the narrative "Scanning..." message. Keep the spinner here for local feedback without duplicating the announcement. -->
    {/if}
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
     /* PR-L: never overflow the info-panel's content area. The base rule
        caps at 420px (or 90vw on narrow viewports), but when the search
        lives inside .info-panel-content (~284px wide on desktop), the
        420px overflows the parent. info-panel-content has overflow:hidden,
        so the overflow gets clipped — but a stale scrollLeft of ~88px
        drifts into view, making every text line look truncated on the
        left ("Top match" → "atch", "Angel Fire Coffee" → "e Coffee"). */
     max-width: 100%;
     font-family: 'Nunito Sans', system-ui, sans-serif;
   }

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
  .searching .search-input-wrap {
    border-color: rgba(var(--color-primary-alt-rgb), 0.35);
  }

  .search-icon {
    color: var(--color-primary-alt);
    flex-shrink: 0;
    opacity: 0.7;
  }

  .search-input {
    flex: 1;
    min-height: 44px;
    background: none;
    border: none;
    outline: none;
    color: var(--color-text-teal-light);
    font-family: inherit;
    font-size: 0.875rem;
    min-width: 0;
  }
  .search-input:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }
  /* W50-UX: placeholder color raised to 0.62 (≈ 5.4:1 on bg-surface-chrome
   * ~0.07 alpha over a dark canvas) so the search bar's affordance is
   * actually readable. Previous 0.35 was ≈ 2.5:1 — failed WCAG 2 AA. */
  .search-input::placeholder {
    color: rgba(224, 240, 240, 0.62);
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
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
    color: rgba(255, 255, 255, 0.45); /* a11y-ok: decorative kbd hint, aria-hidden="true", pointer-events: none */
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

  .search-clear {
    background: none;
    border: none;
    color: rgba(224, 240, 240, 0.5); /* a11y-ok: decorative icon, aria-label on button */
    cursor: pointer;
    padding: 0.25rem;
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
  .search-back-btn {
    display: none;               /* hidden in idle */
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
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
  /* Show back button only in search state */
  .search-active .search-back-btn {
    display: inline-flex;
  }

  /* ── Cancel button (visible only when searching) ────────────────────────── */
  .search-cancel {
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
