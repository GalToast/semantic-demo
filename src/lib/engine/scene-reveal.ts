import { Vector3 } from 'three'
import { appState as state } from '@lib/state/app.svelte.ts'

import {
    clearAutoRotateResumeTimer,
    setAutoRotateSuspended,
    settleCameraToOverviewPose
} from '../engine/camera-controls'
import { updateCameraViewportOffset } from './three-engine'
import { syncClusterSectionState } from '@lib/ui/cluster-labels'
import { updateTraversalUi } from '@lib/journey/focus-ui'
import { getViewportSize, prefersReducedMotion, isMobileViewport } from '@lib/utils/environment'

export function setSceneRevealDataset(active: boolean): void {
    document.body.dataset.sceneReveal = active ? 'active' : 'inactive'
}

export function startSceneReveal(): void {
    const camera = state.camera as { position: Vector3 } | null
    if (!camera || state.currentView !== 'galaxy') return
    state.sceneRevealActive = true
    state.sceneRevealStartedAt = performance.now()
    state.sceneRevealCameraEnd = camera.position.clone()
    setSceneRevealDataset(true)

    state.sceneRevealCameraStart = (() => {
        const cx = state.sceneRevealCameraEnd.x
        const cy = state.sceneRevealCameraEnd.y
        const cz = state.sceneRevealCameraEnd.z
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
            return new Vector3(0, 0, 1)
        }
        return new Vector3(cx * 0.42, cy * 0.34, Math.max(0.96, cz * 0.58))
    })()

    clearAutoRotateResumeTimer()
    setAutoRotateSuspended(true)
}

export function getSceneRevealProgress(frameNow: number): number {
    if (!state.sceneRevealActive || !state.sceneRevealStartedAt) return 1
    if (prefersReducedMotion()) {
        setSceneRevealDataset(false)
        state.sceneRevealActive = false
        return 1.0
    }
    const elapsed = frameNow - state.sceneRevealStartedAt
    return Math.min(1, Math.max(0, elapsed / 2800))
}

export function onWindowResize(): void {
    const camera = state.camera
    const renderer = state.renderer
    if (!camera || !renderer) return
    const { width, height } = getViewportSize()
    const isMobile = isMobileViewport()

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    const w = window as unknown as { map?: { invalidateSize(): void } }
    if (w.map) w.map.invalidateSize()

    document.body.classList.toggle('is-mobile', isMobile)
    updateCameraViewportOffset()
    settleCameraToOverviewPose()
    syncClusterSectionState()
    updateTraversalUi()
}
