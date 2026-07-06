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
    updateMyceliumThreads as updateMyceliumThreadsPort,
    shouldRenderThreads as shouldRenderThreadsPort,
    shouldRenderBridgeThreads as shouldRenderBridgeThreadsPort
} from '@lib/engine/thread-manager'
import { webglContext } from '@lib/engine/webgl-context'
import { appState } from '@lib/state/app.svelte'

// ── Backward-compatible wrapper exports ────────────────────────────────────────

// W50: route through thread-manager.ts (the newer TS port with per-vertex
// color updates + dirty-node amortization) instead of the legacy
// mycelium-engine.ts whose updateMyceliumThreads only writes positions.
// The prior indirection via engineState.myceliumEngine left the color-update
// fix (commit ddf5604f) in dead code — thread endpoints kept initial-cluster
// colors instead of interpolating during focus transitions.
export function updateMyceliumThreads(): void {
    updateMyceliumThreadsPort()
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
