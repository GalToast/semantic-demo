<script lang="ts">
  import { getBusinessRecords } from '@lib/data-store';
  import { describeCluster } from '@lib/utils/ui-presentation';
  import { formatBusinessName } from '@lib/utils/dom-formatters';
  import { humanizeBusinessName } from '@lib/business/humanize';
  import type { SearchResult } from '@lib/types/state';

  // ── Types (re-exported from canonical SearchResult in @lib/types/state) ──────
  //
  // The local SearchResult shape was previously duplicated here AND in
  // SearchResults.svelte. The local copy made every field optional except
  // `index`, which forced 5× `(resultSlice as SearchResult[])` casts at call
  // sites. The canonical @lib/types/state.SearchResult is structural-compatible
  // (it has the same fields with the same nullability), so we import it and
  // drop the casts. The `point` shape mirrors `SearchResultPoint` (same fields).
  //
  // This re-import keeps the file's contract:
  //   - `point` is typed as `SearchResultPoint | undefined` (canonical)
  //   - `SearchResultItem` props still take `point: NonNullable<SearchResult['point']>`
  //     because the search result list only renders items with a hydrated point.

  interface HighlightSegment {
    text: string;
    match: boolean;
  }

  interface SearchResultProps {
    index: number | string;
    order: number;
    strength: number;
    rankLabel: string;
    cardClasses: string;
    point: NonNullable<SearchResult['point']>;
    snippetText: string;
    contextText: string;
    businessName: string;
  }

  interface Props {
    result: SearchResult;
    order: number;
    active: boolean;
    trimmedQuery: string;
    onClick: () => void;
  }

  let { result, order, active, trimmedQuery, onClick }: Props = $props();

  // ── Helpers (ported from SearchResults.svelte) ───────────────────────────────

  function getResultPoint(resultItem: SearchResult): NonNullable<SearchResult['point']> | null {
    if (resultItem.point) return resultItem.point;
    const record = getBusinessRecords()[Number(resultItem.index)];
    if (!record && !resultItem.name) return null;
    return {
      name: record?.name ?? resultItem.name ?? 'Unknown',
      what: record?.what ?? resultItem.snippet ?? resultItem.category ?? '',
      cluster: record?.cluster,
      city: record?.city ?? resultItem.category ?? '',
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

  function itemModel(resultItem: SearchResult, orderIdx: number): SearchResultProps & { highlight: HighlightSegment[]; animationDelay: string; ariaLabel: string } {
    const point = getResultPoint(resultItem) ?? {
      name: resultItem.name ?? 'Unknown',
      what: resultItem.snippet ?? '',
      city: resultItem.category ?? ''
    };

    const deps = {
      getSearchResultStrength: (r: SearchResult) => r.score || 0,
      buildSearchRankLabel: (order: number) => order === 0 ? 'Top match' : `Match ${order + 1}`,
      getSearchResultCardClasses: () => 'search-result',
      buildSearchResultSnippet: () => point.what || resultItem.snippet || '',
      describeCluster,
      formatBusinessName
    };

    const strength = deps.getSearchResultStrength(resultItem);
    const rankLabel = deps.buildSearchRankLabel(orderIdx);
    const cardClasses = `${deps.getSearchResultCardClasses()} search-result-item`;
    const snippetText = deps.buildSearchResultSnippet();
    const contextText = point.city || resultItem.category || '';
    // Humanize via the full BusinessRecord lookup so the Legal name from
    // public_note is preferred over the slug; formatBusinessName is kept as
    // a final safety net if the helpers above ever need it back.
    const recordRef = getBusinessRecords()[Number(resultItem.index)];
    const businessName = humanizeBusinessName({
      name: point.name ?? recordRef?.name ?? resultItem.name ?? 'Unknown',
      public_note: recordRef?.public_note ?? ''
    });

    return {
      index: resultItem.index,
      order: orderIdx,
      strength,
      rankLabel,
      cardClasses,
      point,
      snippetText,
      contextText,
      businessName,
      highlight: highlightSegments(businessName, trimmedQuery),
      animationDelay: `${Math.min(orderIdx * 32, 224)}ms`,
      ariaLabel: `Focus ${businessName}. ${rankLabel}. ${snippetText} ${contextText}.`
    };
  }

  const item = $derived(itemModel(result, order));
</script>

<div class="search-result-listitem" role="option" id={`search-result-option-${order}`} aria-selected={active}>
  <button
    class={`${item.cardClasses}${active ? ' active' : ''}`}
    id={`search-result-${Number(result.index)}`}
    data-index={result.index}
    data-order={order}
    type="button"
    tabindex={active ? 0 : -1}
    aria-label={item.ariaLabel}
    style={`animation-delay: ${item.animationDelay}`}
    onclick={onClick}
  >
    <div class="search-result-row">
      <div class="search-result-eyebrow">
        <span class="search-result-rank">{item.rankLabel}</span>
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
