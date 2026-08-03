/**
 * view-bindings.ts
 * Canonical location (ported from — W15).
 * Core click helper and zoom (view controls were retired 2026-08-03 — the
 * bound buttons were never rendered; switching flows through mode chips).
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { debugWarn } from '@lib/utils/debug'
import { zoomMap } from '@lib/engine/map-state'

interface BindClickOptions {
    optional?: boolean
}

type EventHandler = (event?: MouseEvent) => void

declare global {
    interface Window {
        __semanticDemoProd?: boolean
    }
}

function isStrictBindMode(): boolean {
    return typeof window !== 'undefined' && !window.__semanticDemoProd
}

export function bindClick(id: string, handler: EventHandler, options: BindClickOptions = {}): void {
    const element = document.getElementById(id)
    if (!element) {
        if (options.optional) return
        const message = `[event-bindings] required button #${id} not found in DOM`
        if (isStrictBindMode()) {
            throw new Error(message)
        }
        debugWarn(message)
        return
    }
    element.onclick = handler
}

export function zoomCamera(multiplier: number): void {
    if (state.currentView === 'map' && typeof zoomMap === 'function') {
        zoomMap(multiplier)
        return
    }
    if (!state.camera || !state.controls) return
    const target = state.controls.target
    const direction = state.camera.position.clone().sub(target).normalize()
    const currentDistance = state.camera.position.distanceTo(target)
    const newDistance = currentDistance * multiplier
    const minDist = state.controls.minDistance || state.ORBIT_MIN_DISTANCE_DEFAULT
    const maxDist = state.controls.maxDistance || state.ORBIT_MAX_DISTANCE_DEFAULT
    const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance))
    state.camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)))
}
