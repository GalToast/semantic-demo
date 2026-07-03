/**
 * @lib/engine/renderer/scene-static-tracker.ts — Camera + scene-state delta
 *
 * W49-H: a safe, testable conditional render-skip helper.
 *
 * The animate loop already runs at 8fps when nothing's animating
 * (scheduleNextAnimationFrame(false) uses setTimeout(125ms)), but
 * `renderer.render(scene, camera)` is called on every tick. When the
 * camera matrix + scene-state booleans haven't changed since the
 * previous frame, that render is wasted CPU — the output is
 * byte-identical to the previous one.
 *
 * This module decides whether the next render can be skipped. It's a
 * pure helper:
 *   1. Caller passes the current camera + scene-state snapshot.
 *   2. We compare against the previous snapshot (if any).
 *   3. Returns "should-skip-render" if nothing changed.
 *
 * It does NOT touch the render loop, the camera, or any singletons.
 * That decision lives in three-engine-core.ts so the render-skip is
 * easy to disable for tests (`shouldSkipNextRender(...)` is exported
 * for direct unit testing).
 *
 * Safety guards:
 *   - First call (no previous snapshot) → never skip.
 *   - Any animation flag in `animatingNow` → never skip.
 *   - Camera position/quaternion changed → never skip.
 *   - All-zero state (e.g. before mount) → never skip.
 */

export interface SceneStaticSnapshot {
    /** Camera world position as [x, y, z]. */
    cameraPos: readonly [number, number, number]
    /** Camera rotation as a quaternion [x, y, z, w]. */
    cameraQuat: readonly [number, number, number, number]
}

export interface SceneStaticCheck {
    /**
     * Whether the next render call is genuinely redundant. True means:
     *   - the previous snapshot exists,
     *   - the previous snapshot had a non-zero camera transform,
     *   - every component matches within tolerance, AND
     *   - no animations are currently in progress.
     *
     * False means either "first call" or "something changed".
     */
    shouldSkip: boolean
    /** Updated snapshot to pass on the next call. */
    nextSnapshot: SceneStaticSnapshot
}

/** Tolerance for float comparisons; camera matrices drift by ~1e-7. */
const EPSILON = 1e-5

/**
 * Decide whether the animate loop can skip the next render call.
 *
 * @param prev    The snapshot from the previous frame, or null on first call.
 * @param curr    The snapshot for the current frame.
 * @param animatingNow  True if any user-driven animation is currently
 *                        active (the same conditions checked by
 *                        sceneNeedsContinuousFrame). Skipping during
 *                        animations breaks the visual.
 */
export function shouldSkipNextRender(
    prev: SceneStaticSnapshot | null,
    curr: SceneStaticSnapshot,
    animatingNow: boolean
): SceneStaticCheck {
    // Hard guards: never skip on first call, never skip if the camera
    // hasn't actually moved (first frame often has identity matrix) or
    // while a user animation is in flight.
    if (!prev || animatingNow) {
        return { shouldSkip: false, nextSnapshot: curr }
    }
    if (
        prev.cameraPos[0] === 0 &&
        prev.cameraPos[1] === 0 &&
        prev.cameraPos[2] === 0 &&
        prev.cameraQuat[0] === 0 &&
        prev.cameraQuat[1] === 0 &&
        prev.cameraQuat[2] === 0 &&
        prev.cameraQuat[3] === 0
    ) {
        // Identity pose — no real prior frame to compare against.
        return { shouldSkip: false, nextSnapshot: curr }
    }

    // Compare with epsilon tolerance.
    const posDelta =
        Math.abs(prev.cameraPos[0] - curr.cameraPos[0]) +
        Math.abs(prev.cameraPos[1] - curr.cameraPos[1]) +
        Math.abs(prev.cameraPos[2] - curr.cameraPos[2])
    const quatDelta =
        Math.abs(prev.cameraQuat[0] - curr.cameraQuat[0]) +
        Math.abs(prev.cameraQuat[1] - curr.cameraQuat[1]) +
        Math.abs(prev.cameraQuat[2] - curr.cameraQuat[2]) +
        Math.abs(prev.cameraQuat[3] - curr.cameraQuat[3])

    const shouldSkip = posDelta < EPSILON && quatDelta < EPSILON
    return { shouldSkip, nextSnapshot: curr }
}
