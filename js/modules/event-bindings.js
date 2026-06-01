import { state } from '../state.js';
import { bindViewControls, zoomCamera } from './bindings/view-bindings.js';
import { bindFocusControls, expandNeighborhoodFromCurrentNode, recenterFocusedNode, returnToCountyView } from './bindings/journey-bindings.js';
import { updateHasQuery, bindSearchControls } from './bindings/search-bindings.js';
import { bindSuggestionControls } from './bindings/suggestion-bindings.js';
import { bindSemanticLaneControls } from './bindings/semantic-lane-bindings.js';
import { bindModeAndPromptControls } from './bindings/mode-bindings.js';
import { bindFilterControls } from './bindings/filter-bindings.js';
import { bindPanelControls, revealSelectedBusinessCard as _revealSelectedBusinessCard, setInfoPanelOpen as _setInfoPanelOpen } from './bindings/panel-bindings.js';
import { bindLegendControls } from './bindings/legend-bindings.js';
import { bindUtilityButtons } from './bindings/utility-bindings.js';
import { bindGlobalEvents, disposeEventListeners } from './bindings/global-bindings.js';
import { scheduleOnboardingHint } from './bindings/onboarding-bindings.js';
import { bindFocusTrapObserver } from './bindings/focus-trap-bindings.js';

import { buildLegend } from './ui-renderers.js';
import { syncClusterSectionState } from './cluster-labels.js';

export function revealSelectedBusinessCard() {
    setInfoPanelOpen(true);
    return _revealSelectedBusinessCard();
}

export function setInfoPanelOpen(open, options = {}) {
    return _setInfoPanelOpen(open, options);
}

export {
    disposeEventListeners,
    zoomCamera,
    expandNeighborhoodFromCurrentNode,
    recenterFocusedNode,
    returnToCountyView,
    updateHasQuery
};

export function initEventListeners({
    onWindowResize,
    recordSemanticLaneSnapshot,
    setMyceliumMode,
    setSemanticLaneUiState,
    updateUrlState,
}) {
    if (state.eventListenersInitialized) return;
    state.eventListenersInitialized = true;

    bindViewControls();
    bindFocusControls();
    bindSuggestionControls();
    bindSearchControls();
    bindSemanticLaneControls(recordSemanticLaneSnapshot, setSemanticLaneUiState);
    bindGlobalEvents();
    bindModeAndPromptControls(setMyceliumMode);
    bindUtilityButtons();
    bindFilterControls(updateUrlState);
    bindPanelControls(onWindowResize);
    bindLegendControls();
    bindFocusTrapObserver();

    if (typeof buildLegend === 'function') buildLegend();
    if (typeof syncClusterSectionState === 'function') syncClusterSectionState();
    scheduleOnboardingHint();
}
