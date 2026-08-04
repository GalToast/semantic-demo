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

  Chrome (pill, buttons, icons, spinner, status) is delegated to
  SearchInputChrome.svelte — this component owns the input element
  and all keyboard/compose/debounce/search-dispatch logic.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    searchState,
    setSearchQuery,
    requestSearchInputFocus,
    consumeSearchInputFocusIntent
  } from '@lib/stores/search.svelte';
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { isDataReady } from '@lib/data-store';
  import { pendingSearch } from '@lib/stores/pending-search.svelte';
  import { SearchDispatch } from '@lib/search/search-dispatch';
  import SearchInputChrome from '@lib/components/search/SearchInputChrome.svelte';

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
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let dispatch = new SearchDispatch({
    onQuerySet: (q) => { queryInput = q; },
    getInputElement: () => inputEl
  });
  let _pendingEnterFocus = $state(false);

  // ── Exported actions ────────────────────────────────────────────────────────
  export function focusInput(): void {
    inputEl?.focus();
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  let status = $derived($searchState.status);
  let showLoading = $derived(status === 'searching');
  let hasQuery = $derived(queryInput.trim().length > 0);
  let hasResults = $derived($searchState.results.length > 0);
  let searchActive = $derived(surface === 'search' || surface === 'focus-search');
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
    dispatch.fulfillPending(pendingSearch.value, engineReady.value);
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
  // Orchestrated by SearchDispatch (src/lib/search/search-dispatch.ts).

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
    dispatch.debounceDispatch(queryInput, debounceMs);
  }

  function handleClearQuery(): void {
    queryInput = '';
    setSearchQuery('');
    dispatch.clearQuery();
    requestAnimationFrame(() => {
      inputEl?.focus();
    });
  }

  function handleClear(): void {
    queryInput = '';
    dispatch.clear();
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
        dispatch.cancelDebounce()
        _pendingEnterFocus = true
        dispatch.dispatchSearch(q)
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
    dispatch.cancel(cancelledQuery);
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      // Cleanup runs on both remix-mount AND full unmount. The author-intent
      // note about preserving debounce across view swaps conflicts with the
      // reality of component destruction — be conservative here and clear.
      dispatch.dispose();
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
    // Guard against re-dispatching a query the URL-restore path already
    // fulfilled. 'empty' is included: a deep-link search that settled with
    // zero results must not fire a second API request from this mount.
    if (
      storeQuery === query &&
      ['searching', 'results', 'error', 'empty'].includes($searchState.status)
    ) {
      queryInput = query;
      return;
    }
    // Data-gate (deep-link ?q= render nondeterminism): performSearch has no
    // data-ready guard, so dispatching before initData() resolves searches the
    // not-yet-loaded local index → setResults([]) + status 'empty' + storeQuery
    // 'coffee'. That poisoned state makes the later URL-restore path (app-init
    // → applyUrlState → _restoreSearchFromParams, which DOES await initData and
    // owns the deep-link search) see isNew:false and wait-for-settle instead of
    // re-running, leaving the deep-link stuck with zero results — and handleInput's
    // redundant-fill guard (`value === storeQuery`) then skips a manual re-kick.
    // Deferring to the URL-restore path makes the deep-link search deterministic.
    // When data is already ready by mount time, dispatching here is safe.
    if (!get(isDataReady)) return;
    queryInput = query;
    setSearchQuery(query);
    dispatch.dispatchSearch(query);
  });
</script>

<div
  class="search-input-container"
  class:expanded
  class:has-query={hasQuery}
  class:searching={showLoading}
  class:search-active={searchActive}
>
  <SearchInputChrome
    {hasQuery}
    {showLoading}
    {status}
    {hasResults}
    {searchActive}
    onClear={handleClear}
    onClearQuery={handleClearQuery}
    onCancel={handleCancel}
  >
    {#snippet children()}
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
    {/snippet}
  </SearchInputChrome>
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

  .search-input {
    /* Input field (owned by this component; chrome delegated to SearchInputChrome) */
    flex: 1;
    min-height: 44px;
    background: none;
    border: none;
    outline: none; /* a11y-ok: focus-visible fallback provided below */
    color: var(--color-text-teal-light);
    font-family: inherit;
    font-size: 0.875rem;
    /* W54-fix: override global `body .search-input { min-width: 44px; }` with
       at least 44px so the input can never shrink to zero in a flex context.
       The previous `min-width: 0` allowed the flex container to collapse the
       input to zero width when the parent container had dimensions under
       certain layout conditions (panel-contained search in info panel).
       This ensures the input stays above touch-target minimum. */
    min-width: 44px;
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
    color: rgba(224, 240, 240, 0.85);
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
  }
</style>
