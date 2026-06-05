// camera-controls-core.ts
// TypeScript shadow of camera-controls-core.js
// Focus transition state, camera assist, and route exploration.

import { state } from '../state.js';
import type { SemanticState } from '../../types/state.js';
import { isSearchRouteFocusActive, applyFocusOrbitSlack, clearFocusOrbitSlack } from './camera-orbit-slack.js';

interface TransitionOptions {
    duration?: number;
}

/**
 * Set the focus transition mode and update body dataset attributes.
 */
export function setFocusTransitionMode(mode: string, options: TransitionOptions = {}): void {
    const normalizedMode = String(mode || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    state.focusTransitionMode = normalizedMode;
    state.focusTransitionStartedAt = performance.now();
    if (state.focusTransitionSettleTimer) {
        window.clearTimeout(state.focusTransitionSettleTimer);
        state.focusTransitionSettleTimer = null;
    }
    if (document.body) {
        document.body.dataset.focusTransition = normalizedMode;
        document.body.dataset.focusTransitionPhase = normalizedMode === 'idle' ? 'idle' : 'arriving';
    }
    const duration = Math.max(0, Number.isFinite(options.duration) ? options.duration! : 720);
    if (normalizedMode === 'idle') return;
    state.focusTransitionSettleTimer = window.setTimeout(() => {
        if (state.focusTransitionMode !== normalizedMode) return;
        if (document.body) document.body.dataset.focusTransitionPhase = 'settled';
    }, duration + 180);
}

/**
 * Get focus transition progress as a 0..1 value.
 */
export function getFocusTransitionProgress(duration: number = 640): number {
    if (!state.focusTransitionStartedAt) return 1;
    return Math.min(1, Math.max(0, (performance.now() - state.focusTransitionStartedAt) / duration));
}

/**
 * Start the focus camera assist timer.
 */
export function startFocusCameraAssist(duration: number = 900, reason: string = 'focus'): void {
    state.focusCameraAssistActive = true;
    state.focusCameraAssistUntil = performance.now() + Math.max(180, duration);
    state.focusCameraAssistReason = reason;
    syncCameraAssistDataset();
}

/**
 * Release the focus camera assist.
 */
export function releaseFocusCameraAssist(reason: string = 'manual'): void {
    if (shouldMarkRouteExploration(reason)) {
        markRouteExploration(reason);
    }
    if (!state.focusCameraAssistActive && !state.focusCameraOffset) {
        state.focusCameraAssistReason = reason;
        syncCameraAssistDataset();
        return;
    }
    state.focusCameraAssistActive = false;
    state.focusCameraAssistUntil = 0;
    state.focusCameraAssistReason = reason;
    state.focusCameraOffset = null;
    syncCameraAssistDataset();
}

/**
 * Check if focus camera assist is currently active.
 */
export function focusCameraAssistIsActive(now: number = performance.now()): boolean {
    if (!state.focusCameraAssistActive) return false;
    if (now <= state.focusCameraAssistUntil) return true;
    releaseFocusCameraAssist('arrival-complete');
    return false;
}

/**
 * Sync body dataset for camera assist state.
 */
export function syncCameraAssistDataset(): void {
    if (document.body) {
        document.body.dataset.cameraAssist = state.focusCameraAssistActive ? 'arriving' : 'free';
        document.body.dataset.cameraAssistReason = state.focusCameraAssistReason || 'idle';
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
    state.routeExplorationState = {
        phase: normalizedPhase,
        reason: normalizedReason,
        startedAt: performance.now()
    };
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
    if (state.routeExplorationState.phase !== 'free' || state.routeExplorationState.reason !== reason) {
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
