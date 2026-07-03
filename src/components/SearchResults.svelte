<!--
  @components/SearchResults.svelte — Search results list

 Ported from legacy SearchResultsList.svelte
  Full DOM contract parity for contract tests.

  DOM ids/classes expected by contract tests:
    #search-results-count, .search-results-count-anchor, .search-results-count-all,
    .search-results-count-suffix, .search-results-count-shown, .search-results-count-divider,
    .search-results-count-hidden, #search-result-list, .search-result-list,
    .search-result-listitem, .search-result, .search-result-row,
    .search-result-eyebrow, .search-result-rank,
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
  import { searchState, setActiveResult } from '@lib/stores/search.svelte';
  import { searchVisibleCount as searchVisibleCountFn, setSearchVisibleCount } from '@lib/stores/search.svelte';
  import { activeClusterFilter } from '@lib/stores/filter.svelte';
  import { getBusinessRecords } from '@lib/data-store';
  import { describeCluster } from '@lib/utils/ui-presentation';
  import { prefersReducedMotion } from '@lib/utils/environment';
  import { publish, EVENTS } from '@lib/orchestration/event-bus';
  import { showErrorToast, showExperienceToast } from '@lib/orchestration/toast';
  import { getSearchEngineEmptyStateSuggestions } from '@lib/search-engine';
  import { appState } from '@lib/state/app.svelte';
  import { friendlyErrorMessage } from '@lib/utils/error-messages';
  import type { SearchResult } from '@lib/types/state';
  import SearchResultItem from '@components/SearchResultItem.svelte';

  interface Props {
    /** Whether the results panel is visible */
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  // ── Derived ───────────────────────────────────────────────────────────────────

  let results = $derived($searchState.results);
  let status = $derived($searchState.status);
  let summary = $derived($searchState.summary);
  let activeId = $derived($searchState.activeResultId);
  let visibleCount = $derived(searchVisibleCountFn());
  let searchError = $derived(appState.searchState.searchError);
  let isSearching = $derived(status === 'searching');

  const resultSlice = $derived(results.slice(0, visibleCount));
  const total = $derived(results.length);
  const remaining = $derived(total - visibleCount);
  const showMore = $derived(total > visibleCount);

  const renderContext = $derived(summary?.renderContext || {
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
    // Note: avoid `!==` with reactive store values — Svelte 5 strict-mode
    // compiler bug inverts `!==` to `===`. Use `!= null` (Pattern 3).
    if ($activeClusterFilter != null) {
      const label = describeCluster(Number($activeClusterFilter)).toLowerCase();
      if (!list.includes(label)) list.push(label);
    }
    return list;
  });

  let isFullError = $derived(searchError != null && searchError.type === 'full');
  let isInlineError = $derived(searchError != null && searchError.type === 'inline');
  // W48-H: normalize the raw searchError.message ("Failed to fetch",
  // "NetworkError...", etc.) into user-friendly copy via the shared
  // friendlyErrorMessage() normalizer. Both the full error panel and the
  // inline retry banner use the same friendly title/detail.
  let friendlyError = $derived(isFullError || isInlineError ? friendlyErrorMessage(searchError?.message) : null);
  const isResultsSurfaceActive = $derived(isSearching || isFullError || isEmpty || total > 0);

  // ── Roving tabindex active index ──────────────────────────────────────────────

  /** Index within resultSlice of the currently active (tabbable) result. */
  let activeIndex = $derived.by(() => {
    if (resultSlice.length === 0) return -1;
    // Find the result matching the store's activeResultId
    const matchIdx = resultSlice.findIndex(
      (r) => r.id === activeId
    );
    return matchIdx >= 0 ? matchIdx : 0;
  });

  /** Set the active result by its position in the visible slice. */
  function setActiveResultByIndex(idx: number): void {
    const clamped = Math.max(0, Math.min(idx, resultSlice.length - 1));
    const result = resultSlice[clamped];
    if (result?.id) {
      setActiveResult(result.id);
    }
    // W48-E: scroll the active listitem into view. The listbox renders all
    // items in resultSlice but the wrapper has max-height: min(52vh, 420px)
    // with overflow-y: auto, so items past the cap are scrolled out of
    // view. Without this scrollIntoView, ArrowDown past the cap updates
    // aria-activedescendant but the user can't see what's now highlighted.
    // Block: 'nearest' keeps the scroll minimal (no yank if the item is
    // already visible); reduced-motion is honored for instant scroll.
    if (typeof document !== 'undefined') {
      const item = document.getElementById(`search-result-option-${clamped}`)
      if (item && typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({
          block: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        })
      }
    }
  }

  // ── Reset active index when query changes (A2-8) ──────────────────────────────
  // When the user types a new search query, the keyboard highlight should
  // reset so stale highlights from a previous query don't persist.
  let lastQuery = $state($searchState.query);
  $effect(() => {
    const currentQuery = $searchState.query;
    if (currentQuery !== lastQuery) {
      lastQuery = currentQuery;
      // Defer to next tick so resultSlice has updated with new results.
      void tick().then(() => {
        if (resultSlice.length > 0) {
          setActiveResultByIndex(0);
        }
      });
    }
  });

  // ── Screen reader live announcement for active result (WCAG 4.1.3) ──────────
  let liveAnnouncement = $state('');
  $effect(() => {
    // Search state changes take priority over keyboard nav announcements
    if (isSearching) {
      liveAnnouncement = 'Searching...';
      return;
    }
    if (isFullError) {
      const detail = searchError?.query ? `for "${searchError.query}"` : '';
      liveAnnouncement = `Search error ${detail ? detail + ' ' : ''}Retry or clear.`;
      return;
    }
    if (isEmpty) {
      const q = summary?.query ? `"${summary.query}"` : '';
      liveAnnouncement = `No results found ${q ? q + ' ' : ''}. Try a different term.`;
      return;
    }
    if (isInlineError) {
      const q = searchError?.query ? `"${searchError.query}"` : '';
      liveAnnouncement = `Search is recovering ${q ? q + ' ' : ''}.`;
      return;
    }
    
    // Keyboard navigation within results
    const idx = activeIndex;
    if (idx < 0 || resultSlice.length === 0) {
      liveAnnouncement = '';
      return;
    }
    const active = resultSlice[idx];
    if (active) {
      const pt = active.point ?? getBusinessRecords()[Number(active.index)] ?? null;
      const name = pt?.name ?? active.name ?? 'Unknown';
      const snippet = pt?.what ?? active.snippet ?? active.snippet ?? '';
      const context = pt?.city ?? active.category ?? '';
      const rank = idx === 0 ? 'Top match' : `Match ${idx + 1}`;
      liveAnnouncement = `Focus ${name}. ${rank}. ${snippet} ${context}. (${idx + 1} of ${resultSlice.length})`;
    }
  });

  // Sync DOM focus with the roving active index — but ONLY when the user is
  // already navigating within the result list (DOM focus inside the listbox).
  // Never steal focus from the search input while the user is typing: when
  // results render mid-keystroke, activeIndex flips -1→0 and an ungated effect
  // would yank focus to the first result, freezing the query. Entry into the
  // list is the explicit ArrowDown gesture in SearchInput.handleKeydown; this
  // effect only keeps focus in sync once that gesture has happened.
  $effect(() => {
    const idx = activeIndex;
    if (idx < 0) return;
    void tick().then(() => {
      const list = document.getElementById('search-result-list');
      // If focus is on the input (user typing) or outside the list, don't move it.
      if (!list || !list.contains(document.activeElement)) return;
      const btn = list.querySelector(`[data-order="${idx}"]`) as HTMLElement | null;
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
    } catch {
      // sessionStorage may be unavailable (Safari private mode, disabled storage).
      // Failure is non-fatal: the in-memory count is still accurate for this tab.
    }

    publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-more' });

    requestAnimationFrame(() => {
      const firstNewItem = document.querySelector(`[data-index="${results[firstNewIndex]?.index}"]`);
      if (firstNewItem) firstNewItem.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    });
  }

  function handleContainerKeyDown(event: KeyboardEvent): void {
    const count = resultSlice.length;
    if (count === 0) return;

    const key = event.key;

    // W48-D: only ArrowDown / ArrowUp navigate the list (the WAI-ARIA listbox
    // pattern). ArrowLeft / ArrowRight are intentionally NOT bound — they
    // would surprise users by re-mapping horizontal-arrow expectations
    // (cursor movement inside a search input, RTL flips, etc.). Home / End /
    // Enter / Escape keep their existing semantics.
    if (key === 'ArrowDown') {
      event.preventDefault();
      if (activeIndex < count - 1) {
        setActiveResultByIndex(activeIndex + 1);
      } else {
        // W48-D: at the bottom — don't silently wrap (a11y + UX surprise).
        // Mirror the canvas-keyboard-nav 'End of cluster' toast so the user
        // gets explicit feedback that they hit the boundary. Focus stays on
        // the last result; pressing Esc clears the search.
        showExperienceToast('End of results', 'Press Escape to clear search.');
      }
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      if (activeIndex === 0) {
        // Return focus to search input when moving up from first result
        const input = document.getElementById('search-input');
        if (input) {
          input.focus();
          return;
        }
      }
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
        const active = resultSlice[activeIndex];
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

  function handleResultClick(index: number | string): void {
    const result = results.find((item) => Number(item.index) === Number(index));
    const point = result ? getResultPoint(result) : null;
    if (point) {
      const actions = typeof window !== 'undefined' ? window.__APP_ACTIONS__ : undefined;
      // Publish focus-request event BEFORE calling the legacy focusOnNode so
      // triggers.ts can populate legacy navState (threadCandidates, etc.) before
      // the route-trace overlay refreshes in response to CAMERA_NODE_FOCUSED.
      publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: Number(index) });
      actions?.focusOnNode?.(Number(index), { fromSearchResult: true });
    } else if (result) {
      // W52-UX: previously the click silently did nothing when the underlying
      // record was missing (corrupt catalogue index). The user clicked a
      // result and got no feedback. Surface a warning so the user understands
      // why the click had no effect and can retry.
      showErrorToast(
        'Selection unavailable',
        'This result is missing its detail record. Please retry the search.'
      );
    }
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
      publish(EVENTS.SEARCH_CLEARED, { query: summary.query, preferCachedResults: false });
    }
  }

  function onClear(): void {
    publish(EVENTS.SEARCH_CLEARED);
  }
</script>

{#if visible}
  <!-- Screen reader live region for announcing active result during keyboard navigation (WCAG 4.1.3).
       aria-live="polite": this announces selection/navigiation position, not an error,
       so it must not interrupt (assertive is reserved for critical alerts/errors). -->
  <div class="sr-only" aria-live="polite" aria-atomic="true" role="status">
    {liveAnnouncement}
  </div>
  <div id="search-results" class="search-results-wrapper" class:active={isResultsSurfaceActive}>
    <!-- Loading state -->
    {#if isSearching}
      <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <div class="search-loading-text">Searching...</div>
      </div>
    {:else if isFullError}
      <div class="search-error-state">
        <span class="search-error-kicker">Retry needed</span>
        <div class="search-error-text">
          <strong>{friendlyError?.title ?? 'Something went wrong'}</strong>
          {#if friendlyError?.detail}
            <div class="search-error-detail-message">{friendlyError.detail}</div>
          {/if}
        </div>
        {#if friendlyError?.technical}
          <details class="search-error-technical" data-testid="search-error-detail">
            <summary>Technical details</summary>
            <code>{friendlyError.technical}</code>
          </details>
        {/if}
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
          <span class="discovery-tag">Tip</span>
          <span class="discovery-text">Results match what businesses do, not just where they are. Try a category like “HVAC” or a vibe like “cozy.”</span>
        </div>
      </div>
    {:else if total > 0}
      {#if isInlineError}
        <div class="search-error-inline-retry">
          <span class="search-error-inline-msg">
            <strong>{friendlyError?.title ?? 'Search is recovering'}</strong>
            for "<strong>{searchError?.query}</strong>".
            {#if friendlyError?.detail}<span class="search-error-inline-detail">{friendlyError.detail}</span>{/if}
          </span>
          <button class="search-error-retry-btn compact" type="button" aria-label={`Retry search for ${searchError?.query}`} onclick={onRetry}>Retry</button>
        </div>
      {/if}

      <div id="search-results-count" class="search-results-count">
        {#if total === 1}
          <span class="search-results-count-anchor">Top match</span>
        {:else if appState.composition.panelSurfaceDetail === 'peek' && total > visibleCount}
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
        aria-activedescendant={activeIndex >= 0 ? `search-result-${Number(resultSlice[activeIndex]?.index)}` : undefined}
        aria-keyshortcuts="ArrowDown ArrowUp Home End Enter Escape"
        onkeydown={handleContainerKeyDown}
      >
        {#each resultSlice as result, order (result.index ?? order)}
          <SearchResultItem
            {result}
            {order}
            active={order === activeIndex}
            trimmedQuery={renderContext.trimmedQuery}
            onClick={() => handleResultClick(result.index)}
          />
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
  /* Screen-reader-only utility class for live announcement region */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .search-results-wrapper {
    position: absolute;
    top: calc(1rem + 44px + 0.35rem);
    left: 0;
    right: 0;
    width: 100%;
    z-index: calc(var(--z-search, 100) - 1);
    max-height: min(52vh, 420px);
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    /* Visual styles previously on orphaned .search-results selector */
    background: rgba(var(--color-surface-chrome-rgb), 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: var(--radius-tight);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.15);
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--color-primary-alt-rgb), 0.2) transparent;
  }
  .search-results-wrapper::-webkit-scrollbar {
    width: 4px;
  }
  .search-results-wrapper::-webkit-scrollbar-thumb {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: 2px;
  }

  :global(.search-container.info-panel-contained) .search-results-wrapper {
    position: relative;
    top: auto;
    left: auto;
    right: auto;
    z-index: calc(var(--z-search, 100) + 1);
    margin-top: 0.5rem;
  }

  .search-show-more-btn {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 0.5rem;
    padding: 0 1rem;
    background: rgba(var(--color-primary-alt-rgb), 0.08);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: 0.4rem;
    color: rgba(224, 240, 240, 0.9);
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition:
        background 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease;
  }
  .search-show-more-btn:hover {
    background: rgba(var(--color-primary-alt-rgb), 0.16);
    border-color: rgba(var(--color-primary-alt-rgb), 0.34);
    color: var(--color-text-teal-light);
  }
  .search-show-more-btn:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.6);
    outline-offset: 2px;
  }

  /* Mobile: constrain results to prevent overlapping with mode chips */
  @media (max-width: 768px) {
    .search-results-wrapper {
      max-height: min(40vh, 320px);
    }
  }
</style>
