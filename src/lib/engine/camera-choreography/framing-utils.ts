/**
 * @lib/engine/camera-choreography/framing-utils.ts
 * Focus pocket safe-area camera framing utilities
 *
 * Port of js/modules/camera-framing-utils.ts
 */
import { Vector3, PerspectiveCamera, WebGLRenderer, Points } from 'three'
import type { Vector3Like } from '@lib/state/state-types'
import type { NodePosition } from '@lib/state/state-types'
import { getViewportSize } from '@lib/utils/environment'
import { appState as _state } from '@lib/state/app.svelte'
import { debugWarn } from '@lib/utils/diagnostic-adapter'
const state = _state

// ── Types ────────────────────────────────────────────────────────────────────

export interface CanvasRegion {
    x: number
    y: number
    width: number
    height: number
}

export interface PocketBounds {
    minX: number
    minY: number
    maxX: number
    maxY: number
    centerX: number
    centerY: number
}

export interface ProjectedScreen {
    screenX: number
    screenY: number
    projected: Vector3
}

export interface AppStateLike {
    camera: PerspectiveCamera | null
    renderer: WebGLRenderer | null
    pointsMesh?: Points | null
    nodePositions: NodePosition[]
    originalPositions: NodePosition[]
    [key: string]: unknown
}

// ── getCanvasUnobstructedRegion ──────────────────────────────────────────────

/**
 * Compute the unobstructed canvas region given current UI panel geometry.
 */
export function getCanvasUnobstructedRegion(): CanvasRegion {
    const vp = getViewportSize()
    const vw = vp.width
    const vh = vp.height
    const body = document.body
    const canvasRect = state.renderer?.domElement?.getBoundingClientRect?.() || {
        left: 0,
        top: 0,
        right: vw,
        bottom: vh,
        width: vw,
        height: vh
    }

    const panels: string[] = [
        '#search-panel, .search-panel, [data-panel="search"]',
        '#focus-stage, .focus-stage, #focus-pocket, .focus-pocket, #focus-stage-panel, .focus-stage-panel, [data-panel="focus-stage"]',
        '#thread-inspector-panel, .thread-inspector-panel, [data-panel="thread"]',
        '#info-panel, .info-panel, .detail-panel, .side-panel',
        '#journey-compass, .journey-compass',
        '#legend-panel, .legend-panel',
        '.weather-widget, #weather',
        '.controls, .canvas-controls, #controls, .panel-toggle, .legend-toggle, .help-toggle'
    ]

    let leftOverlap = 0,
        rightOverlap = 0,
        topOverlap = 0,
        bottomOverlap = 0

    for (const selector of panels) {
        try {
            for (const el of body.querySelectorAll(selector)) {
                const styles = window.getComputedStyle(el)
                if (styles.display === 'none' || styles.visibility === 'hidden' || parseFloat(styles.opacity) === 0)
                    continue
                const rect = el.getBoundingClientRect()
                if (rect.width < 20 || rect.height < 20) continue

                const intersects =
                    rect.left < canvasRect.right &&
                    rect.right > canvasRect.left &&
                    rect.top < canvasRect.bottom &&
                    rect.bottom > canvasRect.top
                if (!intersects) continue

                const intersection = {
                    left: Math.max(rect.left, canvasRect.left),
                    right: Math.min(rect.right, canvasRect.right),
                    top: Math.max(rect.top, canvasRect.top),
                    bottom: Math.min(rect.bottom, canvasRect.bottom)
                }
                const width = intersection.right - intersection.left
                const height = intersection.bottom - intersection.top
                if (width < 20 || height < 20) continue

                const overlayCenterX = intersection.left + width / 2
                const overlayCenterY = intersection.top + height / 2
                const canvasCenterX = canvasRect.left + canvasRect.width / 2
                let edge: string | null = null

                if (width <= canvasRect.width * 0.65 && height >= canvasRect.height * 0.35) {
                    edge = overlayCenterX <= canvasCenterX ? 'left' : 'right'
                } else {
                    const edgeDistances = [
                        { edge: 'left', value: Math.abs(overlayCenterX - canvasRect.left) },
                        { edge: 'right', value: Math.abs(canvasRect.right - overlayCenterX) },
                        { edge: 'top', value: Math.abs(overlayCenterY - canvasRect.top) },
                        { edge: 'bottom', value: Math.abs(canvasRect.bottom - overlayCenterY) }
                    ].sort((a, b) => a.value - b.value)
                    edge = edgeDistances[0]?.edge || null
                }

                switch (edge) {
                    case 'left':
                        leftOverlap = Math.max(leftOverlap, intersection.right - canvasRect.left)
                        break
                    case 'right':
                        rightOverlap = Math.max(rightOverlap, canvasRect.right - intersection.left)
                        break
                    case 'top':
                        topOverlap = Math.max(topOverlap, intersection.bottom - canvasRect.top)
                        break
                    case 'bottom':
                        bottomOverlap = Math.max(bottomOverlap, canvasRect.bottom - intersection.top)
                        break
                }
            }
        } catch (error) {
            debugWarn('[engine/framing-utils] cross-origin or shadow DOM intersection skipped:', error)
        }
    }

    return {
        x: canvasRect.left + leftOverlap,
        y: canvasRect.top + topOverlap,
        width: Math.max(1, canvasRect.width - leftOverlap - rightOverlap),
        height: Math.max(1, canvasRect.height - topOverlap - bottomOverlap)
    }
}

// ── projectToScreen ──────────────────────────────────────────────────────────

/**
 * Project a 3D world position through the camera and return screen coordinates.
 */
function projectToScreen(
    worldPos: { x: number; y: number; z: number },
    camera: PerspectiveCamera | null,
    renderer: WebGLRenderer | null,
    pointsMesh: Points | null = null
): ProjectedScreen | null {
    if (!camera || !renderer) return null
    const v = new Vector3(worldPos.x, worldPos.y, worldPos.z)
    if (pointsMesh?.localToWorld) pointsMesh.localToWorld(v)
    const projected = v.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) return null
    const rect = renderer.domElement.getBoundingClientRect()
    return {
        screenX: ((projected.x + 1) / 2) * rect.width + rect.left,
        screenY: ((-projected.y + 1) / 2) * rect.height + rect.top,
        projected
    }
}

// ── computeFocusPocketScreenBounds ───────────────────────────────────────────

/**
 * Compute the screen-space bounding box of all pocket nodes.
 */
export function computeFocusPocketScreenBounds(
    focusIndex: number | null,
    pocketIndices: number[],
    appState: AppStateLike
): PocketBounds | null {
    const camera = appState.camera
    const renderer = appState.renderer
    if (!camera || !renderer) return null
    const pointsMesh = appState.pointsMesh || state.pointsMesh || null

    const allIndices = [focusIndex, ...(pocketIndices || [])]
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity
    let validCount = 0

    for (const idx of allIndices) {
        const pos = appState.nodePositions[idx!] || appState.originalPositions[idx!]
        if (!pos) continue
        const screen = projectToScreen(pos, camera, renderer, pointsMesh)
        if (!screen) continue
        minX = Math.min(minX, screen.screenX)
        minY = Math.min(minY, screen.screenY)
        maxX = Math.max(maxX, screen.screenX)
        maxY = Math.max(maxY, screen.screenY)
        validCount++
    }

    if (validCount === 0) return null
    return {
        minX,
        minY,
        maxX,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    }
}

// ── computeSafeAreaCameraTargetOffset ────────────────────────────────────────

/**
 * Compute a camera target offset that keeps the entire pocket visible.
 */
export function computeSafeAreaCameraTargetOffset(
    pocketBounds: PocketBounds,
    canvasRegion: CanvasRegion,
    focusDistance: number,
    camera: PerspectiveCamera | null,
    controls: { target?: Vector3Like; update?: () => void; enabled?: boolean } | null
): Vector3 | null {
    if (!pocketBounds || !canvasRegion || !camera || !controls) return null

    const regionCenterX = canvasRegion.x + canvasRegion.width / 2
    const regionCenterY = canvasRegion.y + canvasRegion.height / 2

    const pocketCX = pocketBounds.centerX
    const pocketCY = pocketBounds.centerY

    const deltaX = pocketCX - regionCenterX
    const deltaY = pocketCY - regionCenterY

    const halfW = canvasRegion.width / 2
    const halfH = canvasRegion.height / 2
    const normX = halfW > 0 ? deltaX / halfW : 0
    const normY = halfH > 0 ? deltaY / halfH : 0

    const marginFraction = 0.18

    const pocketHalfW = (pocketBounds.maxX - pocketBounds.minX) / 2
    const pocketHalfH = (pocketBounds.maxY - pocketBounds.minY) / 2
    const availableHalfW = halfW * (1 - marginFraction) - pocketHalfW
    const availableHalfH = halfH * (1 - marginFraction) - pocketHalfH

    const isConstrainedX = availableHalfW < 0
    const isConstrainedY = availableHalfH < 0

    const cameraPos = camera.position
    const target = controls.target!
    const viewDir = new Vector3().subVectors(cameraPos, target).normalize()

    const worldUp = new Vector3(0, 1, 0)
    const rightVec = new Vector3().crossVectors(worldUp, viewDir)
    if (rightVec.lengthSq() < 0.0001) rightVec.set(1, 0, 0)
    rightVec.normalize()
    const upVec = new Vector3().crossVectors(viewDir, rightVec).normalize()

    const pixelsPerUnit = focusDistance * 0.0013

    const offset = new Vector3()

    if (isConstrainedX && Math.abs(normX) > 0.1) {
        const correction = Math.max(0, (Math.abs(normX) - (1 - marginFraction)) * pixelsPerUnit * 1.4)
        const maxCorrectionX = pixelsPerUnit * canvasRegion.width * 0.2
        offset.addScaledVector(rightVec, -Math.sign(normX) * Math.min(correction, maxCorrectionX))
    }

    if (isConstrainedY && Math.abs(normY) > 0.1) {
        const correction = Math.max(0, (Math.abs(normY) - (1 - marginFraction)) * pixelsPerUnit * 1.4)
        const maxCorrectionY = pixelsPerUnit * canvasRegion.height * 0.2
        offset.addScaledVector(upVec, Math.sign(normY) * Math.min(correction, maxCorrectionY))
    }

    return offset.lengthSq() > 0.000001 ? offset : null
}
