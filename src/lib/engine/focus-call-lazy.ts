/**
 * @lib/engine/focus-call-lazy.ts — P3-LCP lazy bridge for focusOnNode.
 *
 * focusOnNode (via camera-controls → camera-choreography) drags the Three.js
 * graph into ANY module that statically imports it. focus-ui.ts needs it only
 * inside click handlers, so this bridge dynamic-imports the engine facade on
 * first use. Same carve-out pattern as journey-webgl-lazy: callers get a
 * synchronous no-op-safe wrapper; the real call fires after the module loads.
 */

let cameraModule: typeof import('@lib/engine/camera-controls') | null = null
let cameraPromise: Promise<typeof import('@lib/engine/camera-controls')> | null = null
import { debugWarn } from '@lib/utils/debug'

function ensureCameraModule(): Promise<typeof import('@lib/engine/camera-controls')> {
    if (cameraModule) return Promise.resolve(cameraModule)
    if (!cameraPromise) {
        cameraPromise = import('@lib/engine/camera-controls')
            .then((m) => {
                cameraModule = m
                return m
            })
            .catch((err) => {
                // Reset so a later gesture can retry (e.g. transient network).
                cameraPromise = null
                throw err
            })
    }
    return cameraPromise
}

/** Fire the focus camera move; returns false if the engine isn't loaded yet. */
export function focusOnNodeLazy(index: number, options?: Record<string, unknown>): boolean {
    const mod = cameraModule
    if (!mod) {
        // Kick off the load so the next focus attempt (or the animation the
        // caller would have triggered) has the engine ready. The synchronous
        // return is false; callers treat it as best-effort like the engine
        // ready-state contract.
        void ensureCameraModule()
        return false
    }
    return mod.focusOnNode(index, options)
}

/** Pre-load semantic (no-op). Used by boot paths that anticipate focus. */
export function preloadFocusCameraModule(): void {
    void ensureCameraModule().catch((err) => {
        // #7 hardening: preload is best-effort, but log so a broken chunk
        // surfaces instead of focus silently returning false forever.
        debugWarn('[focus-call-lazy] camera module preload failed', err)
    })
}
