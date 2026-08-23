/**
 * @lib/journey/canvas-interaction-lazy.ts — P3-LCP lazy bridge for canvas interaction bindings.
 *
 * canvas-interaction → canvas-hit-test/canvas-node-picking → Three.js (Raycaster, Vector3, etc.)
 * drags ~80KB+ three graph into any module that statically imports it. focus-ui.ts needs it
 * only inside the focus-sync UI pass (post-focus), not at cold boot paint. This bridge
 * dynamic-imports the real module on first use, breaking the boot chain for mobile 2D.
 */

let mod: typeof import('@lib/journey/canvas-interaction') | null = null
let promise: Promise<typeof import('@lib/journey/canvas-interaction')> | null = null
import { debugWarn } from '@lib/utils/debug'

function ensure(): Promise<typeof import('@lib/journey/canvas-interaction')> {
    if (mod) return Promise.resolve(mod)
    if (!promise) {
        promise = import('@lib/journey/canvas-interaction')
            .then((m) => {
                mod = m
                return m
            })
            .catch((err) => {
                promise = null
                throw err
            })
    }
    return promise
}

/** Lazily ensure canvas interaction bindings (no-op until module loads). */
export function ensureCanvasNodeInteractionBindingsLazy(): void {
    if (mod) {
        mod.ensureCanvasNodeInteractionBindings()
        return
    }
    void ensure()
        .then((m) => m.ensureCanvasNodeInteractionBindings())
        .catch((err) => {
            // #7 hardening: best-effort stays best-effort, but never silently —
            // a 404 here meant canvas node interactions quietly never attached.
            debugWarn('[canvas-interaction-lazy] module load failed; bindings not attached', err)
        })
}

/** Preload hint (optional). */
export function preloadCanvasInteraction(): void {
    void ensure().catch(() => {})
}
