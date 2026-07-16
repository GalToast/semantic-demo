/**
 * Typed debug registry for the focus-semantic overlay.
 *
 * Replaces the previous `(window as any).__DBG_*__` casts in
 * src/lib/journey/semantic-overlay.ts that broke the project's 0-`any`
 * typing contract (and the as-any-budget, semantic-overlay-typing-contract,
 * and semantic-overlay-lineMaterial-callback-typing-contract unit tests).
 *
 * All debug counters/flags now live here as a real typed object so debug
 * tooling can read them without `as any`. There is no `window` exposure:
 * this module-level singleton substitutes for the old globals while keeping
 * the same observable behavior (counters/flags still update on each call).
 */

export interface OverlayDebugState {
    /** removeFocusSemanticOverlay() call count. */
    rfso: number
    /** Last built overlay node count (refreshFocusSemanticOverlay). */
    overlayN: number
    /** Reference to state.focusSemanticConnectionPairs captured at push time. */
    pushRef: unknown[]
    /** Segment push (addEdge) count. */
    pushN: number
    /** updateFocusSemanticOverlayTime() call count. */
    refreshEnd: number
    /** state.focusSemanticConnectionPairs.length captured at refresh-end time. */
    pairsLen: number
    /** Reference to state.focusSemanticConnectionPairs captured at refresh-end time. */
    endRef: unknown[]
    /** Whether pushRef === state.focusSemanticConnectionPairs at refresh-end time. */
    pushEndEq: boolean
}

export const overlayDebug: OverlayDebugState = {
    rfso: 0,
    overlayN: 0,
    pushRef: null as unknown as unknown[],
    endRef: null as unknown as unknown[],
    pushN: 0,
    refreshEnd: 0,
    pairsLen: 0,
    pushEndEq: false
}

export function setOverlayDebugRfso(value: number): void {
    overlayDebug.rfso = value
}

export function setOverlayDebugOverlayN(value: number): void {
    overlayDebug.overlayN = value
}

export function setOverlayDebugPushRef(value: unknown[]): void {
    overlayDebug.pushRef = value
}

export function setOverlayDebugPushN(value: number): void {
    overlayDebug.pushN = value
}

export function setOverlayDebugRefreshEnd(value: number): void {
    overlayDebug.refreshEnd = value
}

export function setOverlayDebugPairsLen(value: number): void {
    overlayDebug.pairsLen = value
}

export function setOverlayDebugEndRef(value: unknown[]): void {
    overlayDebug.endRef = value
}

export function setOverlayDebugPushEndEq(value: boolean): void {
    overlayDebug.pushEndEq = value
}
