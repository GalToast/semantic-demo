<!--
  @components/SearchResults.svelte — Search results list

  Ported from legacy SearchResultsList.svelte (js/modules/components/SearchResultsList.svelte)
  Full DOM contract parity for contract tests.

  DOM ids/classes expected by contract tests:
    #search-results-count, .search-results-count-anchor, .search-results-count-all,
    .search-results-count-suffix, .search-results-count-shown, .search-results-count-divider,
    .search-results-count-hidden, #search-result-list, .search-result-list,
    .search-result-listitem, .search-result, .search-result-row,
    .search-result-eyebrow, .search-result-rank, .search-result-strength,
    .search-result-name, .search-result-match, .search-result-badges,
    .search-result-badge.website, .search-result-badge.email, .search-result-badge.phone,
    .search-result-what, .search-result-context, .search-result-bar,
    .search-show-more-btn, .search-empty-state, .search-empty-icon-wrap,
    .search-empty-icon, .search-empty-title, .search-empty-note,
    .search-suggestion-buttons, .search-suggestion-chip, .search-empty-discovery,
    .discovery-tag, .discovery-text, .search-error-state, .search-error-kicker,
    .search-error-text, .search-error-actions, .search-error-retry-btn,
    .search-error-dismiss-btn, .search-error-inline-retry, .search-error-inline-msg,
    .search-loading, .search-loading-spinner, .search-loading-text
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { searchState, hasResults, activeResult, setActiveResult, clearSearch } from '@lib/stores/search.svelte';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts';
  import { searchVisibleCount as searchVisibleCountFn, setSearchVisibleCount } from '@lib/stores/search.svelte';
  import { activeClusterFilter } from '@lib/stores/filter.svelte';
  import { getBusinessRecords } from '@lib/data-store';
  import { describeCluster } from '@lib/utils/ui-presentation';
  import { formatBusinessName } from '@lib/utils/dom-formatters';
  import { publish, EVENTS } from '@lib/event-bus';
  import { getSearchEngineEmptyStateSuggestions } from '@lib/search-engine';

  interface Props {
    /** Whether the results panel is visible */
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  // ── Types ──────────────────────────────────────────────────────────────────────

  interface SearchResult {
    id?: string;
    name?: string;
    index: number;
    category?: string;
    snippet?: string;
    point?: {
      name?: string;
      what?: string;
      cluster?: number;
      city?: string;
      website?: string;
      email?: string;
      phone?: string;
    };
    score?: number;
  }

  interface SearchSummary {
    query?: string;
    mode?: string;
    renderContext?: {
      trimmedQuery: string;
      topIndex: number | null;
      anchorIndex: number | null;
      topScore: number;
    };
  }

  interface SearchError {
    type: string;
    query?: string;
  }

  interface HighlightSegment {
    text: string;
    match: boolean;
  }

  interface SearchResultProps {
    index: number | string;
    order: number;
    strength: number;
    strengthLabel: string;
    rankLabel: string;
    cardClasses: string;
    point: NonNullable<SearchResult['point']>;
    snippetText: string;
    contextText: string;
    businessName: string;
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  let results = $derived($searchState.results);
  let status = $derived($searchState.status);
  let summary = $derived($searchState.summary);
  let hasQuery = $derived($searchState.hasQuery);
  let activeId = $derived($searchState.activeResultId);
  let visibleCount = $derived(searchVisibleCountFn());
  let searchError: { type: string; query?: string } | null = $derived(
    status === 'error' ? { type: 'full', query: $searchState.query } : null
  );
  let isSearching = $derived(status === 'searching');

  const resultSlice = $derived(results.slice(0, visibleCount) as any[]);
  const total = $derived(results.length);
  const remaining = $derived(total - visibleCount);
  const showMore = $derived(total > visibleCount);

  const renderContext = $derived((summary as any)?.renderContext || {
    trimmedQuery: '',
    topIndex: null,
    anchorIndex: null,
    topScore: 0
  });

  const isEmpty = $derived(!isSearching && total === 0 && summary?.query && !searchError);

  const suggestions = $derived.by(() => {
    // Top 5 categories from the live 8,406-record corpus, falling back to
    // the static "high-signal" starter set if the records haven't loaded.
    const liveSuggestions = getSearchEngineEmptyStateSuggestions();
    const list: string[] = liveSuggestions.length > 0
      ? liveSuggestions.slice(0, 5)
      : ['Coffee', 'Roof repair', 'Childcare', 'Dog friendly'];
    if ($activeClusterFilter !== null) {
      const label = describeCluster(Number($activeClusterFilter)).toLowerCase();
      if (!list.includes(label)) list.push(label);
    }
    return list;
  });

  let isFullError = $derived(searchError != null && searchError.type === 'full');
  let isInlineError = $derived(searchError != null && searchError.type === 'inline');

  // ── Roving tabindex active index ──────────────────────────────────────────────

  /** Index within resultSlice of the currently active (tabbable) result. */
  let activeIndex = $derived.by(() => {
    if (resultSlice.length === 0) return -1;
    // Find the result matching the store's activeResultId
    const matchIdx = (resultSlice as SearchResult[]).findIndex(
      (r) => r.id === activeId
    );
    return matchIdx >= 0 ? matchIdx : 0;
  });

  /** Set the active result by its position in the visible slice. */
  function setActiveResultByIndex(idx: number): void {
    const clamped = Math.max(0, Math.min(idx, resultSlice.length - 1));
    const result = (resultSlice as SearchResult[])[clamped];
    if (result?.id) {
      setActiveResult(result.id);
    }
  }

  // Sync DOM focus with the roving active index (runs after each render).
  $effect(() => {
    const idx = activeIndex;
    if (idx < 0) return;
    // Use tick() to ensure the DOM has updated before focusing.
    void tick().then(() => {
      const list = document.getElementById('search-result-list');
      const btn = list?.querySelector(
        `[data-order="${idx}"]`
      ) as HTMLElement | null;
      if (btn && document.activeElement !== btn) {
        btn.focus({ preventScroll: false });
      }
    });
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleShowMore(): void {
    const nextVisibleCount = total;
    const firstNewIndex = visibleCount;

    setSearchVisibleCount(nextVisibleCount);
    try {
      sessionStorage.setItem('searchVisibleCount', String(nextVisibleCount));
    } catch {}

    publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-more' });

    requestAnimationFrame(() => {
      const firstNewItem = document.querySelector(`[data-index="${(results as unknown as SearchResult[])[firstNewIndex]?.index}"]`);
      if (firstNewItem) firstNewItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function handleContainerKeyDown(event: KeyboardEvent): void {
    const count = resultSlice.length;
    if (count === 0) return;

    const key = event.key;

    if (key === 'ArrowDown' || key === 'ArrowRight') {
      event.preventDefault();
      setActiveResultByIndex(activeIndex < count - 1 ? activeIndex + 1 : 0);
    } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
      event.preventDefault();
      setActiveResultByIndex(activeIndex > 0 ? activeIndex - 1 : count - 1);
    } else if (key === 'Home') {
      event.preventDefault();
      setActiveResultByIndex(0);
    } else if (key === 'End') {
      event.preventDefault();
      setActiveResultByIndex(count - 1);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (activeIndex >= 0) {
        const active = (resultSlice as SearchResult[])[activeIndex];
        if (active) handleResultClick(active.index);
      }
    } else if (key === 'Escape') {
      event.preventDefault();
      onClear();
      // Return focus to the search input after clearing.
      requestAnimationFrame(() => {
        document.getElementById('search-input')?.focus();
      });
    }
    // Do NOT preventDefault for Tab — let Tab move to the next landmark.
  }

  function handleResultClick(index: number | string): void {
    const result = (results as unknown as SearchResult[]).find((item) => Number(item.index) === Number(index));
    const point = result ? getResultPoint(result) : null;
    if (point) {
      const actions = typeof window !== 'undefined'
        ? (window as unknown as {
            __APP_ACTIONS__?: {
              focusOnNode?: (nodeIndex: number, options?: Record<string, unknown>) => unknown;
            };
          }).__APP_ACTIONS__
        : undefined;
      // Publish focus-request event BEFORE calling the legacy focusOnNode so
      // triggers.ts can populate legacy navState (threadCandidates, etc.) before
      // the route-trace overlay refreshes in response to CAMERA_NODE_FOCUSED.
      publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: Number(index) } as any);
      actions?.focusOnNode?.(Number(index), { fromSearchResult: true });
    }
  }

  function getResultPoint(result: SearchResult): NonNullable<SearchResult['point']> | null {
    if (result.point) return result.point;
    const record = getBusinessRecords()[Number(result.index)];
    if (!record && !result.name) return null;
    return {
      name: record?.name ?? result.name ?? 'Unknown',
      what: record?.what ?? result.snippet ?? result.category ?? '',
      cluster: record?.cluster,
      city: record?.city ?? result.category ?? '',
      website: record?.website ?? undefined,
      email: record?.email ?? undefined,
      phone: record?.phone ?? undefined
    };
  }

  function highlightSegments(text: string | undefined, query: string | undefined): HighlightSegment[] {
    const safeText = String(text || '');
    const safeQuery = query === null || query === undefined ? '' : String(query);
    if (!safeText || !safeQuery) return [{ text: safeText, match: false }];

    const index = safeText.toLowerCase().indexOf(safeQuery.toLowerCase());
    if (index === -1) return [{ text: safeText, match: false }];

    return [
      { text: safeText.slice(0, index), match: false },
      { text: safeText.slice(index, index + safeQuery.length), match: true },
      { text: safeText.slice(index + safeQuery.length), match: false }
    ].filter((segment: HighlightSegment) => segment.text);
  }

  function itemModel(result: SearchResult, order: number): SearchResultProps & { highlight: HighlightSegment[]; animationDelay: string; ariaLabel: string } {
    const point = getResultPoint(result) ?? {
      name: result.name ?? 'Unknown',
      what: result.snippet ?? '',
      city: result.category ?? ''
    };
    const deps = {
      getSearchResultStrength: (r: SearchResult) => r.score || 0,
      getSearchResultStrengthLabel: (strength: number) => strength > 0.8 ? 'Strong match' : strength > 0.5 ? 'Good match' : 'Related',
      buildSearchRankLabel: (order: number, _ctx: typeof renderContext) => order === 0 ? 'Top match' : `Match ${order + 1}`,
      getSearchResultCardClasses: () => 'search-result',
      buildSearchResultSnippet: () => point.what || result.snippet || '',
      describeCluster,
      formatBusinessName
    };

    const strength = deps.getSearchResultStrength(result);
    const strengthLabel = deps.getSearchResultStrengthLabel(strength);
    const rankLabel = deps.buildSearchRankLabel(order, renderContext);
    const cardClasses = `${deps.getSearchResultCardClasses()} search-result-item`;
    const snippetText = deps.buildSearchResultSnippet();
    const contextText = point.city || result.category || '';
    const businessName = deps.formatBusinessName(point.name || result.name || 'Unknown');

    return {
      index: result.index,
      order,
      strength,
      strengthLabel,
      rankLabel,
      cardClasses,
      point,
      snippetText,
      contextText,
      businessName,
      highlight: highlightSegments(businessName, renderContext.trimmedQuery),
      animationDelay: `${Math.min(order * 32, 224)}ms`,
      ariaLabel: `Focus ${businessName}. ${rankLabel}. ${snippetText} ${contextText}.`
    };
  }

  function onSuggestionClick(suggestion: string): void {
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (input) {
      input.value = suggestion;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  }

  function onRetry(): void {
    if (summary?.query) {
      publish(EVENTS.SEARCH_CLEARED, { query: summary.query, preferCachedResults: false } as any);
    }
  }

  function onClear(): void {
    publish(EVENTS.SEARCH_CLEARED);
  }
</script>

{#if visible}
  <div id="search-results" class="search-results-wrapper" class:active={total > 0}>
    <!-- Loading state -->
    {#if isSearching}
      <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <div class="search-loading-text">Searching...</div>
      </div>
    {:else if isFullError}
      <div class="search-error-state" role="status" aria-live="polite">
        <span class="search-error-kicker">Retry needed</span>
        <div class="search-error-text">
          We could not finish "<strong>{searchError?.query}</strong>" just now. Retry the live search or clear it and keep exploring.
        </div>
        <div class="search-error-actions">
          <button class="search-error-retry-btn" type="button" aria-label={`Retry search for ${searchError?.query}`} onclick={onRetry}>Retry</button>
          <button class="search-error-dismiss-btn" type="button" aria-label="Clear search and dismiss" onclick={onClear}>Clear</button>
        </div>
      </div>
    {:else if isEmpty}
      <div class="search-empty-state fade-in" role="status" aria-live="polite">
        <div class="search-empty-icon-wrap">
          <svg class="search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M16.5 16.5L21 21"></path>
            <path d="M7 11h8" stroke-opacity="0.5"></path>
          </svg>
        </div>
        <p class="search-empty-title">No results found for "{summary?.query || ''}"</p>
        <p class="search-empty-note">Try clearing filters or searching nearby categories:</p>
        <div class="search-empty-suggestions">
          <div class="search-suggestion-buttons">
            {#each suggestions as suggestion}
              <button class="search-suggestion-chip" type="button" aria-label={`Try search for ${suggestion}`} onclick={() => onSuggestionClick(suggestion)}>
                {suggestion}
              </button>
            {/each}
          </div>
        </div>
        <div class="search-empty-discovery">
          <span class="discovery-tag">Pro Tip</span>
          <span class="discovery-text">The mycelium thrives on semantic relationships. Try searching for a specific trade like "HVAC" or a mood like "cozy".</span>
        </div>
      </div>
    {:else if total > 0}
      {#if isInlineError}
        <div class="search-error-inline-retry" role="status" aria-live="polite">
          <span class="search-error-inline-msg">
            Search is recovering for "<strong>{searchError?.query}</strong>".
          </span>
          <button class="search-error-retry-btn compact" type="button" aria-label={`Retry search for ${searchError?.query}`} onclick={onRetry}>Retry</button>
        </div>
      {/if}

      <div id="search-results-count" class="search-results-count" role="status" aria-live="polite" aria-atomic="true">
        {#if total === 1}
          <span class="search-results-count-anchor">Top match</span>
        {:else if (summary as any)?.mode === 'peek'}
          <span class="search-results-count-anchor">Top match</span>
          <span class="search-results-count-divider" aria-hidden="true">·</span>
          <span class="search-results-count-hidden">{total - visibleCount} more</span>
        {:else if visibleCount >= total}
          <span class="search-results-count-all">All {total}</span>
          <span class="search-results-count-suffix"> matches</span>
        {:else}
          <span class="search-results-count-shown">{visibleCount} of {total}</span>
          <span class="search-results-count-divider" aria-hidden="true">·</span>
          <span class="search-results-count-hidden">{total - visibleCount} behind</span>
        {/if}
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        id="search-result-list"
        class="search-result-list"
        role="listbox"
        tabindex="-1"
        aria-label="Search result businesses"
        aria-activedescendant={activeIndex >= 0 ? `search-result-${Number((resultSlice as SearchResult[])[activeIndex]?.index)}` : undefined}
        aria-keyshortcuts="ArrowDown ArrowUp ArrowLeft ArrowRight Home End Enter Escape"
        onkeydown={handleContainerKeyDown}
      >
        {#each resultSlice as result, order (result.index ?? order)}
          {@const item = itemModel(result, order)}
          <div class="search-result-listitem" role="option" id={`search-result-option-${order}`} aria-selected={order === activeIndex}>
            <button
              class={`${item.cardClasses}${order === activeIndex ? ' active' : ''}`}
              id={`search-result-${Number(result.index)}`}
              data-index={result.index}
              data-order={order}
              type="button"
              tabindex={order === activeIndex ? 0 : -1}
              aria-label={item.ariaLabel}
              style={`animation-delay: ${item.animationDelay}`}
              onclick={() => handleResultClick(result.index)}
            >
              <div class="search-result-row">
                <div class="search-result-eyebrow">
                  <span class="search-result-rank">{item.rankLabel}</span>
                  <span class="search-result-strength">{item.strengthLabel}</span>
                </div>
                <div class="search-result-name">
                  {#each item.highlight as segment}
                    {#if segment.match}
                      <mark class="search-result-match">{segment.text}</mark>
                    {:else}
                      {segment.text}
                    {/if}
                  {/each}
                </div>
                {#if item.point.website || item.point.email || item.point.phone}
                  <div class="search-result-badges">
                    {#if item.point.website}
                      <span class="search-result-badge website" title="Website available" aria-label="Website available">
                        <svg class="search-result-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="9"></circle>
                          <path d="M3 12h18"></path>
                          <path d="M12 3a13.5 13.5 0 0 1 0 18"></path>
                          <path d="M12 3a13.5 13.5 0 0 0 0 18"></path>
                        </svg>
                      </span>
                    {/if}
                    {#if item.point.email}
                      <span class="search-result-badge email" title="Email available" aria-label="Email available">
                        <svg class="search-result-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect>
                          <path d="m4.5 7 7.5 6 7.5-6"></path>
                        </svg>
                      </span>
                    {/if}
                    {#if item.point.phone}
                      <span class="search-result-badge phone" title="Phone available" aria-label="Phone available">
                        <svg class="search-result-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M7.5 4.5 10 7 8.4 9.1c1 2.2 2.3 3.5 4.5 4.5L15 12l2.5 2.5-.8 3.1c-.2.7-.9 1.1-1.6 1A12.5 12.5 0 0 1 5.4 8.9c-.1-.7.3-1.4 1-1.6l1.1-.3Z"></path>
                        </svg>
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="search-result-what">{item.snippetText}</div>
              <div class="search-result-context">{item.contextText}</div>
              <div class="search-result-bar">
                <span style={`width: ${item.strength}%`}></span>
              </div>
            </button>
          </div>
        {/each}
      </div>

      {#if showMore}
        <button
          class="search-show-more-btn"
          type="button"
          aria-label={`Show ${remaining} more search results`}
          aria-expanded="false"
          aria-controls="search-result-list"
          aria-describedby="search-results-count"
          onclick={handleShowMore}
        >
          Show {remaining} more results
        </button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /*
   * Anchor the result list directly under the search input.
   *
   * The parent .search-container is `position: absolute; top: 1rem; z-index: 100`
   * (see SearchBar.svelte). The input lives inside the same container, so
   * anchoring this wrapper to the container's top and offsetting by the
   * input's full height pins the dropdown visually below the input field.
   *
   * z-index sits one notch below --z-search so the result panel never covers
   * the input it belongs to.
   */
  .search-results-wrapper {
    position: absolute;
    top: calc(1rem + 44px + 0.35rem);
    left: 0;
    right: 0;
    width: 100%;
    z-index: calc(var(--z-search, 100) - 1);
    max-height: min(52vh, 420px);
    overflow-y: auto;
  }

  :global(.search-container.info-panel-contained) .search-results-wrapper {
    position: relative;
    top: auto;
    left: auto;
    right: auto;
    z-index: calc(var(--z-search, 100) + 1);
    margin-top: 0.5rem;
  }

  /* Mobile: constrain results to prevent overlapping with mode chips */
  @media (max-width: 768px) {
    .search-results-wrapper {
      max-height: min(40vh, 320px);
    }
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
