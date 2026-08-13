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
import { debugWarn } from '@lib/utils/debug'

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
    // Capture the cache epoch at call entry. cancelAnimate() bumps ppEpoch on
    // every teardown/re-init, so an import that resolves after a teardown must
    // not re-populate the cache the teardown just cleared (engine lifecycle
    // audit F3).
    const epoch = engineState.ppEpoch
    engineState.ppLoading = import('@lib/engine/three-postprocessing')
        .then((m) => {
            const wrapper: PostProcessingModule = {
                initPostProcessing: m.initPostProcessing,
                renderPostProcessing: m.renderPostProcessing,
                disposePostProcessing: m.disposePostProcessing,
                resizePostProcessing: m.resizePostProcessing
            }
            // Only cache when the epoch still matches. Otherwise the in-flight
            // import would resurrect engineState.ppModule / ppLoading; we still
            // return a usable wrapper to the (now superseded) caller so its
            // post-init hook can't throw on null, but the cache stays cleared.
            if (engineState.ppEpoch === epoch) {
                engineState.ppModule = wrapper
            }
            return wrapper
        })
        .catch((e: unknown) => {
            // Module-load failure (transient network or broken chunk): log + clear
            // the in-flight promise so the next request retries the load instead of
            // permanently returning a rejected promise (which would wedge postproc
            // for the rest of the session). Rethrow so callers can react; the render
            // loop degrades gracefully when engineState.ppModule stays null.
            debugWarn('[three-pp-init] postprocessing lazy-load failed:', e)
            engineState.ppLoading = null
            throw e
        })
    return engineState.ppLoading
}
