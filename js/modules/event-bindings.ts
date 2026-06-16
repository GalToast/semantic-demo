/**
 * event-bindings.ts
 * Typechecked sibling for event-bindings.js
 * Central event binding orchestrator. Imports each binding module and
 * dispatches its bind function during app initialization.
 */

import { state as _state } from '@lib/engine/state-bridge'
const state = _state as any
import { bindViewControls, zoomCamera } from './bindings/view-bindings.ts'
import {
    bindFocusControls,
    expandNeighborhoodFromCurrentNode,
    recenterFocusedNode,
    returnToCountyView
} from './bindings/journey-bindings.ts'
import { updateHasQuery, bindSearchControls } from './bindings/search-bindings.ts'
import { bindSuggestionControls } from './bindings/suggestion-bindings.ts'
import { bindSemanticLaneControls } from './bindings/semantic-lane-bindings.ts'
import { bindModeAndPromptControls } from './bindings/mode-bindings.ts'
import { bindFilterControls } from './bindings/filter-bindings.ts'
import {
    bindPanelControls,
    revealSelectedBusinessCard as _revealSelectedBusinessCard,
    setInfoPanelOpen as _setInfoPanelOpen
} from './bindings/panel-bindings.ts'
import { bindLegendControls } from './bindings/legend-bindings.ts'
import { bindUtilityButtons } from './bindings/utility-bindings.ts'
import { bindGlobalEvents, disposeEventListeners } from './bindings/global-bindings.ts'
import { scheduleOnboardingHint } from './bindings/onboarding-bindings.ts'
import { bindFocusTrapObserver } from './bindings/focus-trap-bindings.ts'

import { buildLegend } from '@lib/stores/legend-panel'
import { syncClusterSectionState } from '@lib/ui/cluster-labels'

export function revealSelectedBusinessCard(): void {
    setInfoPanelOpen(true)
    return _revealSelectedBusinessCard()
}

export function setInfoPanelOpen(open?: boolean | undefined, options: { restoreFocus?: boolean } = {}): boolean {
    return _setInfoPanelOpen(open, options)
}

export {
    disposeEventListeners,
    zoomCamera,
    expandNeighborhoodFromCurrentNode,
    recenterFocusedNode,
    returnToCountyView,
    updateHasQuery
}

interface InitEventListenersOptions {
    onWindowResize?: () => void
    recordSemanticLaneSnapshot?: (snapshot: { state: string; attempted_warm: boolean }) => void
    setMyceliumMode?: (mode: string) => void
    setSemanticLaneUiState?: (state: string, options: { label: string; title: string }) => void
    updateUrlState?: (...args: any[]) => void
}

export async function initEventListeners({
    onWindowResize = () => {},
    recordSemanticLaneSnapshot = () => {},
    setMyceliumMode = () => {},
    setSemanticLaneUiState = () => {},
    updateUrlState = () => {}
}: InitEventListenersOptions = {}): Promise<void> {
    if (state.eventListenersInitialized) return
    state.eventListenersInitialized = true

    bindViewControls()
    bindFocusControls()
    bindSuggestionControls()
    bindSearchControls()
    bindSemanticLaneControls(recordSemanticLaneSnapshot, setSemanticLaneUiState)
    bindGlobalEvents()
    bindModeAndPromptControls(setMyceliumMode)
    bindUtilityButtons()
    bindFilterControls()
    bindPanelControls(onWindowResize)
    bindLegendControls()
    bindFocusTrapObserver()

    if (typeof buildLegend === 'function') buildLegend()
    if (typeof syncClusterSectionState === 'function') syncClusterSectionState()
    scheduleOnboardingHint()
}
