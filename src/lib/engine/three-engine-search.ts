/**
 * @lib/engine/three-engine-search.ts — Search & interaction visual wrappers
 *
 * Backward-compatible wrapper exports for search-hero, corridor-node-glow,
 * corridor animation, and interaction-visuals (semantic lens/manifold).
 * Each wrapper delegates to the underlying module through the lazy cache
 * held in three-engine-core.
 *
 * Extracted from three-engine.ts (W47 decomposition). Public API is
 * re-exported through the barrel three-engine.ts — consumers should not
 * import this file directly.
 */

import { engineState } from './three-engine-state'

// ── Search animation wrappers ──────────────────────────────────────────────────

export function triggerSearchHeroMoment(anchorIndex: number): void {
    void engineState.threeSearchAnimations?.triggerSearchHeroMoment(anchorIndex)
}

export function triggerCorridorNodeGlow(now: number): void {
    void engineState.threeSearchAnimations?.triggerCorridorNodeGlow(now)
}

export function updateCorridorNodeGlow(now: number): void {
    void engineState.threeSearchAnimations?.updateCorridorNodeGlow(now)
}

export function triggerSearchCorridorAnimation(now: number): void {
    engineState.threeSearchAnimations?.triggerSearchCorridorAnimation(now)
}

export function updateSearchCorridorAnimation(now: number): void {
    void engineState.threeSearchAnimations?.updateSearchCorridorAnimation(now)
}

export function disposeSearchCorridorAnimation(): void {
    engineState.threeSearchAnimations?.disposeSearchCorridorAnimation()
}

// ── Interaction visual wrappers ────────────────────────────────────────────────

export function updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void {
    engineState.threeInteractionVisuals?.updateInteractionVisuals(now, hoveredNode, focusedNode)
}

export function disposeInteractionVisuals(): void {
    engineState.threeInteractionVisuals?.disposeInteractionVisuals()
}

export function initSemanticLens(): void {
    engineState.threeInteractionVisuals?.initSemanticLens()
}

export function initSemanticManifold(): void {
    engineState.threeInteractionVisuals?.initSemanticManifold()
}
