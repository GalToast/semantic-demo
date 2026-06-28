/**
 * @lib/engine/three-pp-init.ts — Lazy postprocessing initialization
 *
 * Phase 3a of the three-engine-core decomposition. Isolates the lazy dynamic
 * import of the postprocessing module (~150-200 kB) so it stays out of the
 * main chunk until premium mode is toggled on.
 *
 * The module is gated on non-mobile viewports: mobile devices skip
 * postprocessing entirely for performance (see initThreeJS in core).
 */

import type { ThreeEngineState, PostProcessingModule } from './three-engine-state'

/**
 * Lazily import and cache the postprocessing module.
 *
 * The first call triggers a dynamic `import()` and writes the result into
 * `engineState.ppModule`; subsequent calls return the cached module
 * immediately. If the import is already in-flight, it awaits the existing
 * promise rather than triggering a duplicate network request.
 */
export async function ensurePostProcessing(engineState: ThreeEngineState): Promise<PostProcessingModule> {
    if (engineState.ppModule) return engineState.ppModule
    if (engineState.ppLoading) return engineState.ppLoading
    engineState.ppLoading = import('@lib/engine/three-postprocessing').then((m) => {
        engineState.ppModule = {
            initPostProcessing: m.initPostProcessing,
            renderPostProcessing: m.renderPostProcessing,
            disposePostProcessing: m.disposePostProcessing,
            resizePostProcessing: m.resizePostProcessing
        }
        return engineState.ppModule!
    })
    return engineState.ppLoading
}
