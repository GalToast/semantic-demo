<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isLegendPanelOpenStore, isInfoPanelOpenStore } from '../stores.js';
  import { isCompactFocusStageViewport } from '../utils/ui-presentation.js';
  import { buildLegend, closeLegendGuide } from '@lib/stores/legend-panel';
  import { getFocusPanelMode, setFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  let previouslyFocusedElement: HTMLElement | null = $state(null);

    function toggleLegend(): void {
        const nextState = !$isLegendPanelOpenStore;
        
        if (nextState) {
            previouslyFocusedElement = document.activeElement as HTMLElement | null;
            
            // Need to build the legend when opening
            buildLegend();
            
            if (isCompactFocusStageViewport()) {
                if ($isInfoPanelOpenStore) {
                    $isInfoPanelOpenStore = false;
                    setFocusPanelMode(FOCUS_PANEL_MODE.LEGEND_OPEN);
                }
            }
        } else {
            // Restore info panel if compact
            if (isCompactFocusStageViewport() && getFocusPanelMode() === FOCUS_PANEL_MODE.LEGEND_OPEN) {
                $isInfoPanelOpenStore = true;
                setFocusPanelMode(FOCUS_PANEL_MODE.OVERVIEW);
            }
        }
        
        $isLegendPanelOpenStore = nextState;
    }

    function handlePointerDown(e: PointerEvent): void {
        if (!$isLegendPanelOpenStore) return;
        
        const legendPanel = document.getElementById('legend-panel');
        const legendToggle = document.getElementById('btn-legend');
        
        if (legendPanel?.contains(e.target as Node) || legendToggle?.contains(e.target as Node)) return;
        
        const prevFocus = previouslyFocusedElement || legendToggle;
        $isLegendPanelOpenStore = false;
        
        if (isCompactFocusStageViewport() && getFocusPanelMode() === FOCUS_PANEL_MODE.LEGEND_OPEN) {
            $isInfoPanelOpenStore = true;
            setFocusPanelMode(FOCUS_PANEL_MODE.OVERVIEW);
        }
        
        if (prevFocus && typeof prevFocus.focus === 'function') {
            prevFocus.focus({ preventScroll: true });
        }
    }

    function handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && $isLegendPanelOpenStore) {
            closeLegendGuide({ restoreFocus: true });
        }
    }

    onMount((): void => {
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
    });

    onDestroy((): void => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
    });
</script>

<button class="legend-toggle" id="btn-legend" type="button" title="Show field guide" aria-label="Show field guide" aria-expanded={$isLegendPanelOpenStore} aria-pressed={$isLegendPanelOpenStore} aria-controls="legend-panel" onclick={toggleLegend}>
    <svg class="ui-icon" aria-hidden="true"><use href="#icon-guide"></use></svg>
</button>

<aside class="legend-panel glass-heavy" class:active={$isLegendPanelOpenStore} id="legend-panel" role="region" aria-label="Field guide panel" aria-hidden={!$isLegendPanelOpenStore}>
    {#if children}{@render children()}{/if}
</aside>
