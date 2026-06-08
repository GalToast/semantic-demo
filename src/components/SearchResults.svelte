<!--
  @components/SearchResults.svelte — Search results list

  Ported from legacy SearchResultsList.svelte (js/modules/components/SearchResultsList.svelte)
  Full DOM contract parity for contract tests.

  DOM ids/classes expected by contract tests:
    #search-results-count, .search-results-count-anchor, .search-results-count-all,
    .search-results-count-suffix, .search-results-count-shown, .search-results-count-divider,
    .search-results-count-hidden, #search-result-list, .search-result-list,
    .search-result-listitem, .search-result-card, .search-result-row,
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
  import { searchState, hasResults, activeResult, setActiveResult, clearSearch } from '@lib/stores/search';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { isCompact } from '@lib/stores/viewport';
  import { searchVisibleCount as searchVisibleCountFn, setSearchVisibleCount } from '@lib/stores/search';
  import { activeClusterFilter } from '@lib/stores/filter';
  import { describeCluster } from '@lib/utils/ui-presentation';
  import { formatBusinessName } from '@lib/utils/dom-formatters';
  import { publish, EVENTS } from '@lib/event-bus';

  interface Props {
    /** Whether the results panel is visible */
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  // ── Types ──────────────────────────────────────────────────────────────────────

  interface SearchResult {
    index: number | string;
    point: {
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
  let searchError: { type: string; query?: string } | null = $derived(null as { type: string; query?: string } | null);
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
    const list: string[] = ['Coffee', 'Roof repair', 'Childcare', 'Dog friendly'];
    if ($activeClusterFilter !== null) {
      const label = describeCluster(Number($activeClusterFilter)).toLowerCase();
      if (!list.includes(label)) list.push(label);
    }
    return list;
  });

  let isFullError = $derived(searchError != null && searchError.type === 'full');
  let isInlineError = $derived(searchError != null && searchError.type === 'inline');

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

  function handleResultClick(index: number | string): void {
    const point = (results as unknown as SearchResult[])[Number(index)]?.point;
    if (point) {
      publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: Number(index) } as any);
    }
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
    const deps = {
      getSearchResultStrength: (r: SearchResult) => r.score || 0,
      getSearchResultStrengthLabel: (strength: number) => strength > 0.8 ? 'Strong' : strength > 0.5 ? 'Good' : 'Weak',
      buildSearchRankLabel: (order: number, _ctx: typeof renderContext) => order === 0 ? 'Anchor' : `#${order}`,
      getSearchResultCardClasses: () => 'search-result-card',
      buildSearchResultSnippet: (r: SearchResult) => r.point?.what || '',
      describeCluster,
      formatBusinessName: (name: string) => name
    };

    const strength = deps.getSearchResultStrength(result);
    const strengthLabel = deps.getSearchResultStrengthLabel(strength);
    const rankLabel = deps.buildSearchRankLabel(order, renderContext);
    const cardClasses = deps.getSearchResultCardClasses();
    const snippetText = deps.buildSearchResultSnippet(result);
    const contextText = result.point?.city || '';
    const businessName = deps.formatBusinessName(result.point?.name || '');

    return {
      index: result.index,
      order,
      strength,
      strengthLabel,
      rankLabel,
      cardClasses,
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
  <div class="search-results-wrapper">
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
      <div class="search-empty-state fade-in">
        <div class="search-empty-icon-wrap">
          <svg class="search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M16.5 16.5L21 21"></path>
            <path d="M7 11h8" stroke-opacity="0.5"></path>
          </svg>
        </div>
        <p class="search-empty-title">No direct matches found</p>
        <p class="search-empty-note">Try a broader term or one of these high-signal categories to open a new trail:</p>
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
          <span class="search-results-count-anchor">1 anchor</span>
        {:else if (summary as any)?.mode === 'peek'}
          <span class="search-results-count-anchor">Anchor</span>
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

      <div id="search-result-list" class="search-result-list" role="list" aria-label="Search result businesses">
        {#each resultSlice as result, order (result.index ?? order)}
          {@const item = itemModel(result, order)}
          <div class="search-result-listitem" role="listitem">
            <button
              class={item.cardClasses}
              id={`search-result-${Number(result.index)}`}
              data-index={result.index}
              data-order={order}
              type="button"
              tabindex="0"
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
                {#if result.point?.website || result.point?.email || result.point?.phone}
                  <div class="search-result-badges">
                    {#if result.point?.website}
                      <span class="search-result-badge website" title="Website available" aria-label="Website available">
                        <svg class="search-result-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="9"></circle>
                          <path d="M3 12h18"></path>
                          <path d="M12 3a13.5 13.5 0 0 1 0 18"></path>
                          <path d="M12 3a13.5 13.5 0 0 0 0 18"></path>
                        </svg>
                      </span>
                    {/if}
                    {#if result.point?.email}
                      <span class="search-result-badge email" title="Email available" aria-label="Email available">
                        <svg class="search-result-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect>
                          <path d="m4.5 7 7.5 6 7.5-6"></path>
                        </svg>
                      </span>
                    {/if}
                    {#if result.point?.phone}
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
