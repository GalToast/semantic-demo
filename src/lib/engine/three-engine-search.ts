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

import { _threeSearchAnimations, _threeInteractionVisuals } from './three-engine-core'

// ── Search animation wrappers ──────────────────────────────────────────────────

export function triggerSearchHeroMoment(anchorIndex: number): void {
    void _threeSearchAnimations?.triggerSearchHeroMoment(anchorIndex)
}

export function triggerCorridorNodeGlow(now: number): void {
    void _threeSearchAnimations?.triggerCorridorNodeGlow(now)
}

export function updateCorridorNodeGlow(now: number): void {
    void _threeSearchAnimations?.updateCorridorNodeGlow(now)
}

export function triggerSearchCorridorAnimation(now: number): void {
    _threeSearchAnimations?.triggerSearchCorridorAnimation(now)
}

export function updateSearchCorridorAnimation(now: number): void {
    void _threeSearchAnimations?.updateSearchCorridorAnimation(now)
}

export function disposeSearchCorridorAnimation(): void {
    _threeSearchAnimations?.disposeSearchCorridorAnimation()
}

// ── Interaction visual wrappers ────────────────────────────────────────────────

export function updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void {
    _threeInteractionVisuals?.updateInteractionVisuals(now, hoveredNode, focusedNode)
}

export function disposeInteractionVisuals(): void {
    _threeInteractionVisuals?.disposeInteractionVisuals()
}

export function initSemanticLens(): void {
    _threeInteractionVisuals?.initSemanticLens()
}

export function initSemanticManifold(): void {
    _threeInteractionVisuals?.initSemanticManifold()
}
