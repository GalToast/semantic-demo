/**
 * @lib/engine/journey-webgl-lazy.ts — Lazy-loading bridge for journey WebGL overlays.
 *
 * Breaks the static import chain from the main bundle to Three.js by dynamically
 * importing the overlay modules on first use. The synchronous wrappers return
 * immediately (no-op) if the module hasn't loaded yet; the dynamic import is
 * kicked off in the background.
 *
 * W44 Lever 1: Three.js bundle split.
 */

import { setInspectedStrandOverlayUpdater as setAdapterInspectedStrandOverlayUpdater } from '@lib/journey/inspected-strand-overlay-adapter'
import { silenceError } from '@lib/utils/error-handler'
import { silentNull } from '@lib/utils/silent-null'

// ── Lazy module cache ────────────────────────────────────────────────────────

let webglModule: typeof import('@lib/journey/webgl') | null = null
let webglPromise: Promise<typeof import('@lib/journey/webgl')> | null = null

let inspectorWebglModule: typeof import('@lib/journey/thread-inspector-webgl') | null = null
let inspectorWebglPromise: Promise<typeof import('@lib/journey/thread-inspector-webgl')> | null = null

// ── webgl.ts lazy wrappers ───────────────────────────────────────────────────

function ensureWebglModule(): Promise<typeof import('@lib/journey/webgl')> {
    if (webglModule) return Promise.resolve(webglModule)
    if (!webglPromise) {
        webglPromise = import('@lib/journey/webgl')
            .then((mod) => {
                webglModule = mod
                return mod
            })
            .catch(() => {
                // Suppress unhandled rejections during test teardown or when
                // the environment is unavailable. The next call to ensureWebglModule
                // will retry the import.
                webglPromise = null
                return silentNull<typeof import('@lib/journey/webgl')>()
            })
    }
    return webglPromise
}

export function resetRouteTraceDiagnostics(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.resetRouteTraceDiagnostics()
}

export function removeRouteTraceOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.removeRouteTraceOverlay()
}

export function setRouteChoreographyPhase(phase: string): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.setRouteChoreographyPhase(phase)
}

export function refreshRouteTraceOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.refreshRouteTraceOverlay()
}

export function updateRouteTraceOverlayPositions(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.updateRouteTraceOverlayPositions()
}

export function refreshFocusSemanticOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.refreshFocusSemanticOverlay()
}

export function updateFocusSemanticOverlayPositions(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.updateFocusSemanticOverlayPositions()
}

export function updateFocusSemanticOverlayFrame(now: number = performance.now()): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.updateFocusSemanticOverlayTime(now)
}

// Sync the focus semantic overlay LineMaterial.resolution to the drawing
// buffer. Called from onWindowResize so a resize while focused keeps the
// linewidth shader correct.
export function syncFocusSemanticOverlayResolutionPort(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.syncFocusSemanticOverlayResolution()
}

export function removeFocusSemanticOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.removeFocusSemanticOverlay()
}

export function resetFocusThreadDiagnostics(reason?: string): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.resetFocusThreadDiagnostics(reason)
}

export function syncArrivalHandoffOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.syncArrivalHandoffOverlay()
}

export function updateArrivalHandoffOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.updateArrivalHandoffOverlay()
}

export function disposeArrivalHandoffOverlay(): void {
    if (!webglModule) {
        ensureWebglModule()
        return
    }
    webglModule.disposeArrivalHandoffOverlay()
}

// ── route-arrival-overlay-adapter.ts lazy wrappers ─────────────────────────────
//
// W44 Phase 4: these were previously consumed via `import * as routeArrivalMod`
// from three-engine.ts. That static import pulled route-trace.ts + arrival-handoff.ts
// (and thus the three.js chunk) into the main entry graph. Routing the per-frame
// calls through this lazy bridge keeps three.js off the mobile cold path.

type RouteArrivalModule = typeof import('@lib/journey/route-arrival-overlay-adapter')
let routeArrivalModule: RouteArrivalModule | null = null
let routeArrivalPromise: Promise<RouteArrivalModule> | null = null

function ensureRouteArrivalModule(): Promise<RouteArrivalModule> {
    if (routeArrivalModule) return Promise.resolve(routeArrivalModule)
    if (!routeArrivalPromise) {
        routeArrivalPromise = import('@lib/journey/route-arrival-overlay-adapter')
            .then((mod) => {
                routeArrivalModule = mod
                return mod
            })
            .catch(() => {
                routeArrivalPromise = null
                return silentNull<RouteArrivalModule>()
            })
    }
    return routeArrivalPromise
}

export function updateRouteTraceOverlayFrame(now: number = performance.now()): void {
    if (!routeArrivalModule) {
        ensureRouteArrivalModule()
        return
    }
    routeArrivalModule.updateRouteTraceOverlayFrame(now)
}

export function updateArrivalHandoffOverlayFrame(now: number = performance.now()): void {
    if (!routeArrivalModule) {
        ensureRouteArrivalModule()
        return
    }
    routeArrivalModule.updateArrivalHandoffOverlayFrame(now)
}

// ── thread-inspector-webgl.ts lazy wrappers ────────────────────────────────────

function ensureInspectorWebglModule(): Promise<typeof import('@lib/journey/thread-inspector-webgl')> {
    if (inspectorWebglModule) return Promise.resolve(inspectorWebglModule)
    if (!inspectorWebglPromise) {
        inspectorWebglPromise = import('@lib/journey/thread-inspector-webgl')
            .then((mod) => {
                inspectorWebglModule = mod
                return mod
            })
            .catch(() => {
                inspectorWebglPromise = null
                return silentNull<typeof import('@lib/journey/thread-inspector-webgl')>()
            })
    }
    return inspectorWebglPromise
}

export function syncInspectedStrandOverlay(
    ...args: Parameters<typeof import('@lib/journey/thread-inspector-webgl').syncInspectedStrandOverlay>
): void {
    if (!inspectorWebglModule) {
        ensureInspectorWebglModule()
        return
    }
    inspectorWebglModule.syncInspectedStrandOverlay(...args)
}

export function updateInspectedStrandOverlay(now?: number): void {
    if (!inspectorWebglModule) return
    inspectorWebglModule.updateInspectedStrandOverlay(now)
}

export function disposeInspectedStrandOverlay(): void {
    if (!inspectorWebglModule) {
        ensureInspectorWebglModule()
        return
    }
    inspectorWebglModule.disposeInspectedStrandOverlay()
}

export function setInspectedStrandOverlayUpdater(updater: unknown): void {
    setAdapterInspectedStrandOverlayUpdater(updater)
}

// ── Preload helpers (call after initial render) ───────────────────────────────

export function preloadJourneyWebgl(): void {
    ensureWebglModule().catch(silenceError('webgl-preload'))
    ensureInspectorWebglModule().catch(silenceError('inspector-webgl-preload'))
}
