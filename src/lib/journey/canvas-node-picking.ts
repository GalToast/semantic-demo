/**
 * @lib/journey/canvas-node-picking.ts — Raycaster-based canvas field node picking
 *
 * Port of
 *
 * Provides nearest-node finding for canvas pointer events using raycaster
 * (instanced mesh first, then Points threshold) with a screen-space nearest fallback.
 */
import { Raycaster, PerspectiveCamera, Vector3, Vector2, MathUtils, Matrix4 } from 'three'
import type { Intersection, Object3D, InstancedMesh } from 'three'
import { appState } from '@lib/state/app.svelte'
import { isPointVisible } from '@lib/utils/geo-data'
import { getCanvasPointerPosition, getCanvasFieldNodeClickRadius } from './canvas-hit-test'
import type { CanvasPointerPosition } from './canvas-hit-test'
import type { ActiveFilters, GeoPoint } from '@lib/utils/geo-data'
import type { CanvasHoverCandidate } from '@lib/state/state-types'

const canvasFieldRaycaster = new Raycaster()

// Reused scratch Vector3 for the hot-path nearest scan and the raycast
// candidate projection. Hoisted out of the per-node loop to eliminate the
// ~2 * N Vector3 allocations (new Vector3 + .clone()) that previously fired
// on every pointermove.
const _scratchVector = new Vector3()
// Reused identity matrix to test whether a points-mesh world transform is a
// no-op (positions already in world space). Matrix4 has no isIdentity()
// property; element-wise equality against the identity matrix is the check.
const _IDENTITY_MATRIX = new Matrix4()

const DEFAULT_ACTIVE_FILTERS: ActiveFilters = {
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
}

// ── Typed AppState Accessors ────────────────────────────────────────────────
// canvas-node-picking reads Three.js objects off the loosely-typed
// appState fields. appState.camera is typed as CameraLike (a minimal
// projection), appState.pointsMesh as Points, etc. The functions below
// read with .localToWorld() / .project() / setFromCamera() which require
// the full Three.js types. These helpers centralize the upcast once at
// the module boundary instead of repeating 11 inline `as unknown as` casts.

function getRaycastCamera(): PerspectiveCamera | null {
    return appState.camera
}

function getRaycastPointsMesh(): Object3D | null {
    return appState.pointsMesh as Object3D | null
}

function getRaycastPoints(): GeoPoint[] {
    return appState.points as GeoPoint[]
}

function getRaycastSporeMesh(): InstancedMesh | null {
    return appState.nodeSporeMesh as InstancedMesh | null
}

// ── Candidate Types ─────────────────────────────────────────────────────────

export interface CanvasNodePickCandidate extends CanvasHoverCandidate {
    index: number
    distance: number
    screenX: number
    screenY: number
    point: GeoPoint | null
    source: string
    rayDistance: number | null
    distanceToRay: number | null
}

function compareCanvasNodePickCandidates(a: CanvasNodePickCandidate, b: CanvasNodePickCandidate): number {
    const distA = Number.isFinite(a.distance) ? a.distance : Infinity
    const distB = Number.isFinite(b.distance) ? b.distance : Infinity
    if (Math.abs(distA - distB) > 1.0) return distA - distB

    const rayA = typeof a.rayDistance === 'number' && Number.isFinite(a.rayDistance) ? a.rayDistance : Infinity
    const rayB = typeof b.rayDistance === 'number' && Number.isFinite(b.rayDistance) ? b.rayDistance : Infinity
    if (Math.abs(rayA - rayB) > 0.1) return rayA - rayB

    const rayToRayA =
        typeof a.distanceToRay === 'number' && Number.isFinite(a.distanceToRay) ? a.distanceToRay : Infinity
    const rayToRayB =
        typeof b.distanceToRay === 'number' && Number.isFinite(b.distanceToRay) ? b.distanceToRay : Infinity
    return rayToRayA - rayToRayB
}

// ── Picking Mode ────────────────────────────────────────────────────────────

function getCanvasNodePickingMode(): 'nearest' | 'raycast' {
    const urlMode = new URLSearchParams(window.location.search).get('picking')
    const datasetMode = document.body?.dataset?.canvasPickingMode
    return urlMode === 'nearest' || datasetMode === 'nearest' ? 'nearest' : 'raycast'
}

// ── World Threshold ─────────────────────────────────────────────────────────

function getCanvasPointWorldThreshold(pixelRadius: number, rect: DOMRect): number {
    const camera = appState.camera
    const pointsMesh = appState.pointsMesh
    if (!camera || !rect?.height) return 0.035
    const cloudCenter = pointsMesh?.position || new Vector3(0, 0, 0)
    const distance = Math.max(0.25, camera.position.distanceTo(cloudCenter))
    const fov = Number.isFinite(camera.fov) ? MathUtils.degToRad(camera.fov!) : MathUtils.degToRad(45)
    const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / rect.height
    return MathUtils.clamp(worldPerPixel * pixelRadius * 0.42, 0.012, 0.09)
}

// ── Screen Candidate ────────────────────────────────────────────────────────

interface NodeScreenCandidate {
    index: number
    distance: number
    screenX: number
    screenY: number
    point: GeoPoint | null
}

function getCanvasNodeScreenCandidate(index: number, pointer: CanvasPointerPosition): NodeScreenCandidate | null {
    const position = appState.nodePositions[index]
    const camera = getRaycastCamera()
    const pointsMesh = getRaycastPointsMesh()
    if (!position || !camera || !pointsMesh) return null

    // Reuse a module-level scratch Vector3; project in place to skip the
    // redundant .clone(). Skip localToWorld when the mesh has an identity
    // transform (positions are already world-space) to avoid a matrix mult
    // per candidate.
    _scratchVector.set(position.x, position.y, position.z)
    if (!pointsMesh.matrixWorld.equals(_IDENTITY_MATRIX)) _scratchVector.applyMatrix4(pointsMesh.matrixWorld)
    _scratchVector.project(camera)
    if (_scratchVector.z < -1 || _scratchVector.z > 1) return null

    const screenX = ((_scratchVector.x + 1) / 2) * pointer.rect.width + pointer.rect.left
    const screenY = ((-_scratchVector.y + 1) / 2) * pointer.rect.height + pointer.rect.top
    const distance = Math.hypot(screenX - pointer.x, screenY - pointer.y)

    const points = getRaycastPoints()
    return { index, distance, screenX, screenY, point: points[index] ?? null }
}

// ── Raycast Picking ─────────────────────────────────────────────────────────

function findRaycastCanvasFieldNode(
    event: PointerEvent,
    pointer: CanvasPointerPosition,
    maxDistance: number
): CanvasNodePickCandidate | null {
    const camera = getRaycastCamera()
    const pointsMesh = getRaycastPointsMesh()
    const points = getRaycastPoints()
    if (!camera || !pointsMesh || !points?.length) return null

    const ndc = new Vector2(
        ((pointer.x - pointer.rect.left) / pointer.rect.width) * 2 - 1,
        -(((pointer.y - pointer.rect.top) / pointer.rect.height) * 2 - 1)
    )
    canvasFieldRaycaster.setFromCamera(ndc, camera)

    const activeFilters = appState.activeFilters ?? DEFAULT_ACTIVE_FILTERS

    // Try instanced mesh picking first
    const sporePickMesh = getRaycastSporeMesh()
    if (sporePickMesh) {
        const sporeHits = canvasFieldRaycaster
            .intersectObject(sporePickMesh, false)
            .filter(
                (hit: Intersection) =>
                    Number.isFinite(hit.instanceId) && isPointVisible(hit.instanceId!, points, null, activeFilters)
            )
            .map((hit: Intersection): CanvasNodePickCandidate | null => {
                const candidate = getCanvasNodeScreenCandidate(hit.instanceId!, pointer)
                if (!candidate) return null
                return {
                    ...candidate,
                    source: 'instanced-raycast',
                    rayDistance: hit.distance,
                    distanceToRay: null
                }
            })
            .filter(
                (c: CanvasNodePickCandidate | null): c is CanvasNodePickCandidate =>
                    c !== null && c.distance <= maxDistance + 12
            )
        if (sporeHits.length) {
            sporeHits.sort(compareCanvasNodePickCandidates)
            return sporeHits[0]!
        }
    }

    // Fall back to Points mesh raycaster
    const raycasterParams = canvasFieldRaycaster.params as { Points?: { threshold?: number } }
    raycasterParams.Points ??= {}
    raycasterParams.Points.threshold = getCanvasPointWorldThreshold(maxDistance, pointer.rect)
    const intersections = canvasFieldRaycaster
        .intersectObject(pointsMesh, false)
        .filter(
            (hit: Intersection) => Number.isFinite(hit.index) && isPointVisible(hit.index!, points, null, activeFilters)
        )
        .map((hit: Intersection): CanvasNodePickCandidate | null => {
            const candidate = getCanvasNodeScreenCandidate(hit.index!, pointer)
            if (!candidate) return null
            return {
                ...candidate,
                source: 'raycast',
                rayDistance: hit.distance,
                distanceToRay:
                    typeof hit.distanceToRay === 'number' && Number.isFinite(hit.distanceToRay)
                        ? hit.distanceToRay
                        : null
            }
        })
        .filter(
            (c: CanvasNodePickCandidate | null): c is CanvasNodePickCandidate =>
                c !== null && c.distance <= maxDistance + 8
        )
    if (!intersections.length) return null
    intersections.sort(compareCanvasNodePickCandidates)
    return intersections[0]!
}

// ── Public API ──────────────────────────────────────────────────────────────

export function findNearestCanvasFieldNode(
    event: PointerEvent,
    maxDistance: number = getCanvasFieldNodeClickRadius(event)
): CanvasNodePickCandidate | null {
    const pointer = getCanvasPointerPosition(event)
    const camera = getRaycastCamera()
    const pointsMesh = getRaycastPointsMesh()
    const nodePositions = appState.nodePositions
    if (!pointer || !camera || !pointsMesh || !nodePositions?.length) return null

    if (getCanvasNodePickingMode() === 'raycast') {
        const raycastCandidate = findRaycastCanvasFieldNode(event, pointer, maxDistance)
        if (raycastCandidate) {
            appState.lastCanvasNodePick = raycastCandidate
            return raycastCandidate
        }
    }

    let nearestIndex = -1
    let nearestDistance = Infinity
    let nearestScreenX = 0
    let nearestScreenY = 0
    const points = getRaycastPoints()
    const activeFilters = appState.activeFilters ?? DEFAULT_ACTIVE_FILTERS
    // Precompute the mesh-transform identity check once per call (the mesh
    // object does not change within a single pick).
    const meshIdentity = pointsMesh.matrixWorld.equals(_IDENTITY_MATRIX)

    // Hot path: brute-force nearest scan over all nodes. Previously this called
    // getCanvasNodeScreenCandidate() per node, allocating a fresh Vector3 + a
    // .clone() + a result object for every node on every pointermove. We now
    // reuse a single scratch Vector3, project in place, skip localToWorld on an
    // identity transform, and only build one candidate object for the winner.
    nodePositions.forEach((position, index) => {
        if (!position || !isPointVisible(index, points, null, activeFilters)) return
        _scratchVector.set(position.x, position.y, position.z)
        if (!meshIdentity) _scratchVector.applyMatrix4(pointsMesh.matrixWorld)
        _scratchVector.project(camera)
        const ndcZ = _scratchVector.z
        if (ndcZ < -1 || ndcZ > 1) return
        const screenX = ((_scratchVector.x + 1) / 2) * pointer.rect.width + pointer.rect.left
        const screenY = ((-_scratchVector.y + 1) / 2) * pointer.rect.height + pointer.rect.top
        const distance = Math.hypot(screenX - pointer.x, screenY - pointer.y)
        if (distance < nearestDistance) {
            nearestDistance = distance
            nearestIndex = index
            nearestScreenX = screenX
            nearestScreenY = screenY
        }
    })

    let nearest: CanvasNodePickCandidate | null = null
    if (nearestIndex >= 0 && nearestDistance <= maxDistance) {
        nearest = {
            index: nearestIndex,
            distance: nearestDistance,
            screenX: nearestScreenX,
            screenY: nearestScreenY,
            point: points[nearestIndex] ?? null,
            source: 'nearest',
            rayDistance: null,
            distanceToRay: null
        }
    }
    appState.lastCanvasNodePick = nearest
    return nearest
}
