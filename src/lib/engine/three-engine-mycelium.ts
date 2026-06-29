/**
 * @lib/engine/three-engine-mycelium.ts — Mycelium / thread visual wrappers
 *
 * Backward-compatible wrapper exports for mycelium and point-cloud
 * creation / visibility. Each wrapper delegates to the underlying module
 * through the lazy cache held in three-engine-core.
 *
 * Extracted from three-engine.ts (W47 decomposition). Public API is
 * re-exported through the barrel three-engine.ts — consumers should not
 * import this file directly.
 */

import { engineState } from './three-engine-state'
import { createPoints as createPointsPort } from '@lib/engine/node-manager'
import {
    createMycelium as createMyceliumPort,
    shouldRenderThreads as shouldRenderThreadsPort,
    shouldRenderBridgeThreads as shouldRenderBridgeThreadsPort
} from '@lib/engine/thread-manager'
import { webglContext } from '@lib/engine/webgl-context'
import { appState } from '@lib/state/app.svelte'

// ── Backward-compatible wrapper exports ────────────────────────────────────────

export function updateMyceliumThreads(): void {
    engineState.myceliumEngine?.updateMyceliumThreads()
}

export function createPoints(): void {
    createPointsPort()
    appState.pointsMesh = webglContext.pointsMesh
    appState.pointsMaterial = webglContext.pointsMaterial
    appState.nodeSporeMesh = webglContext.nodeSporeMesh
    appState.nodeSporeMaterial = webglContext.nodeSporeMaterial
    if (engineState.state) {
        engineState.state.pointsMesh = webglContext.pointsMesh
        engineState.state.pointsMaterial = webglContext.pointsMaterial
        engineState.state.nodeSporeMesh = webglContext.nodeSporeMesh
        engineState.state.nodeSporeMaterial = webglContext.nodeSporeMaterial
    }
}

export function createMycelium(): void {
    createMyceliumPort()
}

export function shouldRenderThreads(): boolean {
    return shouldRenderThreadsPort()
}

export function shouldRenderBridgeThreads(): boolean {
    return shouldRenderBridgeThreadsPort()
}
