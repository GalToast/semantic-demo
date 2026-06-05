import { state } from '../state.js'
import { prefersReducedMotion } from './environment.js'
import { easeInOutCubic } from './utils/math-easing.js'

// -----------------------------------------------------------------------------
// AUTO-ROTATE STATE MACHINE / RESTORE
// -----------------------------------------------------------------------------
/**
 * Canonical idle/overview camera pose. Used to correct auto-rotate drift after
 * long idle periods or viewport resizes. Matches the initial camera in
 * `initThreeJS` (state.camera.position.set(1.5, 1.2, 2.0); camera.lookAt(0,0,0)).
 */
export const OVERVIEW_CAMERA_POSE = Object.freeze({
    position: Object.freeze([1.5, 1.2, 2.0]),
    target: Object.freeze([0, 0, 0])
});

/**
 * Snap the camera + OrbitControls target back to the canonical idle pose.
 * Guarded so it only fires when the app is actually in overview (no focus,
 * no selection, no trail depth, no scene reveal). Returns true if a settle
 * was applied. Does not animate — the goal is a reliable reset, not a
 * choreographed return. Callers:
 *   - returnToOverview() in lifecycle.js
 *   - onWindowResize() in scene-reveal.js (corrects long-idle drift)
 */
export function settleCameraToOverviewPose() {
    if (!state.camera || !state.controls) return false;
    if (state.sceneRevealActive) return false;
    if (state.focusedNode !== null) return false;
    if (state.selectedPoint !== null) return false;
    if (state.navState?.mode !== 'overview') return false;
    if (state.trailDepth !== 0) return false;

    const [px, py, pz] = OVERVIEW_CAMERA_POSE.position;
    const [tx, ty, tz] = OVERVIEW_CAMERA_POSE.target;
    state.camera.position.set(px, py, pz);
    state.controls.target.set(tx, ty, tz);
    state.camera.lookAt(tx, ty, tz);
    if (typeof state.controls.update === 'function') {
        state.controls.update();
    }
    return true;
}

export function isCameraIdleOrbitAllowed() {
    const prefersReduced = prefersReducedMotion()
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
    )
}

export function syncOrbitAutoRotate() {
    if (state.controls) {
        const allowed = isCameraIdleOrbitAllowed()
        state.controls.autoRotate = allowed
        if (!allowed) {
            state.controls.autoRotateSpeed = 0
            if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0
        } else if (!state.autoRotateSoftResumeStartedAt && state.controls.autoRotateSpeed <= 0) {
            state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
                ? state.AUTO_ROTATE_BASE_SPEED
                : 0.5
        }
    }
}

export function setAutoRotateSuspended(suspended) {
    if (state.autoRotateSuspended === suspended) return
    state.autoRotateSuspended = suspended
    if (suspended) {
        state.autoRotateSoftResumeStartedAt = 0
    } else {
        state.autoRotateSoftResumeStartedAt = performance.now()
    }
    syncOrbitAutoRotate()
}

export function clearAutoRotateResumeTimer() {
    if (!state.autoRotateResumeTimer) return
    clearTimeout(state.autoRotateResumeTimer)
    state.autoRotateResumeTimer = null
    state.autoRotateResumeDueAt = 0
}

export function scheduleAutoRotateResume(delay = state.AUTO_ROTATE_IDLE_MS) {
    clearAutoRotateResumeTimer()
    if (prefersReducedMotion()) return
    if (
        !state.autoRotate ||
        state.currentView !== 'galaxy' ||
        state.focusedNode !== null ||
        state.selectedPoint !== null ||
        state.sceneRevealActive ||
        state.navState.mode !== 'overview' ||
        state.navState.focusPocketMeta?.active ||
        state.trailDepth !== 0
    )
        return
    state.autoRotateResumeDueAt = performance.now() + delay
    state.autoRotateResumeTimer = setTimeout(() => {
        state.autoRotateResumeTimer = null
        state.autoRotateResumeDueAt = 0
        if (
            state.autoRotate &&
            state.currentView === 'galaxy' &&
            state.focusedNode === null &&
            state.selectedPoint === null &&
            state.navState.mode === 'overview' &&
            !state.sceneRevealActive &&
            !state.navState.focusPocketMeta?.active &&
            state.trailDepth === 0
        ) {
            setAutoRotateSuspended(false)
        }
    }, delay)
}

export function noteSceneInteraction(delay = state.AUTO_ROTATE_IDLE_MS) {
    setAutoRotateSuspended(true)
    scheduleAutoRotateResume(delay)
}

export function updateAutoRotateSoftResume(now = performance.now()) {
    if (!state.controls) return
    if (!Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)) state.AUTO_ROTATE_BASE_SPEED = 0.5
    syncOrbitAutoRotate()
    if (!state.controls.autoRotate) return
    if (!state.autoRotateSoftResumeStartedAt) {
        state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
            ? state.AUTO_ROTATE_BASE_SPEED
            : 0.5
        return
    }

    const progress = Math.min(
        1,
        Math.max(0, (now - state.autoRotateSoftResumeStartedAt) / state.AUTO_ROTATE_SOFT_RESUME_MS)
    )
    const eased = easeInOutCubic(progress)
    state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
        ? state.AUTO_ROTATE_BASE_SPEED * eased
        : 0.5 * eased
    if (progress >= 1) {
        state.autoRotateSoftResumeStartedAt = 0
        state.controls.autoRotateSpeed = Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)
            ? state.AUTO_ROTATE_BASE_SPEED
            : 0.5
    }
}

export function toggleAutoRotate() {
    const prefersReduced = prefersReducedMotion()
    if (prefersReduced) {
        state.autoRotate = false
        if (state.controls) {
            state.controls.autoRotate = false
            state.controls.autoRotateSpeed = 0
        }
        const rotateBtn = document.getElementById('btn-rotate')
        if (rotateBtn) {
            rotateBtn.setAttribute('aria-pressed', 'false')
            rotateBtn.setAttribute('aria-disabled', 'true')
        }
        return
    }
    state.autoRotate = !state.autoRotate
    if (state.controls) {
        state.controls.autoRotate = state.autoRotate && !state.autoRotateSuspended
    }
    const rotateBtn = document.getElementById('btn-rotate')
    if (rotateBtn) {
        // Reflect state.autoRotate directly — state.controls?.autoRotate is the
        // THREE OrbitControls' flag, which can be false even when state.autoRotate
        // is true (e.g., when the toggle fires before the orbit controls finish
        // initializing, or while autoRotateSuspended is briefly true).
        rotateBtn.setAttribute('aria-pressed', String(state.autoRotate === true))
        rotateBtn.removeAttribute('aria-disabled')
    }
}
