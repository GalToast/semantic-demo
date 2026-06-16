/**
 * @lib/engine/camera-controls-core.svelte.ts — Svelte 5 rune-class for camera focus transition, assist, and route exploration
 *
 * Ticket W11-T6: Parallel artifact to js/modules/camera-controls-core.ts.
 * The Svelte 5 class owns the reactive state via $state fields. Legacy state
 * writes are kept for backward compatibility with choreography files that
 * still import from the legacy path directly.
 *
 * State-holding fields (owned by this class):
 *   focusTransitionMode, focusTransitionStartedAt, focusTransitionSettleTimer,
 *   focusCameraAssistActive, focusCameraAssistUntil, focusCameraAssistReason,
 *   routeExplorationState, focusCameraOffset.
 *
 * Body dataset writes are side effects, not $effect — they stay in method bodies.
 */

import { state, withStateMutation, type SemanticState } from '../../../js/state.ts';
import { isSearchRouteFocusActive, applyFocusOrbitSlack, clearFocusOrbitSlack } from './camera-orbit-slack-bridge';

// ── Types ────────────────────────────────────────────────────────────────────

interface TransitionOptions {
    duration?: number;
}

interface RouteExplorationState {
    phase: string;
    reason: string;
    startedAt: number;
}

// ── CameraControlsCore class ─────────────────────────────────────────────────

class CameraControlsCore {
    // ── Focus transition state ────────────────────────────────────────────
    focusTransitionMode = $state<string>('idle');
    focusTransitionStartedAt = $state<number>(0);
    focusTransitionSettleTimer = $state<number | null>(null);

    // ── Camera assist state ───────────────────────────────────────────────
    focusCameraAssistActive = $state<boolean>(false);
    focusCameraAssistUntil = $state<number>(0);
    focusCameraAssistReason = $state<string>('');

    // ── Route exploration state ───────────────────────────────────────────
    routeExplorationState = $state<RouteExplorationState>({
        phase: 'idle',
        reason: '',
        startedAt: 0
    });

    // ── Focus camera offset (set by choreography, read by focus.ts) ──────
    focusCameraOffset = $state<any>(null);

    // ── Derived helpers ───────────────────────────────────────────────────
    isTransitioning = $derived(this.focusTransitionMode !== 'idle');
    isCameraAssistActive = $derived(
        this.focusCameraAssistActive && this.focusCameraAssistUntil > performance.now()
    );

    // ── Focus transition ──────────────────────────────────────────────────

    setFocusTransitionMode(mode: string, options: TransitionOptions = {}): void {
        const normalizedMode = String(mode || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
        this.focusTransitionMode = normalizedMode;
        this.focusTransitionStartedAt = performance.now();
        if (this.focusTransitionSettleTimer != null) {
            window.clearTimeout(this.focusTransitionSettleTimer);
            this.focusTransitionSettleTimer = null;
        }
        // Legacy mirror for choreography files that still read from state.focusTransitionMode
        const _s = state as unknown as SemanticState;
        _s.focusTransitionMode = normalizedMode;
        _s.focusTransitionStartedAt = this.focusTransitionStartedAt;

        if (document.body) {
            document.body.dataset.focusTransition = normalizedMode;
            document.body.dataset.focusTransitionPhase = normalizedMode === 'idle' ? 'idle' : 'arriving';
        }
        const duration = Math.max(0, Number.isFinite(options.duration) ? options.duration! : 720);
        if (normalizedMode === 'idle') return;
        this.focusTransitionSettleTimer = window.setTimeout(() => {
            if (this.focusTransitionMode !== normalizedMode) return;
            if (document.body) document.body.dataset.focusTransitionPhase = 'settled';
        }, duration + 180) as unknown as number;
    }

    getFocusTransitionProgress(duration: number = 640): number {
        if (!this.focusTransitionStartedAt) return 1;
        return Math.min(1, Math.max(0, (performance.now() - this.focusTransitionStartedAt) / duration));
    }

    // ── Camera assist ─────────────────────────────────────────────────────

    startFocusCameraAssist(duration: number = 900, reason: string = 'focus'): void {
        this.focusCameraAssistActive = true;
        this.focusCameraAssistUntil = performance.now() + Math.max(180, duration);
        this.focusCameraAssistReason = reason;
        // Legacy mirror
        const _s = state as unknown as SemanticState;
        _s.focusCameraAssistActive = true;
        _s.focusCameraAssistUntil = this.focusCameraAssistUntil;
        _s.focusCameraAssistReason = reason;
        this.syncCameraAssistDataset();
    }

    releaseFocusCameraAssist(reason: string = 'manual'): void {
        if (this.shouldMarkRouteExploration(reason)) {
            this.markRouteExploration(reason);
        }
        const _s = state as unknown as SemanticState;
        if (!this.focusCameraAssistActive && !_s.focusCameraOffset) {
            this.focusCameraAssistReason = reason;
            _s.focusCameraAssistReason = reason;
            this.syncCameraAssistDataset();
            return;
        }
        this.focusCameraAssistActive = false;
        this.focusCameraAssistUntil = 0;
        this.focusCameraAssistReason = reason;
        this.focusCameraOffset = null;
        // Legacy mirror
        _s.focusCameraAssistActive = false;
        _s.focusCameraAssistUntil = 0;
        _s.focusCameraAssistReason = reason;
        _s.focusCameraOffset = null;
        this.syncCameraAssistDataset();
    }

    focusCameraAssistIsActive(now: number = performance.now()): boolean {
        if (!this.focusCameraAssistActive) return false;
        if (now <= this.focusCameraAssistUntil) return true;
        this.releaseFocusCameraAssist('arrival-complete');
        return false;
    }

    syncCameraAssistDataset(): void {
        if (document.body) {
            document.body.dataset.cameraAssist = this.focusCameraAssistActive ? 'arriving' : 'free';
            document.body.dataset.cameraAssistReason = this.focusCameraAssistReason || 'idle';
        }
    }

    setCameraAssistChoreography(phase: string = 'free', reason: string = 'view-handoff'): void {
        if (!document.body) return;
        const normalizedPhase = String(phase || 'free').replace(/[^a-z0-9-]/gi, '') || 'free';
        const normalizedReason = String(reason || 'view-handoff').replace(/[^a-z0-9-]/gi, '') || 'view-handoff';
        document.body.dataset.cameraAssist = normalizedPhase;
        document.body.dataset.cameraAssistReason = normalizedReason;
    }

    // ── Route exploration ─────────────────────────────────────────────────

    setRouteExplorationState(phase: string = 'idle', reason: string = ''): void {
        const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
        const normalizedReason = String(reason || '').replace(/[^a-z0-9-]/gi, '') || '';
        this.routeExplorationState = {
            phase: normalizedPhase,
            reason: normalizedReason,
            startedAt: performance.now()
        };
        // Legacy mirror — routeExplorationState is a tracked sub-object
        withStateMutation(() => {
            const _s = state as unknown as SemanticState;
            _s.routeExplorationState = {
                phase: normalizedPhase,
                reason: normalizedReason,
                startedAt: performance.now()
            };
        });
        if (document.body) {
            document.body.dataset.routeExploration = normalizedPhase;
            document.body.dataset.routeExplorationReason = normalizedReason;
        }
    }

    clearRouteExploration(reason: string = 'clear'): void {
        this.setRouteExplorationState('idle', reason);
        clearFocusOrbitSlack(reason);
    }

    markRouteExploration(reason: string = 'user-control'): boolean {
        if (!isSearchRouteFocusActive()) return false;
        const _s = state as unknown as SemanticState;
        if (_s.routeExplorationState.phase !== 'free' || _s.routeExplorationState.reason !== reason) {
            this.setRouteExplorationState('free', reason);
            applyFocusOrbitSlack(reason);
        }
        return true;
    }

    shouldMarkRouteExploration(reason: string = ''): boolean {
        return ['user-control', 'user-wheel', 'field-click'].includes(reason);
    }

    getRouteLayerOrigin(): string {
        return 'galaxy';
    }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const cameraControlsCore = new CameraControlsCore();

// ── Legacy-compatible function exports ───────────────────────────────────────
// These maintain the same API surface as js/modules/camera-controls-core.ts
// so existing consumers (choreography, bridge) don't need import changes.

export function setFocusTransitionMode(mode: string, options: TransitionOptions = {}): void {
    cameraControlsCore.setFocusTransitionMode(mode, options);
}

export function getFocusTransitionProgress(duration: number = 640): number {
    return cameraControlsCore.getFocusTransitionProgress(duration);
}

export function startFocusCameraAssist(duration: number = 900, reason: string = 'focus'): void {
    cameraControlsCore.startFocusCameraAssist(duration, reason);
}

export function releaseFocusCameraAssist(reason: string = 'manual'): void {
    cameraControlsCore.releaseFocusCameraAssist(reason);
}

export function focusCameraAssistIsActive(now: number = performance.now()): boolean {
    return cameraControlsCore.focusCameraAssistIsActive(now);
}

export function syncCameraAssistDataset(): void {
    cameraControlsCore.syncCameraAssistDataset();
}

export function setCameraAssistChoreography(phase: string = 'free', reason: string = 'view-handoff'): void {
    cameraControlsCore.setCameraAssistChoreography(phase, reason);
}

export function setRouteExplorationState(phase: string = 'idle', reason: string = ''): void {
    cameraControlsCore.setRouteExplorationState(phase, reason);
}

export function clearRouteExploration(reason: string = 'clear'): void {
    cameraControlsCore.clearRouteExploration(reason);
}

export function markRouteExploration(reason: string = 'user-control'): boolean {
    return cameraControlsCore.markRouteExploration(reason);
}

export function shouldMarkRouteExploration(reason: string = ''): boolean {
    return cameraControlsCore.shouldMarkRouteExploration(reason);
}

export function getRouteLayerOrigin(): string {
    return cameraControlsCore.getRouteLayerOrigin();
}
