/**
 * @lib/engine/focus-pocket-size-mesh.ts — Phase-2 L3: twin-mesh pocket size channel.
 *
 * A tiny second Points cloud (~22 vertices) rendered at SIZE_MULTIPLIER × the base
 * point size, tracking the pocket's gathered `state.nodePositions` per frame and
 * sampling the live (dimmed/brightened) colors straight from the dominant Points
 * color attribute. This delivers the LARGER-dots channel the vision jury has never
 * seen — brightness alone (L1) and organic ties (L2) left the pocket reading as
 * "faint scattered dots" at 8,406-dot density.
 *
 * Costs: 1 extra draw call, ~66 floats of geometry, O(22) writes per frame.
 * Deliberately NOT a per-point size attribute on the dominant Points geometry —
 * no surgery on the shader that renders all 8,406 points (see the GLM-5.2 camp's
 * "Constellation Clearing" paper, tmp/phase2-design-2026-07-15/).
 */
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three'
import { appState as state } from '@lib/state/app.svelte'
import { CONFIG } from '@lib/engine/config'
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'

const SIZE_MULTIPLIER = 3.4
const TWIN_OPACITY = 0.9

function twinIndices(): number[] {
    const focused = state.navState.focusedIndex
    const pocket = state.navState.focusPocketIndices || []
    if (!Number.isFinite(focused) || pocket.length === 0) return []
    return [...new Set([focused as number, ...pocket])].filter((i) => Number.isFinite(i))
}

export function disposeFocusPocketSizeMesh(): void {
    const mesh = state.focusPocketSizeMesh
    if (!mesh) return
    mesh.parent?.remove(mesh)
    mesh.geometry?.dispose?.()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.())
    else mat?.dispose?.()
    state.focusPocketSizeMesh = null
}

/**
 * Per-frame sync: build when a pocket exists, rebuild on membership change,
 * tear down when focus/pocket clears, and track positions + live colors.
 * Wired into the frame loop next to the semantic-overlay syncs (three-engine-core).
 */
export function syncFocusPocketSizeMesh(): void {
    const indices = twinIndices()
    if (!indices.length || !state.scene) {
        disposeFocusPocketSizeMesh()
        return
    }
    const parent = state.myceliumGroup || state.scene
    let mesh = state.focusPocketSizeMesh
    if (mesh && mesh.userData?.indexKey !== indices.join(',')) {
        disposeFocusPocketSizeMesh()
        mesh = null
    }
    if (!mesh) {
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(indices.length * 3), 3))
        geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(indices.length * 3), 3))
        const material = new PointsMaterial({
            size: CONFIG.POINTS_MATERIAL_BASE_SIZE * SIZE_MULTIPLIER,
            vertexColors: true,
            transparent: true,
            opacity: TWIN_OPACITY,
            depthWrite: false,
            blending: AdditiveBlending,
            sizeAttenuation: true
        })
        mesh = new Points(geometry, material)
        mesh.userData = { indexKey: indices.join(','), indices: [...indices] }
        parent.add(mesh)
        state.focusPocketSizeMesh = mesh
    }
    const posAttr = mesh.geometry.getAttribute('position')
    const colAttr = mesh.geometry.getAttribute('color')
    const srcColors = state.pointsMesh?.geometry?.attributes?.color?.array as Float32Array | undefined
    const ids = mesh.userData.indices as number[]
    for (let k = 0; k < ids.length; k++) {
        const i = ids[k]!
        const p = state.nodePositions[i]
        posAttr.setXYZ(k, p?.x ?? 0, p?.y ?? 0, p?.z ?? 0)
        if (srcColors) {
            colAttr.setXYZ(k, srcColors[i * 3] ?? 1, srcColors[i * 3 + 1] ?? 1, srcColors[i * 3 + 2] ?? 1)
        }
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
}

// Ensure the pocket twin mesh is torn down whenever the experience resets
// (e.g. return-to-overview). The frame-loop sync also disposes when the
// focus/pocket clears, but continuous rendering may stop before that tick,
// leaving the overlay in the scene after focus exit.
subscribe(EVENTS.STATE_RESET, () => disposeFocusPocketSizeMesh())
