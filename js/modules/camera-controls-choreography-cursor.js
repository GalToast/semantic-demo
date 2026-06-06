import { state } from '../state.js'
import {
  getNavState, getPoints, getTrailDepth, getMyceliumMode
} from '../state/selectors/index.js'
import { isMobile } from './environment.js'
import { refreshMapRouteEmbodiment } from './map-state.js'
import {
  refreshCompositionState,
  dispatchNavTransition,
  setTrailDepth,
  setMyceliumMode,
  updateExplorationUi,
  syncSearchStatusForFocus
} from './lifecycle.js'
import { updateJourneyCompass } from './journey-compass-controller.js'
import { applyPointFilterColors, syncFocusStage } from './journey.js'
import { syncSemanticDiveUi } from './semantic-dive-ui.js'
import { publish, EVENTS } from './event-bus.js'
import { clearRouteExploration } from './camera-controls-core.js'
import { setFocusPanelMode, FOCUS_PANEL_MODE } from './focus-panel-mode.js'
import { animateCameraToNode } from './camera-controls-choreography-focus.js'

// -----------------------------------------------------------------------------
// FOCUS NODE ORCHESTRATOR — focusOnNode
// -----------------------------------------------------------------------------

export function focusOnNode(index, options = {}) {
  if (!Number.isFinite(index) || index < 0 || !getPoints() || index >= getPoints().length) return false
  const point = getPoints()[index]
  if (!point) return false

  state.selectedPoint = point
  state.hoverHighlightIndex = -1
  state.pinnedThreadIndex = null

  dispatchNavTransition('FOCUS_NODE', {
    index,
    preserveMode: !!options.preserveMode,
    fromTraversal: !!options.fromTraversal,
    fromCanvasNode: !!options.fromCanvasNode,
    appendHistory: !!options.appendHistory,
    restoreHistory: !!options.restoreHistory
  })

  if (getTrailDepth() === 0) {
    setTrailDepth(1, { skipUrlSync: true })
  }

  if (getNavState().mode === 'trail' && getMyceliumMode() !== 'trail') {
    setMyceliumMode('trail', { skipUrlSync: true })
  }

  document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'))

  document.getElementById('onboarding-hint')?.classList.remove('visible')
  const hint = document.getElementById('onboarding-hint')
  if (hint) {
    hint._dismissedThisSession = true
    if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer)
  }
  document.body.dataset.focusOrigin = options.fromCanvasNode
    ? 'field-node'
    : options.fromSearchResult
    ? 'search-result'
    : options.fromTraversal
    ? 'trail-walk'
    : 'programmatic'
  if (options.fromCanvasNode) {
    setFocusPanelMode(FOCUS_PANEL_MODE.FIELD_NODE)
  }

  if (isMobile()) {
    const storySection = document.getElementById('story-section')
    const clusterSection = document.getElementById('cluster-section')
    if (storySection) storySection.open = false
    if (clusterSection) clusterSection.open = false
  }

  publish(EVENTS.CAMERA_MOVED, { reason: 'focus-node', index })
  publish(EVENTS.CAMERA_NODE_FOCUSED, { index, point, options })

  applyPointFilterColors()
  updateExplorationUi()

  syncFocusStage(point)
  refreshMapRouteEmbodiment()

  clearRouteExploration(options.fromTraversal ? 'trail-walk' : options.fromCanvasNode ? 'field-node-focus' : 'focus')

  syncSearchStatusForFocus(point, {
    fromTraversal: !!options.fromTraversal,
    fromSearchResult: !!options.fromSearchResult
  })

  animateCameraToNode(index, {
    transitionStyle: options.fromTraversal ? 'walk' : options.fromSearchResult ? 'search' : 'focus'
  })

  syncSemanticDiveUi()
  refreshCompositionState()
  if (!options.skipUrlSync) {
    publish(EVENTS.URL_SYNC_REQUESTED, {
      params: { record: point.lead_id || null },
      mode: options.historyMode || 'push',
      reason: 'focus'
    })
  }
  updateJourneyCompass()
  return true
}
