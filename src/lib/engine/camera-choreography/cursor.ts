/**
 * @lib/engine/camera-choreography/cursor.ts — Focus node orchestrator (focusOnNode)
 *
 * Ported from: js/modules/camera-controls-choreography-cursor.ts
 *
 * Orchestrates the full focus-on-node flow: dispatches navigation transitions,
 * syncs DOM attributes, publishes events, updates journey/compass state, and
 * triggers the camera animation (delegated to focus.ts).
 */

import { state, type Point, type SemanticState } from '../../../../js/state.ts'
import {
  getNavState, getPoints, getTrailDepth, getMyceliumMode
} from '../../../../js/state/selectors/index.ts'
import { isMobile } from '../../../../js/modules/environment.ts'
import { refreshMapRouteEmbodiment } from '../../../../js/modules/map-state.ts'
import {
  refreshCompositionState,
  dispatchNavTransition,
  setTrailDepth,
  setMyceliumMode,
  updateExplorationUi,
  syncSearchStatusForFocus
} from '../../../../js/modules/lifecycle.ts'
import { updateJourneyCompass } from '../../../../js/modules/journey-compass-controller.ts'
import { applyPointFilterColors, syncFocusStage } from '../../../../js/modules/journey.ts'
import { syncSemanticDiveUi } from '@lib/journey/semantic-dive'
import { publish, EVENTS } from '../../../../js/modules/event-bus.ts'
import { clearRouteExploration } from '../../../../js/modules/camera-controls-core.ts'
import { setFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode'
import { animateCameraToNode } from './focus'

// Narrow local alias for onboarding-hint dynamic properties (matches onboarding-bindings.ts pattern)
type OnboardingHint = HTMLElement & {
  _dismissedThisSession?: boolean
  _autoHideTimer?: ReturnType<typeof setTimeout> | null
}

// Local options interface matching runtime usage across all callers
export interface FocusOnNodeOptions {
  preserveMode?: boolean
  fromTraversal?: boolean
  fromCanvasNode?: boolean
  fromSearchResult?: boolean
  appendHistory?: boolean
  restoreHistory?: boolean
  skipUrlSync?: boolean
  historyMode?: string
  [key: string]: unknown
}

const _s = state as unknown as SemanticState

// -----------------------------------------------------------------------------
// FOCUS NODE ORCHESTRATOR — focusOnNode
// -----------------------------------------------------------------------------

export function focusOnNode(index: number, options: FocusOnNodeOptions = {}): boolean {
  const points = getPoints() as Point[]
  if (!Number.isFinite(index) || index < 0 || !points || index >= points.length) return false
  const point = points[index]
  if (!point) return false
  const suppressCanvasFocusUntil = Number((_s as any).suppressCanvasFocusUntil) || 0
  if (options.fromCanvasNode && typeof performance !== 'undefined' && performance.now() < suppressCanvasFocusUntil) {
    return false
  }

  _s.selectedPoint = point
  _s.hoverHighlightIndex = -1
  _s.pinnedThreadIndex = null

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
  const hint = document.getElementById('onboarding-hint') as OnboardingHint | null
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
    const storySection = document.getElementById('story-section') as HTMLDetailsElement | null
    const clusterSection = document.getElementById('cluster-section') as HTMLDetailsElement | null
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
