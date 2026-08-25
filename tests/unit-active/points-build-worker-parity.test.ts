/**
 * Parity test: the geometry worker's buildPointsBuffers must produce buffers
 * IDENTICAL to the main-thread createPoints per-point loop (node-manager.ts)
 * — INP campaign 2026-08-25.
 */
import { describe, expect, it } from 'vitest'
import { Color, MathUtils } from 'three'
import { buildPointsBuffers } from '../../src/lib/workers/mycelium-build-worker'
import { computeOverviewScatterOffsets } from '../../src/lib/utils/geo-data'
import { getPointBoundsCenter } from '../../src/lib/engine/node-manager'
import { getThreadCategoryColor } from '../../src/lib/utils/ui-presentation-three'

const COLORS = ['#4fd1c5', '#f6ad55', '#fc8181', '#68d391']
const TINT = { r: 0.2, g: 0.3, b: 0.4 }
const SCALE = { x: 1.2, y: 0.9, z: 1.1 }

const rawPositions = new Float32Array([0.1, 0.2, 0.3, 0.5, 0.4, 0.6, 0.8, 0.7, 0.9, 0.3, 0.6, 0.2])
const clusters = [0, 1, 2, 0]

const payload = {
    clusters,
    rawPositions,
    colors: COLORS,
    threadTint: TINT,
    fieldScale: SCALE
}

describe('points build worker — parity with main-thread createPoints loop', () => {
    it('produces buffers identical to the node-manager loop', () => {
        // Reference: the exact main-thread loop (node-manager createPoints).
        const scatterOffsets = computeOverviewScatterOffsets(clusters as unknown as Array<{ x?: number }>, rawPositions)
        // getPointBoundsCenter via the node-manager re-export shim — proves
        // the shim resolves to the pure module.
        const bounds = getPointBoundsCenter(clusters as unknown as Array<{ x?: number }>, rawPositions)
        const renderCenter = bounds.center
        const tint = new Color(TINT.r, TINT.g, TINT.b)
        const refPositions: number[] = []
        const refColors: number[] = []

        for (let i = 0; i < clusters.length; i += 1) {
            const scatter = scatterOffsets[i] || { x: 0, y: 0, z: 0 }
            const px = rawPositions[i * 3] ?? 0
            const py = rawPositions[i * 3 + 1] ?? 0
            const pz = rawPositions[i * 3 + 2] ?? 0
            const cluster = clusters[i] ?? 0
            const fx = (px - renderCenter.x + scatter.x) * SCALE.x
            const fy = (py - renderCenter.y + scatter.y) * SCALE.y
            const fz = (pz - renderCenter.z + scatter.z) * SCALE.z
            refPositions.push(fx, fy, fz)
            const color = getThreadCategoryColor(cluster, COLORS).lerp(tint, 0.005)
            const radialDepth = Math.sqrt(fx * fx + fy * fy + fz * fz)
            const depthFactor = MathUtils.clamp(1.16 - radialDepth * 0.14, 0.82, 1.12)
            color.offsetHSL(0, 0.045, -0.01)
            refColors.push(
                Math.min(1, color.r * depthFactor * 1.18 + 0.018),
                Math.min(1, color.g * depthFactor * 1.18 + 0.022),
                Math.min(1, color.b * depthFactor * 1.18 + 0.019)
            )
        }

        const built = buildPointsBuffers(payload)
        expect(built.positions).toEqual(new Float32Array(refPositions))
        expect(built.colors).toEqual(new Float32Array(refColors))
        expect(built.pointBaseColors).toEqual(built.colors)
        expect(built.bounds.count).toBe(4)
        expect(built.bounds.center.x).toBeCloseTo(renderCenter.x, 10)
    })

    it('empty payload produces zero-length buffers without throwing', () => {
        const built = buildPointsBuffers({
            clusters: [],
            rawPositions: new Float32Array(0),
            colors: COLORS,
            threadTint: TINT,
            fieldScale: SCALE
        })
        expect(built.positions.length).toBe(0)
        expect(built.bounds.count).toBe(0)
    })
})
