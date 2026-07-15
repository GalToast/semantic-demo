/**
 * @lib/engine/focus-connection-rays.ts — Anchor→satellite connection rays for the focus pocket
 *
 * Renders straight-line rays from the focused anchor node to each pocket satellite
 * (primary + support). Pairs are computed when the pocket is built (focus-pocket.ts)
 * and stored in `state.focusSemanticConnectionPairs`. This module owns the
 * `LineSegments` Three.js object, updates endpoints each frame when nodes move,
 * and handles visibility lifecycle (fade in/out with mode transitions).
 *
 * Integration:
 * - Pairs are populated in `focus-pocket.ts` via `computeFocusConnectionPairs()`.
 * - Frame updates are triggered via `markNodesDirty()` from the lerp loop
 *   (three-engine-frame-updates.ts:275) and consumed in `thread-manager.ts`
 *   `updateMyceliumThreads()` which already runs in the frame loop.
 * - Teardown is handled in `lifecycle.ts` (clears the pairs array + disposes the mesh).
 */
import {
    Vector3,
    LineSegments,
    LineBasicMaterial,
    BufferGeometry,
    Float32BufferAttribute,
    Color,
    Group
} from 'three'
import { appState as state } from '@lib/state/app.svelte'
import { webglContext } from '@lib/engine/webgl-context'
import { prefersReducedMotion } from '@lib/utils/environment'
import type { FocusConnectionSegment } from '@lib/state/state-types'

// ── Constants ──────────────────────────────────────────────────────────────────

const RAY_COLOR = new Color(0x4ecdc4) // teal, matching focus mycelium profile
const RAY_OPACITY_ACTIVE = 0.5
const RAY_OPACITY_FADE_OUT = 0

/** Modes whose surfaces keep the focus pocket alive — rays stay visible there. */
const RAY_ACTIVE_MODES = new Set(['focus', 'inside', 'trail'])

// ── State ──────────────────────────────────────────────────────────────────────

let rayMesh: LineSegments | null = null
let rayMaterial: LineBasicMaterial | null = null
let rayGroup: Group | null = null
let currentOpacity = RAY_OPACITY_FADE_OUT
let targetOpacity = RAY_OPACITY_FADE_OUT
let rayInitialized = false

// ── Geometry helpers ───────────────────────────────────────────────────────────

/**
 * Build or rebuild the LineSegments geometry from the current pairs array.
 * Each pair produces ONE line segment (2 vertices).
 */
function buildRayGeometry(pairs: FocusConnectionSegment[]): BufferGeometry {
    const vertexCount = pairs.length * 2
    const positions = new Float32Array(vertexCount * 3)
    const colors = new Float32Array(vertexCount * 3)

    for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i]
        const aIdx = pair.a
        const bIdx = pair.b
        const vertBase = i * 6

        // Anchor position (a)
        const aPos = state.nodePositions?.[aIdx]
        positions[vertBase] = Number.isFinite(aPos?.x) ? aPos!.x : 0
        positions[vertBase + 1] = Number.isFinite(aPos?.y) ? aPos!.y : 0
        positions[vertBase + 2] = Number.isFinite(aPos?.z) ? aPos!.z : 0
        colors[vertBase] = RAY_COLOR.r
        colors[vertBase + 1] = RAY_COLOR.g
        colors[vertBase + 2] = RAY_COLOR.b

        // Satellite position (b)
        const bPos = state.nodePositions?.[bIdx]
        positions[vertBase + 3] = Number.isFinite(bPos?.x) ? bPos!.x : 0
        positions[vertBase + 4] = Number.isFinite(bPos?.y) ? bPos!.y : 0
        positions[vertBase + 5] = Number.isFinite(bPos?.z) ? bPos!.z : 0
        colors[vertBase + 3] = RAY_COLOR.r
        colors[vertBase + 4] = RAY_COLOR.g
        colors[vertBase + 5] = RAY_COLOR.b
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return geometry
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialize (or re-initialize) the ray mesh if pairs exist.
 * Called when the pocket is built and pairs are populated.
 */
export function ensureFocusConnectionRays(): void {
    const pairs = state.focusSemanticConnectionPairs
    if (!pairs || pairs.length === 0) {
        // No pairs — ensure cleanup
        destroyFocusConnectionRays()
        return
    }

    // Already initialized — reuse only when the pair count still matches the
    // geometry's segment count. On focus A -> focus B without an exit in
    // between, pairs are rebuilt (computeFocusConnectionPairs) and a different
    // satellite count would otherwise leave stale/overwritten segments.
    if (rayInitialized && rayMesh) {
        const currentSegments = (rayMesh.geometry.attributes.position?.count ?? 0) / 2
        if (currentSegments === pairs.length) {
            targetOpacity = RAY_OPACITY_ACTIVE
            return
        }
        destroyFocusConnectionRays()
    }

    // Create the ray group and mesh
    const geometry = buildRayGeometry(pairs)
    rayMaterial = new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: RAY_OPACITY_FADE_OUT,
        depthWrite: false
    })
    rayMesh = new LineSegments(geometry, rayMaterial)
    rayGroup = new Group()
    rayGroup.add(rayMesh)
    rayGroup.visible = false

    // Parent into the mycelium group so rays travel with the scene graph
    if (state.myceliumGroup) {
        state.myceliumGroup.add(rayGroup)
    } else if (state.scene) {
        state.scene.add(rayGroup)
    }

    rayInitialized = true
    targetOpacity = RAY_OPACITY_ACTIVE
}

/**
 * Update ray endpoints to match current node positions.
 * Called per-frame when nodes are dirty.
 */
export function updateFocusConnectionRays(): void {
    if (!rayMesh || !rayMesh.geometry) return

    const pairs = state.focusSemanticConnectionPairs
    if (!pairs || pairs.length === 0) {
        destroyFocusConnectionRays()
        return
    }

    const positions = rayMesh.geometry.attributes.position
    if (!positions) return

    const arr = positions.array as Float32Array
    for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i]
        const vertBase = i * 6

        const aPos = state.nodePositions?.[pair.a]
        arr[vertBase] = Number.isFinite(aPos?.x) ? aPos!.x : 0
        arr[vertBase + 1] = Number.isFinite(aPos?.y) ? aPos!.y : 0
        arr[vertBase + 2] = Number.isFinite(aPos?.z) ? aPos!.z : 0

        const bPos = state.nodePositions?.[pair.b]
        arr[vertBase + 3] = Number.isFinite(bPos?.x) ? bPos!.x : 0
        arr[vertBase + 4] = Number.isFinite(bPos?.y) ? bPos!.y : 0
        arr[vertBase + 5] = Number.isFinite(bPos?.z) ? bPos!.z : 0
    }
    positions.needsUpdate = true
}

/**
 * Fade the ray opacity toward the target.
 * Called per-frame during the render loop for smooth transitions.
 */
export function updateFocusConnectionRaysOpacity(): void {
    if (!rayMaterial) return

    // Drive the fade target from live state every frame: rays are only active
    // while a pocket exists AND the current mode keeps it on screen. This makes
    // rays fade out on ANY exit path (overview/search/map switch, trail end)
    // without needing per-transition hooks. Teardown still goes through
    // destroyFocusConnectionRays() (disposeSemanticLens -> engine teardown).
    const pairs = state.focusSemanticConnectionPairs
    const mode = state.navState?.mode
    targetOpacity =
        rayInitialized && pairs && pairs.length > 0 && RAY_ACTIVE_MODES.has(mode)
            ? RAY_OPACITY_ACTIVE
            : RAY_OPACITY_FADE_OUT

    const reducedMotion = prefersReducedMotion()
    const lerpSpeed = reducedMotion ? 0.3 : 0.1

    if (Math.abs(currentOpacity - targetOpacity) > 0.001) {
        currentOpacity += (targetOpacity - currentOpacity) * lerpSpeed
        rayMaterial.opacity = currentOpacity
    }
    if (rayGroup) {
        rayGroup.visible = currentOpacity > 0.01
    }
}

/**
 * Destroy the ray mesh and clean up all resources.
 * Called on focus exit / teardown.
 */
export function destroyFocusConnectionRays(): void {
    if (rayGroup) {
        // Remove from parent
        if (rayGroup.parent) {
            rayGroup.parent.remove(rayGroup)
        }
        rayGroup.dispose?.()
    }
    rayMesh?.geometry?.dispose?.()
    rayMaterial?.dispose?.()

    rayMesh = null
    rayMaterial = null
    rayGroup = null
    rayInitialized = false
    currentOpacity = RAY_OPACITY_FADE_OUT
    targetOpacity = RAY_OPACITY_FADE_OUT
}

/**
 * Compute and populate focusSemanticConnectionPairs from the current pocket.
 * Called from focus-pocket.ts after pocket indices/roles are set.
 *
 * Creates { a: anchorIndex, b: satelliteIndex } segments for each pocket
 * satellite (primary + support roles).
 */
export function computeFocusConnectionPairs(anchorIndex: number): void {
    const pairs = state.focusSemanticConnectionPairs
    if (!pairs) return

    // Clear existing pairs
    pairs.length = 0

    const pocketIndices = state.navState.focusPocketIndices ?? []
    const roleByIndex = state.navState.focusPocketRoleByIndex ?? new Map()

    // Filter to valid pocket satellites (exclude anchor itself)
    const satellites = pocketIndices.filter(
        (idx: number) => Number.isFinite(idx) && idx !== anchorIndex && idx >= 0
    )

    // Build pairs — each satellite gets a direct connection to the anchor
    for (const satIdx of satellites) {
        const role = roleByIndex.get(satIdx) || 'support'
        pairs.push({
            a: anchorIndex,
            b: satIdx,
            layer: 0,
            role,
            // Metadata for potential future styling (e.g., role-based color)
            priority: role === 'primary' ? 0.78 : 0.54
        })
    }
}

/**
 * Check if rays should be active (pocket is open, has pairs).
 */
export function areFocusConnectionRaysActive(): boolean {
    return rayInitialized && (rayGroup?.visible ?? false)
}
