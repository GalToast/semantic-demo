/**
 * @lib/utils/point-cloud-math.ts — pure point-cloud math shared by the main
 * thread and the geometry build worker (INP campaign 2026-08-25).
 *
 * getPointBoundsCenter was EXTRACTED verbatim from node-manager.ts (which
 * re-exports it — call sites and the AGENTS.md-documented import location
 * are unchanged). node-manager pulls the Svelte state graph at module eval,
 * so the worker imports THIS module instead. No store/webgl/DOM reads here.
 */
import { Vector3 } from 'three'

export function getPointBoundsCenter(points: ReadonlyArray<unknown>, positionBuffer: Float32Array) {
    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)
    let count = 0

    // `positionBuffer` is a required `Float32Array` (TypeScript-enforced).
    // The legacy `point.x/y/z` fallback has been removed: at runtime
    // `state.points` is `BusinessRecord[]` and does not carry `.x`/`.y`/`.z`,
    // so the fallback would silently produce `count=0` and a wrong center.
    // See `tmp/bounds-center-audit-2026-06-29.md` for the audit history.
    const len = points.length
    for (let i = 0; i < len; i += 1) {
        const rawX = positionBuffer[i * 3]
        const rawY = positionBuffer[i * 3 + 1]
        const rawZ = positionBuffer[i * 3 + 2]
        if (rawX === undefined || rawY === undefined || rawZ === undefined) continue
        const x = Number(rawX)
        const y = Number(rawY)
        const z = Number(rawZ)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
        if (x < min.x) min.x = x
        if (y < min.y) min.y = y
        if (z < min.z) min.z = z
        if (x > max.x) max.x = x
        if (y > max.y) max.y = y
        if (z > max.z) max.z = z
        count += 1
    }

    if (!count) {
        return {
            center: new Vector3(0, 0, 0),
            min: new Vector3(0, 0, 0),
            max: new Vector3(0, 0, 0),
            count: 0
        }
    }

    return {
        center: min.clone().add(max).multiplyScalar(0.5),
        min,
        max,
        count
    }
}
