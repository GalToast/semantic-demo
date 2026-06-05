<script>
    import { compositionStore } from '../stores.js';
</script>

<section class="info-panel-surface info-panel-surface-search" data-surface-owner="search-results" data-ownership-lane="surface interaction content" aria-label="Search surface">
    <div class="search-container" role="search">
        <div class="search-chrome-slot" id="search-chrome-slot"></div>

        <div class="search-hint" id="search-status" hidden></div>
        
        <div class="search-results glass-light" id="search-results" role="region" aria-label="Search results">
            <!-- SearchResultsList will be mounted here by the island script -->
        </div>

        <div class="mode-grid" id="mode-grid"></div>
    </div>
</section>
