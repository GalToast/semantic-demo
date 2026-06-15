/**
 * @lib/engine/camera-controls-core.ts — Camera focus transition, assist, and route exploration
 *
 * Port of js/modules/camera-controls-core.ts (154 LOC).
 * Focus transition state, camera assist, and route exploration.
 */

import { state, withStateMutation, type SemanticState } from '../../../js/state.ts';
import { isSearchRouteFocusActive, applyFocusOrbitSlack, clearFocusOrbitSlack } from '../../../js/modules/camera-orbit-slack.ts';

interface TransitionOptions {
    duration?: number;
}

const _s = state as unknown as SemanticState;

/**
 * Set the focus transition mode and update body dataset attributes.
 */
export function setFocusTransitionMode(mode: string, options: TransitionOptions = {}): void {
    const normalizedMode = String(mode || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    _s.focusTransitionMode = normalizedMode;
    _s.focusTransitionStartedAt = performance.now();
    if (_s.focusTransitionSettleTimer != null) {
        window.clearTimeout(_s.focusTransitionSettleTimer);
        _s.focusTransitionSettleTimer = null;
    }
    if (document.body) {
        document.body.dataset.focusTransition = normalizedMode;
        document.body.dataset.focusTransitionPhase = normalizedMode === 'idle' ? 'idle' : 'arriving';
    }
    const duration = Math.max(0, Number.isFinite(options.duration) ? options.duration! : 720);
    if (normalizedMode === 'idle') return;
    _s.focusTransitionSettleTimer = window.setTimeout(() => {
        if (_s.focusTransitionMode !== normalizedMode) return;
        if (document.body) document.body.dataset.focusTransitionPhase = 'settled';
    }, duration + 180) as unknown as ReturnType<typeof setTimeout>;
}

/**
 * Get focus transition progress as a 0..1 value.
 */
export function getFocusTransitionProgress(duration: number = 640): number {
    if (!_s.focusTransitionStartedAt) return 1;
    return Math.min(1, Math.max(0, (performance.now() - _s.focusTransitionStartedAt) / duration));
}

/**
 * Start the focus camera assist timer.
 */
export function startFocusCameraAssist(duration: number = 900, reason: string = 'focus'): void {
    _s.focusCameraAssistActive = true;
    _s.focusCameraAssistUntil = performance.now() + Math.max(180, duration);
    _s.focusCameraAssistReason = reason;
    syncCameraAssistDataset();
}

/**
 * Release the focus camera assist.
 */
export function releaseFocusCameraAssist(reason: string = 'manual'): void {
    if (shouldMarkRouteExploration(reason)) {
        markRouteExploration(reason);
    }
    if (!_s.focusCameraAssistActive && !_s.focusCameraOffset) {
        _s.focusCameraAssistReason = reason;
        syncCameraAssistDataset();
        return;
    }
    _s.focusCameraAssistActive = false;
    _s.focusCameraAssistUntil = 0;
    _s.focusCameraAssistReason = reason;
    _s.focusCameraOffset = null;
    syncCameraAssistDataset();
}

/**
 * Check if focus camera assist is currently active.
 */
export function focusCameraAssistIsActive(now: number = performance.now()): boolean {
    if (!_s.focusCameraAssistActive) return false;
    if (now <= _s.focusCameraAssistUntil) return true;
    releaseFocusCameraAssist('arrival-complete');
    return false;
}

/**
 * Sync body dataset for camera assist state.
 */
export function syncCameraAssistDataset(): void {
    if (document.body) {
        document.body.dataset.cameraAssist = _s.focusCameraAssistActive ? 'arriving' : 'free';
        document.body.dataset.cameraAssistReason = _s.focusCameraAssistReason || 'idle';
    }
}

/**
 * Set camera assist choreography phase and reason.
 */
export function setCameraAssistChoreography(phase: string = 'free', reason: string = 'view-handoff'): void {
    if (!document.body) return;
    const normalizedPhase = String(phase || 'free').replace(/[^a-z0-9-]/gi, '') || 'free';
    const normalizedReason = String(reason || 'view-handoff').replace(/[^a-z0-9-]/gi, '') || 'view-handoff';
    document.body.dataset.cameraAssist = normalizedPhase;
    document.body.dataset.cameraAssistReason = normalizedReason;
}

/**
 * Set route exploration state.
 */
export function setRouteExplorationState(phase: string = 'idle', reason: string = ''): void {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    const normalizedReason = String(reason || '').replace(/[^a-z0-9-]/gi, '') || '';
    withStateMutation(() => {
        _s.routeExplorationState = {
            phase: normalizedPhase,
            reason: normalizedReason,
            startedAt: performance.now()
        };
    });
    document.body.dataset.routeExploration = normalizedPhase;
    document.body.dataset.routeExplorationReason = normalizedReason;
}

/**
 * Clear route exploration state.
 */
export function clearRouteExploration(reason: string = 'clear'): void {
    setRouteExplorationState('idle', reason);
    clearFocusOrbitSlack(reason);
}

/**
 * Mark route exploration as active.
 */
export function markRouteExploration(reason: string = 'user-control'): boolean {
    if (!isSearchRouteFocusActive()) return false;
    if (_s.routeExplorationState.phase !== 'free' || _s.routeExplorationState.reason !== reason) {
        setRouteExplorationState('free', reason);
        applyFocusOrbitSlack(reason);
    }
    return true;
}

/**
 * Check if the reason should trigger route exploration marking.
 */
export function shouldMarkRouteExploration(reason: string = ''): boolean {
    return ['user-control', 'user-wheel', 'field-click'].includes(reason);
}

/**
 * Get the route layer origin.
 */
export function getRouteLayerOrigin(): string {
    return 'galaxy';
}
