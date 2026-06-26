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

import { appState as _state } from '@lib/state/app.svelte'
import type { SemanticState } from '@lib/state/state-types'
const state = _state as unknown as SemanticState
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
        // _s alias removed: state is now typed as SemanticState at module level
        if (state.camera == null || state.controls == null) return false
        if (state.sceneRevealActive) return false
        if (state.focusedNode != null) return false
        if (state.selectedPoint != null) return false
        const _mode = state.navState?.mode
        if (_mode === 'overview') {
            /* ok — fall through */
        } else return false
        if (state.trailDepth === 0) {
            /* ok — fall through */
        } else return false

        const cam = state.camera
        const ctrl = state.controls
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
        // _s alias removed: state is now typed as SemanticState at module level
        const prefersReduced = prefersReducedMotion()
        return (
            this.autoRotate &&
            !prefersReduced &&
            state.currentView === 'galaxy' &&
            state.focusedNode === null &&
            state.selectedPoint === null &&
            state.navState.mode === 'overview' &&
            !this.autoRotateSuspended &&
            !state.sceneRevealActive &&
            !state.searchGlowActive
        )
    }

    // ── Orbit sync ────────────────────────────────────────────────────────

    syncOrbitAutoRotate(): void {
        // _s alias removed: state is now typed as SemanticState at module level
        if (state.controls != null) {
            const allowed = this.isCameraIdleOrbitAllowed()
            state.controls.autoRotate = allowed
            if (!allowed) {
                state.controls.autoRotateSpeed = 0
                if (this.autoRotateSoftResumeStartedAt) this.autoRotateSoftResumeStartedAt = 0
            } else if (!this.autoRotateSoftResumeStartedAt && (state.controls.autoRotateSpeed ?? 0) <= 0) {
                state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED
            }
        }
    }

    // ── Suspend/resume ────────────────────────────────────────────────────

    setAutoRotateSuspended(suspended: boolean): void {
        if (this.autoRotateSuspended === suspended) return
        this.autoRotateSuspended = suspended
        // Legacy mirror
        // _s alias removed: state is now typed as SemanticState at module level
        state.autoRotateSuspended = suspended
        if (suspended) {
            this.autoRotateSoftResumeStartedAt = 0
            state.autoRotateSoftResumeStartedAt = 0
        } else {
            this.autoRotateSoftResumeStartedAt = performance.now()
            state.autoRotateSoftResumeStartedAt = this.autoRotateSoftResumeStartedAt
        }
        this.syncOrbitAutoRotate()
    }

    clearAutoRotateResumeTimer(): void {
        if (!this.autoRotateResumeTimer) return
        clearTimeout(this.autoRotateResumeTimer)
        this.autoRotateResumeTimer = null
        this.autoRotateResumeDueAt = 0
        // Legacy mirror
        // _s alias removed: state is now typed as SemanticState at module level
        state.autoRotateResumeTimer = null
        state.autoRotateResumeDueAt = 0
    }

    scheduleAutoRotateResume(delay: number = AUTO_ROTATE_IDLE_MS): void {
        this.clearAutoRotateResumeTimer()
        if (prefersReducedMotion()) return
        // _s alias removed: state is now typed as SemanticState at module level
        const _isGalaxy = state.currentView === 'galaxy'
        const _noFocus = state.focusedNode == null
        const _noSelection = state.selectedPoint == null
        const _isOverview = state.navState.mode === 'overview'
        const _pocketActive = (state.navState.focusPocketMeta as { active?: boolean } | null)?.active === true
        const _trailZero = state.trailDepth === 0
        if (
            !this.autoRotate ||
            !_isGalaxy ||
            !_noFocus ||
            !_noSelection ||
            state.sceneRevealActive ||
            !_isOverview ||
            _pocketActive ||
            !_trailZero
        )
            return
        this.autoRotateResumeDueAt = performance.now() + delay
        state.autoRotateResumeDueAt = this.autoRotateResumeDueAt
        this.autoRotateResumeTimer = setTimeout(() => {
            this.autoRotateResumeTimer = null
            this.autoRotateResumeDueAt = 0
            state.autoRotateResumeTimer = null
            state.autoRotateResumeDueAt = 0
            if (
                this.autoRotate &&
                state.currentView === 'galaxy' &&
                state.focusedNode == null &&
                state.selectedPoint == null &&
                state.navState.mode === 'overview' &&
                !state.sceneRevealActive &&
                (state.navState.focusPocketMeta as { active?: boolean } | null)?.active !== true &&
                state.trailDepth === 0
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
        // _s alias removed: state is now typed as SemanticState at module level
        if (state.controls == null) return
        this.syncOrbitAutoRotate()
        if (!state.controls.autoRotate) return
        if (!this.autoRotateSoftResumeStartedAt) {
            state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED
            return
        }

        const progress = Math.min(
            1,
            Math.max(0, (now - this.autoRotateSoftResumeStartedAt) / AUTO_ROTATE_SOFT_RESUME_MS)
        )
        const eased = easeInOutCubic(progress)
        state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED * eased
        if (progress >= 1) {
            this.autoRotateSoftResumeStartedAt = 0
            state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED
        }
    }

    // ── Toggle ────────────────────────────────────────────────────────────

    toggleAutoRotate(): void {
        // _s alias removed: state is now typed as SemanticState at module level
        const prefersReduced = prefersReducedMotion()
        if (prefersReduced) {
            this.autoRotate = false
            state.autoRotate = false
            if (state.controls != null) {
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
        this.autoRotate = !this.autoRotate
        state.autoRotate = this.autoRotate
        if (state.controls != null) {
            state.controls.autoRotate = this.autoRotate && !this.autoRotateSuspended
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
