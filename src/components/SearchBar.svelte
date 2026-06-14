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
  import { testCompatStore, syncTestStateFromBody } from '@lib/stores/test-compat';
  import { searchState } from '@lib/stores/search';
  import SearchInput from './SearchInput.svelte';
  import SearchResults from './SearchResults.svelte';
  import { viewport, isCompact } from '@lib/stores/viewport';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the search bar is visually expanded */
    expanded?: boolean;
    /** Whether it is rendered inside the info panel sheet */
    panelContained?: boolean;
  }

  let { expanded = false, panelContained = false }: Props = $props();

  // ── Test Compatibility ────────────────────────────────────────────────────────

  let testPanelSurface = $derived(testCompatStore().panelSurface || testCompatStore().navSurface);
  let testLoadingPhase = $derived(testCompatStore().loadingPhase);

  // Sync test state on mount
  onMount(() => {
    syncTestStateFromBody();
    const observer = new MutationObserver(() => syncTestStateFromBody());
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-panel-surface', 'data-nav-surface', 'data-loading-phase'] });
    return () => observer.disconnect();
  });

  // ── Derived ───────────────────────────────────────────────────────────────────

  let hasQuery = $derived($searchState.hasQuery || $searchState.query.trim().length > 0);
  let showResults = $derived($searchState.resultsRendered || $searchState.results.length > 0);
  let isExpanded = $derived(expanded || hasQuery || showResults);
  let showLoading = $derived(testLoadingPhase === 'searching');
  let isError = $derived(testLoadingPhase === 'error');
  let isEmpty = $derived(testLoadingPhase === 'empty');
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
>
  <SearchInput expanded={isExpanded} />
  <SearchResults />
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
    left: auto;
    transform: none;
    width: 100%;
    z-index: 2;
    margin: -2rem -1rem 0;
    padding: 0 1rem;
  }

  :global(body[data-panel-surface='map-trail']) .search-container.info-panel-contained,
  :global(body[data-panel-surface='map-search'][data-trail-state='active'][data-journey-navigation-owner='map-trail-strip'])
    .search-container.info-panel-contained {
    position: fixed;
    left: 8px;
    right: 8px;
    top: calc(148px + env(safe-area-inset-top, 0px));
    bottom: auto;
    width: auto;
    max-width: none;
    max-height: min(34dvh, 288px);
    margin: 0;
    padding: 0 16px;
    transform: none;
    pointer-events: auto;
    z-index: var(--z-overlay-elevated, 90);
  }
</style>
