/**
 * three-lens-anchor-bloom.ts — Init for Step Inside bloom point light
 *
 * Extracted from three-interaction-visuals.ts initSemanticLens() (L6, ~12 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 3 — Init concern extractions).
 *
 * Creates:
 *   - anchorBloomLight: warm PointLight (0xfff4ba) for trailDepth === 2
 *
 * Handles idempotent cleanup of any prior anchorBloomLight before creating
 * a new one.
 */
import { PointLight, Scene as SceneType } from 'three'
import { appState } from '@lib/state/app.svelte'

type AppState = typeof appState

/**
 * Create the anchor bloom point light, cleaning up any prior instance first.
 * Writes state.anchorBloomLight.
 *
 * @param state — The app state object (reads/writes anchorBloomLight)
 * @param scene — The Three.js scene (target for scene.add / scene.remove)
 */
export function initAnchorBloomLight(state: AppState, scene: SceneType): void {
    // Idempotent cleanup: remove prior light if it exists
    if (state.anchorBloomLight) {
        scene.remove(state.anchorBloomLight)
        state.anchorBloomLight.dispose?.()
        state.anchorBloomLight = null
    }
    const anchorBloomLight = new PointLight(0xfff4ba, 0, 0.6)
    anchorBloomLight.name = 'anchorBloomLight'
    scene.add(anchorBloomLight)
    state.anchorBloomLight = anchorBloomLight
}
