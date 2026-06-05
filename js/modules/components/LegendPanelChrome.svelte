<script>
    import { onMount, onDestroy } from 'svelte';
    import { isLegendPanelOpenStore, isInfoPanelOpenStore } from '../stores.js';
    import { isCompactFocusStageViewport } from '../utils/ui-presentation.js';
    import { buildLegend, closeLegendGuide } from '../legend-ui.js';

    let previouslyFocusedElement = null;

    function toggleLegend() {
        const nextState = !$isLegendPanelOpenStore;
        
        if (nextState) {
            previouslyFocusedElement = document.activeElement;
            
            // Need to build the legend when opening
            buildLegend();
            
            if (isCompactFocusStageViewport()) {
                if ($isInfoPanelOpenStore) {
                    $isInfoPanelOpenStore = false;
                    document.body.dataset.focusPanelMode = 'legend-open';
                }
            }
        } else {
            // Restore info panel if compact
            if (isCompactFocusStageViewport() && document.body.dataset.focusPanelMode === 'legend-open') {
                $isInfoPanelOpenStore = true;
                document.body.dataset.focusPanelMode = 'overview';
            }
        }
        
        $isLegendPanelOpenStore = nextState;
    }

    function handlePointerDown(e) {
        if (!$isLegendPanelOpenStore) return;
        
        const legendPanel = document.getElementById('legend-panel');
        const legendToggle = document.getElementById('btn-legend');
        
        if (legendPanel?.contains(e.target) || legendToggle?.contains(e.target)) return;
        
        const prevFocus = previouslyFocusedElement || legendToggle;
        $isLegendPanelOpenStore = false;
        
        if (isCompactFocusStageViewport() && document.body.dataset.focusPanelMode === 'legend-open') {
            $isInfoPanelOpenStore = true;
            document.body.dataset.focusPanelMode = 'overview';
        }
        
        if (prevFocus && typeof prevFocus.focus === 'function') {
            prevFocus.focus({ preventScroll: true });
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape' && $isLegendPanelOpenStore) {
            closeLegendGuide({ restoreFocus: true });
        }
    }

    onMount(() => {
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
    });

    onDestroy(() => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
    });
</script>

<button class="legend-toggle" id="btn-legend" type="button" title="Show field guide" aria-label="Show field guide" aria-expanded={$isLegendPanelOpenStore} aria-pressed={$isLegendPanelOpenStore} aria-controls="legend-panel" onclick={toggleLegend}>
    <svg class="ui-icon" aria-hidden="true"><use href="#icon-guide"></use></svg>
</button>

<aside class="legend-panel glass-heavy" class:active={$isLegendPanelOpenStore} id="legend-panel" role="region" aria-label="Field guide panel" aria-hidden={!$isLegendPanelOpenStore}>
    <slot></slot>
</aside>
