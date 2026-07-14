<!--
  @components/SearchBar.svelte — Search input + results (composed)

  Mirrors the legacy .search-container DOM structure for contract test compat.
  Composes SearchInput + SearchResults for full DOM contract coverage.

  DOM ids/classes expected by contract tests:
    .search-container, #search-input, #search-spinner, #search-clear-btn,
    #search-status, #search-results, .search-result,
    .search-label-text, .search-icon, #semantic-lane-pill
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { testCompatStore, syncTestStateFromBody } from '@lib/stores/test-compat.svelte.ts';
  import { searchState } from '@lib/stores/search.svelte';
  import { currentSurface } from '@lib/stores/navigation.svelte.ts';
  import SearchInput from './SearchInput.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { subscribe, EVENTS } from '@lib/orchestration/event-bus';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the search bar is visually expanded */
    expanded?: boolean;
    /** Whether it is rendered inside the info panel sheet */
    panelContained?: boolean;
  }

  let { expanded = false, panelContained = false }: Props = $props();

  // ── Test Compatibility ────────────────────────────────────────────────────────

  let testLoadingPhase = $derived($testCompatStore.loadingPhase);

  // Sync test state on mount (one-shot — tests set body attrs before mount)
  onMount(() => {
    syncTestStateFromBody();
  });

  // ── Derived ───────────────────────────────────────────────────────────────────

  let hasQuery = $derived($searchState.hasQuery || $searchState.query.trim().length > 0);
  let hasSearchSummary = $derived(Boolean($searchState.summary?.query?.trim()));
  let showResults = $derived($searchState.resultsRendered || $searchState.results.length > 0 || hasSearchSummary);
  let isExpanded = $derived(expanded || hasQuery || showResults);
  let showLoading = $derived(testLoadingPhase === 'searching');
  let isError = $derived(testLoadingPhase === 'error');
  let isStoreError = $derived($searchState.status === 'error');
  let isEmpty = $derived(testLoadingPhase === 'empty');

  let searchInputRef: SearchInput | undefined = $state(undefined);

  // Only loaded when search results/loading/error/empty state is active.
  // Defers ~27 KB chunk until user actually searches.
  type SearchResultsModule = typeof import('./SearchResults.svelte');
  let SearchResultsComponent: SearchResultsModule['default'] | null = $state(null);

  $effect(() => {
    if (showResults || showLoading || isError || isStoreError || isEmpty) {
      import('./SearchResults.svelte').then(mod => {
        SearchResultsComponent = mod.default;
      });
    } else {
      SearchResultsComponent = null;
    }
  });

  // W47-E / M10: dev-only mock-data banner. Shown ONLY when the search
  // engine genuinely falls back to the 20-business mock catalog
  // (`@lib/search/mock-catalog.ts`), signaled by SEARCH_MOCK_FALLBACK.
  // This is distinct from the common API-down case where the engine serves
  // the real local 8,406-record index — that path must NOT trip the banner
  // (it would be a misleading false-positive). The banner makes the genuine
  // mock fallback explicit so a developer doesn't mistake the 20-business
  // fake for the full dataset.
  //
  // Previously this polled sessionStorage every 750ms (timer sprawl) and
  // later keyed off generic api_unreachable flag which fired on ANY failed
  // API call — including the real local-index fallback. Now event-driven on
  // SEARCH_MOCK_FALLBACK (show) / SEARCH_SUCCESS (hide).
  let mockBannerVisible = $state(false)
  onMount(() => {
    mockBannerVisible = false
    const unsubMock = subscribe(EVENTS.SEARCH_MOCK_FALLBACK, () => {
      mockBannerVisible = true
    })
    const unsubSuccess = subscribe(EVENTS.SEARCH_SUCCESS, () => {
      mockBannerVisible = false
    })
    return () => {
      unsubMock()
      unsubSuccess()
    }
  })
</script>

<div
  class="search-container"
  class:expanded={isExpanded}
  class:has-query={hasQuery}
  class:results-rendered={showResults}
  class:searching={showLoading}
  class:is-compact={$viewport.isCompact}
  class:info-panel-contained={panelContained}
  role="search"
  aria-label="Search businesses"
  onpointerdown={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  {#if mockBannerVisible}
    <div
      class="mock-banner"
      role="status"
      data-testid="mock-banner"
      title="Demo data: search is using a 20-business mock catalog. Append ?staticDev=0 for the real API."
    >
      <strong>Demo data:</strong> search is using a 20-business mock catalog.
      Append <code>?staticDev=0</code> for the real API.
    </div>
  {/if}
  <SearchInput bind:this={searchInputRef} expanded={isExpanded} surface={currentSurface()} />
  {#if SearchResultsComponent}
    <SearchResultsComponent />
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
    min-height: 44px;
    font-family: 'Nunito Sans', system-ui, sans-serif;
  }
  .search-container.is-compact {
    width: calc(100% - 1rem);
    top: calc(7.25rem + env(safe-area-inset-top, 0px));
    left: 0.5rem;
    transform: none;
    padding: 0;
  }
  .search-container.info-panel-contained {
    position: sticky;
    top: 0;
    left: 0;
    transform: none;
    width: 100%;
    z-index: var(--z-search-bar, 2);
    margin: -1rem -1rem 0 0;
    padding: 0 1rem;
  }

  /* W48-UX: search-panel inner elements (search-input-wrap + search-results)
     each have their own borders; the outer container border created a
     "3 stacked search boxes" visual when all three nested borders are
     visible at once. Drop the outer container border + background when
     the container is inside an info panel — the inner elements provide
     sufficient surface distinction. */
  .search-container.info-panel-contained {
    border: none;
    background: transparent;
    padding: 0;
  }

  /* W47-E: dev-only mock-data banner. W48-UX compact to a single-line
     status pill so it doesn't displace the search layout (the previous
     multi-line version took ~150px and clipped the "Top match" label
     below). The full diagnostic text lives in the title attribute for
     hover / screen-reader access. */
  .mock-banner {
    background: rgba(255, 193, 7, 0.16);
    border: 1px solid rgba(255, 193, 7, 0.5);
    color: rgba(255, 224, 130, 0.96);
    font-size: 0.7rem;
    line-height: 1.3;
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    margin-bottom: 0.4rem;
    font-family: 'Nunito Sans', system-ui, sans-serif;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mock-banner strong {
    color: rgba(255, 224, 130, 1);
    letter-spacing: 0.04em;
  }
  .mock-banner code {
    background: rgba(0, 0, 0, 0.32);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    font-size: 0.95em;
    color: rgba(255, 224, 130, 0.96);
  }
</style>
