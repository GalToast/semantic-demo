// camera-controls-restore.ts
// TypeScript shadow of camera-controls-restore.js
// Auto-rotate state machine and camera restore utilities.

import { state } from '../state.js';
import { prefersReducedMotion } from './environment.js';
import { easeInOutCubic } from './utils/math-easing.js';

export const OVERVIEW_CAMERA_POSE = Object.freeze({
    position: Object.freeze([1.5, 1.2, 2.0]) as readonly [number, number, number],
    target: Object.freeze([0, 0, 0]) as readonly [number, number, number]
});

/**
 * Snap the camera + OrbitControls target back to the canonical idle pose.
 */
export function settleCameraToOverviewPose(): boolean {
    if (!state.camera || !state.controls) return false;
    if (state.sceneRevealActive) return false;
    if (state.focusedNode !== null) return false;
    if (state.selectedPoint !== null) return false;
    if (state.navState?.mode !== 'overview') return false;
    if (state.trailDepth !== 0) return false;

    const [px, py, pz] = OVERVIEW_CAMERA_POSE.position;
    const [tx, ty, tz] = OVERVIEW_CAMERA_POSE.target;
    (state.camera as any).position.set(px, py, pz);
    (state.controls as any).target.set(tx, ty, tz);
    (state.camera as any).lookAt(tx, ty, tz);
    if (typeof (state.controls as any).update === 'function') {
        (state.controls as any).update();
    }
    return true;
}

/**
 * Check if camera idle orbit (auto-rotate) is allowed.
 */
export function isCameraIdleOrbitAllowed(): boolean {
    const prefersReduced = prefersReducedMotion();
    return (
        state.autoRotate &&
        !prefersReduced &&
        state.currentView === 'galaxy' &&
        state.focusedNode === null &&
        state.selectedPoint === null &&
        state.navState.mode === 'overview' &&
        !state.autoRotateSuspended &&
        !state.sceneRevealActive &&
        !state.searchGlowActive
    );
}

/**
 * Sync OrbitControls auto-rotate with state.
 */
export function syncOrbitAutoRotate(): void {
    if (state.controls) {
        const allowed = isCameraIdleOrbitAllowed();
        (state.controls as any).autoRotate = allowed;
        if (!allowed) {
            (state.controls as any).autoRotateSpeed = 0;
            if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0;
        } else if (!state.autoRotateSoftResumeStartedAt && (state.controls as any).autoRotateSpeed <= 0) {
            (state.controls as any).autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
                ? state.AUTO_ROTATE_BASE_SPEED
                : 0.5;
        }
    }
}

/**
 * Set auto-rotate suspended state.
 */
export function setAutoRotateSuspended(suspended: boolean): void {
    if (state.autoRotateSuspended === suspended) return;
    state.autoRotateSuspended = suspended;
    if (suspended) {
        state.autoRotateSoftResumeStartedAt = 0;
    } else {
        state.autoRotateSoftResumeStartedAt = performance.now();
    }
    syncOrbitAutoRotate();
}

/**
 * Clear the auto-rotate resume timer.
 */
export function clearAutoRotateResumeTimer(): void {
    if (!state.autoRotateResumeTimer) return;
    clearTimeout(state.autoRotateResumeTimer);
    state.autoRotateResumeTimer = null;
    state.autoRotateResumeDueAt = 0;
}

/**
 * Schedule auto-rotate resume after a delay.
 */
export function scheduleAutoRotateResume(delay: number = state.AUTO_ROTATE_IDLE_MS): void {
    clearAutoRotateResumeTimer();
    if (prefersReducedMotion()) return;
    if (
        !state.autoRotate ||
        state.currentView !== 'galaxy' ||
        state.focusedNode !== null ||
        state.selectedPoint !== null ||
        state.sceneRevealActive ||
        state.navState.mode !== 'overview' ||
        (state.navState.focusPocketMeta as any)?.active ||
        state.trailDepth !== 0
    )
        return;
    state.autoRotateResumeDueAt = performance.now() + delay;
    state.autoRotateResumeTimer = setTimeout(() => {
        state.autoRotateResumeTimer = null;
        state.autoRotateResumeDueAt = 0;
        if (
            state.autoRotate &&
            state.currentView === 'galaxy' &&
            state.focusedNode === null &&
            state.selectedPoint === null &&
            state.navState.mode === 'overview' &&
            !state.sceneRevealActive &&
            !(state.navState.focusPocketMeta as any)?.active &&
            state.trailDepth === 0
        ) {
            setAutoRotateSuspended(false);
        }
    }, delay) as unknown as ReturnType<typeof setTimeout>;
}

/**
 * Note a scene interaction and schedule auto-rotate resume.
 */
export function noteSceneInteraction(delay: number = state.AUTO_ROTATE_IDLE_MS): void {
    setAutoRotateSuspended(true);
    scheduleAutoRotateResume(delay);
}

/**
 * Update auto-rotate soft resume progress.
 */
export function updateAutoRotateSoftResume(now: number = performance.now()): void {
    if (!state.controls) return;
    if (!Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)) state.AUTO_ROTATE_BASE_SPEED = 0.5;
    syncOrbitAutoRotate();
    if (!(state.controls as any).autoRotate) return;
    if (!state.autoRotateSoftResumeStartedAt) {
        (state.controls as any).autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
            ? state.AUTO_ROTATE_BASE_SPEED
            : 0.5;
        return;
    }

    const progress = Math.min(
        1,
        Math.max(0, (now - state.autoRotateSoftResumeStartedAt) / state.AUTO_ROTATE_SOFT_RESUME_MS)
    );
    const eased = easeInOutCubic(progress);
    (state.controls as any).autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
        ? state.AUTO_ROTATE_BASE_SPEED * eased
        : 0.5 * eased;
    if (progress >= 1) {
        state.autoRotateSoftResumeStartedAt = 0;
        (state.controls as any).autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
            ? state.AUTO_ROTATE_BASE_SPEED
            : 0.5;
    }
}

/**
 * Toggle auto-rotate on/off.
 */
export function toggleAutoRotate(): void {
    const prefersReduced = prefersReducedMotion();
    if (prefersReduced) {
        state.autoRotate = false;
        if (state.controls) {
            (state.controls as any).autoRotate = false;
            (state.controls as any).autoRotateSpeed = 0;
        }
        const rotateBtn = document.getElementById('btn-rotate');
        if (rotateBtn) {
            rotateBtn.setAttribute('aria-pressed', 'false');
            rotateBtn.setAttribute('aria-disabled', 'true');
        }
        return;
    }
    state.autoRotate = !state.autoRotate;
    if (state.controls) {
        (state.controls as any).autoRotate = state.autoRotate && !state.autoRotateSuspended;
    }
    const rotateBtn = document.getElementById('btn-rotate');
    if (rotateBtn) {
        rotateBtn.setAttribute('aria-pressed', String(state.autoRotate === true));
        rotateBtn.removeAttribute('aria-disabled');
    }
}
