/**
 * @lib/engine/legend-ui-bridge.ts - Bridge adapter for legend UI.
 *
 * Re-exports the Svelte-side legend UI functions.
 * Legacy kernel (js/modules/legend-ui.ts) retired in W15.
 */

export { initLegendEventBusSubscriptions } from '@lib/journey/legend-ui';
export {
    isLegendPanelOpen,
    openLegendPanel,
    closeLegendPanel,
    restoreLegendCollapsedPanel,
    buildLegend,
    updateLegendGuideState,
    closeLegendGuide,
    buildCanvasColorLegend,
    setPreviouslyFocusedLegend,
    getPreviouslyFocusedLegend,
} from '@lib/stores/legend-panel.svelte.ts';
