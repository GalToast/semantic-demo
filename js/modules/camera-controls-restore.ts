// camera-controls-restore.ts
// TypeScript shadow of camera-controls-restore.js
// Auto-rotate state machine and camera restore utilities.

import { state } from '../state.js';
import type { CameraLike, ControlsLike, SemanticState } from '../../types/state';
import { prefersReducedMotion } from './environment.js';
import { easeInOutCubic } from './utils/math-easing.js';

const _s = state as unknown as SemanticState;

export const OVERVIEW_CAMERA_POSE = Object.freeze({
    position: Object.freeze([2.05, 1.55, 2.75]) as readonly [number, number, number],
    target: Object.freeze([0, 0, 0]) as readonly [number, number, number]
});

/**
 * Snap the camera + OrbitControls target back to the canonical idle pose.
 */
export function settleCameraToOverviewPose(): boolean {
    if (_s.camera == null || _s.controls == null) return false;
    if (_s.sceneRevealActive) return false;
    if (_s.focusedNode !== null) return false;
    if (_s.selectedPoint !== null) return false;
    if (_s.navState?.mode !== 'overview') return false;
    if (_s.trailDepth !== 0) return false;

    const cam = _s.camera as CameraLike;
    const ctrl = _s.controls as ControlsLike;
    const [px, py, pz] = OVERVIEW_CAMERA_POSE.position;
    const [tx, ty, tz] = OVERVIEW_CAMERA_POSE.target;
    cam.position.set?.(px, py, pz);
    ctrl.target.set?.(tx, ty, tz);
    cam.lookAt?.(tx, ty, tz);
    ctrl.update();
    return true;
}

/**
 * Check if camera idle orbit (auto-rotate) is allowed.
 */
export function isCameraIdleOrbitAllowed(): boolean {
    const prefersReduced = prefersReducedMotion();
    return (
        _s.autoRotate &&
        !prefersReduced &&
        _s.currentView === 'galaxy' &&
        _s.focusedNode === null &&
        _s.selectedPoint === null &&
        _s.navState.mode === 'overview' &&
        !_s.autoRotateSuspended &&
        !_s.sceneRevealActive &&
        !_s.searchGlowActive
    );
}

/**
 * Sync OrbitControls auto-rotate with state.
 */
export function syncOrbitAutoRotate(): void {
    if (_s.controls != null) {
        const allowed = isCameraIdleOrbitAllowed();
        _s.controls.autoRotate = allowed;
        if (!allowed) {
            _s.controls.autoRotateSpeed = 0;
            if (_s.autoRotateSoftResumeStartedAt) _s.autoRotateSoftResumeStartedAt = 0;
        } else if (!_s.autoRotateSoftResumeStartedAt && (_s.controls.autoRotateSpeed ?? 0) <= 0) {
            _s.controls.autoRotateSpeed = Number.isFinite(_s.AUTO_ROTATE_BASE_SPEED)
                ? _s.AUTO_ROTATE_BASE_SPEED
                : 0.5;
        }
    }
}

/**
 * Set auto-rotate suspended state.
 */
export function setAutoRotateSuspended(suspended: boolean): void {
    if (_s.autoRotateSuspended === suspended) return;
    _s.autoRotateSuspended = suspended;
    if (suspended) {
        _s.autoRotateSoftResumeStartedAt = 0;
    } else {
        _s.autoRotateSoftResumeStartedAt = performance.now();
    }
    syncOrbitAutoRotate();
}

/**
 * Clear the auto-rotate resume timer.
 */
export function clearAutoRotateResumeTimer(): void {
    if (!_s.autoRotateResumeTimer) return;
    clearTimeout(_s.autoRotateResumeTimer);
    _s.autoRotateResumeTimer = null;
    _s.autoRotateResumeDueAt = 0;
}

/**
 * Schedule auto-rotate resume after a delay.
 */
export function scheduleAutoRotateResume(delay: number = _s.AUTO_ROTATE_IDLE_MS): void {
    clearAutoRotateResumeTimer();
    if (prefersReducedMotion()) return;
    if (
        !_s.autoRotate ||
        _s.currentView !== 'galaxy' ||
        _s.focusedNode !== null ||
        _s.selectedPoint !== null ||
        _s.sceneRevealActive ||
        _s.navState.mode !== 'overview' ||
        (_s.navState.focusPocketMeta as { active?: boolean } | null)?.active === true ||
        _s.trailDepth !== 0
    )
        return;
    _s.autoRotateResumeDueAt = performance.now() + delay;
    _s.autoRotateResumeTimer = setTimeout(() => {
        _s.autoRotateResumeTimer = null;
        _s.autoRotateResumeDueAt = 0;
        if (
            _s.autoRotate &&
            _s.currentView === 'galaxy' &&
            _s.focusedNode === null &&
            _s.selectedPoint === null &&
            _s.navState.mode === 'overview' &&
            !_s.sceneRevealActive &&
            (_s.navState.focusPocketMeta as { active?: boolean } | null)?.active !== true &&
            _s.trailDepth === 0
        ) {
            setAutoRotateSuspended(false);
        }
    }, delay) as unknown as ReturnType<typeof setTimeout>;
}

/**
 * Note a scene interaction and schedule auto-rotate resume.
 */
export function noteSceneInteraction(delay: number = _s.AUTO_ROTATE_IDLE_MS): void {
    setAutoRotateSuspended(true);
    scheduleAutoRotateResume(delay);
}

/**
 * Update auto-rotate soft resume progress.
 */
export function updateAutoRotateSoftResume(now: number = performance.now()): void {
    if (_s.controls == null) return;
    if (!Number.isFinite(_s.AUTO_ROTATE_BASE_SPEED)) _s.AUTO_ROTATE_BASE_SPEED = 0.5;
    syncOrbitAutoRotate();
    if (!_s.controls.autoRotate) return;
    if (!_s.autoRotateSoftResumeStartedAt) {
        _s.controls.autoRotateSpeed = Number.isFinite(_s.AUTO_ROTATE_BASE_SPEED)
            ? _s.AUTO_ROTATE_BASE_SPEED
            : 0.5;
        return;
    }

    const progress = Math.min(
        1,
        Math.max(0, (now - _s.autoRotateSoftResumeStartedAt) / _s.AUTO_ROTATE_SOFT_RESUME_MS)
    );
    const eased = easeInOutCubic(progress);
    _s.controls.autoRotateSpeed = Number.isFinite(_s.AUTO_ROTATE_BASE_SPEED)
        ? _s.AUTO_ROTATE_BASE_SPEED * eased
        : 0.5 * eased;
    if (progress >= 1) {
        _s.autoRotateSoftResumeStartedAt = 0;
        _s.controls.autoRotateSpeed = Number.isFinite(_s.AUTO_ROTATE_BASE_SPEED)
            ? _s.AUTO_ROTATE_BASE_SPEED
            : 0.5;
    }
}

/**
 * Toggle auto-rotate on/off.
 */
export function toggleAutoRotate(): void {
    const prefersReduced = prefersReducedMotion();
    if (prefersReduced) {
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
    _s.autoRotate = !_s.autoRotate;
    if (_s.controls != null) {
        _s.controls.autoRotate = _s.autoRotate && !_s.autoRotateSuspended;
    }
    const rotateBtn = document.getElementById('btn-rotate');
    if (rotateBtn) {
        rotateBtn.setAttribute('aria-pressed', String(_s.autoRotate === true));
        rotateBtn.removeAttribute('aria-disabled');
    }
}
