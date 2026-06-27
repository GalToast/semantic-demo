/**
 * @lib/engine/camera-controls-restore.svelte.ts — Svelte 5 rune-class for auto-rotate state machine and camera restore
 *
 * Ticket W11-T6: Parallel artifact to
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

import { appState } from '@lib/state/app.svelte'
import { prefersReducedMotion } from '@lib/utils/environment'
import { easeInOutCubic } from '@lib/utils/math-easing'

// ── Constants ────────────────────────────────────────────────────────────────

export const OVERVIEW_CAMERA_POSE = Object.freeze({
    position: Object.freeze([2.05, 1.55, 2.75]) as readonly [number, number, number],
    target: Object.freeze([0, 0, 0]) as readonly [number, number, number]
})

const AUTO_ROTATE_IDLE_MS = 3600
const AUTO_ROTATE_SOFT_RESUME_MS = 1800
const AUTO_ROTATE_BASE_SPEED = 0.34

// ── CameraControlsRestore class ──────────────────────────────────────────────

class CameraControlsRestore {
    // ── Auto-rotate state ─────────────────────────────────────────────────
    autoRotate = $state<boolean>(false)
    autoRotateSuspended = $state<boolean>(false)
    autoRotateSoftResumeStartedAt = $state<number>(0)
    autoRotateResumeTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    autoRotateResumeDueAt = $state<number>(0)

    // ── Camera overview pose ──────────────────────────────────────────────

    settleCameraToOverviewPose(): boolean {
        if (appState.camera == null || appState.controls == null) return false
        if (appState.sceneRevealActive) return false
        if (appState.focusedNode != null) return false
        if (appState.selectedPoint != null) return false
        const _mode = appState.navState?.mode
        if (_mode === 'overview') {
            /* ok — fall through */
        } else return false
        if (appState.trailDepth === 0) {
            /* ok — fall through */
        } else return false

        const cam = appState.camera
        const ctrl = appState.controls
        const [px, py, pz] = OVERVIEW_CAMERA_POSE.position
        const [tx, ty, tz] = OVERVIEW_CAMERA_POSE.target
        cam.position.set?.(px, py, pz)
        ctrl.target.set?.(tx, ty, tz)
        cam.lookAt?.(tx, ty, tz)
        ctrl.update()
        return true
    }

    // ── Auto-rotate allowed check ─────────────────────────────────────────

    isCameraIdleOrbitAllowed(): boolean {
        const prefersReduced = prefersReducedMotion()
        return (
            this.autoRotate &&
            !prefersReduced &&
            appState.currentView === 'galaxy' &&
            appState.focusedNode === null &&
            appState.selectedPoint === null &&
            appState.navState.mode === 'overview' &&
            !this.autoRotateSuspended &&
            !appState.sceneRevealActive &&
            !appState.searchGlowActive
        )
    }

    // ── Orbit sync ────────────────────────────────────────────────────────

    syncOrbitAutoRotate(): void {
        if (appState.controls != null) {
            const allowed = this.isCameraIdleOrbitAllowed()
            appState.controls.autoRotate = allowed
            if (!allowed) {
                appState.controls.autoRotateSpeed = 0
                if (this.autoRotateSoftResumeStartedAt) this.autoRotateSoftResumeStartedAt = 0
            } else if (!this.autoRotateSoftResumeStartedAt && (appState.controls.autoRotateSpeed ?? 0) <= 0) {
                appState.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED
            }
        }
    }

    // ── Suspend/resume ────────────────────────────────────────────────────

    setAutoRotateSuspended(suspended: boolean): void {
        if (this.autoRotateSuspended === suspended) return
        this.autoRotateSuspended = suspended
        // Legacy mirror
        appState.autoRotateSuspended = suspended
        if (suspended) {
            this.autoRotateSoftResumeStartedAt = 0
            appState.autoRotateSoftResumeStartedAt = 0
        } else {
            this.autoRotateSoftResumeStartedAt = performance.now()
            appState.autoRotateSoftResumeStartedAt = this.autoRotateSoftResumeStartedAt
        }
        this.syncOrbitAutoRotate()
    }

    clearAutoRotateResumeTimer(): void {
        if (!this.autoRotateResumeTimer) return
        clearTimeout(this.autoRotateResumeTimer)
        this.autoRotateResumeTimer = null
        this.autoRotateResumeDueAt = 0
        // Legacy mirror
        appState.autoRotateResumeTimer = null
        appState.autoRotateResumeDueAt = 0
    }

    scheduleAutoRotateResume(delay: number = AUTO_ROTATE_IDLE_MS): void {
        this.clearAutoRotateResumeTimer()
        if (prefersReducedMotion()) return
        const _isGalaxy = appState.currentView === 'galaxy'
        const _noFocus = appState.focusedNode == null
        const _noSelection = appState.selectedPoint == null
        const _isOverview = appState.navState.mode === 'overview'
        const _pocketActive = (appState.navState.focusPocketMeta as { active?: boolean } | null)?.active === true
        const _trailZero = appState.trailDepth === 0
        if (
            !this.autoRotate ||
            !_isGalaxy ||
            !_noFocus ||
            !_noSelection ||
            !appState.sceneRevealActive ||
            !_isOverview ||
            _pocketActive ||
            !_trailZero
        )
            return
        this.autoRotateResumeDueAt = performance.now() + delay
        appState.autoRotateResumeDueAt = this.autoRotateResumeDueAt
        this.autoRotateResumeTimer = setTimeout(() => {
            this.autoRotateResumeTimer = null
            this.autoRotateResumeDueAt = 0
            appState.autoRotateResumeTimer = null
            appState.autoRotateResumeDueAt = 0
            if (
                this.autoRotate &&
                appState.currentView === 'galaxy' &&
                appState.focusedNode == null &&
                appState.selectedPoint == null &&
                appState.navState.mode === 'overview' &&
                !appState.sceneRevealActive &&
                (appState.navState.focusPocketMeta as { active?: boolean } | null)?.active !== true &&
                appState.trailDepth === 0
            ) {
                this.setAutoRotateSuspended(false)
            }
        }, delay)
    }

    noteSceneInteraction(delay: number = AUTO_ROTATE_IDLE_MS): void {
        this.setAutoRotateSuspended(true)
        this.scheduleAutoRotateResume(delay)
    }

    // ── Soft resume progress ──────────────────────────────────────────────

    updateAutoRotateSoftResume(now: number = performance.now()): void {
        if (appState.controls == null) return
        this.syncOrbitAutoRotate()
        if (!appState.controls.autoRotate) return
        if (!this.autoRotateSoftResumeStartedAt) {
            appState.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED
            return
        }

        const progress = Math.min(
            1,
            Math.max(0, (now - this.autoRotateSoftResumeStartedAt) / AUTO_ROTATE_SOFT_RESUME_MS)
        )
        const eased = easeInOutCubic(progress)
        appState.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED * eased
        if (progress >= 1) {
            this.autoRotateSoftResumeStartedAt = 0
            appState.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED
        }
    }

    // ── Toggle ────────────────────────────────────────────────────────────

    toggleAutoRotate(): void {
        const prefersReduced = prefersReducedMotion()
        if (prefersReduced) {
            this.autoRotate = false
            appState.autoRotate = false
            if (appState.controls != null) {
                appState.controls.autoRotate = false
                appState.controls.autoRotateSpeed = 0
            }
            const rotateBtn = document.getElementById('btn-rotate')
            if (rotateBtn) {
                rotateBtn.setAttribute('aria-pressed', 'false')
                rotateBtn.setAttribute('aria-disabled', 'true')
            }
            return
        }
        this.autoRotate = !this.autoRotate
        appState.autoRotate = this.autoRotate
        if (appState.controls != null) {
            appState.controls.autoRotate = this.autoRotate && !this.autoRotateSuspended
        }
        const rotateBtn = document.getElementById('btn-rotate')
        if (rotateBtn) {
            rotateBtn.setAttribute('aria-pressed', String(this.autoRotate === true))
            rotateBtn.removeAttribute('aria-disabled')
        }
    }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const cameraControlsRestore = new CameraControlsRestore()

// ── Legacy-compatible function exports ───────────────────────────────────────
// These maintain the same API surface as
// so existing consumers (choreography, bridge) don't need import changes.

export function settleCameraToOverviewPose(): boolean {
    return cameraControlsRestore.settleCameraToOverviewPose()
}

export function isCameraIdleOrbitAllowed(): boolean {
    return cameraControlsRestore.isCameraIdleOrbitAllowed()
}

export function syncOrbitAutoRotate(): void {
    cameraControlsRestore.syncOrbitAutoRotate()
}

export function setAutoRotateSuspended(suspended: boolean): void {
    cameraControlsRestore.setAutoRotateSuspended(suspended)
}

export function clearAutoRotateResumeTimer(): void {
    cameraControlsRestore.clearAutoRotateResumeTimer()
}

export function scheduleAutoRotateResume(delay: number = AUTO_ROTATE_IDLE_MS): void {
    cameraControlsRestore.scheduleAutoRotateResume(delay)
}

export function noteSceneInteraction(delay: number = AUTO_ROTATE_IDLE_MS): void {
    cameraControlsRestore.noteSceneInteraction(delay)
}

export function updateAutoRotateSoftResume(now: number = performance.now()): void {
    cameraControlsRestore.updateAutoRotateSoftResume(now)
}

export function toggleAutoRotate(): void {
    cameraControlsRestore.toggleAutoRotate()
}
