<!--
  @components/SearchResults.svelte — Search results list

  Ported from:
    - js/modules/search-state.js (result rendering)
    - js/modules/ui-renderers.js (result row layout)

  Extracted from SearchBar.svelte as the results-only component.
  Renders the result list, summary bar, empty/error states.

  DOM ids/classes expected by contract tests:
    #search-results, .search-result, .result-name, .result-score,
    .result-category, .result-snippet, #search-status
-->
<script lang="ts">
  import { searchState, hasResults, activeResult, setActiveResult, clearSearch } from '@lib/stores/search';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { isCompact } from '@lib/stores/viewport';

  interface Props {
    /** Whether the results panel is visible */
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  // ── Derived ───────────────────────────────────────────────────────────────────

  let results = $derived($searchState.results);
  let status = $derived($searchState.status);
  let summary = $derived($searchState.summary);
  let hasQuery = $derived($searchState.hasQuery);
  let activeId = $derived($searchState.activeResultId);

  let isEmpty = $derived(status === 'empty' && hasQuery);
  let isError = $derived(status === 'error');
  let showResults = $derived(hasResults && status !== 'idle');
  let showLoading = $derived(status === 'searching');

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleResultClick(index: number): void {
    if (index < 0 || index >= results.length) return;
    const result = results[index];
    if (!result) return;
    setActiveResult(result.id);
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: result.index });
  }
</script>

{#if visible}
  <div class="search-results-wrapper">
    <!-- Empty state -->
    {#if isEmpty}
      <div class="search-status search-empty" id="search-status" role="status">
        No matches found
      </div>
    {/if}

    <!-- Error state -->
    {#if isError}
      <div class="search-status search-error" id="search-status" role="alert">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 8v4M12 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Search unavailable. Try a different query.
      </div>
    {/if}

    <!-- Idle hint -->
    {#if !showLoading && !isError && !isEmpty && !showResults}
      <div class="search-status search-hint" id="search-status" role="status">
        Type to search the semantic field
      </div>
    {/if}

    <!-- Summary bar -->
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

    <!-- Results list -->
    {#if showResults}
      <div
        class="search-results"
        class:is-compact={$isCompact}
        id="search-results"
        role="listbox"
        aria-label="Search results"
      >
        {#each results as result, idx (result.id)}
          <button
            class="search-result"
            class:active={activeId === result.id}
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
{/if}

<style>
  .search-results-wrapper {
    margin-top: 0.35rem;
    width: min(420px, 90vw);
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

  /* ── Summary bar ──────────────────────────────────────────────────────────── */
  .search-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.4);
    margin-bottom: 0.35rem;
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
  .search-results.is-compact {
    max-height: 40vh;
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
    font-family: 'Nunito Sans', system-ui, sans-serif;
    font-size: 0.8rem;
    transition: background 0.1s ease;
  }
  .search-result:last-child {
    border-bottom: none;
  }
  .search-result:hover {
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
