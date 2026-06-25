/**
 * @lib/demo/camera.ts — Camera snapshot and animation helpers for the micro-demo
 *
 * Port of js/modules/micro-demo-camera.js
 *
 * Captures overview camera position, provides fallback defaults,
 * animates camera back to overview with easing, and cancels in-progress animations.
 */
import { Vector3 } from 'three'
import { appState } from '@lib/state/app.svelte'
import { easeInOutSine } from '@lib/utils/math-easing'
import { prefersReducedMotion } from '@lib/utils/environment'

let _overviewCameraSnapshot: { camera: Vector3; target: Vector3 } | null = null
let _overviewCameraRafId: number | null = null

interface DemoCameraControls {
    target: Vector3
    update: () => void
}

function isThreeVector(value: unknown): value is Vector3 {
    const vector = value as Partial<Vector3> | null
    return Boolean(
        vector &&
        typeof vector.x === 'number' &&
        typeof vector.y === 'number' &&
        typeof vector.z === 'number' &&
        typeof vector.clone === 'function' &&
        typeof vector.copy === 'function' &&
        typeof vector.lerpVectors === 'function'
    )
}

function getDemoCameraPosition(): Vector3 | null {
    const camera = appState.camera as unknown as { position?: unknown } | null
    return isThreeVector(camera?.position) ? camera.position : null
}

function getDemoControls(): DemoCameraControls | null {
    const controls = appState.controls as unknown as { target?: unknown; update?: unknown } | null
    if (!isThreeVector(controls?.target) || typeof controls?.update !== 'function') return null
    return {
        target: controls.target,
        update: controls.update.bind(controls)
    }
}

export function captureOverviewCameraSnapshot(): void {
    const cameraPosition = getDemoCameraPosition()
    const controls = getDemoControls()
    if (!cameraPosition || !controls) return
    _overviewCameraSnapshot = {
        camera: cameraPosition.clone(),
        target: controls.target.clone()
    }
}

export function getOverviewCameraSnapshot(): { camera: Vector3; target: Vector3 } {
    if (_overviewCameraSnapshot?.camera?.clone && _overviewCameraSnapshot?.target?.clone) {
        return {
            camera: _overviewCameraSnapshot.camera.clone() as Vector3,
            target: _overviewCameraSnapshot.target.clone() as Vector3
        }
    }
    return {
        camera: new Vector3(0, 3.5, 5),
        target: new Vector3(0, 0, 0)
    }
}

export function animateCameraToOverview(duration = 1000): void {
    const cameraPosition = getDemoCameraPosition()
    const controls = getDemoControls()
    if (!cameraPosition || !controls) return
    const animationCameraPosition: Vector3 = cameraPosition
    const animationControls: DemoCameraControls = controls

    const startPos = animationCameraPosition.clone()
    const startTarget = animationControls.target.clone()
    const { camera: overviewPos, target: overviewTarget } = getOverviewCameraSnapshot()

    if (prefersReducedMotion()) {
        animationCameraPosition.copy(overviewPos)
        animationControls.target.copy(overviewTarget)
        animationControls.update()
        return
    }

    // Cancel any existing overview camera animation
    if (_overviewCameraRafId !== null) {
        cancelAnimationFrame(_overviewCameraRafId)
        _overviewCameraRafId = null
    }

    const startTime = performance.now()
    const _rafCancelled = false

    function step(now: number): void {
        if (_rafCancelled) return
        const raw = (now - startTime) / duration
        const t = Math.min(Math.max(raw, 0), 1)
        const eased = easeInOutSine(t)
        animationCameraPosition.lerpVectors(startPos, overviewPos, eased)
        animationControls.target.lerpVectors(startTarget, overviewTarget, eased)
        animationControls.update()
        if (t < 0.999) {
            _overviewCameraRafId = requestAnimationFrame(step)
        } else {
            _overviewCameraRafId = null
        }
    }
    _overviewCameraRafId = requestAnimationFrame(step)
}

export function cancelOverviewCameraAnimation(): void {
    if (_overviewCameraRafId !== null) {
        cancelAnimationFrame(_overviewCameraRafId)
        _overviewCameraRafId = null
    }
}
