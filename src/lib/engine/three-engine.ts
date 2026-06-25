/**
 * @lib/engine/three-engine.ts — Barrel re-export for the three-engine submodules
 *
 * Re-exports the full public API from the three focused submodules
 * (core, mycelium, search) plus the shared delegation surface and constants.
 *
 * Module decomposition (W47):
 *   three-engine-core.ts    — lifecycle / render loop / shared lazy cache
 *   three-engine-mycelium.ts — mycelium & point-cloud wrappers
 *   three-engine-search.ts  — search & interaction visual wrappers
 *
 * Consumers import from this barrel; the split is internal.
 */

// ── Re-export: core (lifecycle / render loop) ────────────────────────────────

export {
    initThreeJS,
    animate,
    deinit,
    cancelAnimate,
    onWindowResize,
    updateCameraViewportOffset,
    applyMapFlatteningLayout
} from './three-engine-core'

// ── Re-export: mycelium / thread visuals ───────────────────────────────────────

export {
    updateMyceliumThreads,
    createPoints,
    createMycelium,
    shouldRenderThreads,
    shouldRenderBridgeThreads
} from './three-engine-mycelium'

// ── Re-export: search / interaction visuals ───────────────────────────────────

export {
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation,
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold
} from './three-engine-search'

// ── Re-export: renderer diagnostics ────────────────────────────────────────────

export { getSceneRenderableDiagnostics } from './renderer/renderer-diagnostics'

// ── Constants (spread-copied from node-manager for stable identity) ─────────────

import {
    SCENE_ATMOSPHERE as PORT_SCENE_ATMOSPHERE,
    MYCELIUM_FIELD_SCALE as PORT_MYCELIUM_FIELD_SCALE
} from '@lib/engine/node-manager'

export const SCENE_ATMOSPHERE: typeof import('@lib/engine/node-manager').SCENE_ATMOSPHERE = {
    ...PORT_SCENE_ATMOSPHERE
}
export const MYCELIUM_FIELD_SCALE: typeof import('@lib/engine/node-manager').MYCELIUM_FIELD_SCALE = {
    ...PORT_MYCELIUM_FIELD_SCALE
}

// ── Delegation surface ─────────────────────────────────────────────────────────
//
// Import the named wrappers so engineDelegates can forward to them.
// New code should prefer calling engineDelegates.foo() directly so the
// indirection is visible at the call site.

import { applyMapFlatteningLayout } from './three-engine-core'
import { updateMyceliumThreads, createPoints, createMycelium } from './three-engine-mycelium'
import {
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation,
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold
} from './three-engine-search'

export const engineDelegates = {
    updateMyceliumThreads,
    applyMapFlatteningLayout,
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation,
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold,
    createPoints,
    createMycelium
}
