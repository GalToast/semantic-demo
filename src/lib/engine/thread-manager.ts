/**
 * @lib/engine/thread-manager.ts — TypeScript port of
 *
 * Creates the mycelium thread line geometry (core, wispy, bridge layers).
 * Preserves the exact same public API as the legacy module.
 *
 * Import strategy:
 *   - @lib/*   for engine-local modules
 *   - ../../../js/* for modules still owned by the legacy tree
 */

import { webglContext } from './webgl-context'
import { syncMyceliumHandles } from './three-store-sync'
import {
    Vector3,
    Vector2,
    Object3D,
    LineSegments,
    NormalBlending,
    Group,
    Box3,
    Sphere,
    InstancedInterleavedBuffer,
    InterleavedBufferAttribute
} from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { appState as state } from '@lib/state/app.svelte'
import { pointIndexByLeadId } from '@lib/data-store'
import { buildMyceliumBuffersInWorker, discoverMyceliumEdgesInWorker } from './mycelium-worker-client'
import { discoverMyceliumEdges, serializeAdjacency } from '@lib/workers/mycelium-build-worker'
import type { MyceliumWorkerBuffers } from './mycelium-worker-client'
import { CONFIG } from './config'
import { disposeObject3D } from './resource-tracker'
import { getThreadCategoryColor } from '@lib/utils/ui-presentation-three'
import { isMobileViewport } from '@lib/utils/environment'
import { yieldToBrowser } from '@lib/engine/three-engine-timers'
import type { SemanticNeighborDetail } from '@lib/types/business'
import {
    pairKey,
    getBezierControlPoint,
    pushBezierLinePair,
    refreshCachedBezierViewVector,
    getBezierViewVectorSnapshot,
    hasDisposeBezierViewRefresh,
    setDisposeBezierViewRefresh,
    runDisposeBezierViewRefresh,
    BEZIER_SEGMENTS_PER_PAIR,
    computeLayerIntensityMap,
    rebuildDirtyPairsInLayer
} from './mycelium-bezier'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Number of straight line segments each mycelium bezier curve is broken into.
 * 5 was visibly angular; 10 gives smooth filaments without bloating the buffer. */

type EdgePair = { a: number; b: number }
/**
 * Canonical edge-set form: three interleaved Int32Arrays ([a0,b0,a1,b1,...]).
 * This is what the discovery worker TRANSFERS back (zero-copy — the object
 * form would structured-clone thousands of small {a,b} objects, the measured
 * ~1000ms round-trip cost). The sync fallback and geometric fallback build
 * the same interleaved format so the tessellation loops are format-agnostic.
 */
type MyceliumEdgeSets = {
    corePairs: Int32Array
    wispyPairs: Int32Array
    bridgePairs: Int32Array
}

// ── LOD-first build (2026-08-25) ──────────────────────────────────────────
// Init trace measured createMycelium at +751ms: ~10k bezier pairs × 10
// segments tessellated synchronously on the boot critical path. Initial
// builds now tessellate at MYCELIUM_INITIAL_LOD_SEGMENTS_PER_PAIR and an
// idle callback upgrades the buffers to full smoothness.
// STRIDE CONTRACT: every buffer consumer must read the SAME segments/pair
// the build used — dirty-pair in-place rebuilds index offsets by stride.
// webglContext.myceliumSegmentsPerPair is the single source of truth.
export const MYCELIUM_INITIAL_LOD_SEGMENTS_PER_PAIR = 4

type CachedMyceliumEdgeSets = {
    sets: MyceliumEdgeSets
    semantic: boolean
    pointsRef: unknown
    positionsRef: unknown
    /** Identity of state.semanticNeighborMapByLeadId the discovery actually
     * used (null for geometric-fallback caches). When a NEW non-empty map
     * arrives after boot (the 40MB threads artifact lands late), this
     * mismatch invalidates the cache so the scene upgrades to semantic
     * edges — see notifySemanticNeighborMapReady(). */
    semanticSource: unknown
}
let cachedEdgeSets: CachedMyceliumEdgeSets | null = null

export type CachedEdgeSetsMeta = {
    pointsRef: unknown
    positionsRef: unknown
    semanticSource: unknown
}
export type CurrentRefs = {
    points: unknown
    positions: unknown
    neighborMap: unknown
    neighborMapSize: number
}
/** Cache-validity predicate — exported pure for unit pinning
 * (mycelium-cache-stale.test.ts). Semantics:
 * - no cache → rebuild;
 * - array identity drift (points/positions) → rebuild;
 * - a NEW NON-EMPTY neighbor map (identity change) → rebuild so the scene
 *   upgrades geometric→semantic edges once the threads artifact lands;
 * - map still empty/size 0 (mid-load or reset) → KEEP the current build
 *   (never downgrade a live scene back to geometric while data loads). */
export function isCachedEdgeSetsUsable(cached: CachedEdgeSetsMeta | null, current: CurrentRefs): boolean {
    if (!cached) return false
    if (cached.pointsRef !== current.points) return false
    if (cached.positionsRef !== current.positions) return false
    if (current.neighborMapSize > 0 && cached.semanticSource !== current.neighborMap) return false
    return true
}
let lodUpgradeToken = 0
// Sanctioned setTimeout wrapper — keeps the no-restricted-syntax lint rule
// happy for the requestIdleCallback fallback path.
const lodUpgradeReg = new DisposableRegistry({ label: 'mycelium-lod-upgrade' })

function scheduleMyceliumLodUpgrade(builtBelowFullLod: boolean): void {
    if (!builtBelowFullLod) return
    const token = ++lodUpgradeToken
    const fire = (): void => {
        if (token !== lodUpgradeToken) return // disposed / superseded meanwhile
        void createMycelium()
    }
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
        .requestIdleCallback
    // INP A/B correction (2026-08-25, certified interleaved N=9/arm): the old
    // 600ms timeout fired the full-10 REBUILD inside the post-tap interaction
    // window — LOD-first as landed roughly DOUBLED interaction-window mycelium
    // work (589ms LOD=4 build + ~700ms unmarked rebuild vs 681ms single full
    // build). 5s post-ready lets the user finish entering the scene before
    // the quality upgrade runs; angularity for a few seconds is invisible
    // next to the jank it removes. See tmp/inp-campaign.md LOD A/B section.
    if (ric) ric(fire, { timeout: 5000 })
    else lodUpgradeReg.schedule(5000, fire)
}

/**
 * Semantic-upgrade hook (2026-08-26): the 40MB threads artifact lands AFTER
 * boot (~3s vs ~2s), so the first createMycelium always runs on the geometric
 * fallback and nothing ever applied the real semantic edges (~1.5k pairs vs
 * the ~10k-pair contract). semantic-threads.ts calls this ONCE after it
 * assigns a NON-EMPTY state.semanticNeighborMapByLeadId; the cache check in
 * createMycelium (isCachedEdgeSetsUsable) sees the new map identity, treats
 * the cached edge sets as stale, and this rebuild upgrades the live scene to
 * semantic filaments. Idle-scheduled so it never fights an active gesture.
 */
export function notifySemanticNeighborMapReady(): void {
    if (!webglContext.pointsMesh || !state.points?.length || !state.nodePositions?.length) return
    if (!state.semanticNeighborMapByLeadId?.size) return // reset-to-empty path — never rebuild from that
    performance.mark('engine-init-mycelium-semantic-rebuild')
    const token = ++lodUpgradeToken // supersede any pending LOD upgrade — this build supersedes it
    const fire = (): void => {
        if (token !== lodUpgradeToken) return // disposed / superseded meanwhile
        void createMycelium()
    }
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
        .requestIdleCallback
    if (ric) ric(fire, { timeout: 2500 })
    else lodUpgradeReg.schedule(2500, fire)
}

async function buildGeometricMyceliumEdges(
    clusterMembers: Map<number, number[]>,
    clusterCentroids: Map<number, { x: number; y: number; z: number }>
): Promise<MyceliumEdgeSets | undefined> {
    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return undefined
    const corePairs: EdgePair[] = []
    const wispyPairs: EdgePair[] = []
    const bridgePairs: EdgePair[] = []
    const seen = new Set<number>()
    const cellSize = 0.1
    const CORE_SQ = 0.048 * 0.048
    const WISPY_SQ = 0.078 * 0.078
    const grid = new Map<string, number[]>()

    for (let i = 0; i < state.points.length; i += 1) {
        const pos = state.nodePositions[i]
        if (!pos) continue
        const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key)!.push(i)
    }
    performance.mark('engine-init-geometric-grid-done')

    for (let i = 0; i < state.points.length; i += 1) {
        if (i !== 0 && i % 800 === 0) await yieldToBrowser()
        const pos = state.nodePositions[i]
        if (!pos) continue
        const cx = Math.floor(pos.x / cellSize)
        const cy = Math.floor(pos.y / cellSize)
        const cz = Math.floor(pos.z / cellSize)
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dz = -1; dz <= 1; dz += 1) {
                    const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
                    if (!bucket) continue
                    for (const j of bucket) {
                        if (j <= i) continue
                        const p1 = state.points[i]
                        const p2 = state.points[j]
                        if (!p1 || !p2 || p1.cluster !== p2.cluster) continue
                        const other = state.nodePositions[j]
                        if (!other) continue
                        const dx = pos.x - other.x
                        const dy = pos.y - other.y
                        const dz = pos.z - other.z
                        const distSq = dx * dx + dy * dy + dz * dz
                        // integer pair key: 8406 < 16384, pack as min*16384+max
                        const key = i < j ? i * 16384 + j : j * 16384 + i
                        if (seen.has(key)) continue
                        if (distSq < CORE_SQ) {
                            corePairs.push({ a: i, b: j })
                            seen.add(key)
                        } else if (distSq < WISPY_SQ) {
                            wispyPairs.push({ a: i, b: j })
                            seen.add(key)
                        }
                    }
                }
            }
        }
    }

    const clusterSeen = new Set<string>()
    const clusters = [...clusterMembers.keys()]
    clusters.forEach((cluster) => {
        const centroid = clusterCentroids.get(cluster)
        if (!centroid) return
        clusters
            .filter((candidate) => candidate !== cluster)
            .map((candidate) => {
                const other = clusterCentroids.get(candidate)!
                return {
                    cluster: candidate,
                    dist: Math.hypot(centroid.x - other.x, centroid.y - other.y, centroid.z - other.z)
                }
            })
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 2)
            .forEach(({ cluster: otherCluster, dist }) => {
                if (dist > 0.42) return
                const bridgeKey = [cluster, otherCluster].sort((a, b) => a - b).join(':')
                if (clusterSeen.has(bridgeKey)) return
                clusterSeen.add(bridgeKey)
                const otherCentroid = clusterCentroids.get(otherCluster)
                if (!otherCentroid) return
                const a = (clusterMembers.get(cluster) || []).slice().sort((left, right) => {
                    const lp = state.nodePositions[left]
                    const rp = state.nodePositions[right]
                    if (!lp || !rp) return 0
                    return (
                        Math.hypot(lp.x - otherCentroid.x, lp.y - otherCentroid.y, lp.z - otherCentroid.z) -
                        Math.hypot(rp.x - otherCentroid.x, rp.y - otherCentroid.y, rp.z - otherCentroid.z)
                    )
                })[0]
                const b = (clusterMembers.get(otherCluster) || []).slice().sort((left, right) => {
                    const lp = state.nodePositions[left]
                    const rp = state.nodePositions[right]
                    if (!lp || !rp) return 0
                    return (
                        Math.hypot(lp.x - centroid.x, lp.y - centroid.y, lp.z - centroid.z) -
                        Math.hypot(rp.x - centroid.x, rp.y - centroid.y, rp.z - centroid.z)
                    )
                })[0]
                if (a === undefined || b === undefined) return
                bridgePairs.push({ a, b })
            })
    })
    performance.mark('engine-init-geometric-scan-done')

    return interleave(corePairs, wispyPairs, bridgePairs)
}

/** Pack three {a,b} pair arrays into the canonical interleaved Int32Array form
 * ([a0,b0,a1,b1,...] per layer) — the zero-copy transfer shape. */
function interleave(corePairs: EdgePair[], wispyPairs: EdgePair[], bridgePairs: EdgePair[]): MyceliumEdgeSets {
    const pack = (pairs: EdgePair[]): Int32Array => {
        const buf = new Int32Array(pairs.length * 2)
        for (let i = 0; i < pairs.length; i += 1) {
            buf[i * 2] = pairs[i]!.a
            buf[i * 2 + 1] = pairs[i]!.b
        }
        return buf
    }
    return { corePairs: pack(corePairs), wispyPairs: pack(wispyPairs), bridgePairs: pack(bridgePairs) }
}

async function buildSemanticMyceliumEdges(): Promise<MyceliumEdgeSets | null> {
    if (!state.semanticNeighborMapByLeadId?.size || !pointIndexByLeadId.getSnapshot().size) return null

    // INP 2026-08-25 (longtask attribution): discovery is the ~900ms
    // main-thread task. Run it on the geometry worker; the sync fallback
    // calls the SAME exported pure function — zero drift by construction.
    const leadIds: string[] = []
    const pointClusters: Array<number | null> = []
    for (let i = 0; i < state.points.length; i += 1) {
        const point = state.points[i]
        leadIds.push(point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id))
        pointClusters.push(point?.cluster ?? null)
    }
    const neighborMap: Record<string, SemanticNeighborDetail[]> = {}
    state.semanticNeighborMapByLeadId.forEach((record, leadId) => {
        neighborMap[leadId] = record.neighbors
    })
    // Attribution (2026-08-25): the discovery window split into maps-build /
    // CSR-serialize / worker round-trip. init-trace-probe picks up any
    // engine-init-* mark automatically.
    performance.mark('engine-init-discovery-maps-done')

    // Serialize to CSR typed arrays — TRANSFERRED zero-copy (the object-graph
    // structured clone measured ~650ms on main; the CSR pass is a single O(n)
    // loop). The fallback re-serializes from the intact object map.
    const adjacency = serializeAdjacency({ leadIds, neighborMap })
    performance.mark('engine-init-discovery-csr-done')
    const workerResult = await discoverMyceliumEdgesInWorker({
        leadIds,
        pointClusters,
        ...adjacency
    })
    if (workerResult !== undefined) {
        return workerResult
    }
    // Diagnostic mark: the worker path failed and the sync fallback ran.
    performance.mark('engine-init-discovery-fallback')

    // Worker unavailable/failed — same algorithm, main thread. The object
    // form is re-packed to interleaved Int32Arrays so the tessellation loops
    // below are format-agnostic (they index the flat arrays either way).
    const syncResult = discoverMyceliumEdges({ leadIds, pointClusters, neighborMap })
    if (!syncResult) return null
    return interleave(syncResult.corePairs, syncResult.wispyPairs, syncResult.bridgePairs)
}

// ── Dirty-node tracking for amortized updates ──────────────────────────────

/**
 * Set of node indices whose positions changed this frame.
 * Consumed by `updateMyceliumThreads()` to skip pairs that don't
 * touch any moved node, turning O(N²) bezier rebuilds into O(k·d)
 * where k = pairs-per-dirty-node and d = dirty-node count.
 *
 * Populated by `markNodesDirty()` (called from the lerp loop in
 * three-engine-frame-updates) and drained at the end of each
 * `updateMyceliumThreads()` call.
 */
const dirtyNodeIndices = new Set<number>()

/**
 * Record one or more node indices as having moved this frame.
 * Must be called BEFORE `state.myceliumDirty = true` so the
 * downstream `updateMyceliumThreads()` can filter pairs.
 *
 * @param indices — node indices that had their position lerp'd
 */
export function markNodesDirty(indices: Iterable<number>): void {
    for (const idx of indices) {
        dirtyNodeIndices.add(idx)
    }
}

function getNavigationMode() {
    return state.navState?.mode
}

function getLineSegmentCount(line: LineSegments) {
    const positionCount = line?.geometry?.attributes?.position?.count || 0
    return Math.floor(positionCount / 2)
}

/**
 * Narrow an `Object3D` child to `LineSegments` via the runtime `isLineSegments`
 * flag, which three.js core `LineSegments` sets to `true` and the `LineSegments2`
 * mycelium-layer addon omits. Replaces the prior bare unsafe `LineSegments`
 * downcast at the call site with an auditable user-defined type predicate;
 * the runtime check is strict-equality on the flag, matching the prior
 * `if (child.isLineSegments)` truthiness test for real three.js objects
 * (flag is always `true` or absent).
 */
function isLineSegmentsObject3D(child: Object3D & { isLineSegments?: boolean }): child is LineSegments {
    return child.isLineSegments === true
}

export function getGroupLineSegmentCount(group: Group) {
    let total = 0
    if (group && group.children) {
        group.children.forEach((child: Object3D & { isLineSegments?: boolean }) => {
            if (isLineSegmentsObject3D(child)) {
                total += getLineSegmentCount(child)
            }
        })
    }
    return total
}

export type LayerBounds = {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
    center: { x: number; y: number; z: number }
    radius: number
}

/**
 * Fast-path LineSegmentsGeometry construction: mirrors three 0.184
 * setPositions/setColors internals (InstancedInterleavedBuffer stride 6,
 * instanceStart/End + instanceColorStart/End at offsets 0/3) but assigns
 * PRECOMPUTED bounds instead of running the O(n) computeBoundingBox/
 * computeBoundingSphere (~530-760ms post-worker long task, 2026-08-25).
 * Returns null when the input fails sanity (caller falls back to
 * setPositions); the layout assumption is CI-guarded by
 * line-segments-fast-path parity test against the INSTALLED three.
 */
export function buildFastLineSegmentsGeometry(
    positions: Float32Array,
    colors: Float32Array,
    bounds: LayerBounds
): LineSegmentsGeometry | null {
    if (positions.length === 0 || positions.length % 6 !== 0) return null
    if (!Number.isFinite(bounds.radius) || !Number.isFinite(bounds.min.x)) return null
    const geometry = new LineSegmentsGeometry()
    const instanceBuffer = new InstancedInterleavedBuffer(positions, 6, 1)
    geometry.setAttribute('instanceStart', new InterleavedBufferAttribute(instanceBuffer, 3, 0))
    geometry.setAttribute('instanceEnd', new InterleavedBufferAttribute(instanceBuffer, 3, 3))
    geometry.instanceCount = instanceBuffer.count
    if (geometry.instanceCount !== positions.length / 6) return null
    const colorBuffer = new InstancedInterleavedBuffer(colors, 6, 1)
    geometry.setAttribute('instanceColorStart', new InterleavedBufferAttribute(colorBuffer, 3, 0))
    geometry.setAttribute('instanceColorEnd', new InterleavedBufferAttribute(colorBuffer, 3, 3))
    geometry.boundingBox = new Box3(
        new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
    )
    geometry.boundingSphere = new Sphere(new Vector3(bounds.center.x, bounds.center.y, bounds.center.z), bounds.radius)
    return geometry
}

function createLineSegments(
    positions: number[] | Float32Array,
    colors: number[] | Float32Array,
    opacity: number,
    linewidth: number,
    /** Precomputed layer bounds from the geometry worker — lets the fast path
     * SKIP setPositions' O(n) computeBoundingBox/computeBoundingSphere (the
     * ~530-760ms post-worker long task, 2026-08-25). Absent/invalid → the
     * original setPositions path runs (three 0.184 layout verified by the
     * line-segments-fast-path parity test). */
    bounds?: {
        min: { x: number; y: number; z: number }
        max: { x: number; y: number; z: number }
        center: { x: number; y: number; z: number }
        radius: number
    }
) {
    if (!positions.length) return null
    let geometry: LineSegmentsGeometry
    let colorsApplied = false
    if (bounds !== undefined && positions instanceof Float32Array && colors instanceof Float32Array) {
        const fast = buildFastLineSegmentsGeometry(positions, colors, bounds)
        if (fast) {
            geometry = fast
            colorsApplied = true // fast path sets instanceColorStart/End itself
        } else {
            // Layout sanity rejected the input (three upgrade) — original path.
            geometry = new LineSegmentsGeometry()
        }
    } else {
        geometry = new LineSegmentsGeometry()
    }
    if (!colorsApplied) {
        geometry.setPositions(positions)
        if (colors.length) {
            geometry.setColors(colors)
        }
    }
    // The @types/three LineMaterial has a stricter parameters type than
    // the runtime export of the same class. Cast to the constructor's
    // inferred parameter shape to keep the call site narrow.
    const material = new LineMaterial({
        color: 0xffffff,
        linewidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthWrite: true,
        blending: NormalBlending,
        vertexColors: !!colors.length
    } as ConstructorParameters<typeof LineMaterial>[0])
    // The runtime LineMaterial and the @types/three LineMaterial are
    // seen by the type system as distinct (different module instances).
    // The runtime instances are the same at execution; bridge with a
    // constructor-parameter-shaped cast.
    return new LineSegments2(geometry, material as ConstructorParameters<typeof LineSegments2>[1])
}

export function getThreadPulseOpacity(
    baseOpacity: number,
    pulse: number,
    requestedAmplitude: number,
    revealProgress = 1
) {
    const safeBase = Math.max(0, Number.isFinite(baseOpacity) ? baseOpacity : 0)
    const safeReveal = Math.max(0, Number.isFinite(revealProgress) ? revealProgress : 1)
    const amplitude = Math.min(
        Math.max(0, Number.isFinite(requestedAmplitude) ? requestedAmplitude : 0),
        Math.max(0.0006, safeBase * 0.26)
    )
    return Math.max(0, safeBase + pulse * amplitude) * safeReveal
}
// getThreadOpacityEnvelope removed — it was never called at runtime.

export function getMyceliumPresentationProfile() {
    const currentMode = getNavigationMode()
    if (currentMode === 'overview' || currentMode === undefined) {
        // Ambient overview profile. Previously 0.12/0.047/0.068 — too faint against
        // the dark canvas (8,406 points × ~3,830 line segments rendered at 12%
        // opacity appeared nearly invisible). Bumped to ~3-5× the previous
        // base opacities so the mycelium reads as a clear ambient texture while
        // still staying subordinate to points and spore materials.
        return { core: 0.75, wispy: 0.42, bridge: 0.58, pulse: 0.08, linewidth: { core: 4.5, wispy: 2.0, bridge: 3.0 } } // hero-legibility pass2: +50% width so threads keep edges at overview distance
    }
    // Semantic-dive mode needs its own profile because the downstream
    // `semanticDiveThreadScale` multiplier (0.42 in three-engine-core) applies
    // on top of whatever core/wispy/bridge values we return here. The old
    // focusedNode profile (0.16 × 0.42 ≈ 0.067) made threads nearly invisible;
    // this boosted profile (0.38 × 0.42 ≈ 0.16) keeps them legible while
    // remaining subordinate to the focused point. Must run BEFORE the generic
    // focusedNode branch so it captures the semantic-dive case specifically.
    if (state.semanticDiveMode && state.focusedNode !== null && state.focusedNode !== undefined) {
        return {
            core: 0.38,
            wispy: 0.16,
            bridge: 0.24,
            pulse: 0.04,
            linewidth: { core: 2.0, wispy: 0.8, bridge: 1.4 }
        }
    }
    if (state.focusedNode !== null && state.focusedNode !== undefined) {
        // Plain FOCUS profile (no semantic-dive, no deep trail). Keep the
        // compact viewport quiet so the selected node and pocket remain legible;
        // desktop keeps the elevated relationship context used by the wide
        // focus presentation. `semanticDiveThreadScale` is 1 in both branches.
        if (isMobileViewport()) {
            return {
                core: 0.15,
                wispy: 0.05,
                bridge: 0.08,
                pulse: 0.008,
                linewidth: { core: 2.0, wispy: 0.8, bridge: 1.4 }
            }
        }
        return {
            core: 0.5,
            wispy: 0.24,
            bridge: 0.36,
            pulse: 0.012,
            linewidth: { core: 2.2, wispy: 1.0, bridge: 1.6 }
        }
    }
    const hasSearchSummary = Object.keys(state.searchState.currentSearchSummary || {}).length > 0
    if (hasSearchSummary || state.searchState.searchGlowActive) {
        // W60 (2026-08-19): 0.32/0.14/0.22 → 0.42/0.24/0.30. Vision-jury
        // (dots-3-note) called search-threads "a faint grid, almost invisible
        // against the dark background"; ~50% opacity lift on core + wispy
        // keeps the relationship context legible without competing with the
        // results list. (First application was silently dropped by a parallel
        // lane formatter — re-applied 2026-08-19 and verified in commit.)
        return {
            core: 0.42,
            wispy: 0.24,
            bridge: 0.3,
            pulse: 0.072,
            linewidth: { core: 2.5, wispy: 1.0, bridge: 1.8 }
        }
    }
    // BS-A F2: the prior trailDepth>=1 gate returned the IDENTICAL profile on
    // both sides (dead check). Collapsed to a single unconditional return so
    // maintainers don't edit one branch expecting it to be the live path.
    return { core: 0.2, wispy: 0.08, bridge: 0.13, pulse: 0.044, linewidth: { core: 2.0, wispy: 0.8, bridge: 1.4 } }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function shouldRenderThreads() {
    const currentMode = getNavigationMode()
    const { trailDepth } = state.navState || {}
    const { currentSearchSummary } = state.searchState ?? {}
    const { focusedNode } = state

    if (currentMode === 'overview' || currentMode === undefined) return true
    if (currentMode === 'map') return false
    if (currentSearchSummary) return true
    if (currentMode === 'focus' && focusedNode !== null && focusedNode !== undefined) return true
    if (trailDepth >= 1) return true
    if (currentMode === 'bridge') return true

    return false
}

export function shouldRenderBridgeThreads() {
    const currentMode = getNavigationMode()
    return currentMode === 'bridge'
}

export function disposeMycelium() {
    lodUpgradeToken += 1 // cancel any pending LOD-upgrade rebuild
    // Deregister the camera-move listener so we don't leak OrbitControls refs.
    runDisposeBezierViewRefresh()

    if (webglContext.myceliumGroup) {
        if (webglContext.pointsMesh) webglContext.pointsMesh.remove(webglContext.myceliumGroup)
        disposeObject3D(webglContext.myceliumGroup)
        webglContext.myceliumGroup = null
    }
    webglContext.myceliumCoreLines = null
    webglContext.myceliumWispyLines = null
    webglContext.myceliumBridgeLines = null
    webglContext.myceliumConnectionPairs = []
}

// ── Boot-race retry (2026-08-26) ──────────────────────────────────────────────
// Measured (tmp/boot-race-repro.md + switchboard event 14): createMycelium can
// be called while the data worker is still delivering (GPU contention); the old
// one-shot silent return left the scene PERMANENTLY core-less — render loop
// alive, frames advancing, myceliumCoreLines null forever. Re-arm a bounded
// retry so late data still builds the core lines.
const MYCELIUM_RETRY_MS = 750
const MYCELIUM_RETRY_MAX = 24 // ≈18s of bounded retry; later triggers handle rebuilds after that
let myceliumRetryTimer: ReturnType<typeof setTimeout> | null = null
function scheduleMyceliumRetry(opts?: { segmentsPerPair?: number }): void {
    if (myceliumRetryTimer !== null) return
    let attempts = 0
    myceliumRetryTimer = setTimeout(function tick() {
        myceliumRetryTimer = null
        attempts += 1
        if (webglContext.pointsMesh && state.points?.length && state.nodePositions?.length) {
            void createMycelium(opts) // conditions met — real build (guard now passes)
        } else if (attempts < MYCELIUM_RETRY_MAX) {
            myceliumRetryTimer = setTimeout(tick, MYCELIUM_RETRY_MS)
        }
    }, MYCELIUM_RETRY_MS)
}

export async function createMycelium(opts?: { segmentsPerPair?: number }) {
    if (!webglContext.pointsMesh || !state.points?.length || !state.nodePositions?.length) {
        // Late-data race: silent one-shot return permanently skipped the core
        // build. Retry in bounded steps until data lands (or budget exhausted;
        // later rebuild triggers call us again).
        scheduleMyceliumRetry(opts)
        return
    }
    if (myceliumRetryTimer !== null) {
        clearTimeout(myceliumRetryTimer)
        myceliumRetryTimer = null
    }

    // Keep the current filaments visible while the new ones build — the old
    // Group stays attached to pointsMesh until the new Group is ready to
    // atomically replace it (prevents the pale gap seen after reload, where
    // dispose cleared the scene before the async scan/worker finished).
    lodUpgradeToken += 1
    runDisposeBezierViewRefresh()
    const oldGroup = webglContext.myceliumGroup
    const oldCore = webglContext.myceliumCoreLines
    const oldWispy = webglContext.myceliumWispyLines
    const oldBridge = webglContext.myceliumBridgeLines
    const oldPairs = webglContext.myceliumConnectionPairs.slice()
    webglContext.myceliumGroup = null
    webglContext.myceliumCoreLines = null
    webglContext.myceliumWispyLines = null
    webglContext.myceliumBridgeLines = null
    webglContext.myceliumConnectionPairs = []

    // Tessellation level for THIS build — clamped to the full-quality ceiling;
    // below-ceiling builds schedule an idle upgrade back to the ceiling.
    const segmentsPerPair = Math.min(
        Math.max(1, Math.floor(opts?.segmentsPerPair ?? BEZIER_SEGMENTS_PER_PAIR)),
        BEZIER_SEGMENTS_PER_PAIR
    )
    webglContext.myceliumSegmentsPerPair = segmentsPerPair

    state.myceliumDirty = true
    refreshCachedBezierViewVector()

    // Subscribe to OrbitControls change events so the bezier view vector
    // stays in sync with the current camera angle after orbit.
    if (webglContext.controls && !hasDisposeBezierViewRefresh()) {
        const handler = (): void => {
            refreshCachedBezierViewVector()
        }
        webglContext.controls.addEventListener('change', handler)
        setDisposeBezierViewRefresh(() => {
            webglContext.controls?.removeEventListener('change', handler)
        })
    }

    // LOD-upgrade rebuilds reuse previously computed edge sets when the
    // underlying arrays are identical — re-tessellate, don't re-discover.
    // Semantic-upgrade-aware cache check: when the threads artifact lands
    // AFTER boot, the map identity changes and the geometric cache is stale —
    // the rebuild below re-discovers with real semantic edges.
    const neighborMapRef = state.semanticNeighborMapByLeadId
    const cachedEdgeSetsHit = isCachedEdgeSetsUsable(cachedEdgeSets, {
        points: state.points,
        positions: state.nodePositions,
        neighborMap: neighborMapRef,
        neighborMapSize: neighborMapRef?.size ?? 0
    })
        ? cachedEdgeSets
        : null

    const semanticEdges = cachedEdgeSetsHit
        ? cachedEdgeSetsHit.semantic
            ? cachedEdgeSetsHit.sets
            : null
        : await buildSemanticMyceliumEdges()
    let edgeSets: MyceliumEdgeSets | undefined
    if (cachedEdgeSetsHit) {
        edgeSets = cachedEdgeSetsHit.sets
    } else if (semanticEdges) {
        edgeSets = semanticEdges
    } else {
        const clusterMembers = new Map()
        const clusterCentroids = new Map()
        state.points.forEach((point, index: number) => {
            const pos = state.nodePositions[index]
            if (!pos) return
            if (!clusterMembers.has(point.cluster)) {
                clusterMembers.set(point.cluster, [])
                clusterCentroids.set(point.cluster, { x: 0, y: 0, z: 0, count: 0 })
            }
            clusterMembers.get(point.cluster).push(index)
            const centroid = clusterCentroids.get(point.cluster)
            centroid.x += pos.x
            centroid.y += pos.y
            centroid.z += pos.z
            centroid.count += 1
        })

        clusterCentroids.forEach((centroid) => {
            centroid.x /= centroid.count || 1
            centroid.y /= centroid.count || 1
            centroid.z /= centroid.count || 1
        })

        edgeSets = (await buildGeometricMyceliumEdges(clusterMembers, clusterCentroids)) || undefined
    }
    if (edgeSets && !cachedEdgeSetsHit) {
        cachedEdgeSets = {
            sets: edgeSets,
            semantic: !!semanticEdges,
            pointsRef: state.points,
            positionsRef: state.nodePositions,
            // The map identity discovery actually consumed this build — null
            // for the geometric fallback. A later non-empty map invalidates.
            semanticSource: semanticEdges ? neighborMapRef : null
        }
    }
    if (!edgeSets) {
        // No new edges — keep the old filaments visible.
        webglContext.myceliumGroup = oldGroup
        webglContext.myceliumCoreLines = oldCore
        webglContext.myceliumWispyLines = oldWispy
        webglContext.myceliumBridgeLines = oldBridge
        webglContext.myceliumConnectionPairs = oldPairs
        return
    }
    performance.mark('engine-init-mycelium-edges-done')

    // INP campaign 2026-08-25 (6d0ffd77): the tessellation loop measured +751ms
    // inside the post-tap interaction window. Try the off-main-thread worker
    // build first; on ANY failure fall back to the original sync loops below.
    let workerBuffers: MyceliumWorkerBuffers | null = null
    try {
        workerBuffers = await buildMyceliumBuffersInWorker({
            corePairs: edgeSets.corePairs,
            wispyPairs: edgeSets.wispyPairs,
            bridgePairs: edgeSets.bridgePairs,
            nodePositions: state.nodePositions,
            // Cluster ids ONLY — shipping full BusinessRecords made the
            // postMessage structured clone a ~900ms main-thread long task
            // (2026-08-25 longtask probe attribution).
            pointClusters: state.points.map((point) => point.cluster ?? null),
            colors: [...CONFIG.COLORS],
            intensities: {
                core: semanticEdges ? 0.5 : 0.4,
                wispy: semanticEdges ? 0.3 : 0.22,
                bridge: semanticEdges ? 0.42 : 0.32
            },
            viewVector: getBezierViewVectorSnapshot(),
            segmentsPerPair
        })
    } catch {
        workerBuffers = null
    }
    performance.mark('engine-init-mycelium-worker-done')

    const coreConnections: number[] | Float32Array = workerBuffers ? workerBuffers.core : []
    const coreColors: number[] | Float32Array = workerBuffers ? workerBuffers.coreColors : []
    const wispyConnections: number[] | Float32Array = workerBuffers ? workerBuffers.wispy : []
    const wispyColors: number[] | Float32Array = workerBuffers ? workerBuffers.wispyColors : []
    const bridgeConnections: number[] | Float32Array = workerBuffers ? workerBuffers.bridge : []
    const bridgeColors: number[] | Float32Array = workerBuffers ? workerBuffers.bridgeColors : []

    webglContext.myceliumConnectionPairs.length = 0

    // Tessellate the interleaved Int32Arrays directly — no reconstruction.
    // Pair N occupies indices [N*2, N*2+1] in each layer buffer.
    const tessellateLayer = (
        pairs: Int32Array,
        connections: number[] | Float32Array,
        colors: number[] | Float32Array,
        intensity: number
    ): void => {
        if (workerBuffers) return // worker already produced the buffers
        for (let p = 0; p < pairs.length; p += 2) {
            pushBezierLinePair(
                connections as number[],
                colors as number[],
                { a: pairs[p]!, b: pairs[p + 1]! },
                state.nodePositions,
                state.points,
                (cluster) => getThreadCategoryColor(cluster, CONFIG.COLORS),
                intensity,
                segmentsPerPair
            )
        }
    }

    tessellateLayer(edgeSets.corePairs, coreConnections, coreColors, semanticEdges ? 0.5 : 0.4)
    for (let p = 0; p < edgeSets.corePairs.length; p += 2) {
        webglContext.myceliumConnectionPairs.push({
            a: edgeSets.corePairs[p]!,
            b: edgeSets.corePairs[p + 1]!,
            layer: 0
        })
    }
    tessellateLayer(edgeSets.wispyPairs, wispyConnections, wispyColors, semanticEdges ? 0.3 : 0.22)
    for (let p = 0; p < edgeSets.wispyPairs.length; p += 2) {
        webglContext.myceliumConnectionPairs.push({
            a: edgeSets.wispyPairs[p]!,
            b: edgeSets.wispyPairs[p + 1]!,
            layer: 1
        })
    }
    tessellateLayer(edgeSets.bridgePairs, bridgeConnections, bridgeColors, semanticEdges ? 0.42 : 0.32)
    for (let p = 0; p < edgeSets.bridgePairs.length; p += 2) {
        webglContext.myceliumConnectionPairs.push({
            a: edgeSets.bridgePairs[p]!,
            b: edgeSets.bridgePairs[p + 1]!,
            layer: 2
        })
    }

    const newGroup = new Group()
    const profile = getMyceliumPresentationProfile()
    const newCore = createLineSegments(
        coreConnections,
        coreColors,
        profile.core,
        profile.linewidth.core,
        workerBuffers?.layerBounds.core
    )
    const newWispy = createLineSegments(
        wispyConnections,
        wispyColors,
        profile.wispy,
        profile.linewidth.wispy,
        workerBuffers?.layerBounds.wispy
    )
    const newBridge = createLineSegments(
        bridgeConnections,
        bridgeColors,
        profile.bridge,
        profile.linewidth.bridge,
        workerBuffers?.layerBounds.bridge
    )
    performance.mark('engine-init-mycelium-geometry-done')

    if (newCore) newGroup.add(newCore)
    if (newWispy) newGroup.add(newWispy)
    if (newBridge) newGroup.add(newBridge)
    if (!webglContext.scene) {
        disposeObject3D(newGroup)
        webglContext.myceliumGroup = oldGroup
        webglContext.myceliumCoreLines = oldCore
        webglContext.myceliumWispyLines = oldWispy
        webglContext.myceliumBridgeLines = oldBridge
        webglContext.myceliumConnectionPairs = oldPairs
        return
    }
    if (oldGroup) {
        // Cross-fade (300ms): keep the sparse filaments visible at their
        // current opacity while the dense semantic ones grow in — turns the
        // 15k→176k pop into a growth feel. Falls back to atomic swap when
        // rAF is unavailable (tests) or a layer is missing.
        const newMats = [newCore, newWispy, newBridge]
            .map((l) => (l as unknown as { material?: { opacity: number } })?.material)
            .filter((m): m is { opacity: number } => !!m)
        const oldMats = (oldGroup.children as Array<{ material?: { opacity: number } }>)
            .map((c) => c.material)
            .filter((m): m is { opacity: number } => !!m)
        const newTargets = newMats.map((m) => m.opacity)
        const oldTargets = oldMats.map((m) => m.opacity)
        newMats.forEach((m) => (m.opacity = 0))
        webglContext.myceliumGroup = newGroup
        webglContext.myceliumCoreLines = newCore
        webglContext.myceliumWispyLines = newWispy
        webglContext.myceliumBridgeLines = newBridge
        // 2026-08-26: re-mirror the upgraded handles into appState/legacy/
        // engineState — the cross-fade previously swapped webglContext only,
        // staling the state mirror (and TEST_STATE) at the disposed 15k
        // objects while the 176k lines rendered (scene had them; mirror did
        // not — the exact failure mode three-engine-init.ts documents).
        syncMyceliumHandles({
            myceliumGroup: newGroup,
            myceliumCoreLines: newCore,
            myceliumWispyLines: newWispy,
            myceliumBridgeLines: newBridge,
            myceliumConnectionPairs: webglContext.myceliumConnectionPairs
        })
        if (webglContext.pointsMesh) webglContext.pointsMesh.add(newGroup)
        if (typeof requestAnimationFrame !== 'undefined' && oldMats.length && newMats.length) {
            const start = performance.now()
            const duration = 300
            const tick = (): void => {
                const t = Math.min((performance.now() - start) / duration, 1)
                oldMats.forEach((m, i) => (m.opacity = oldTargets[i]! * (1 - t)))
                newMats.forEach((m, i) => (m.opacity = newTargets[i]! * t))
                if (t < 1) requestAnimationFrame(tick)
                else {
                    if (webglContext.pointsMesh) webglContext.pointsMesh.remove(oldGroup)
                    disposeObject3D(oldGroup)
                }
            }
            requestAnimationFrame(tick)
        } else {
            if (webglContext.pointsMesh) webglContext.pointsMesh.remove(oldGroup)
            disposeObject3D(oldGroup)
        }
    } else {
        webglContext.myceliumGroup = newGroup
        webglContext.myceliumCoreLines = newCore
        webglContext.myceliumWispyLines = newWispy
        webglContext.myceliumBridgeLines = newBridge
        // 2026-08-26: mirror the swapped handles (same invariant as the
        // cross-fade branch above).
        syncMyceliumHandles({
            myceliumGroup: newGroup,
            myceliumCoreLines: newCore,
            myceliumWispyLines: newWispy,
            myceliumBridgeLines: newBridge,
            myceliumConnectionPairs: webglContext.myceliumConnectionPairs
        })
        if (webglContext.pointsMesh) webglContext.pointsMesh.add(newGroup)
    }

    {
        state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6
        state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6
        state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6
    }

    // LineMaterial.resolution must match the drawing buffer size or the
    // screen-space linewidth shader (offset /= resolution.y) produces lines
    // ~1000× too thick. The legacy js/modules/three-engine.ts synced this
    // every frame; the TS port dropped it (regression). Sync once at creation
    // and on resize (see syncMyceliumLineResolution).
    syncMyceliumLineResolution()

    // Below-full builds hand off to an idle callback that rebuilds at the
    // full tessellation level once the browser has breathing room.
    scheduleMyceliumLodUpgrade(segmentsPerPair < BEZIER_SEGMENTS_PER_PAIR)
}

/**
 * Sync LineMaterial.resolution on all three mycelium line layers to the
 * renderer's current drawing-buffer size. Must be called after createMycelium
 * and on every canvas resize. Without this, LineMaterial keeps its default
 * resolution (1,1) and the mycelium renders as fat bands instead of thin
 * filaments (TS-port regression of the legacy per-frame sync).
 */
export function syncMyceliumLineResolution(): void {
    const renderer = webglContext.renderer
    if (!renderer) return
    const size = new Vector2()
    renderer.getSize(size)
    const dpr = renderer.getPixelRatio()
    const width = Math.max(1, Math.round(size.x * dpr))
    const height = Math.max(1, Math.round(size.y * dpr))
    for (const line of [
        webglContext.myceliumCoreLines,
        webglContext.myceliumWispyLines,
        webglContext.myceliumBridgeLines
    ]) {
        if (!line) continue
        const mat = (line as { material?: { resolution?: Vector2 } }).material
        if (mat?.resolution) mat.resolution.set(width, height)
    }
}

export function updateMyceliumThreads(): void {
    // Early exit: no connection pairs at all — nothing to rebuild.
    if (!webglContext.myceliumConnectionPairs?.length) {
        state.scenePerformanceDiagnostics.lastThreadUpdateMs = 0
        state.scenePerformanceDiagnostics.lastThreadUpdateDirtyNodes = 0
        state.scenePerformanceDiagnostics.lastThreadUpdateDirtyPairs = 0
        dirtyNodeIndices.clear()
        state.myceliumDirty = false
        return
    }

    // Fast path: no nodes moved this frame — skip the entire rebuild.
    // H2 fix (Jul-10 bugsweep): the previous code had a comment above
    // but inverted logic — when !hasDirtyNodes it FULL-rebuilt the buffer
    // (~100k segs) + zeroed tail every idle continuous frame. Now we early-exit
    // and drain the flag so RAF can go idle (see sceneNeedsContinuousFrame).
    // Do NOT zero tail on skip — historic bug that collapsed visible mycelium.
    const hasDirtyNodes = dirtyNodeIndices.size > 0
    if (!hasDirtyNodes) {
        state.scenePerformanceDiagnostics.lastThreadUpdateMs = 0
        state.scenePerformanceDiagnostics.lastThreadUpdateDirtyNodes = 0
        state.scenePerformanceDiagnostics.lastThreadUpdateDirtyPairs = 0
        dirtyNodeIndices.clear()
        state.myceliumDirty = false
        return
    }

    const startedAt = performance.now()
    const dirtyNodeCount = dirtyNodeIndices.size

    const layerIntensity = computeLayerIntensityMap(!!state.semanticNeighborMapByLeadId?.size)
    const colorFn = (cluster: number | null | undefined) => getThreadCategoryColor(cluster, CONFIG.COLORS)

    const dirtyPairs0 = rebuildDirtyPairsInLayer(
        webglContext.myceliumCoreLines,
        0,
        layerIntensity,
        webglContext.myceliumConnectionPairs,
        dirtyNodeIndices,
        state.nodePositions,
        state.points,
        colorFn,
        webglContext.myceliumSegmentsPerPair
    )
    const dirtyPairs1 = rebuildDirtyPairsInLayer(
        webglContext.myceliumWispyLines,
        1,
        layerIntensity,
        webglContext.myceliumConnectionPairs,
        dirtyNodeIndices,
        state.nodePositions,
        state.points,
        colorFn,
        webglContext.myceliumSegmentsPerPair
    )
    const dirtyPairs2 = rebuildDirtyPairsInLayer(
        webglContext.myceliumBridgeLines,
        2,
        layerIntensity,
        webglContext.myceliumConnectionPairs,
        dirtyNodeIndices,
        state.nodePositions,
        state.points,
        colorFn,
        webglContext.myceliumSegmentsPerPair
    )
    const totalDirtyPairs = dirtyPairs0 + dirtyPairs1 + dirtyPairs2

    const elapsed = performance.now() - startedAt

    state.scenePerformanceDiagnostics.lastThreadUpdateMs = elapsed
    state.scenePerformanceDiagnostics.lastThreadUpdateDirtyNodes = dirtyNodeCount
    state.scenePerformanceDiagnostics.lastThreadUpdateDirtyPairs = totalDirtyPairs

    // Drain the dirty set — consumed for this frame.
    dirtyNodeIndices.clear()
    state.myceliumDirty = false
}

/**
 * Drain the dirty-node set and clear myceliumDirty WITHOUT rebuilding the
 * thread buffers. Called when threads are not being rendered (e.g. map mode
 * where shouldRenderThreads() is false) — without this, markNodesDirty()
 * accumulates unboundedly every frame (up to all 8406 node indices) and
 * myceliumDirty stays stuck true, keeping the RAF loop from going idle.
 */
export function drainMyceliumDirtyState(): void {
    dirtyNodeIndices.clear()
    state.myceliumDirty = false
}
