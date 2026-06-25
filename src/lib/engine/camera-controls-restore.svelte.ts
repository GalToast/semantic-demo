/**
 * @lib/engine/camera-controls-restore.svelte.ts — Svelte 5 rune-class for auto-rotate state machine and camera restore
 *
 * Ticket W11-T6: Parallel artifact to js/modules/camera-controls-restore.ts.
 * The Svelte 5 class owns the reactive state via $state fields. Legacy state
 * writes are kept for backward compatibility with choreography files that
 * still import from the legacy path directly.
 *
 * State-holding fields (owned by this class):
 *   autoRotate, autoRotateSuspended, autoRotateSoftResumeStartedAt,
 *   autoRotateResumeTimer, autoRotateResumeDueAt.
 *
 * Three.js object mutations (controls.autoRotate, controls.autoRotateSpeed)
 * stay imperative — they're not Svelte state.
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state;
import type { ControlsLike, SemanticState } from '@lib/state/state-types';
import { prefersReducedMotion } from '@lib/utils/environment';
import { easeInOutCubic } from '@lib/utils/math-easing';

// ── Constants ────────────────────────────────────────────────────────────────

export const OVERVIEW_CAMERA_POSE = Object.freeze({
    position: Object.freeze([2.05, 1.55, 2.75]) as readonly [number, number, number],
    target: Object.freeze([0, 0, 0]) as readonly [number, number, number]
});

const AUTO_ROTATE_IDLE_MS = 3600;
const AUTO_ROTATE_SOFT_RESUME_MS = 1800;
const AUTO_ROTATE_BASE_SPEED = 0.34;

// ── CameraControlsRestore class ──────────────────────────────────────────────

class CameraControlsRestore {
    // ── Auto-rotate state ─────────────────────────────────────────────────
    autoRotate = $state<boolean>(false);
    autoRotateSuspended = $state<boolean>(false);
    autoRotateSoftResumeStartedAt = $state<number>(0);
    autoRotateResumeTimer = $state<ReturnType<typeof setTimeout> | null>(null);
    autoRotateResumeDueAt = $state<number>(0);

    // ── Camera overview pose ──────────────────────────────────────────────

    settleCameraToOverviewPose(): boolean {
        const _s = state as unknown as SemanticState;
        if (_s.camera == null || _s.controls == null) return false;
        if (_s.sceneRevealActive) return false;
        // Note: avoid `!==` on Svelte-5-rune state properties — the strict-mode
        // compiler bug inverts `!==` to `===`. Use `!= null` (Pattern 3) and
        // positive equality (Pattern 2) instead.
        if (_s.focusedNode != null) return false;
        if (_s.selectedPoint != null) return false;
        const _mode = _s.navState?.mode;
        if (_mode === 'overview') { /* ok — fall through */ } else return false;
        if (_s.trailDepth === 0) { /* ok — fall through */ } else return false;

        const cam = _s.camera;
        const ctrl = _s.controls;
        const [px, py, pz] = OVERVIEW_CAMERA_POSE.position;
        const [tx, ty, tz] = OVERVIEW_CAMERA_POSE.target;
        cam.position.set?.(px, py, pz);
        ctrl.target.set?.(tx, ty, tz);
        cam.lookAt?.(tx, ty, tz);
        ctrl.update();
        return true;
    }

    // ── Auto-rotate allowed check ─────────────────────────────────────────

    isCameraIdleOrbitAllowed(): boolean {
        const _s = state as unknown as SemanticState;
        const prefersReduced = prefersReducedMotion();
        return (
            this.autoRotate &&
            !prefersReduced &&
            _s.currentView === 'galaxy' &&
            _s.focusedNode === null &&
            _s.selectedPoint === null &&
            _s.navState.mode === 'overview' &&
            !this.autoRotateSuspended &&
            !_s.sceneRevealActive &&
            !_s.searchGlowActive
        );
    }

    // ── Orbit sync ────────────────────────────────────────────────────────

    syncOrbitAutoRotate(): void {
        const _s = state as unknown as SemanticState;
        if (_s.controls != null) {
            const allowed = this.isCameraIdleOrbitAllowed();
            _s.controls.autoRotate = allowed;
            if (!allowed) {
                _s.controls.autoRotateSpeed = 0;
                if (this.autoRotateSoftResumeStartedAt) this.autoRotateSoftResumeStartedAt = 0;
            } else if (!this.autoRotateSoftResumeStartedAt && (_s.controls.autoRotateSpeed ?? 0) <= 0) {
                _s.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED;
            }
        }
    }

    // ── Suspend/resume ────────────────────────────────────────────────────

    setAutoRotateSuspended(suspended: boolean): void {
        if (this.autoRotateSuspended === suspended) return;
        this.autoRotateSuspended = suspended;
        // Legacy mirror
        const _s = state as unknown as SemanticState;
        _s.autoRotateSuspended = suspended;
        if (suspended) {
            this.autoRotateSoftResumeStartedAt = 0;
            _s.autoRotateSoftResumeStartedAt = 0;
        } else {
            this.autoRotateSoftResumeStartedAt = performance.now();
            _s.autoRotateSoftResumeStartedAt = this.autoRotateSoftResumeStartedAt;
        }
        this.syncOrbitAutoRotate();
    }

    clearAutoRotateResumeTimer(): void {
        if (!this.autoRotateResumeTimer) return;
        clearTimeout(this.autoRotateResumeTimer);
        this.autoRotateResumeTimer = null;
        this.autoRotateResumeDueAt = 0;
        // Legacy mirror
        const _s = state as unknown as SemanticState;
        _s.autoRotateResumeTimer = null;
        _s.autoRotateResumeDueAt = 0;
    }

    scheduleAutoRotateResume(delay: number = AUTO_ROTATE_IDLE_MS): void {
        this.clearAutoRotateResumeTimer();
        if (prefersReducedMotion()) return;
        const _s = state as unknown as SemanticState;
        // Note: avoid `!==` on Svelte-5-rune state properties — the strict-mode
        // compiler bug inverts `!==` to `===`. Use positive equality (Pattern 2)
        // and `!= null` (Pattern 3) instead.
        const _isGalaxy = _s.currentView === 'galaxy';
        const _noFocus = _s.focusedNode == null;
        const _noSelection = _s.selectedPoint == null;
        const _isOverview = _s.navState.mode === 'overview';
        const _pocketActive = (_s.navState.focusPocketMeta as { active?: boolean } | null)?.active === true;
        const _trailZero = _s.trailDepth === 0;
        if (
            !this.autoRotate ||
            !_isGalaxy ||
            !_noFocus ||
            !_noSelection ||
            _s.sceneRevealActive ||
            !_isOverview ||
            _pocketActive ||
            !_trailZero
        )
            return;
        this.autoRotateResumeDueAt = performance.now() + delay;
        _s.autoRotateResumeDueAt = this.autoRotateResumeDueAt;
        this.autoRotateResumeTimer = setTimeout(() => {
            this.autoRotateResumeTimer = null;
            this.autoRotateResumeDueAt = 0;
            _s.autoRotateResumeTimer = null;
            _s.autoRotateResumeDueAt = 0;
            if (
                this.autoRotate &&
                _s.currentView === 'galaxy' &&
                _s.focusedNode == null &&
                _s.selectedPoint == null &&
                _s.navState.mode === 'overview' &&
                !_s.sceneRevealActive &&
                (_s.navState.focusPocketMeta as { active?: boolean } | null)?.active !== true && // audit-ok: plain function, not transformed — bundle preserves native !==
                _s.trailDepth === 0
            ) {
                this.setAutoRotateSuspended(false);
            }
        }, delay);
    }

    noteSceneInteraction(delay: number = AUTO_ROTATE_IDLE_MS): void {
        this.setAutoRotateSuspended(true);
        this.scheduleAutoRotateResume(delay);
    }

    // ── Soft resume progress ──────────────────────────────────────────────

    updateAutoRotateSoftResume(now: number = performance.now()): void {
        const _s = state as unknown as SemanticState;
        if (_s.controls == null) return;
        this.syncOrbitAutoRotate();
        if (!_s.controls.autoRotate) return;
        if (!this.autoRotateSoftResumeStartedAt) {
            _s.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED;
            return;
        }

        const progress = Math.min(
            1,
            Math.max(0, (now - this.autoRotateSoftResumeStartedAt) / AUTO_ROTATE_SOFT_RESUME_MS)
        );
        const eased = easeInOutCubic(progress);
        _s.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED * eased;
        if (progress >= 1) {
            this.autoRotateSoftResumeStartedAt = 0;
            _s.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED;
        }
    }

    // ── Toggle ────────────────────────────────────────────────────────────

    toggleAutoRotate(): void {
        const _s = state as unknown as SemanticState;
        const prefersReduced = prefersReducedMotion();
        if (prefersReduced) {
            this.autoRotate = false;
            _s.autoRotate = false;
            if (_s.controls != null) {
                _s.controls.autoRotate = false;
                _s.controls.autoRotateSpeed = 0;
            }
            const rotateBtn = document.getElementById('btn-rotate');
            if (rotateBtn) {
                rotateBtn.setAttribute('aria-pressed', 'false');
                rotateBtn.setAttribute('aria-disabled', 'true');
            }
            return;
        }
        this.autoRotate = !this.autoRotate;
        _s.autoRotate = this.autoRotate;
        if (_s.controls != null) {
            _s.controls.autoRotate = this.autoRotate && !this.autoRotateSuspended;
        }
        const rotateBtn = document.getElementById('btn-rotate');
        if (rotateBtn) {
            rotateBtn.setAttribute('aria-pressed', String(this.autoRotate === true));
            rotateBtn.removeAttribute('aria-disabled');
        }
    }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const cameraControlsRestore = new CameraControlsRestore();

// ── Legacy-compatible function exports ───────────────────────────────────────
// These maintain the same API surface as js/modules/camera-controls-restore.ts
// so existing consumers (choreography, bridge) don't need import changes.

export function settleCameraToOverviewPose(): boolean {
    return cameraControlsRestore.settleCameraToOverviewPose();
}

export function isCameraIdleOrbitAllowed(): boolean {
    return cameraControlsRestore.isCameraIdleOrbitAllowed();
}

export function syncOrbitAutoRotate(): void {
    cameraControlsRestore.syncOrbitAutoRotate();
}

export function setAutoRotateSuspended(suspended: boolean): void {
    cameraControlsRestore.setAutoRotateSuspended(suspended);
}

export function clearAutoRotateResumeTimer(): void {
    cameraControlsRestore.clearAutoRotateResumeTimer();
}

export function scheduleAutoRotateResume(delay: number = AUTO_ROTATE_IDLE_MS): void {
    cameraControlsRestore.scheduleAutoRotateResume(delay);
}

export function noteSceneInteraction(delay: number = AUTO_ROTATE_IDLE_MS): void {
    cameraControlsRestore.noteSceneInteraction(delay);
}

export function updateAutoRotateSoftResume(now: number = performance.now()): void {
    cameraControlsRestore.updateAutoRotateSoftResume(now);
}

export function toggleAutoRotate(): void {
    cameraControlsRestore.toggleAutoRotate();
}
