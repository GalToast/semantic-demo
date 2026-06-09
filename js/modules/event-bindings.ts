/**
 * event-bindings.ts
 * Typechecked sibling for event-bindings.js
 * Central event binding orchestrator. Imports each binding module and
 * dispatches its bind function during app initialization.
 */

import { state as _state } from '../state.js';
const state = _state as any;
import { debugWarn } from './diagnostic-adapter.js';
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

export function revealSelectedBusinessCard(): void {
    setInfoPanelOpen(true);
    return _revealSelectedBusinessCard();
}

export function setInfoPanelOpen(open?: boolean | undefined, options: { restoreFocus?: boolean } = {}): boolean {
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

interface InitEventListenersOptions {
    onWindowResize?: () => void;
    recordSemanticLaneSnapshot?: (snapshot: { state: string; attempted_warm: boolean }) => void;
    setMyceliumMode?: (mode: string) => void;
    setSemanticLaneUiState?: (state: string, options: { label: string; title: string }) => void;
    updateUrlState?: (...args: any[]) => void;
}

export async function initEventListeners({
    onWindowResize = () => {},
    recordSemanticLaneSnapshot = () => {},
    setMyceliumMode = () => {},
    setSemanticLaneUiState = () => {},
    updateUrlState = () => {},
}: InitEventListenersOptions = {}): Promise<void> {
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
    bindFilterControls();
    bindPanelControls(onWindowResize);
    bindLegendControls();
    bindFocusTrapObserver();

    if (typeof buildLegend === 'function') buildLegend();
    if (typeof syncClusterSectionState === 'function') syncClusterSectionState();
    scheduleOnboardingHint();

    // Svelte islands are loaded on demand so Node-side test imports of
    // this module (which never call initEventListeners) don't need a
    // .svelte loader. In the browser, the islands mount here; the small
    // extra latency is unobservable because the user is still seeing
    // the loading overlay.
    try {
        const [searchChrome, filterChrome] = await Promise.all([
            import('./search-chrome-island.ts'),
            import('./filter-chrome-island.ts')
        ]);
        if (typeof (searchChrome as any)?.initSearchChromeSvelteIsland === 'function') (searchChrome as any).initSearchChromeSvelteIsland();
        if (typeof (filterChrome as any)?.initFilterChromeSvelteIsland === 'function') (filterChrome as any).initFilterChromeSvelteIsland();
    } catch (e) {
        debugWarn('[event-bindings] failed to load svelte islands', (e as Error)?.message);
    }
}
