/**
 * @lib/journey/canvas-node-picking.ts — Raycaster-based canvas field node picking
 *
 * Port of js/modules/journey-canvas-node-picking.js
 *
 * Provides nearest-node finding for canvas pointer events using raycaster
 * (instanced mesh first, then Points threshold) with a screen-space nearest fallback.
 */
import { Raycaster, PerspectiveCamera, Vector3, Vector2, MathUtils } from 'three'
import type { Camera, Intersection, Object3D, InstancedMesh } from 'three'
import { appState } from '@lib/state/app.svelte'
import { isPointVisible } from '@lib/utils/geo-data'
import { getCanvasPointerPosition, getCanvasFieldNodeClickRadius } from './canvas-hit-test'
import type { CanvasPointerPosition } from './canvas-hit-test'
import type { ActiveFilters, GeoPoint } from '@lib/utils/geo-data'
import type { CanvasHoverCandidate } from '@lib/state/state-types'

const canvasFieldRaycaster = new Raycaster()

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

function getRaycastCamera(): Camera | null {
    return appState.camera as unknown as Camera | null
}

function getRaycastPointsMesh(): Object3D | null {
    return appState.pointsMesh as unknown as Object3D | null
}

function getRaycastPoints(): GeoPoint[] {
    return appState.points as unknown as GeoPoint[]
}

function getRaycastSporeMesh(): InstancedMesh | null {
    return (appState.nodeSporeHitMesh ?? appState.nodeSporeMesh) as unknown as InstancedMesh | null
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

    const vector = new Vector3(position.x, position.y, position.z)
    if (pointsMesh.localToWorld) pointsMesh.localToWorld(vector)
    const projected = vector.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) return null

    const screenX = ((projected.x + 1) / 2) * pointer.rect.width + pointer.rect.left
    const screenY = ((-projected.y + 1) / 2) * pointer.rect.height + pointer.rect.top
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

    let nearest: CanvasNodePickCandidate | null = null
    let nearestDistance = Infinity
    const points = getRaycastPoints()
    const activeFilters = appState.activeFilters ?? DEFAULT_ACTIVE_FILTERS

    nodePositions.forEach((position, index) => {
        if (!position || !isPointVisible(index, points, null, activeFilters)) return
        const candidate = getCanvasNodeScreenCandidate(index, pointer)
        if (candidate && candidate.distance < nearestDistance) {
            nearestDistance = candidate.distance
            nearest = {
                ...candidate,
                source: 'nearest',
                rayDistance: null,
                distanceToRay: null
            }
        }
    })

    const resolved = nearest && nearestDistance <= maxDistance ? nearest : null
    appState.lastCanvasNodePick = resolved
    return resolved
}
