/**
 * three-micro-demo-bridge.ts — Micro-demo event bridge for Three.js visuals (deprecated / no-op)
 *
 * The 6-phase micro-demo this bridge served was replaced by the 10-phase
 * DemoChoreography.svelte store (src/lib/stores/demo.svelte.ts). The event
 * bridge is no longer wired at module init (see three-interaction-visuals.ts),
 * so initMicroDemoBridge() is a no-op and disposeMicroDemoBridge() is a
 * harmless cleanup that removes nothing (no listeners are ever registered).
 * Kept as a stable seam so callers don't need to branch on demo version.
 */

let _onDemoNodeHighlight: ((e: Event) => void) | null = null
let _onDemoNamePulse: (() => void) | null = null

/**
 * @deprecated No-op. The 10-phase DemoChoreography.svelte owns the micro-demo.
 * Retained only as a stable no-op seam; do not rely on it registering listeners.
 */
export function initMicroDemoBridge(): void {
    // Intentionally a no-op. The legacy 6-phase demo that needed these
    // document event listeners was retired in favor of the Svelte store.
}

/**
 * Remove micro-demo event listeners to prevent handler leaks.
 * Called during disposal (disposeInteractionVisuals).
 */
export function disposeMicroDemoBridge(): void {
    if (typeof document !== 'undefined' && document && document.removeEventListener) {
        if (_onDemoNodeHighlight) {
            document.removeEventListener('micro-demo-node-highlight', _onDemoNodeHighlight as EventListener)
            _onDemoNodeHighlight = null
        }
        if (_onDemoNamePulse) {
            document.removeEventListener('micro-demo-name-pulse', _onDemoNamePulse as EventListener)
            _onDemoNamePulse = null
        }
    }
}
