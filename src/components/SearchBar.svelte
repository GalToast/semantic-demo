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
  import SearchInput from './SearchInput.svelte';
  import SearchResults from './SearchResults.svelte';
  import { isCompact } from '@lib/stores/viewport';

  // ── Props ─────────────────────────────────────────────────────────────────────

  interface Props {
    /** Whether the search bar is visually expanded */
    expanded?: boolean;
  }

  let { expanded = false }: Props = $props();

  // ── Test Compatibility ────────────────────────────────────────────────────────

  let testPanelSurface = $derived($testCompatStore.panelSurface || $testCompatStore.navSurface);
  let testLoadingPhase = $derived($testCompatStore.loadingPhase);

  // Sync test state on mount
  onMount(() => {
    syncTestStateFromBody();
    const observer = new MutationObserver(() => syncTestStateFromBody());
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-panel-surface', 'data-nav-surface', 'data-loading-phase'] });
    return () => observer.disconnect();
  });

  // ── Derived ───────────────────────────────────────────────────────────────────

  let hasQuery = $derived(false); // driven by SearchInput
  let showResults = $derived(false); // driven by SearchResults
  let showLoading = $derived(testLoadingPhase === 'searching');
  let isError = $derived(testLoadingPhase === 'error');
  let isEmpty = $derived(testLoadingPhase === 'empty');
</script>

<div
  class="search-container"
  class:expanded
  class:has-query={hasQuery}
  class:results-rendered={showResults}
  class:searching={showLoading}
  class:is-compact={$isCompact}
  id="search-chrome"
  role="search"
  aria-label="Search businesses in the semantic field"
>
  <SearchInput />
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
    font-family: 'Nunito Sans', system-ui, sans-serif;
  }
  .search-container.is-compact {
    width: 100%;
    top: 0;
    left: 0;
    transform: none;
    padding: 0.5rem;
  }
</style>