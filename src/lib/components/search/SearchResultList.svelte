<!--
  SearchResultList.svelte — presentational component for the search results listbox.

  Renders the inline error banner (when present), results count, the listbox
  with result items, and the "Show more" control.

  DOM contract classes preserved:
    .search-error-inline-retry, .search-error-inline-msg, .search-error-inline-detail,
    .search-error-retry-btn, #search-results-count, .search-results-count-anchor,
    .search-results-count-all, .search-results-count-suffix, .search-results-count-shown,
    .search-results-count-divider, .search-results-count-hidden,
    #search-result-list, .search-result-list, .search-result-listitem,
    .search-show-more-btn

  Purely prop-driven: receives derived values and callbacks from the parent.
  No store subscriptions, no event publishing.
-->
<script lang="ts">
  import type { SearchResult } from '@lib/types/state';
  import type { FriendlyError } from '@lib/utils/error-messages';
  import SearchResultItem from '@components/SearchResultItem.svelte';

  interface Props {
    /** The visible slice of results. */
    resultSlice: SearchResult[];
    /** Index within resultSlice of the currently active (tabbable) result. */
    activeIndex: number;
    /** Render context with trimmedQuery for highlight. */
    renderContext: { trimmedQuery: string };
    /** Total number of results. */
    total: number;
    /** Number of currently visible results. */
    visibleCount: number;
    /** Whether the "Show more" button should appear. */
    showMore: boolean;
    /** Number of remaining hidden results. */
    remaining: number;
    /** Whether the panel surface is in "peek" variant (affects count display). */
    isPeek: boolean;
    /** Whether the inline error banner should be shown. */
    isInlineError: boolean;
    /** Pre-normalized friendly error for inline display. */
    friendlyError: FriendlyError | null;
    /** Raw search error (for query string in inline banner). */
    searchError: { query?: string } | null;
    /** Keyboard handler for the listbox container. */
    onContainerKeyDown: (_event: KeyboardEvent) => void;
    /** "Show more" click handler. */
    onShowMore: () => void;
    /** Per-result click handler. */
    onResultClick: (_index: number | string) => void;
    /** Retry handler for inline error banner. */
    onRetry: () => void;
  }

  let {
    resultSlice,
    activeIndex,
    renderContext,
    total,
    visibleCount,
    showMore,
    remaining,
    isPeek,
    isInlineError,
    friendlyError,
    searchError,
    onContainerKeyDown,
    onShowMore,
    onResultClick,
    onRetry
  }: Props = $props();
</script>

{#if isInlineError}
  <div class="search-error-inline-retry">
    <span class="search-error-inline-msg">
      <strong>{friendlyError?.title ?? 'Search is recovering'}</strong>
      for "<strong>{searchError?.query}</strong>".
      {#if friendlyError?.detail}<span class="search-error-inline-detail">{friendlyError.detail}</span>{/if}
    </span>
    <button class="search-error-retry-btn compact" type="button" aria-label={`Retry search for ${searchError?.query ?? ''}`} onclick={onRetry}>Retry</button>
  </div>
{/if}

<div id="search-results-count" class="search-results-count">
  {#if total === 1}
    <span class="search-results-count-anchor">Top match</span>
  {:else if isPeek && total > visibleCount}
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
  aria-activedescendant={activeIndex >= 0 ? `search-result-option-${activeIndex}` : undefined}
  aria-keyshortcuts="ArrowDown ArrowUp Home End Enter Escape"
  onkeydown={onContainerKeyDown}
>
  {#each resultSlice as result, order (result.index ?? order)}
    <SearchResultItem
      {result}
      {order}
      active={order === activeIndex}
      trimmedQuery={renderContext.trimmedQuery}
      onClick={() => onResultClick(result.index)}
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
    onclick={onShowMore}
  >
    Show {remaining} more results
  </button>
{/if}

<style>
  /*
   * Show-more button styles — moved here from SearchResults.svelte during
   * extraction so Svelte's scoped CSS applies correctly to the button
   * rendered by this component.
   */
  .search-show-more-btn {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 0.5rem;
    padding: 0 1rem;
    /* Sticky so the control stays in-frame at the bottom of the scrollable
       results surface and is always reachable when results remain. */
    position: sticky;
    bottom: 0;
    z-index: 1;
    background: rgba(var(--color-surface-chrome-rgb), 0.96);
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
</style>
