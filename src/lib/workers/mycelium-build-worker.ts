/**
 * @lib/workers/mycelium-build-worker.ts — off-main-thread mycelium tessellation.
 *
 * INP campaign (2026-08-25): createMycelium's tessellation loop measured
 * +751ms inside the post-tap interaction window (tmp/inp-campaign.md). This
 * worker runs the EXACT same pushBezierLinePair math off-thread and returns
 * transferable Float32Array buffers — the main thread only does the GPU
 * upload (which must stay main-side).
 *
 * Parity: uses the same pure pushBezierLinePair from @lib/engine/mycelium-bezier
 * (DI-injected, no store/webgl reads in the tessellation path). The view-vector
 * cache is seeded from the main thread via seedBezierViewVector so control
 * points match camera-refreshed builds.
 *
 * Protocol:
 *   in:  { type: 'BUILD', ...MyceliumBuildPayload }
 *   out: { type: 'BUILT', core: Float32Array, wispy: Float32Array,
 *          bridge: Float32Array, coreColors: Float32Array,
 *          wispyColors: Float32Array, bridgeColors: Float32Array,
 *          pairCount: number }  (buffers transferred, not cloned)
 */
import { pushBezierLinePair, seedBezierViewVector, pairKey } from '@lib/engine/mycelium-bezier'
import { computeOverviewScatterOffsets } from '@lib/utils/geo-data'
import { getPointBoundsCenter } from '@lib/utils/point-cloud-math'
import { getThreadCategoryColor } from '@lib/utils/ui-presentation-three'
import { Color, MathUtils } from 'three'

type EdgePair = { a: number; b: number }

export interface MyceliumBuildPayload {
    corePairs: Int32Array | EdgePair[]
    wispyPairs: Int32Array | EdgePair[]
    bridgePairs: Int32Array | EdgePair[]
    nodePositions: Array<{ x?: number; y?: number; z?: number }>
    /** Cluster id per point — INP fix (2026-08-25 longtask probe): the
     * original payload shipped 8,406 full BusinessRecord objects and the
     * structured clone cost ~900ms ON THE MAIN THREAD (the very long task
     * this worker was meant to remove). Only .cluster is read worker-side. */
    pointClusters: Array<number | null>
    /** Category color strings (CONFIG.COLORS) — Color parses them worker-side. */
    colors: string[]
    intensities: { core: number; wispy: number; bridge: number }
    /** Main-thread view vector (refreshCachedBezierViewVector result). */
    viewVector: { x: number; y: number; z: number }
    segmentsPerPair: number
}

/** Per-layer bounding box + sphere in three's Box3/Sphere semantics — lets
 * the main thread SKIP LineSegmentsGeometry.setPositions' O(n)
 * computeBoundingBox/computeBoundingSphere (the ~530-760ms post-worker
 * long task, 2026-08-25). Radius = max endpoint distance from center
 * (matches three's algorithm; an upper bound is required for culling). */
export function computeLayerBounds(positions: Float32Array): {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
    center: { x: number; y: number; z: number }
    radius: number
} {
    let minX = Infinity,
        minY = Infinity,
        minZ = Infinity
    let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]!,
            y = positions[i + 1]!,
            z = positions[i + 2]!
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (z < minZ) minZ = z
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        if (z > maxZ) maxZ = z
    }
    if (!Number.isFinite(minX)) {
        return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 }, radius: 0 }
    }
    const cx = (minX + maxX) / 2,
        cy = (minY + maxY) / 2,
        cz = (minZ + maxZ) / 2
    let radiusSq = 0
    for (let i = 0; i < positions.length; i += 3) {
        const dx = positions[i]! - cx,
            dy = positions[i + 1]! - cy,
            dz = positions[i + 2]! - cz
        const d = dx * dx + dy * dy + dz * dz
        if (d > radiusSq) radiusSq = d
    }
    return {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        center: { x: cx, y: cy, z: cz },
        radius: Math.sqrt(radiusSq)
    }
}

/** Pure build function — exported for unit-test parity checks (no worker spawn). */
export interface LayerBounds {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
    center: { x: number; y: number; z: number }
    radius: number
}

export function buildMyceliumBuffers(payload: MyceliumBuildPayload): {
    layerBounds: { core: LayerBounds; wispy: LayerBounds; bridge: LayerBounds }
    core: Float32Array
    wispy: Float32Array
    bridge: Float32Array
    coreColors: Float32Array
    wispyColors: Float32Array
    bridgeColors: Float32Array
} {
    seedBezierViewVector(payload.viewVector)
    // Minimal per-point views — pushBezierLinePair only reads .cluster.
    const pointViews = payload.pointClusters.map((cluster) => ({ cluster }))
    const colorFn = (cluster: number | null | undefined): { r: number; g: number; b: number } => {
        const c = new Color(
            payload.colors[
                (cluster === null || cluster === undefined || !Number.isFinite(cluster) ? 0 : cluster) %
                    payload.colors.length
            ]
        )
        return { r: c.r, g: c.g, b: c.b }
    }

    // Accept BOTH the interleaved Int32Array form (zero-copy from the
    // discovery worker) and the object form (parity-test fixtures). Both
    // iterate to the same pushBezierLinePair call site — the shape is the
    // only difference.
    const normalizePairs = (pairs: Int32Array | EdgePair[]): EdgePair[] => {
        if (pairs instanceof Int32Array) {
            const out: EdgePair[] = []
            for (let i = 0; i < pairs.length; i += 2) out.push({ a: pairs[i]!, b: pairs[i + 1]! })
            return out
        }
        return pairs
    }
    const corePairs = normalizePairs(payload.corePairs)
    const wispyPairs = normalizePairs(payload.wispyPairs)
    const bridgePairs = normalizePairs(payload.bridgePairs)

    const core: number[] = []
    const coreColors: number[] = []
    const wispy: number[] = []
    const wispyColors: number[] = []
    const bridge: number[] = []
    const bridgeColors: number[] = []

    for (const pair of corePairs) {
        pushBezierLinePair(
            core,
            coreColors,
            pair,
            payload.nodePositions,
            pointViews,
            colorFn,
            payload.intensities.core,
            payload.segmentsPerPair
        )
    }
    for (const pair of wispyPairs) {
        pushBezierLinePair(
            wispy,
            wispyColors,
            pair,
            payload.nodePositions,
            pointViews,
            colorFn,
            payload.intensities.wispy,
            payload.segmentsPerPair
        )
    }
    for (const pair of bridgePairs) {
        pushBezierLinePair(
            bridge,
            bridgeColors,
            pair,
            payload.nodePositions,
            pointViews,
            colorFn,
            payload.intensities.bridge,
            payload.segmentsPerPair
        )
    }

    const layerBounds = {
        core: computeLayerBounds(new Float32Array(core)),
        wispy: computeLayerBounds(new Float32Array(wispy)),
        bridge: computeLayerBounds(new Float32Array(bridge))
    }
    return {
        layerBounds,
        core: new Float32Array(core),
        wispy: new Float32Array(wispy),
        bridge: new Float32Array(bridge),
        coreColors: new Float32Array(coreColors),
        wispyColors: new Float32Array(wispyColors),
        bridgeColors: new Float32Array(bridgeColors)
    }
}

// ── Discovery (edge sets) — pure, shared with the main-thread fallback ──
// INP 2026-08-25 longtask attribution: the DOMINANT main-thread cost in the
// mycelium window is buildSemanticMyceliumEdges — edge DISCOVERY (~900ms
// sync), not tessellation. The algorithm lives in ONE exported pure function
// used by both this worker and the main-thread sync fallback — zero drift.

export interface DiscoverNeighbor {
    leadId: string | null
    semanticScore?: number
    bridgeScore?: number
    sameCity?: boolean
    threadType?: string
}

export interface DiscoverPayload {
    /** lead_id per point index ('' when absent — skipped, mirrors main). */
    leadIds: string[]
    pointClusters: Array<number | null>
    /** semanticNeighborMapByLeadId serialized: leadId → neighbor details. */
    neighborMap: Record<string, DiscoverNeighbor[]>
}

export interface DiscoveredEdgeSets {
    corePairs: Array<{ a: number; b: number }>
    wispyPairs: Array<{ a: number; b: number }>
    bridgePairs: Array<{ a: number; b: number }>
}

/** Zero-copy discovery response — the SAME edge sets as DiscoveredEdgeSets,
 * but as three interleaved Int32Arrays ([a0,b0,a1,b1,...]). postMessage
 * TRANSFERS these (zero-copy); the object form would structured-clone
 * thousands of small {a,b} objects (~1000ms, the measured round-trip cost).
 * The main thread iterates the flat arrays directly — no reconstruction. */
export interface DiscoveredEdgeSetsBuffers {
    corePairs: Int32Array
    wispyPairs: Int32Array
    bridgePairs: Int32Array
}

/** Reconstruct the object form from interleaved buffers — parity-test helper
 * ONLY (the hot path never calls this). */
export function unpairEdges(buffer: Int32Array): Array<{ a: number; b: number }> {
    const out: Array<{ a: number; b: number }> = []
    for (let i = 0; i < buffer.length; i += 2) out.push({ a: buffer[i]!, b: buffer[i + 1]! })
    return out
}

/** CSR serialization of the neighbor map — INP 2026-08-25: the structured
 * clone of 8,406 record objects inside postMessage measured ~650ms ON MAIN
 * (the transfer had become the cost after the compute moved worker-side).
 * Typed arrays transfer ZERO-COPY. threadType's bridge-includes check is
 * precomputed to a flag bit at serialization (data-static). */
export interface SerializedAdjacency {
    /** CSR offsets: record i's neighbors occupy [offsets[i], offsets[i+1]).
     * Indexed by POINT index (records exist only for points with a leadId
     * present in the neighbor map — missing = empty range). */
    recordOffsets: Int32Array
    /** Per-neighbor string-table index of the neighbor's leadId. */
    neighborLeadIdx: Int32Array
    neighborScores: Float32Array
    neighborBridgeScores: Float32Array
    /** bit0 = sameCity, bit1 = threadType.toLowerCase().includes('bridge'). */
    neighborFlags: Uint8Array
    /** Unique leadIds (points + neighbors). neighborLeadIdx indexes this. */
    stringTable: string[]
}

export function serializeAdjacency(payload: {
    leadIds: string[]
    neighborMap: Record<string, DiscoverNeighbor[]>
}): SerializedAdjacency {
    const { leadIds, neighborMap } = payload
    const stringTable: string[] = []
    const stringIdx = new Map<string, number>()
    const intern = (s: string): number => {
        let idx = stringIdx.get(s)
        if (idx === undefined) {
            idx = stringTable.length
            stringIdx.set(s, idx)
            stringTable.push(s)
        }
        return idx
    }
    for (const leadId of leadIds) if (leadId) intern(leadId)

    const n = leadIds.length
    const recordRows: Array<Array<{ leadIdx: number; score: number; bridge: number; flags: number }>> = new Array(n)
    for (let i = 0; i < n; i += 1) {
        const leadId = leadIds[i]
        const record = leadId ? neighborMap[leadId] : undefined
        const row: Array<{ leadIdx: number; score: number; bridge: number; flags: number }> = []
        if (record) {
            for (const neighbor of record) {
                const nl = String(neighbor.leadId ?? '')
                if (!nl) continue
                row.push({
                    leadIdx: intern(nl),
                    score: Number.isFinite(neighbor.semanticScore) ? neighbor.semanticScore! : 0,
                    bridge: Number.isFinite(neighbor.bridgeScore) ? neighbor.bridgeScore! : 0,
                    flags:
                        (neighbor.sameCity ? 1 : 0) |
                        (String(neighbor.threadType || '')
                            .toLowerCase()
                            .includes('bridge')
                            ? 2
                            : 0)
                })
            }
        }
        recordRows[i] = row
    }

    let total = 0
    for (const row of recordRows) total += row.length
    const recordOffsets = new Int32Array(n + 1)
    const neighborLeadIdx = new Int32Array(total)
    const neighborScores = new Float32Array(total)
    const neighborBridgeScores = new Float32Array(total)
    const neighborFlags = new Uint8Array(total)
    let cursor = 0
    for (let i = 0; i < n; i += 1) {
        recordOffsets[i] = cursor
        for (const cell of recordRows[i]!) {
            neighborLeadIdx[cursor] = cell.leadIdx
            neighborScores[cursor] = cell.score
            neighborBridgeScores[cursor] = cell.bridge
            neighborFlags[cursor] = cell.flags
            cursor += 1
        }
    }
    recordOffsets[n] = cursor
    return { recordOffsets, neighborLeadIdx, neighborScores, neighborBridgeScores, neighborFlags, stringTable }
}

/** CSR-form discovery — the algorithm over the serialized adjacency. The
 * per-record top-20-by-score selection sorts an index slice (same ordering
 * semantics as the object form: score desc, stable within equal scores). */
export function discoverMyceliumEdgesCSR(
    payload: DiscoverPayload & { adjacency: SerializedAdjacency }
): DiscoveredEdgeSets | null {
    const { leadIds, pointClusters, adjacency } = payload
    if (!leadIds.length) return null
    const { recordOffsets, neighborLeadIdx, neighborScores, neighborBridgeScores, neighborFlags, stringTable } =
        adjacency
    // pointIndexByLeadId: leadId string-table index → point index.
    const leadStrToTable = new Map<string, number>()
    for (let t = 0; t < stringTable.length; t += 1) leadStrToTable.set(stringTable[t]!, t)
    const pointIndex = new Map<string, number>()
    for (let i = 0; i < leadIds.length; i += 1) {
        const leadId = leadIds[i]
        if (leadId) pointIndex.set(leadId, i)
    }
    if (!pointIndex.size) return null

    const seen = new Set<string>()
    const corePairs: Array<{ a: number; b: number }> = []
    const wispyPairs: Array<{ a: number; b: number }> = []
    const bridgePairs: Array<{ a: number; b: number }> = []
    const coreDegree = new Map<number, number>()
    const wispyDegree = new Map<number, number>()
    const bridgeDegree = new Map<number, number>()
    const order: number[] = []

    for (let index = 0; index < leadIds.length; index += 1) {
        const leadId = leadIds[index]
        if (!leadId) continue
        const from = recordOffsets[index]!
        const to = recordOffsets[index + 1]!
        if (to <= from) continue
        order.length = 0
        for (let k = from; k < to; k += 1) order.push(k)
        // Score desc; Array.prototype.sort is stable → ties keep CSR order,
        // matching the object form's stable sort of the source array.
        order.sort((ka, kb) => (neighborScores[kb!] || 0) - (neighborScores[ka!] || 0))
        const top = order.slice(0, 20)
        for (const k of top) {
            const neighborLead = stringTable[neighborLeadIdx[k!]!]
            const otherIndex = neighborLead ? pointIndex.get(neighborLead) : undefined
            if (otherIndex === undefined || otherIndex === index) continue
            const key = pairKey(index, otherIndex)
            if (seen.has(key)) continue
            seen.add(key)
            const semanticScore = neighborScores[k!]!
            const bridgeScore = neighborBridgeScores[k!]!
            const sameCluster = pointClusters[index] === pointClusters[otherIndex]
            const sameCity = (neighborFlags[k!]! & 1) !== 0
            const bridgeLike = (neighborFlags[k!]! & 2) !== 0 || bridgeScore >= 0.62

            if (!sameCluster) {
                if (!bridgeLike) continue
                const aDegree = bridgeDegree.get(index) || 0
                const bDegree = bridgeDegree.get(otherIndex) || 0
                if (aDegree >= 2 || bDegree >= 2) continue
                bridgeDegree.set(index, aDegree + 1)
                bridgeDegree.set(otherIndex, bDegree + 1)
                bridgePairs.push({ a: index, b: otherIndex })
                continue
            }

            if (semanticScore >= 0.62 || (semanticScore >= 0.56 && sameCity)) {
                const aDegree = coreDegree.get(index) || 0
                const bDegree = coreDegree.get(otherIndex) || 0
                if (aDegree >= 4 || bDegree >= 4) continue
                coreDegree.set(index, aDegree + 1)
                coreDegree.set(otherIndex, bDegree + 1)
                corePairs.push({ a: index, b: otherIndex })
            } else if (semanticScore >= 0.42 || sameCity) {
                const aDegree = wispyDegree.get(index) || 0
                const bDegree = wispyDegree.get(otherIndex) || 0
                if (aDegree >= 5 || bDegree >= 5) continue
                wispyDegree.set(index, aDegree + 1)
                wispyDegree.set(otherIndex, bDegree + 1)
                wispyPairs.push({ a: index, b: otherIndex })
            }
        }
    }

    return corePairs.length || wispyPairs.length || bridgePairs.length ? { corePairs, wispyPairs, bridgePairs } : null
}

/** Buffer-form discovery — same algorithm, same ordering, same caps; the
 * result is three interleaved Int32Arrays for zero-copy transfer. Kept in
 * lockstep with discoverMyceliumEdgesCSR by construction (single push site).
 */
export function discoverMyceliumEdgesCSRBuffers(
    payload: DiscoverPayload & { adjacency: SerializedAdjacency }
): DiscoveredEdgeSetsBuffers | null {
    const sets = discoverMyceliumEdgesCSR(payload)
    if (!sets) return null
    const toBuffer = (pairs: Array<{ a: number; b: number }>): Int32Array => {
        const buf = new Int32Array(pairs.length * 2)
        for (let i = 0; i < pairs.length; i += 1) {
            buf[i * 2] = pairs[i]!.a
            buf[i * 2 + 1] = pairs[i]!.b
        }
        return buf
    }
    return {
        corePairs: toBuffer(sets.corePairs),
        wispyPairs: toBuffer(sets.wispyPairs),
        bridgePairs: toBuffer(sets.bridgePairs)
    }
}

/** Object-form discovery — serializes then runs the CSR algorithm. Kept as
 * the sync-fallback entry (rare path) and for the parity test fixture API. */
export function discoverMyceliumEdges(payload: DiscoverPayload): DiscoveredEdgeSets | null {
    if (!payload.leadIds.length) return null
    const adjacency = serializeAdjacency(payload)
    return discoverMyceliumEdgesCSR({ ...payload, adjacency })
}

// ── Points build (INP 2026-08-25: createPoints per-point loop, +394ms) ──

export interface PointsBuildPayload {
    /** Cluster id per point (rawClustersBuffer copy). Length = point count. */
    clusters: number[]
    /** Raw source positions, [x,y,z] per point (CLONED — main store keeps
     * its reference; transferring would detach the store's buffer). */
    rawPositions: Float32Array
    colors: string[]
    threadTint: { r: number; g: number; b: number }
    fieldScale: { x: number; y: number; z: number }
}

export interface PointsBuildBuffers {
    /** Render-space positions [x,y,z] per point — ALSO the nodePositions
     * triples (createPoints pushes identical values into state arrays). */
    positions: Float32Array
    colors: Float32Array
    pointBaseColors: Float32Array
    bounds: {
        min: { x: number; y: number; z: number }
        max: { x: number; y: number; z: number }
        center: { x: number; y: number; z: number }
        count: number
    }
}

/** Pure build function — exported for unit-test parity checks (no worker
 * spawn). Mirrors the createPoints per-point loop EXACTLY (node-manager.ts).
 * `clusters` doubles as the points-length carrier for the length-only APIs
 * (computeOverviewScatterOffsets/getPointBoundsCenter never read point
 * objects — only positionBuffer + length). */
export function buildPointsBuffers(payload: PointsBuildPayload): PointsBuildBuffers {
    const n = payload.clusters.length
    // Length-only usage: the functions read rawPositions + .length, never the
    // point objects themselves (verified — geo-data.ts getPosition + the
    // bounds loop read positionBuffer exclusively).
    const pointsLike = payload.clusters as unknown as Array<{ x?: number; y?: number; z?: number }>
    const scatterOffsets = computeOverviewScatterOffsets(pointsLike, payload.rawPositions)
    const bounds = getPointBoundsCenter(pointsLike, payload.rawPositions)
    const renderCenter = bounds.center

    const tint = new Color(payload.threadTint.r, payload.threadTint.g, payload.threadTint.b)
    const positions = new Float32Array(n * 3)
    const colors = new Float32Array(n * 3)
    const pointBaseColors = new Float32Array(n * 3)

    for (let i = 0; i < n; i += 1) {
        const scatter = scatterOffsets[i] || { x: 0, y: 0, z: 0 }
        const px = payload.rawPositions[i * 3] ?? 0
        const py = payload.rawPositions[i * 3 + 1] ?? 0
        const pz = payload.rawPositions[i * 3 + 2] ?? 0
        const cluster = payload.clusters[i] ?? 0

        const fx = (px - renderCenter.x + scatter.x) * payload.fieldScale.x
        const fy = (py - renderCenter.y + scatter.y) * payload.fieldScale.y
        const fz = (pz - renderCenter.z + scatter.z) * payload.fieldScale.z
        positions[i * 3] = fx
        positions[i * 3 + 1] = fy
        positions[i * 3 + 2] = fz

        const color = getThreadCategoryColor(cluster, payload.colors).lerp(tint, 0.005)
        const radialDepth = Math.sqrt(fx * fx + fy * fy + fz * fz)
        const depthFactor = MathUtils.clamp(1.16 - radialDepth * 0.14, 0.82, 1.12)
        color.offsetHSL(0, 0.045, -0.01)
        const baseR = Math.min(1, color.r * depthFactor * 1.18 + 0.018)
        const baseG = Math.min(1, color.g * depthFactor * 1.18 + 0.022)
        const baseB = Math.min(1, color.b * depthFactor * 1.18 + 0.019)
        pointBaseColors[i * 3] = baseR
        pointBaseColors[i * 3 + 1] = baseG
        pointBaseColors[i * 3 + 2] = baseB
        colors[i * 3] = baseR
        colors[i * 3 + 1] = baseG
        colors[i * 3 + 2] = baseB
    }

    return {
        positions,
        colors,
        pointBaseColors,
        bounds: {
            min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
            max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
            center: { x: renderCenter.x, y: renderCenter.y, z: renderCenter.z },
            count: bounds.count
        }
    }
}

interface WorkerAPI {
    postMessage(message: MyceliumBuildPayload & { type: 'BUILD' }): void
    onmessage: ((e: MessageEvent) => void) | null
    addEventListener(type: 'message', cb: (e: MessageEvent) => void): void
}

/**
 * Worker scope facade: the declared WorkerAPI plus the postMessage signature
 * the message handlers below need. self (DedicatedWorkerGlobalScope) and the
 * declared WorkerAPI are unrelated types, so the unavoidable scope cast is
 * centralized to this single auditable site (was 5 scattered casts).
 */
type WorkerScope = WorkerAPI & {
    postMessage(message: unknown, transfer?: Transferable[]): void
}

const ctx = (typeof self !== 'undefined' ? self : globalThis) as unknown as WorkerScope

type BuildRequest =
    | (MyceliumBuildPayload & { type: 'BUILD'; requestId?: number })
    | (PointsBuildPayload & { type: 'POINTS_BUILD'; requestId?: number })
    | (DiscoverPayload & SerializedAdjacency & { type: 'DISCOVER_BUILD'; requestId?: number })

ctx.onmessage = (e: MessageEvent<BuildRequest>): void => {
    const requestId = e.data.requestId ?? 0
    if (e.data.type === 'POINTS_BUILD') {
        const result = buildPointsBuffers(e.data)
        const transfer = [result.positions.buffer, result.colors.buffer, result.pointBaseColors.buffer]
        ctx.postMessage({ type: 'POINTS_BUILT', requestId, ...result }, transfer)
        return
    }
    if (e.data.type === 'DISCOVER_BUILD') {
        // CSR arrays arrive TRANSFERRED (zero-copy) — run the CSR algorithm
        // directly; no re-serialization worker-side. The RESPONSE is also
        // transferred: three interleaved Int32Arrays instead of an object
        // graph of thousands of {a,b} pairs (the structured clone of that
        // graph measured ~1000ms — the dominant cost in the mycelium window).
        const result = discoverMyceliumEdgesCSRBuffers({ ...e.data, adjacency: e.data })
        if (!result) {
            ctx.postMessage({ type: 'DISCOVER_BUILT', requestId, edgeSets: null })
            return
        }
        const transfer = [result.corePairs.buffer, result.wispyPairs.buffer, result.bridgePairs.buffer]
        ctx.postMessage({ type: 'DISCOVER_BUILT', requestId, edgeSets: result }, transfer)
        return
    }
    // buildMyceliumBuffers seeds the view vector internally.
    const result = buildMyceliumBuffers(e.data)
    const transfer = [
        result.core.buffer,
        result.wispy.buffer,
        result.bridge.buffer,
        result.coreColors.buffer,
        result.wispyColors.buffer,
        result.bridgeColors.buffer
    ]
    ctx.postMessage({ type: 'BUILT', requestId: e.data.requestId ?? 0, ...result }, transfer)
}
