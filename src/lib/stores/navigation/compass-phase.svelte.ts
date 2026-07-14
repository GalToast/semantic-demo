/**
 * @lib/stores/navigation/compass-phase.svelte.ts — Compass phase management
 *
 * Manages loading phase keys and scene reveal state that drive the
 * compass/loading UI transitions.
 */
import { writeNavStateMirror, _readNavSnapshot } from './navigation-state.svelte.ts'

/** Set the current loading phase key. */
export function setLoadingPhase(phase: string): void {
    writeNavStateMirror({ loadingPhaseKey: phase })
}

/** Backward-compatible alias for callers using the legacy nav-state field name. */
export const setLoadingPhaseKey = setLoadingPhase

/** Start the scene reveal sequence. */
export function startSceneReveal(): void {
    writeNavStateMirror({ sceneRevealActive: true, sceneRevealStartedAt: Date.now() })
}

/** Complete the scene reveal sequence. */
export function completeSceneReveal(): void {
    writeNavStateMirror({ sceneRevealActive: false })
}

/** Directly set scene reveal active state. */
export function setSceneRevealActive(active: boolean): void {
    const cur = _readNavSnapshot()
    const startedAt = active ? cur.sceneRevealStartedAt || Date.now() : cur.sceneRevealStartedAt
    writeNavStateMirror({ sceneRevealActive: active, sceneRevealStartedAt: startedAt })
}
