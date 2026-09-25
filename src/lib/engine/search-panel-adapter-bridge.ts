/**
 * search-panel-adapter-bridge.ts
 *
 * Imperative bridge: re-exports canonical search-panel-adapter for legacy callers.
 * Canonical source: src/lib/search/search-panel-adapter.ts
 */

export {
    getSearchContainer,
    setSearchContainerState,
    setSearchGlowState,
    getPanelSurfaceDetailFromMobileSheet,
    syncPanelSurfaceDetailFromMobileSheet,
    setMobileSearchSheetMode,
    clearMobileSearchSheetState,
    setupMobileSearchSheetToggle
} from '@lib/search/search-panel-adapter';
