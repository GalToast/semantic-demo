<script lang="ts">
    import {
        searchResultsStore,
        searchSummaryStore,
        isSearchingStore,
        searchErrorStore,
        searchVisibleCountStore,
        activeClusterFilterStore
    } from '../stores.js';
    import {
        buildSearchRankLabel,
        buildSearchResultSnippet,
        getSearchResultCardClasses,
        getSearchResultStrength,
        getSearchResultStrengthLabel
    } from '../search-result-renderer.js';
    import { formatBusinessName } from '../utils/dom-formatters.js';
    import { describeCluster } from '../utils/ui-presentation.js';
    import { buildSearchResultProps } from '../view-models/search-results-view-model.js';
    import { publish, EVENTS } from '../event-bus.js';
    import { state } from '@lib/engine/state-bridge';

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

    interface HighlightSegment {
        text: string;
        match: boolean;
    }

    interface SearchResultsListProps {
        onSuggestionClick?: (suggestion: string) => void;
        onRetry?: () => void;
        onClear?: () => void;
    }

    let {
        onSuggestionClick = (suggestion: string) => {
            const input = document.getElementById('search-input') as HTMLInputElement | null;
            if (input) {
                input.value = suggestion;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            }
        },
        onRetry = () => {
            const summary: SearchSummary | null = $searchSummaryStore;
            if (summary?.query) {
                // SEARCH_REQUESTED is not in the EVENTS manifest (pre-existing gap);
                // publish as a raw string to preserve runtime behavior.
                publish('SEARCH_REQUESTED', { query: summary.query, preferCachedResults: false });
            }
        },
        onClear = () => {
            publish(EVENTS.SEARCH_CLEARED);
        }
    }: SearchResultsListProps = $props();

    const resultSlice = $derived<SearchResult[]>($searchResultsStore.slice(0, $searchVisibleCountStore));
    const total = $derived<number>($searchResultsStore.length);
    const remaining = $derived(total - $searchVisibleCountStore);
    const showMore = $derived(total > $searchVisibleCountStore);
    
    const renderContext = $derived($searchSummaryStore?.renderContext || {
        trimmedQuery: '',
        topIndex: null,
        anchorIndex: null,
        topScore: 0
    });

    const isEmpty = $derived(!$isSearchingStore && total === 0 && $searchSummaryStore?.query && !$searchErrorStore);

    const suggestions = $derived.by(() => {
        const list: string[] = ['Coffee', 'Roof repair', 'Childcare', 'Dog friendly'];
        if ($activeClusterFilterStore !== null) {
            const label = describeCluster($activeClusterFilterStore).toLowerCase();
            if (!list.includes(label)) list.push(label);
        }
        return list;
    });

    function handleShowMore(): void {
        const nextVisibleCount = total;
        const firstNewIndex = $searchVisibleCountStore;
        
        searchVisibleCountStore.set(nextVisibleCount);
        try {
            sessionStorage.setItem('searchVisibleCount', String(nextVisibleCount));
        } catch {}

        publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-more' });
        
        requestAnimationFrame(() => {
            const firstNewItem = document.querySelector(`[data-index="${($searchResultsStore as SearchResult[])[firstNewIndex]?.index}"]`);
            if (firstNewItem) firstNewItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    function handleResultClick(index: number | string): void {
        const point = (state as { points?: unknown[] }).points?.[index as number];
        if (point) {
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index });
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
        // The view model uses JSDoc types; bridge with any casts.
        const deps = {
            getSearchResultStrength,
            getSearchResultStrengthLabel,
            buildSearchRankLabel,
            getSearchResultCardClasses,
            buildSearchResultSnippet,
            describeCluster,
            formatBusinessName
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props: any = buildSearchResultProps(result as any, order, renderContext as any, deps as any);

        return {
            ...props,
            highlight: highlightSegments(props.businessName, renderContext.trimmedQuery),
            animationDelay: `${Math.min(order * 32, 224)}ms`,
            ariaLabel: `Focus ${props.businessName}. ${props.rankLabel}. ${props.snippetText} ${props.contextText}.`
        };
    }
</script>

{#if $isSearchingStore}
    <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <div class="search-loading-text">Searching...</div>
    </div>
{:else if $searchErrorStore && $searchErrorStore.type === 'full'}
    <div class="search-error-state" role="status" aria-live="polite">
        <span class="search-error-kicker">Retry needed</span>
        <div class="search-error-text">
            We could not finish "<strong>{$searchErrorStore.query}</strong>" just now. Retry the live search or clear it and keep exploring.
        </div>
        <div class="search-error-actions">
            <button class="search-error-retry-btn" type="button" aria-label={`Retry search for ${$searchErrorStore.query}`} onclick={onRetry}>Retry</button>
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
    {#if $searchErrorStore && $searchErrorStore.type === 'inline'}
        <div class="search-error-inline-retry" role="status" aria-live="polite">
            <span class="search-error-inline-msg">
                Search is recovering for "<strong>{$searchErrorStore.query}</strong>".
            </span>
            <button class="search-error-retry-btn compact" type="button" aria-label={`Retry search for ${$searchErrorStore.query}`} onclick={onRetry}>Retry</button>
        </div>
    {/if}

    <div id="search-results-count" class="search-results-count" role="status" aria-live="polite" aria-atomic="true">
        {#if total === 1}
            <span class="search-results-count-anchor">1 anchor</span>
        {:else if $searchSummaryStore?.mode === 'peek'}
            <span class="search-results-count-anchor">Anchor</span>
            <span class="search-results-count-divider" aria-hidden="true">·</span>
            <span class="search-results-count-hidden">{total - $searchVisibleCountStore} more</span>
        {:else if $searchVisibleCountStore >= total}
            <span class="search-results-count-all">All {total}</span>
            <span class="search-results-count-suffix"> matches</span>
        {:else}
            <span class="search-results-count-shown">{$searchVisibleCountStore} of {total}</span>
            <span class="search-results-count-divider" aria-hidden="true">·</span>
            <span class="search-results-count-hidden">{total - $searchVisibleCountStore} behind</span>
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
