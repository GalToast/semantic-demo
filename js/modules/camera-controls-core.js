import { state } from '../state.js'
import { isSearchRouteFocusActive, applyFocusOrbitSlack, clearFocusOrbitSlack } from './camera-orbit-slack.js'

// -----------------------------------------------------------------------------
// FOCUS TRANSITION STATE
// -----------------------------------------------------------------------------
export function setFocusTransitionMode(mode, options = {}) {
    const normalizedMode = String(mode || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle'
    state.focusTransitionMode = normalizedMode
    state.focusTransitionStartedAt = performance.now()
    if (state.focusTransitionSettleTimer) {
        window.clearTimeout(state.focusTransitionSettleTimer)
        state.focusTransitionSettleTimer = null
    }
    if (document.body) {
        document.body.dataset.focusTransition = normalizedMode
        document.body.dataset.focusTransitionPhase = normalizedMode === 'idle' ? 'idle' : 'arriving'
    }
    const duration = Math.max(0, Number.isFinite(options.duration) ? options.duration : 720)
    if (normalizedMode === 'idle') return
    state.focusTransitionSettleTimer = window.setTimeout(() => {
        if (state.focusTransitionMode !== normalizedMode) return
        if (document.body) document.body.dataset.focusTransitionPhase = 'settled'
    }, duration + 180)
}

export function getFocusTransitionProgress(duration = 640) {
    if (!state.focusTransitionStartedAt) return 1
    return Math.min(1, Math.max(0, (performance.now() - state.focusTransitionStartedAt) / duration))
}

// -----------------------------------------------------------------------------
// FOCUS CAMERA ASSIST
// -----------------------------------------------------------------------------

export function startFocusCameraAssist(duration = 900, reason = 'focus') {
    state.focusCameraAssistActive = true
    state.focusCameraAssistUntil = performance.now() + Math.max(180, duration)
    state.focusCameraAssistReason = reason
    syncCameraAssistDataset()
}

export function releaseFocusCameraAssist(reason = 'manual') {
    if (shouldMarkRouteExploration(reason)) {
        markRouteExploration(reason)
    }
    if (!state.focusCameraAssistActive && !state.focusCameraOffset) {
        state.focusCameraAssistReason = reason
        syncCameraAssistDataset()
        return
    }
    state.focusCameraAssistActive = false
    state.focusCameraAssistUntil = 0
    state.focusCameraAssistReason = reason
    state.focusCameraOffset = null
    syncCameraAssistDataset()
}

export function focusCameraAssistIsActive(now = performance.now()) {
    if (!state.focusCameraAssistActive) return false
    if (now <= state.focusCameraAssistUntil) return true
    releaseFocusCameraAssist('arrival-complete')
    return false
}

export function syncCameraAssistDataset() {
    if (document.body) {
        document.body.dataset.cameraAssist = state.focusCameraAssistActive ? 'arriving' : 'free'
        document.body.dataset.cameraAssistReason = state.focusCameraAssistReason || 'idle'
    }
}

export function setCameraAssistChoreography(phase = 'free', reason = 'view-handoff') {
    if (!document.body) return
    const normalizedPhase = String(phase || 'free').replace(/[^a-z0-9-]/gi, '') || 'free'
    const normalizedReason = String(reason || 'view-handoff').replace(/[^a-z0-9-]/gi, '') || 'view-handoff'
    document.body.dataset.cameraAssist = normalizedPhase
    document.body.dataset.cameraAssistReason = normalizedReason
}

// -----------------------------------------------------------------------------
// ROUTE EXPLORATION
// -----------------------------------------------------------------------------

export function setRouteExplorationState(phase = 'idle', reason = '') {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle'
    const normalizedReason = String(reason || '').replace(/[^a-z0-9-]/gi, '') || ''
    state.routeExplorationState = {
        phase: normalizedPhase,
        reason: normalizedReason,
        startedAt: performance.now()
    }
    document.body.dataset.routeExploration = normalizedPhase
    document.body.dataset.routeExplorationReason = normalizedReason
}

export function clearRouteExploration(reason = 'clear') {
    setRouteExplorationState('idle', reason)
    clearFocusOrbitSlack(reason)
}

export function markRouteExploration(reason = 'user-control') {
    if (!isSearchRouteFocusActive()) return false
    if (state.routeExplorationState.phase !== 'free' || state.routeExplorationState.reason !== reason) {
        setRouteExplorationState('free', reason)
        applyFocusOrbitSlack(reason)
    }
    return true
}

export function shouldMarkRouteExploration(reason = '') {
    return ['user-control', 'user-wheel', 'field-click'].includes(reason)
}

export function getRouteLayerOrigin() {
    return 'galaxy'
}
