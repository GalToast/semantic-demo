<script lang="ts">
    import SearchChrome from './SearchChrome.svelte';
</script>

<section class="info-panel-surface info-panel-surface-search" data-surface-owner="search-results" data-ownership-lane="surface interaction content" aria-label="Search surface">
    <div class="search-container" role="search">
        <div class="search-chrome-slot" id="search-chrome-slot" data-svelte-mounted="search-chrome">
            <SearchChrome />
        </div>

        <div class="search-hint" id="search-status" hidden></div>
        
        <div class="search-results glass-light" id="search-results" role="region" aria-label="Search results"></div>

        <div class="mode-grid" id="mode-grid"></div>
    </div>
</section>
