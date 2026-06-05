<!--
  @components/SearchBar.svelte — Search input + results

  Mirrors the legacy .search-container DOM structure for contract test compat.
  Reads/writes the search store, renders results/empty/error/loading states,
  supports keyboard navigation, debounced search dispatch, and mobile sheet mode.

  DOM ids/classes expected by contract tests:
    .search-container, #search-input, #search-spinner, #search-clear-btn,
    #search-status, #search-results, .search-result,
    .search-label-text, .search-icon, #semantic-lane-pill
-->
<script lang="ts">
  import { searchState, hasResults, setSearchQuery, setSearchResults, setSearchStatus, setActiveResult, clearSearch } from '@lib/stores/search';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { isCompact } from '@lib/stores/viewport';
  import { performSearch } from '@lib/search-engine';
  import type { SearchResult } from '@lib/types/state';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the search bar is visually expanded */
    expanded?: boolean;
    /** Placeholder text for the input */
    placeholder?: string;
    /** Debounce delay in ms before dispatching the search action */
    debounceMs?: number;
    /** Callback invoked when a search should fire */
    onSearch?: (query: string, signal: AbortSignal) => void;
  }

  let {
    expanded = false,
    placeholder = 'Search businesses...',
    debounceMs = 300,
    onSearch
  }: Props = $props();

  // ── Local state ───────────────────────────────────────────────────────────────

  let queryInput = $state('');
  let focusedIndex = $state(-1);
  let showSheet = $state(false);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;

  // ── Derived ───────────────────────────────────────────────────────────────────

  let activeId = $derived($searchState.activeResultId);
  let results = $derived($searchState.results);
  let status = $derived($searchState.status);
  let summary = $derived($searchState.summary);
  let hasQuery = $derived($searchState.hasQuery);
  let trimmedQuery = $derived(queryInput.trim());
  let isEmpty = $derived(status === 'empty' && hasQuery);
  let isError = $derived(status === 'error');
  let showResults = $derived(hasResults && status !== 'idle');
  let showLoading = $derived(status === 'searching');
  let resultCount = $derived(results.length);

  // ── Search dispatch ───────────────────────────────────────────────────────────

  function dispatchSearch(query: string): void {
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }

    const trimmed = query.trim();

    if (trimmed.length === 0) {
      clearSearch();
      return;
    }

    if (trimmed.length < 2) {
      setSearchStatus('idle');
      return;
    }

    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;
    setSearchStatus('searching');

    if (onSearch) {
      onSearch(trimmed, signal);
    } else {
      performSearch(trimmed, signal)
        .then((results) => {
          if (searchAbortController !== null && signal === searchAbortController.signal) {
            setSearchResults(results);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (searchAbortController !== null && signal === searchAbortController.signal) {
            setSearchStatus('error');
          }
        });
    }
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
    focusedIndex = -1;
    debounceDispatch(queryInput);
  }

  function handleClear(): void {
    queryInput = '';
    focusedIndex = -1;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    clearSearch();
    requestAnimationFrame(() => {
      document.getElementById('search-input')?.focus();
    });
  }

  function handleResultClick(index: number): void {
    if (index < 0 || index >= results.length) return;
    const result = results[index];
    if (!result) return;
    setActiveResult(result.id);
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: result.index });
  }

  function handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Escape': {
        if (queryInput.length > 0) {
          handleClear();
        }
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (resultCount > 0) {
          focusedIndex = (focusedIndex + 1) % resultCount;
          scrollResultIntoView(focusedIndex);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (resultCount > 0) {
          focusedIndex = focusedIndex <= 0 ? resultCount - 1 : focusedIndex - 1;
          scrollResultIntoView(focusedIndex);
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < resultCount) {
          handleResultClick(focusedIndex);
        }
        break;
      }
    }
  }

  function scrollResultIntoView(index: number): void {
    const container = document.getElementById('search-results');
    if (!container) return;
    const buttons = container.querySelectorAll<HTMLElement>('.search-result');
    buttons[index]?.scrollIntoView({ block: 'nearest' });
  }

  function toggleSheet(): void {
    showSheet = !showSheet;
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (searchAbortController) searchAbortController.abort();
    };
  });
</script>

<!--
  Wrapper: .search-container (matches legacy DOM for contract tests).
  Inside: search-icon, search-label-text, input, clear-btn, spinner, status, results.
-->
<div
  class="search-container"
  class:expanded
  class:has-query={hasQuery}
  class:results-rendered={showResults}
  class:searching={showLoading}
  class:is-compact={$isCompact}
  class:sheet-open={showSheet && $isCompact}
  id="search-chrome"
  role="search"
  aria-label="Search businesses in the semantic field"
>
  <!-- ── Semantic lane pill (health indicator) ────────────────────────────── -->
  <div id="semantic-lane-pill" class="semantic-lane-pill" data-state="healthy">
    <span class="lane-pill-dot"></span>
  </div>

  <!-- ── Search label ─────────────────────────────────────────────────────── -->
  <span class="search-label-text">Search</span>

  <!-- ── Input row ────────────────────────────────────────────────────────── -->
  <div class="search-input-wrap">
    <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="5.8" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="m15 15 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <input
      id="search-input"
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
      aria-label="Search businesses"
      aria-controls="search-results"
      aria-activedescendant={focusedIndex >= 0 ? results[focusedIndex]?.id ?? undefined : undefined}
    />
    {#if queryInput.length > 0}
      <button class="search-clear" id="search-clear-btn" onclick={handleClear} aria-label="Clear search" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
    {#if $isCompact}
      <button class="sheet-toggle" onclick={toggleSheet} aria-label="Toggle search results" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d={showSheet ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- ── Loading state ────────────────────────────────────────────────────── -->
  {#if showLoading}
    <div class="search-status" id="search-status" role="status" aria-live="polite">
      <span class="search-spinner" id="search-spinner"></span>
      Searching semantic field…
    </div>
  {/if}

  <!-- ── Error state ──────────────────────────────────────────────────────── -->
  {#if isError}
    <div class="search-status search-error" id="search-status" role="alert">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M12 8v4M12 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Search unavailable. Try a different query.
    </div>
  {/if}

  <!-- ── Empty state ──────────────────────────────────────────────────────── -->
  {#if isEmpty}
    <div class="search-status search-empty" id="search-status" role="status">
      No matches for "<span class="empty-query">{trimmedQuery}</span>"
    </div>
  {/if}

  <!-- ── Idle status ──────────────────────────────────────────────────────── -->
  {#if !showLoading && !isError && !isEmpty && !showResults}
    <div class="search-status search-hint" id="search-status" role="status">
      Type to search the semantic field
    </div>
  {/if}

  <!-- ── Summary bar ──────────────────────────────────────────────────────── -->
  {#if summary}
    <div class="search-summary" aria-live="polite">
      {summary.resultCount} {summary.resultCount === 1 ? 'match' : 'matches'}
      {#if summary.topScore > 0}
        <span class="summary-score">top score {summary.topScore.toFixed(2)}</span>
      {/if}
      {#if summary.summaryType !== 'semantic'}
        <span class="summary-type">{summary.summaryType}</span>
      {/if}
    </div>
  {/if}

  <!-- ── Results list ─────────────────────────────────────────────────────── -->
  {#if showResults}
    <div
      class="search-results active"
      id="search-results"
      role="listbox"
      aria-label="Search results"
      class:is-compact={$isCompact}
      class:sheet-open={showSheet && $isCompact}
    >
      {#each results as result, idx (result.id)}
        <button
          class="search-result"
          class:active={activeId === result.id}
          class:focused={focusedIndex === idx}
          id="result-{result.id}"
          role="option"
          aria-selected={activeId === result.id}
          onclick={() => handleResultClick(idx)}
          type="button"
        >
          <div class="result-main">
            <span class="result-name">{result.name}</span>
            <span class="result-score">{result.score.toFixed(2)}</span>
          </div>
          <div class="result-meta">
            {#if result.category}
              <span class="result-category">{result.category}</span>
            {/if}
            {#if result.snippet}
              <span class="result-snippet">{result.snippet}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* ── Container ────────────────────────────────────────────────────────────── */
  .search-container {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-search, 100);
    width: min(420px, 90vw);
    font-family: 'Nunito Sans', system-ui, sans-serif;
  }
  .search-container.is-compact {
    width: 100%;
    top: 0;
    left: 0;
    transform: none;
    padding: 0.5rem;
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
    box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.12);
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
    background: none;
    border: none;
    outline: none;
    color: #e0f0f0;
    font-family: inherit;
    font-size: 0.875rem;
    min-width: 0;
  }
  .search-input::placeholder {
    color: rgba(224, 240, 240, 0.35);
  }
  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .search-clear,
  .sheet-toggle {
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
  .search-clear:hover,
  .sheet-toggle:hover {
    color: #ff6b6b;
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
  }
  .search-error {
    color: #ff6b6b;
  }
  .search-empty {
    color: rgba(224, 240, 240, 0.45);
  }
  .search-hint {
    color: rgba(224, 240, 240, 0.3);
    font-style: italic;
  }
  .empty-query {
    color: #4ecdc4;
    font-style: italic;
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

  /* ── Summary bar ──────────────────────────────────────────────────────────── */
  .search-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.4);
    margin-top: 0.35rem;
  }
  .summary-score {
    font-family: 'JetBrains Mono', monospace;
    color: #96ceb4;
  }
  .summary-type {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
  }

  /* ── Results list ─────────────────────────────────────────────────────────── */
  .search-results {
    margin-top: 0.35rem;
    background: rgba(7, 16, 24, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 0.5rem;
    border: 1px solid rgba(78, 205, 196, 0.15);
    max-height: 320px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(78, 205, 196, 0.2) transparent;
  }
  .search-results::-webkit-scrollbar {
    width: 4px;
  }
  .search-results::-webkit-scrollbar-thumb {
    background: rgba(78, 205, 196, 0.2);
    border-radius: 2px;
  }
  .search-results.is-compact.sheet-open {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 55vh;
    border-radius: 0.75rem 0.75rem 0 0;
    border-bottom: none;
    z-index: 200;
  }

  /* ── Individual result row ────────────────────────────────────────────────── */
  .search-result {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    padding: 0.55rem 0.75rem;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(78, 205, 196, 0.06);
    color: #e0f0f0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: 0.8rem;
    transition: background 0.1s ease;
  }
  .search-result:last-child {
    border-bottom: none;
  }
  .search-result:hover,
  .search-result.focused {
    background: rgba(78, 205, 196, 0.08);
  }
  .search-result.active {
    background: rgba(78, 205, 196, 0.14);
    border-left: 2px solid #4ecdc4;
  }

  .result-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .result-name {
    flex: 1;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .result-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #96ceb4;
    flex-shrink: 0;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
  }
  .result-category {
    color: #4ecdc4;
    opacity: 0.8;
    white-space: nowrap;
  }
  .result-snippet {
    color: rgba(224, 240, 240, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }
</style>
