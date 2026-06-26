/**
 * @lib/journey/canvas-hit-test.ts — Raycaster hit testing and thread candidate screen projection
 *
 * Port of
 *
 * Provides canvas interaction adapter, thread candidate visibility checking,
 * nearest-thread-candidate lookup, and pointer position utilities.
 */
import { Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import { appState } from '@lib/state/app.svelte'
import { isPointVisible } from '@lib/utils/geo-data'
import { getSemanticThreadDisplayLimit } from '@lib/journey/neighborhood'
import { hasCoarsePointer } from '@lib/utils/environment'
import type { ActiveFilters, GeoPoint } from '@lib/utils/geo-data'
import type { ThreadCandidateRef } from '@lib/types/state'

const DEFAULT_ACTIVE_FILTERS: ActiveFilters = {
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
}

// ── Canvas Interaction Adapter ──────────────────────────────────────────────

export interface CanvasInteractionAdapter {
    summarizeNeighborReason: (
        candidate: unknown
    ) => string
    walkThreadNeighbor: (index: number, options?: Record<string, unknown>) => boolean
    inspectThreadNeighbor: (index: number, options?: Record<string, unknown>) => void
    scheduleCanvasThreadInspectionClear: (delay: number) => void
    setTimer: (fn: () => void, delay: number) => number | undefined
    clearTimer: (id: number | undefined) => void
}

export const canvasInteractionAdapter: CanvasInteractionAdapter = {
    summarizeNeighborReason: () => '',
    walkThreadNeighbor: () => false,
    inspectThreadNeighbor: () => {},
    scheduleCanvasThreadInspectionClear: () => {},
    setTimer: (fn: () => void, delay: number): number | undefined =>
        typeof setTimeout !== 'undefined' ? window.setTimeout(fn, delay) : undefined,
    clearTimer: (id: number | undefined): void => {
        if (typeof clearTimeout !== 'undefined' && id !== undefined) window.clearTimeout(id)
    }
}

export function initJourneyCanvasInteractionAdapter(deps: Partial<CanvasInteractionAdapter> = {}): void {
    if (typeof deps.summarizeNeighborReason === 'function') {
        canvasInteractionAdapter.summarizeNeighborReason = deps.summarizeNeighborReason
    }
    if (typeof deps.walkThreadNeighbor === 'function') {
        canvasInteractionAdapter.walkThreadNeighbor = deps.walkThreadNeighbor
    }
    if (typeof deps.inspectThreadNeighbor === 'function') {
        canvasInteractionAdapter.inspectThreadNeighbor = deps.inspectThreadNeighbor
    }
    if (typeof deps.scheduleCanvasThreadInspectionClear === 'function') {
        canvasInteractionAdapter.scheduleCanvasThreadInspectionClear = deps.scheduleCanvasThreadInspectionClear
    }
    if (typeof deps.setTimer === 'function') {
        canvasInteractionAdapter.setTimer = deps.setTimer
    }
    if (typeof deps.clearTimer === 'function') {
        canvasInteractionAdapter.clearTimer = deps.clearTimer
    }
}

// ── Thread Candidate Visibility ─────────────────────────────────────────────

export function isThreadCandidateVisibleOnCanvas(index: number, margin = 18): boolean {
    if (appState.currentView !== 'galaxy') return true
    if (!Number.isFinite(index)) return false

    const position =
        appState.nodePositions[index] ?? appState.targetPositions[index] ?? appState.originalPositions[index]
    const canvas = appState.renderer?.domElement
    const camera = (appState.camera ?? undefined) as Camera | undefined
    if (!position || !camera || !canvas?.getBoundingClientRect) return true

    const rect = canvas.getBoundingClientRect()
    const worldPosition = new Vector3(position.x, position.y, position.z)
    const pointsMesh = (appState.pointsMesh ?? undefined) as Object3D | undefined
    if (pointsMesh?.localToWorld) pointsMesh.localToWorld(worldPosition)
    const projection = worldPosition.project(camera)
    if (projection.z < -1 || projection.z > 1) return false

    const screenX = ((projection.x + 1) / 2) * rect.width + rect.left
    const screenY = ((-projection.y + 1) / 2) * rect.height + rect.top
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return false
    if (
        screenX < rect.left + margin ||
        screenY < rect.top + margin ||
        screenX > rect.right - margin ||
        screenY > rect.bottom - margin
    ) {
        return false
    }

    const topEl = document.elementFromPoint(screenX, screenY)
    return !topEl || topEl === canvas || canvas.contains(topEl)
}

// ── Screen Candidate Projection ─────────────────────────────────────────────

interface ScreenCandidate {
    index: number
    reason: string
    source: string
    screenX: number
    screenY: number
    inViewport: boolean
    canvasReachable: boolean
    distanceFromFocus: number | null
}

function getFocusThreadScreenCandidates(): ScreenCandidate[] {
    const camera = (appState.camera ?? undefined) as Camera | undefined
    const canvas = appState.renderer?.domElement as HTMLCanvasElement | undefined
    if (!canvas || !camera) return []
    const rect = canvas.getBoundingClientRect()
    const navState = appState.navState
    const focusIndex =
        navState?.focusedIndex != null && Number.isFinite(navState.focusedIndex) ? navState.focusedIndex : null
    const points = appState.points as GeoPoint[]
    const threadCandidates = navState?.threadCandidates ?? []
    const pointsMesh = (appState.pointsMesh ?? undefined) as Object3D | undefined
    const nodePositions = appState.nodePositions
    const targetPositions = appState.targetPositions
    const originalPositions = appState.originalPositions
    const activeFilters = appState.activeFilters ?? DEFAULT_ACTIVE_FILTERS

    return threadCandidates
        .filter(
            (candidate: ThreadCandidateRef) => candidate.source === 'semantic' && candidate.index !== focusIndex
        )
        .filter((candidate: ThreadCandidateRef) =>
            isPointVisible(candidate.index, points, null, activeFilters)
        )
        .slice(0, getSemanticThreadDisplayLimit())
        .map((candidate: ThreadCandidateRef): ScreenCandidate | null => {
            const ci = candidate.index
            const pos = nodePositions[ci] ?? targetPositions[ci] ?? originalPositions[ci]
            if (!pos) return null
            const px = Number.isFinite(pos.x) ? pos.x : 0
            const py = Number.isFinite(pos.y) ? pos.y : 0
            const pz = Number.isFinite(pos.z) ? pos.z : 0
            const vector = new Vector3(px, py, pz)
            if (pointsMesh?.localToWorld) pointsMesh.localToWorld(vector)
            const projected = vector.clone().project(camera)
            const screenX = ((projected.x + 1) / 2) * rect.width + rect.left
            const screenY = ((-projected.y + 1) / 2) * rect.height + rect.top
            const inViewport =
                projected.z >= -1 &&
                projected.z <= 1 &&
                screenX >= rect.left &&
                screenX <= rect.right &&
                screenY >= rect.top &&
                screenY <= rect.bottom
            const element = inViewport ? document.elementFromPoint(screenX, screenY) : null

            const focusPos = focusIndex != null ? nodePositions[focusIndex] : undefined
            const distFocus =
                focusIndex != null && focusPos
                    ? new Vector3(px, py, pz).distanceTo(
                          new Vector3(
                              Number.isFinite(focusPos.x) ? focusPos.x : 0,
                              Number.isFinite(focusPos.y) ? focusPos.y : 0,
                              Number.isFinite(focusPos.z) ? focusPos.z : 0
                          )
                      )
                    : null
            return {
                index: ci,
                reason: canvasInteractionAdapter.summarizeNeighborReason(
                    candidate as unknown as Record<string, unknown>
                ),
                source: candidate.source,
                screenX,
                screenY,
                inViewport,
                canvasReachable: !element || element === canvas || canvas.contains(element),
                distanceFromFocus: distFocus
            }
        })
        .filter((c): c is ScreenCandidate => c !== null)
}

// ── Nearest Candidate ───────────────────────────────────────────────────────

export function getNearestCanvasThreadCandidate(
    event: { clientX: number; clientY: number },
    maxDistance = 34
): ScreenCandidate | null {
    const candidates = getFocusThreadScreenCandidates().filter((c) => c.inViewport && c.canvasReachable)
    let nearest: ScreenCandidate | null = null
    let nearestDistance = Infinity
    candidates.forEach((candidate) => {
        const distance = Math.hypot(candidate.screenX - event.clientX, candidate.screenY - event.clientY)
        if (distance < nearestDistance) {
            nearest = candidate
            nearestDistance = distance
        }
    })
    return nearest && nearestDistance <= maxDistance ? nearest : null
}

// ── Pointer Position ────────────────────────────────────────────────────────

export interface CanvasPointerPosition {
    x: number
    y: number
    rect: DOMRect
}

export function getCanvasPointerPosition(event: { clientX: number; clientY: number }): CanvasPointerPosition | null {
    const canvas = appState.renderer?.domElement as HTMLCanvasElement | undefined
    if (!canvas || !event) return null
    const rect = canvas.getBoundingClientRect()
    const clientX = Number(event.clientX)
    const clientY = Number(event.clientY)
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
    return { x: clientX, y: clientY, rect }
}

export function getCanvasFieldNodeClickRadius(event?: { pointerType?: string }): number {
    const pointerType = event?.pointerType || ''
    if (pointerType === 'touch' || pointerType === 'pen') return 34
    return hasCoarsePointer() ? 34 : 26
}
