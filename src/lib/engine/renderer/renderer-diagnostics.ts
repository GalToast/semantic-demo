/**
 * @lib/engine/renderer/renderer-diagnostics.ts
 * Scene performance diagnostics and metrics.
 *
 * Extracted from three-engine.ts during the W46 renderer decomposition.
 */

import { getLiveResourceCounts, webglContext } from '@lib/engine/webgl-context'
import { appState } from '@lib/state/app.svelte'

export interface ScenePerformanceTimings {
    controlsMs?: number
    nodeMotionMs?: number
    threadUpdateMs?: number
    glowMs?: number
    lensMs?: number
    updateMs?: number
    renderMs?: number
    overlayUpdateMs?: number
}

export function smoothDiagnosticValue(current: number, next: number, sampleCount: number): number {
    const divisor = Math.max(1, Math.min(sampleCount, 120))
    return (current * (divisor - 1) + next) / divisor
}

export function getSceneRenderableDiagnostics() {
    const perf = appState.scenePerformanceDiagnostics
    const resources = getLiveResourceCounts()
    return {
        active: perf?.active ?? false,
        fps: Math.round(1000 / Math.max(1, perf?.avgFrameMs || 0)),
        drawCalls: perf?.drawCalls ?? 0,
        triangles: perf?.triangles ?? 0,
        points: appState.points?.length || 0,
        myceliumCoreSegments: perf?.myceliumCoreSegments ?? 0,
        myceliumWispySegments: perf?.myceliumWispySegments ?? 0,
        myceliumBridgeSegments: perf?.myceliumBridgeSegments ?? 0,
        memory: resources
    }
}

export function sampleScenePerformance(
    frameMs: number,
    timings: ScenePerformanceTimings = {},
    legacyState?: any
): void {
    appState.withMutation(() => {
        const diagnostics = appState.scenePerformanceDiagnostics
        diagnostics.active = !!(
            appState.renderer &&
            appState.scene &&
            appState.camera &&
            appState.currentView === 'galaxy'
        )
        diagnostics.reason = diagnostics.active ? 'sampling' : 'inactive-view'
        diagnostics.sampleCount = Math.min(600, (diagnostics.sampleCount || 0) + 1)
        diagnostics.avgFrameMs = smoothDiagnosticValue(diagnostics.avgFrameMs || 0, frameMs, diagnostics.sampleCount)
        diagnostics.maxFrameMs = Math.max(frameMs, (diagnostics.maxFrameMs || 0) * 0.992)
        diagnostics.avgControlsMs = smoothDiagnosticValue(
            diagnostics.avgControlsMs || 0,
            timings.controlsMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.avgNodeMotionMs = smoothDiagnosticValue(
            diagnostics.avgNodeMotionMs || 0,
            timings.nodeMotionMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.avgThreadUpdateMs = smoothDiagnosticValue(
            diagnostics.avgThreadUpdateMs || 0,
            timings.threadUpdateMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.avgGlowMs = smoothDiagnosticValue(
            diagnostics.avgGlowMs || 0,
            timings.glowMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.avgLensMs = smoothDiagnosticValue(
            diagnostics.avgLensMs || 0,
            timings.lensMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.avgUpdateMs = smoothDiagnosticValue(
            diagnostics.avgUpdateMs || 0,
            timings.updateMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.maxUpdateMs = Math.max(timings.updateMs || 0, (diagnostics.maxUpdateMs || 0) * 0.992)
        diagnostics.avgRenderMs = smoothDiagnosticValue(
            diagnostics.avgRenderMs || 0,
            timings.renderMs || 0,
            diagnostics.sampleCount
        )
        diagnostics.maxRenderMs = Math.max(timings.renderMs || 0, (diagnostics.maxRenderMs || 0) * 0.992)
        diagnostics.renderables = getSceneRenderableDiagnostics()

        if (legacyState) {
            Object.assign(legacyState.scenePerformanceDiagnostics, diagnostics)
        }
    })
}
