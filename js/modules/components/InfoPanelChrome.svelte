<script>
    import { isInfoPanelOpenStore, isLegendPanelOpenStore, compositionStore } from '../stores.js';
    import { cancelMicroDemo } from '../micro-demo.js';
    import { closeLegendPanel } from '../legend-ui.js';
    import { isCompactFocusStageViewport } from '../utils/ui-presentation.js';

    import OverviewSurface from './InfoPanelOverviewSurface.svelte';
    import SearchSurface from './InfoPanelSearchSurface.svelte';
    import SelectionSurface from './InfoPanelSelectionSurface.svelte';
    import DiscoverySurface from './InfoPanelDiscoverySurface.svelte';

    let previouslyFocusedElement = null;

    const panelSurface = $derived($compositionStore.panelSurface);

    function togglePanel() {
        cancelMicroDemo('user-input');
        
        const nextState = !$isInfoPanelOpenStore;
        
        if (nextState) {
            previouslyFocusedElement = document.activeElement;
            if (isCompactFocusStageViewport()) {
                if ($isLegendPanelOpenStore) {
                    closeLegendPanel();
                    $isLegendPanelOpenStore = false;
                }
            }
        }
        
        $isInfoPanelOpenStore = nextState;
        
        if (!nextState && previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
            previouslyFocusedElement.focus({ preventScroll: true });
            previouslyFocusedElement = null;
        }
    }
    
    $effect(() => {
        document.body.dataset.focusPanelMode = $isInfoPanelOpenStore ? 'manual-panel' : 'manual-collapsed';
    });
</script>

<button class="panel-toggle" class:is-collapsed={!$isInfoPanelOpenStore} id="btn-panel" type="button" title="Open side panel" aria-label="Open side panel" aria-expanded={$isInfoPanelOpenStore} aria-controls="info-panel" onclick={togglePanel}>
    <svg class="ui-icon" aria-hidden="true"><use href="#icon-panel"></use></svg>
</button>

<aside class="info-panel slide-in-left" class:active={$isInfoPanelOpenStore} id="info-panel" role="region" aria-labelledby="info-panel-title" aria-hidden={!$isInfoPanelOpenStore}>
    <button class="info-header" id="info-panel-toggle" type="button" aria-label="Toggle info panel" aria-expanded={$isInfoPanelOpenStore} aria-controls="info-panel" onclick={togglePanel}>
        <p class="info-panel-title" id="info-panel-title">MoCo Business Mycelium</p>
        <span class="info-toggle-icon" id="info-toggle-icon" class:is-collapsed={!$isInfoPanelOpenStore} aria-hidden="true">
            <svg class="ui-icon"><use href="#icon-panel"></use></svg>
        </span>
    </button>
    <div class="info-content" id="info-panel-content">
        <!-- Declarative Surface Routing -->
        {#if panelSurface === 'idle'}
            <OverviewSurface />
        {/if}
        
        {#if ['search', 'focus-search', 'map-search', 'map-focus-search'].includes(panelSurface)}
            <SearchSurface />
        {/if}
        
        {#if ['focus', 'semantic-dive', 'map-focus', 'map-focus-search'].includes(panelSurface)}
            <SelectionSurface />
        {/if}

        <DiscoverySurface />
    </div>
</aside>
