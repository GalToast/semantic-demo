/**
 * @lib/journey/webgl.ts — Re-export bridge with LAZY dynamic imports.
 *
 * Converts static imports of route-arrival-overlay-adapter and semantic-overlay
 * (both of which transitively import Three.js) into lazy dynamic imports using
 * the module-holder + ensureModule + forwarding-function pattern from
 * journey-webgl-lazy.ts. This breaks the static import chain so Vite can
 * code-split Three.js out of the main bundle and eliminates
 * [INEFFECTIVE_DYNAMIC_IMPORT] build warnings.
 *
 * W44 Lever 1: Three.js bundle split.
 */

// ── Module holders ────────────────────────────────────────────────────────────

let routeArrivalOverlayAdapterModule:
    | typeof import('@lib/journey/route-arrival-overlay-adapter')
    | null = null
let semanticOverlayModule: typeof import('@lib/journey/semantic-overlay') | null = null

// ── Lazy initializers ─────────────────────────────────────────────────────────

async function ensureRouteArrivalOverlayAdapterModule(): Promise<
    typeof import('@lib/journey/route-arrival-overlay-adapter')
> {
    if (!routeArrivalOverlayAdapterModule) {
        routeArrivalOverlayAdapterModule = await import(
            '@lib/journey/route-arrival-overlay-adapter'
        )
        // Register updaters with lazy wrappers so they resolve on first call.
        routeArrivalOverlayAdapterModule.setRouteArrivalOverlayUpdaters({
            updateRouteTraceOverlayPositions: lazyUpdateRouteTraceOverlayPositions,
            updateArrivalHandoffOverlay: lazyUpdateArrivalHandoffOverlay
        })
    }
    return routeArrivalOverlayAdapterModule
}

async function ensureSemanticOverlayModule(): Promise<
    typeof import('@lib/journey/semantic-overlay')
> {
    if (!semanticOverlayModule) {
        semanticOverlayModule = await import('@lib/journey/semantic-overlay')
    }
    return semanticOverlayModule
}

// ── Route-arrival-overlay-adapter forwarding functions ────────────────────────

function lazyUpdateRouteTraceOverlayPositions(now?: number): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.updateRouteTraceOverlayPositions?.(now)
    )
}

function lazyUpdateArrivalHandoffOverlay(now?: number): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.updateArrivalHandoffOverlay?.(now)
    )
}

// ── Semantic-overlay forwarding functions ─────────────────────────────────────

export function resetFocusThreadDiagnostics(reason?: string): void {
    ensureSemanticOverlayModule().then((mod) => mod.resetFocusThreadDiagnostics?.(reason))
}

export function removeFocusSemanticOverlay(): void {
    ensureSemanticOverlayModule().then((mod) => mod.removeFocusSemanticOverlay?.())
}

export function refreshFocusSemanticOverlay(): void {
    ensureSemanticOverlayModule().then((mod) => mod.refreshFocusSemanticOverlay?.())
}

export function updateFocusSemanticOverlayPositions(now: number): void {
    ensureSemanticOverlayModule().then((mod) => mod.updateFocusSemanticOverlayPositions?.(now))
}

export function updateFocusSemanticOverlayTime(now: number = performance.now()): void {
    ensureSemanticOverlayModule().then((mod) => mod.updateFocusSemanticOverlayTime?.(now))
}

export function syncFocusSemanticOverlayResolution(): void {
    ensureSemanticOverlayModule().then((mod) => mod.syncFocusSemanticOverlayResolution?.())
}

// ── Route-trace forwarding functions ──────────────────────────────────────────

export function resetRouteTraceDiagnostics(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.resetRouteTraceDiagnostics?.()
    )
}

export function removeRouteTraceOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.removeRouteTraceOverlay?.()
    )
}

export function setRouteChoreographyPhase(phase: string): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.setRouteChoreographyPhase?.(phase)
    )
}

export function refreshRouteTraceOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.refreshRouteTraceOverlay?.()
    )
}

export function updateRouteTraceOverlayPositions(now?: number): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.updateRouteTraceOverlayPositions?.(now)
    )
}

export function initRouteTraceSubscriptions(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.initRouteTraceSubscriptions?.()
    )
}

// ── Arrival-handoff forwarding functions ──────────────────────────────────────

export function removeArrivalHandoffOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.removeArrivalHandoffOverlay?.()
    )
}

export function buildArrivalHandoffOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.buildArrivalHandoffOverlay?.()
    )
}

export function disposeArrivalHandoffOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.disposeArrivalHandoffOverlay?.()
    )
}

export function syncArrivalHandoffOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.syncArrivalHandoffOverlay?.()
    )
}

export function updateArrivalHandoffOverlay(): void {
    ensureRouteArrivalOverlayAdapterModule().then(
        (mod) => mod.updateArrivalHandoffOverlay?.()
    )
}

// ── Diagnostic probe ──────────────────────────────────────────────────────────

export function getSemanticFocusCueProbeSnapshot(): Record<string, unknown> {
    // Probe reads state; if module not loaded yet, return empty snapshot.
    return semanticOverlayModule?.getSemanticFocusCueProbeSnapshot?.() ?? {}
}
