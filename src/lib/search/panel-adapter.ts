/**
 * @lib/search/panel-adapter.ts — Svelte search adapter bridge.
 *
 * The canonical DOM implementation still lives in the legacy engine kernel
 * while the Svelte search orchestration port is in progress.
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
} from '@lib/engine/search-panel-adapter-bridge';
