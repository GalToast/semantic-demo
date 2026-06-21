/**
 * event-bindings.ts
 * Central event binding orchestrator. Imports each binding module and
 * dispatches its bind function during app initialization.
 *
 * Ported from js/modules/event-bindings.ts (W15 Wave E).
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state as any
import { bindViewControls, zoomCamera } from '@lib/ui/view-bindings'
import {
    bindFocusControls,
    expandNeighborhoodFromCurrentNode,
    recenterFocusedNode,
    returnToCountyView
} from '@lib/ui/journey-bindings'
import { updateHasQuery, bindSearchControls } from '@lib/ui/search-bindings'
import { bindSuggestionControls } from '@lib/ui/suggestion-bindings'
import { bindSemanticLaneControls } from '@lib/ui/semantic-lane-bindings'
import { bindModeAndPromptControls } from '@lib/ui/mode-bindings'
import { bindFilterControls } from '@lib/ui/filter-bindings'
import {
    bindPanelControls,
    revealSelectedBusinessCard as _revealSelectedBusinessCard,
    setInfoPanelOpen as _setInfoPanelOpen
} from '@lib/ui/panel-bindings'
import { bindLegendControls } from '@lib/ui/legend-bindings'
import { bindUtilityButtons } from '@lib/ui/utility-bindings'
import { bindGlobalEvents, disposeEventListeners } from '@lib/ui/global-bindings'
import { scheduleOnboardingHint } from '@lib/ui/onboarding-bindings'
import { bindFocusTrapObserver } from '@lib/utils/focus-trap-bindings'

import { buildLegend } from '@lib/stores/legend-panel.svelte.ts'
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
