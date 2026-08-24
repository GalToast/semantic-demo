<!--
  SearchEmptyState.svelte — presentational component for the empty search results state.

  Renders the "no results" message, suggestion chips, and discovery tip.
  DOM contract classes: .search-empty-state, .search-empty-icon-wrap,
  .search-empty-icon, .search-empty-title, .search-empty-note,
  .search-suggestion-buttons, .search-suggestion-chip,
  .search-empty-discovery, .discovery-tag, .discovery-text.

  Purely prop-driven: receives the query string, suggestion list, and a
  click handler. No store subscriptions, no event publishing.
-->
<script lang="ts">
  interface Props {
    /** The search query that returned no results. */
    query: string;
    /** List of suggestion strings to show as chips. */
    suggestions: string[];
    /** Callback when a suggestion chip is clicked. */
    onSuggestionClick: (_suggestion: string) => void;
  }

  let { query, suggestions, onSuggestionClick }: Props = $props();
</script>

<div class="search-empty-state fade-in">
  <div class="search-empty-icon-wrap">
    <svg class="search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="11" cy="11" r="7"></circle>
      <path d="M16.5 16.5L21 21"></path>
      <path d="M7 11h8" stroke-opacity="0.5"></path>
    </svg>
  </div>
  <p class="search-empty-title">No results found for "{query}"</p>
  <p class="search-empty-note">Try clearing filters or searching nearby categories:</p>
  <div class="search-empty-suggestions">
    <div class="search-suggestion-buttons" role="group" aria-label="Search suggestions">
      {#each suggestions as suggestion}
        <button class="search-suggestion-chip" type="button" aria-label={`Search for ${suggestion}`} onclick={() => onSuggestionClick(suggestion)}>
          {suggestion}
        </button>
      {/each}
    </div>
  </div>
  <div class="search-empty-discovery">
    <span class="discovery-tag">Tip</span>
    <span class="discovery-text">Results match what businesses do, not just where they are. Try a category like "HVAC" or a vibe like "cozy."</span>
  </div>
</div>
