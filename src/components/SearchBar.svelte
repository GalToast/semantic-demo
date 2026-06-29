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

  // W47-E: dev-only mock-data banner. When the search API fails the engine
  // falls back to a local mock catalog (`@lib/search/mock-catalog.ts`) and
  // fires SEARCH_DEGRADED via the event bus. Without this banner a developer
  // searching in localhost sees the mock results and assumes they're real
  // data — easy to mistake a 20-business fake catalog for the full 8,406-
  // point Montgomery County dataset. The banner makes the fallback explicit.
  //
  // Previously this polled sessionStorage every 750ms. That was timer
  // sprawl: a single setInterval running forever just to flip one boolean.
  // Now we react to SEARCH_DEGRADED (show) / SEARCH_SUCCESS (hide) and
  // initialize from sessionStorage on mount for the page-reload case.
  let mockBannerVisible = $state(false)
  onMount(() => {
    try {
      mockBannerVisible =
        window.sessionStorage?.getItem('api_unreachable') === '1'
    } catch {
      mockBannerVisible = false
    }
    const unsubDegraded = subscribe(EVENTS.SEARCH_DEGRADED, () => {
      mockBannerVisible = true
    })
    const unsubSuccess = subscribe(EVENTS.SEARCH_SUCCESS, () => {
      mockBannerVisible = false
    })
    return () => {
      unsubDegraded()
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
  aria-label="Search businesses in the semantic field"
  onpointerdown={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  {#if mockBannerVisible}
    <div
      class="mock-banner"
      role="status"
      data-testid="mock-banner"
    >
      <strong>Showing demo data:</strong> the search API fell back to a local
      mock catalog (20 fake businesses across 4 categories: coffee, roof,
      childcare, dog). The 8,406-business Montgomery County dataset is not
      loaded. Append <code>?staticDev=0</code> to the URL to force the API,
      or clear <code>sessionStorage.api_unreachable</code> to retry.
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

  /* W47-E: dev-only mock-data banner. Sits above the search input as a
     small status pill so it's visible but doesn't displace layout. The
     cyan-on-amber palette signals "this is not the real data" without
     being alarming. */
  .mock-banner {
    background: rgba(255, 193, 7, 0.16);
    border: 1px solid rgba(255, 193, 7, 0.5);
    color: rgba(255, 224, 130, 0.96);
    font-size: 0.7rem;
    line-height: 1.4;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    margin-bottom: 0.45rem;
    font-family: 'Nunito Sans', system-ui, sans-serif;
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
