/**
 * three-lens-petals.ts — Per-frame update for focus radial mesh petals
 *
 * Extracted from three-interaction-visuals.ts (L156–195, ~40 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 1 — Per-frame update functions).
 *
 * Reads: state.focusPetalGroup, state.focusPetals
 * Writes: Three.js mesh positions/opacity/visibility/rotation/scale
 */
import { Vector3, Mesh, Material } from 'three'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state

/** Narrow a single-material object's material to a single Material instance. */
function asSingleMaterial(mat: Material | Material[]): Material {
    if (!Array.isArray(mat)) return mat
    const first = mat[0]
    if (!first) throw new Error('Expected a single material, received an empty material array.')
    return first
}

/**
 * Update the radial mesh petals around the focused/hovered node.
 * Called from updateInteractionVisuals() in the per-frame hot path.
 *
 * @param worldPos — World-space position of the focused node (null = no focus)
 * @param time — Elapsed time in seconds (now / 1000)
 * @param isInside — Whether semantic dive mode is active (affects opacity targets)
 */
export function updateSelectedNodePetals(worldPos: Vector3 | null, time: number, isInside: boolean): void {
    if (!state.focusPetalGroup || !Array.isArray(state.focusPetals)) return
    const hasFocus = worldPos !== null
    const targetOpacity = hasFocus ? (isInside ? 0.24 : 0.65) : 0
    state.focusPetalGroup.visible =
        hasFocus || state.focusPetals.some((petal: Mesh) => asSingleMaterial(petal.material).opacity > 0.01)
    if (hasFocus) {
        state.focusPetalGroup.position.copy(worldPos)
        state.focusPetalGroup.rotation.set(
            Math.sin(time * 0.12 + 0.3) * 0.1,
            Math.sin(time * 0.16 + 1.1) * 0.16,
            Math.sin(time * 0.1 + 2.1) * 0.08
        )
    }

    state.focusPetals.forEach((petal: Mesh, index: number) => {
        const data = petal.userData || {}
        const mat = asSingleMaterial(petal.material)
        mat.opacity += (targetOpacity - mat.opacity) * 0.1
        petal.visible = mat.opacity > 0.01
        if (!hasFocus) return

        const phase = (data.phase || 0) + time * (data.speed || 0.28)
        const radius = data.radius || 0.026
        const sway = Math.sin(time * 0.38 + index * 0.77) * 0.38 + Math.sin(time * 0.16 + index * 1.43) * 0.18
        const angle = phase + sway
        const breath = 0.82 + Math.sin(time * 0.64 + index) * 0.18 + Math.sin(time * 0.23 + index * 1.8) * 0.07
        petal.position.set(
            Math.cos(angle) * radius * breath,
            (data.lift || 0) + Math.sin(phase * 0.61) * radius * 0.34,
            Math.sin(angle) * radius * (data.tilt || 0.72) * breath
        )
        ;(mat as Material & { rotation?: number }).rotation =
            angle + Math.PI * 0.5 + Math.sin(time * 0.46 + index) * 0.44
        const length = (data.length || 0.042) * (1.0 + Math.sin(time * 0.72 + index * 0.9) * 0.18)
        const thickness = data.thickness || 0.008
        petal.scale.set(length, thickness, 1)
    })
}
