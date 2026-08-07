/**
 * @lib/engine/camera-controls-core.svelte.ts — Svelte 5 rune-class for camera focus transition, assist, and route exploration
 *
 * Ticket W11-T6: Parallel artifact to
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

import { appState } from '@lib/state/app.svelte'
import type { Vector3Like } from '@lib/state/types/core-types'
import { focusStore } from '@lib/stores/focus.svelte'
import { isSearchRouteFocusActive, applyFocusOrbitSlack, clearFocusOrbitSlack } from './camera-choreography/orbit-slack'
import { setRouteExplorationPhase } from '@lib/stores/journey.svelte'

// ── Types ────────────────────────────────────────────────────────────────────

interface TransitionOptions {
    duration?: number
}

interface RouteExplorationState {
    phase: string
    reason: string
    startedAt: number
}

// ── CameraControlsCore class ─────────────────────────────────────────────────

class CameraControlsCore {
    // ── Focus transition state ────────────────────────────────────────────
    focusTransitionMode = $state<string>('idle')
    focusTransitionStartedAt = $state<number>(0)
    focusTransitionSettleTimer = $state<number | null>(null)

    // ── Camera assist state ───────────────────────────────────────────────
    focusCameraAssistActive = $state<boolean>(false)
    focusCameraAssistUntil = $state<number>(0)
    focusCameraAssistReason = $state<string>('')

    // ── Route exploration state ───────────────────────────────────────────
    routeExplorationState = $state<RouteExplorationState>({
        phase: 'idle',
        reason: '',
        startedAt: 0
    })

    // ── Focus camera offset (set by choreography, read by focus.ts) ──────
    // Owned by this class; the appState.focusCameraOffset field is a legacy
    // mirror kept in lockstep via setFocusCameraOffset() / releaseFocusCameraAssist().
    focusCameraOffset = $state<{ x: number; y: number; z: number } | null>(null)

    // ── Derived helpers ───────────────────────────────────────────────────
    isTransitioning = $derived(!(this.focusTransitionMode === 'idle'))
    isCameraAssistActive = $derived(this.focusCameraAssistActive && this.focusCameraAssistUntil > performance.now())

    // ── Focus transition ──────────────────────────────────────────────────

    setFocusTransitionMode(mode: string, options: TransitionOptions = {}): void {
        const normalizedMode = String(mode || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle'
        // FocusTransitionMode is a coarse-grained state machine value
        // ('idle' | 'entering' | 'settling' | 'inside' | 'exiting'). The DOM
        // dataset and Svelte store carry the raw style name ('focus',
        // 'search', 'walk', etc.) for CSS hooks, but the validated legacy
        // state field must only receive canonical mode values to satisfy
        // the runtime state validator.
        const canonicalMode: 'idle' | 'entering' = normalizedMode === 'idle' ? 'idle' : 'entering'
        this.focusTransitionMode = canonicalMode
        this.focusTransitionStartedAt = performance.now()
        if (this.focusTransitionSettleTimer != null) {
            window.clearTimeout(this.focusTransitionSettleTimer)
            this.focusTransitionSettleTimer = null
        }
        // Legacy mirror for choreography files that still read from state.focusState.focusTransitionMode
        appState.focusState.focusTransitionMode = canonicalMode
        appState.focusState.focusTransitionStartedAt = this.focusTransitionStartedAt

        // Tier-2 parity cleanup: drop the body.dataset write. CSS uses class
        // selectors (body.focus-transition-phase-arriving), not data attributes.
        // Parity-attrs writes focusTransition from focusStore.transitionMode.
        if (document.body) {
            // Mirror to CSS class for class-based selectors
            for (const cls of Array.from(document.body.classList)) {
                if (cls.startsWith('focus-transition-phase-')) document.body.classList.remove(cls)
            }
            document.body.classList.add(`focus-transition-phase-${canonicalMode === 'idle' ? 'idle' : 'arriving'}`)
        }
        const duration = Math.max(0, Number.isFinite(options.duration) ? options.duration! : 720)
        if (canonicalMode === 'idle') return
        this.focusTransitionSettleTimer = window.setTimeout(() => {
            if (this.focusTransitionMode !== canonicalMode) return
            // Complete the transition: the settle window is over, so flip the
            // canonical mode back to 'idle' (not just the CSS phase class).
            // Parity (body dataset focus-transition-*) and Svelte consumers
            // read focusStore.transitionMode / focusTransitionMode, and a
            // transition that never returns to 'idle' leaves hit-testing,
            // isTransitioning gates, and the focus-transition-entering body
            // class stuck forever — observed on deep-link boot where the
            // second focus pass re-arms entering and the focus card becomes
            // click-dead (painted but not hit-testable).
            this.focusTransitionMode = 'idle'
            if (appState.focusState) {
                appState.focusState.focusTransitionMode = 'idle'
            }
            if (document.body) {
                // NOTE: body.dataset.focusTransitionPhase removed — CSS uses class selectors
                for (const cls of Array.from(document.body.classList)) {
                    if (cls.startsWith('focus-transition-phase-')) document.body.classList.remove(cls)
                }
                document.body.classList.add('focus-transition-phase-settled')
            }
            // Publish through the focus store so parity consumers (body
            // dataset.focusTransition, focus-transition-* class mirrors) get
            // the idle flip without waiting for an unrelated store write.
            focusStore.update((s) => ({ ...s, transitionMode: 'idle' }))
        }, duration + 180)
    }

    getFocusTransitionProgress(duration: number = 640): number {
        if (!this.focusTransitionStartedAt) return 1
        return Math.min(1, Math.max(0, (performance.now() - this.focusTransitionStartedAt) / duration))
    }

    // ── Camera assist ─────────────────────────────────────────────────────

    startFocusCameraAssist(duration: number = 900, reason: string = 'focus'): void {
        this.focusCameraAssistActive = true
        this.focusCameraAssistUntil = performance.now() + Math.max(180, duration)
        this.focusCameraAssistReason = reason
        // Legacy mirror
        appState.focusCameraAssistActive = true
        appState.focusCameraAssistUntil = this.focusCameraAssistUntil
        appState.focusCameraAssistReason = reason
        this.syncCameraAssistDataset()
    }

    releaseFocusCameraAssist(reason: string = 'manual'): void {
        if (this.shouldMarkRouteExploration(reason)) {
            this.markRouteExploration(reason)
        }
        if (!this.focusCameraAssistActive && !appState.focusCameraOffset) {
            this.focusCameraAssistReason = reason
            appState.focusCameraAssistReason = reason
            this.syncCameraAssistDataset()
            return
        }
        this.focusCameraAssistActive = false
        this.focusCameraAssistUntil = 0
        this.focusCameraAssistReason = reason
        // Single-writer route: setFocusCameraOffset handles BOTH the class
        // $state field and the legacy appState mirror in one call.
        this.setFocusCameraOffset(null)
        // Legacy mirror
        appState.focusCameraAssistActive = false
        appState.focusCameraAssistUntil = 0
        appState.focusCameraAssistReason = reason
        this.syncCameraAssistDataset()
    }

    focusCameraAssistIsActive(now: number = performance.now()): boolean {
        if (!this.focusCameraAssistActive) return false
        if (now <= this.focusCameraAssistUntil) return true
        this.releaseFocusCameraAssist('arrival-complete')
        return false
    }

    syncCameraAssistDataset(): void {
        if (!document.body) return
        const active = this.focusCameraAssistActive && this.focusCameraAssistUntil > performance.now()
        document.body.dataset.cameraAssist = active ? 'arriving' : 'free'
        document.body.dataset.cameraAssistReason = active ? this.focusCameraAssistReason : 'idle'
    }

    setCameraAssistChoreography(_phase: string = 'free', _reason: string = 'view-handoff'): void {
        // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles body.dataset sync.
        // This method is a no-op since the source of truth is the store state.
    }

    // ── Focus camera offset (single-writer — see single-writer contract) ──
    // Sole canonical writer for both the class-owned $state field and the
    // legacy appState.focusCameraOffset mirror. Choreography (focus.ts) and
    // sibling core methods (releaseFocusCameraAssist) MUST route through this
    // setter so the canonical + mirror never drift.
    setFocusCameraOffset(offset: { x: number; y: number; z: number } | Vector3Like | null): void {
        if (
            offset &&
            typeof offset.x === 'number' &&
            typeof offset.y === 'number' &&
            typeof offset.z === 'number'
        ) {
            const snapshot = { x: offset.x, y: offset.y, z: offset.z }
            this.focusCameraOffset = snapshot
            // Legacy mirror — same scalar triple (avoid retaining a Three.js
            // Vector3 reference inside the rune state).
            appState.focusCameraOffset = snapshot
        } else {
            this.focusCameraOffset = null
            appState.focusCameraOffset = null
        }
    }

    // ── Route exploration ─────────────────────────────────────────────────

    setRouteExplorationState(phase: string = 'idle', reason: string = ''): void {
        const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle'
        const normalizedReason = String(reason || '').replace(/[^a-z0-9-]/gi, '') || ''
        this.routeExplorationState = {
            phase: normalizedPhase,
            reason: normalizedReason,
            startedAt: performance.now()
        }
        // Legacy mirror — routeExplorationState is a tracked sub-object
        {
            appState.routeExplorationState = {
                phase: normalizedPhase,
                reason: normalizedReason,
                startedAt: performance.now()
            }
        }
        // Wires routeExplorationPhase into the journey store so parity-attrs
        // (which reads journey.routeExplorationPhase) produces the right
        // data-route-exploration value.
        setRouteExplorationPhase(normalizedPhase as 'idle' | 'free' | 'searching' | 'focusing')
        // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles body.dataset sync.
    }

    clearRouteExploration(reason: string = 'clear'): void {
        this.setRouteExplorationState('idle', reason)
        clearFocusOrbitSlack(reason)
    }

    markRouteExploration(reason: string = 'user-control'): boolean {
        if (!isSearchRouteFocusActive()) return false
        const _phaseIsFree = appState.routeExplorationState.phase === 'free'
        const _reasonMatches = appState.routeExplorationState.reason === reason
        if (!_phaseIsFree || !_reasonMatches) {
            this.setRouteExplorationState('free', reason)
            applyFocusOrbitSlack(reason)
        }
        return true
    }

    shouldMarkRouteExploration(reason: string = ''): boolean {
        return ['user-control', 'user-wheel', 'field-click'].includes(reason)
    }

    getRouteLayerOrigin(): string {
        return 'galaxy'
    }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const cameraControlsCore = new CameraControlsCore()

// ── Legacy-compatible function exports ───────────────────────────────────────
// These maintain the same API surface as
// so existing consumers (choreography, bridge) don't need import changes.

export function setFocusTransitionMode(mode: string, options: TransitionOptions = {}): void {
    cameraControlsCore.setFocusTransitionMode(mode, options)
}

export function getFocusTransitionProgress(duration: number = 640): number {
    return cameraControlsCore.getFocusTransitionProgress(duration)
}

export function startFocusCameraAssist(duration: number = 900, reason: string = 'focus'): void {
    cameraControlsCore.startFocusCameraAssist(duration, reason)
}

export function releaseFocusCameraAssist(reason: string = 'manual'): void {
    cameraControlsCore.releaseFocusCameraAssist(reason)
}

export function focusCameraAssistIsActive(now: number = performance.now()): boolean {
    return cameraControlsCore.focusCameraAssistIsActive(now)
}

export function syncCameraAssistDataset(): void {
    cameraControlsCore.syncCameraAssistDataset()
}

export function setCameraAssistChoreography(phase: string = 'free', reason: string = 'view-handoff'): void {
    cameraControlsCore.setCameraAssistChoreography(phase, reason)
}

export function setFocusCameraOffset(
    offset: { x: number; y: number; z: number } | Vector3Like | null
): void {
    cameraControlsCore.setFocusCameraOffset(offset)
}

export function setRouteExplorationState(phase: string = 'idle', reason: string = ''): void {
    cameraControlsCore.setRouteExplorationState(phase, reason)
}

export function clearRouteExploration(reason: string = 'clear'): void {
    cameraControlsCore.clearRouteExploration(reason)
}

export function markRouteExploration(reason: string = 'user-control'): boolean {
    return cameraControlsCore.markRouteExploration(reason)
}

export function shouldMarkRouteExploration(reason: string = ''): boolean {
    return cameraControlsCore.shouldMarkRouteExploration(reason)
}

export function getRouteLayerOrigin(): string {
    return cameraControlsCore.getRouteLayerOrigin()
}
