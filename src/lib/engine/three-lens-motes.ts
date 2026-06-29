/**
 * three-lens-motes.ts — Per-frame update for focus mote orbital sprites
 *
 * Extracted from three-interaction-visuals.ts (L115–155, ~41 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 1 — Per-frame update functions).
 *
 * Reads: state.focusMoteGroup, state.focusMotes
 * Writes: Three.js mesh positions/opacity/visibility
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
 * Update the orbital mote sprites around the focused/hovered node.
 * Called from updateInteractionVisuals() in the per-frame hot path.
 *
 * @param worldPos — World-space position of the focused node (null = no focus)
 * @param time — Elapsed time in seconds (now / 1000)
 * @param isInside — Whether semantic dive mode is active (affects opacity targets)
 */
export function updateSelectedNodeMotes(worldPos: Vector3 | null, time: number, isInside: boolean): void {
    if (!state.focusMoteGroup || !Array.isArray(state.focusMotes)) return
    const hasFocus = worldPos !== null
    const targetOpacity = hasFocus ? (isInside ? 0.4 : 0.82) : 0
    state.focusMoteGroup.visible =
        hasFocus || state.focusMotes.some((mote: Mesh) => asSingleMaterial(mote.material).opacity > 0.01)
    if (hasFocus) {
        state.focusMoteGroup.position.copy(worldPos)
        state.focusMoteGroup.rotation.set(
            Math.sin(time * 0.19) * 0.14,
            Math.sin(time * 0.13 + 0.7) * 0.18,
            Math.sin(time * 0.17 + 1.4) * 0.1
        )
    }

    state.focusMotes.forEach((mote: Mesh, index: number) => {
        const data = mote.userData || {}
        const moteMat = asSingleMaterial(mote.material)
        moteMat.opacity += (targetOpacity - moteMat.opacity) * 0.08
        mote.visible = moteMat.opacity > 0.01
        if (!hasFocus) return

        const phase = (data.phase || 0) + time * (data.speed || 0.45)
        const radius = data.radius || 0.028
        const breath = 0.82 + Math.sin(time * 0.92 + index * 0.61) * 0.16 + Math.sin(time * 0.31 + index) * 0.07
        const curl = phase + Math.sin(time * 0.42 + index) * 0.62 + Math.sin(time * 0.17 + index * 1.7) * 0.28
        const wander = data.drift || 0.6
        const verticalDrift = Math.sin(phase * 0.61) * radius * 0.46 + Math.sin(time * 0.58 + index) * 0.009 * wander
        mote.position.set(
            Math.cos(curl) * radius * breath + Math.sin(time * 0.33 + index * 2.1) * 0.004 * wander,
            (data.lift || 0) + verticalDrift,
            Math.sin(curl) * radius * (data.tilt || 0.72) * breath +
                Math.cos(time * 0.29 + index * 1.6) * 0.004 * wander
        )
        const moteScale =
            (data.scale || 0.0084) *
            (1.0 + Math.sin(time * 1.08 + index * 0.7) * 0.24 + Math.sin(time * 0.41 + index) * 0.09)
        mote.scale.set(moteScale, moteScale, 1)
    })
}
