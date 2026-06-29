/**
 * three-lens-filaments.ts — Per-frame update for focus wispy line segments
 *
 * Extracted from three-interaction-visuals.ts (L196–258, ~63 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 1 — Per-frame update functions).
 *
 * Reads: state.focusFilaments
 * Writes: Three.js line segment buffer positions/opacity/visibility
 */
import { Vector3, Material } from 'three'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state

/** Narrow a single-material object's material to a single Material instance. */
function asSingleMaterial(mat: Material | Material[]): Material {
    if (!Array.isArray(mat)) return mat
    const first = mat[0]
    if (!first) throw new Error('Expected a single material, received an empty material array.')
    return first
}

const FOCUS_WISP_COUNT = 18
const FOCUS_WISP_SEGMENTS = 18

/**
 * Update the wispy filament line segments around the focused/hovered node.
 * Called from updateInteractionVisuals() in the per-frame hot path.
 *
 * @param worldPos — World-space position of the focused node (null = no focus)
 * @param time — Elapsed time in seconds (now / 1000)
 * @param isInside — Whether semantic dive mode is active (affects opacity targets)
 */
export function updateSelectedNodeFilaments(worldPos: Vector3 | null, time: number, isInside: boolean): void {
    if (!state.focusFilaments?.geometry?.attributes?.position) return
    const positions = state.focusFilaments.geometry.attributes.position.array
    const hasFocus = worldPos !== null
    const targetOpacity = hasFocus ? (isInside ? 0.22 : 0.5) : 0
    const filMat = asSingleMaterial(state.focusFilaments.material)
    filMat.opacity += (targetOpacity - filMat.opacity) * 0.1
    state.focusFilaments.visible = filMat.opacity > 0.01
    if (!hasFocus) {
        positions.fill(0)
        state.focusFilaments.geometry.attributes.position.needsUpdate = true
        return
    }

    let offset = 0
    for (let i = 0; i < FOCUS_WISP_COUNT; i += 1) {
        const seed = i * 1.713
        const phase = time * (0.2 + i * 0.008) + seed
        const rootOrbit = 0.004 + (i % 7) * 0.0011
        const length = 0.017 + (i % 8) * 0.0024 + Math.sin(time * 0.34 + seed) * 0.002
        const curlStrength = 0.0045 + (i % 6) * 0.0017
        const lean = Math.sin(seed * 1.37) * (0.0022 + (i % 5) * 0.0009)
        const shell = 0.66 + (i % 4) * 0.11
        const root = {
            x: worldPos.x + Math.cos(seed + time * 0.06) * rootOrbit,
            y: worldPos.y - 0.007 + Math.sin(seed * 0.7 + time * 0.09) * 0.0035,
            z: worldPos.z + Math.sin(seed + time * 0.055) * rootOrbit * 0.78
        }
        let prev = null
        for (let s = 0; s <= FOCUS_WISP_SEGMENTS; s += 1) {
            const t = s / FOCUS_WISP_SEGMENTS
            const taper = Math.sin(t * Math.PI)
            const ease = t * t * (3 - 2 * t)
            const curl =
                phase +
                ease * (2.25 + i * 0.055) +
                Math.sin(time * 0.34 + seed + t * 5.6) * 0.72 +
                Math.sin(time * 0.12 + seed * 2.1 + t * 9.2) * 0.3
            const drift = Math.sin(time * 0.48 + seed + t * 6.8) * taper
            const lateral = curlStrength * ease * (0.62 + taper * shell)
            const float = Math.sin(time * 0.28 + seed * 0.8 + t * 3.7) * taper * 0.0075
            const point = {
                x: root.x + Math.cos(curl) * lateral + Math.sin(phase * 1.1 + t * 4.6) * taper * 0.0032 + lean * ease,
                y: root.y + Math.sin(t * Math.PI * 0.74) * length * 0.24 + ease * length * 0.07 + float,
                z: root.z + Math.sin(curl) * lateral * 0.9 + drift * 0.0048
            }
            if (prev) {
                positions[offset++] = prev.x
                positions[offset++] = prev.y
                positions[offset++] = prev.z
                positions[offset++] = point.x
                positions[offset++] = point.y
                positions[offset++] = point.z
            }
            prev = point
        }
    }
    while (offset < positions.length) positions[offset++] = 0
    state.focusFilaments.geometry.attributes.position.needsUpdate = true
}
