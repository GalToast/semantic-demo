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
import { Vector3, Vector2, Object3D, LineSegments, NormalBlending, Group } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { appState as state } from '@lib/state/app.svelte'
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
    hasDisposeBezierViewRefresh,
    setDisposeBezierViewRefresh,
    runDisposeBezierViewRefresh,
    BEZIER_SEGMENTS_PER_PAIR,
    computeLayerIntensityMap,
    rebuildDirtyPairsInLayer
} from './mycelium-bezier'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Number of straight line segments each mycelium bezier curve is broken into.
 * 5 was visibly angular; 10 gives smooth filaments without bloating the buffer. */

type EdgePair = { a: number; b: number }
type MyceliumEdgeSets = {
    corePairs: EdgePair[]
    wispyPairs: EdgePair[]
    bridgePairs: EdgePair[]
}

function buildGeometricMyceliumEdges(
    clusterMembers: Map<number, number[]>,
    clusterCentroids: Map<number, { x: number; y: number; z: number }>
): MyceliumEdgeSets | undefined {
    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return undefined
    const corePairs: EdgePair[] = []
    const wispyPairs: EdgePair[] = []
    const bridgePairs: EdgePair[] = []
    const seen = new Set<string>()
    const cellSize = 0.1
    const grid = new Map<string, number[]>()

    for (let i = 0; i < state.points.length; i += 1) {
        const pos = state.nodePositions[i]
        if (!pos) continue
        const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key)!.push(i)
    }

    for (let i = 0; i < state.points.length; i += 1) {
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
                        const dist = Math.hypot(pos.x - other.x, pos.y - other.y, pos.z - other.z)
                        const key = pairKey(i, j)
                        if (seen.has(key)) continue
                        if (dist < 0.048) {
                            corePairs.push({ a: i, b: j })
                            seen.add(key)
                        } else if (dist < 0.078) {
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

    return { corePairs, wispyPairs, bridgePairs }
}

async function buildSemanticMyceliumEdges(): Promise<MyceliumEdgeSets | null> {
    if (!state.semanticNeighborMapByLeadId?.size || !state.pointIndexByLeadId?.size) return null
    const seen = new Set<string>()
    const corePairs: EdgePair[] = []
    const wispyPairs: EdgePair[] = []
    const bridgePairs: EdgePair[] = []
    const coreDegree = new Map<number, number>()
    const wispyDegree = new Map<number, number>()
    const bridgeDegree = new Map<number, number>()

    for (let index = 0; index < state.points.length; index += 1) {
        const point = state.points[index]
        const leadId = point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id)
        if (!leadId) continue
        const record = state.semanticNeighborMapByLeadId.get(leadId)
        const sortedNeighbors = [...(record?.neighbors || [])]
            .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0))
            .slice(0, 20)
        sortedNeighbors.forEach((neighbor: SemanticNeighborDetail) => {
            const otherIndex = state.pointIndexByLeadId.get(String(neighbor.leadId))
            if (otherIndex === undefined || otherIndex === index) return
            const key = pairKey(index, otherIndex)
            if (seen.has(key)) return
            seen.add(key)
            const semanticScore = Number.isFinite(neighbor.semanticScore) ? neighbor.semanticScore : 0
            const bridgeScore = Number.isFinite(neighbor.bridgeScore) ? neighbor.bridgeScore : 0
            const sameCluster = state.points[index]?.cluster === state.points[otherIndex]?.cluster
            const sameCity = !!neighbor.sameCity
            const bridgeLike =
                String(neighbor.threadType || '')
                    .toLowerCase()
                    .includes('bridge') || bridgeScore >= 0.62

            if (!sameCluster) {
                if (!bridgeLike) return
                const aDegree = bridgeDegree.get(index) || 0
                const bDegree = bridgeDegree.get(otherIndex) || 0
                if (aDegree >= 2 || bDegree >= 2) return
                bridgeDegree.set(index, aDegree + 1)
                bridgeDegree.set(otherIndex, bDegree + 1)
                bridgePairs.push({ a: index, b: otherIndex })
                return
            }

            if (semanticScore >= 0.62 || (semanticScore >= 0.56 && sameCity)) {
                const aDegree = coreDegree.get(index) || 0
                const bDegree = coreDegree.get(otherIndex) || 0
                if (aDegree >= 4 || bDegree >= 4) return
                coreDegree.set(index, aDegree + 1)
                coreDegree.set(otherIndex, bDegree + 1)
                corePairs.push({ a: index, b: otherIndex })
            } else if (semanticScore >= 0.42 || sameCity) {
                const aDegree = wispyDegree.get(index) || 0
                const bDegree = wispyDegree.get(otherIndex) || 0
                if (aDegree >= 5 || bDegree >= 5) return
                wispyDegree.set(index, aDegree + 1)
                wispyDegree.set(otherIndex, bDegree + 1)
                wispyPairs.push({ a: index, b: otherIndex })
            }
        })
        if (index % 250 === 0) await yieldToBrowser()
    }

    return corePairs.length || wispyPairs.length || bridgePairs.length ? { corePairs, wispyPairs, bridgePairs } : null
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

function createLineSegments(positions: number[], colors: number[], opacity: number, linewidth: number) {
    if (!positions.length) return null
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    if (colors.length) {
        geometry.setColors(colors)
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
        return { core: 0.58, wispy: 0.28, bridge: 0.42, pulse: 0.04, linewidth: { core: 2.5, wispy: 1.0, bridge: 1.8 } }
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
        return {
            core: 0.32,
            wispy: 0.14,
            bridge: 0.22,
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

export async function createMycelium() {
    if (!webglContext.pointsMesh || !state.points?.length || !state.nodePositions?.length) return

    disposeMycelium()

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

    const semanticEdges = await buildSemanticMyceliumEdges()
    let edgeSets: MyceliumEdgeSets | undefined
    if (semanticEdges) {
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

        edgeSets = buildGeometricMyceliumEdges(clusterMembers, clusterCentroids) || undefined
    }
    if (!edgeSets) return
    const coreConnections: number[] = []
    const coreColors: number[] = []
    const wispyConnections: number[] = []
    const wispyColors: number[] = []
    const bridgeConnections: number[] = []
    const bridgeColors: number[] = []

    webglContext.myceliumConnectionPairs.length = 0

    edgeSets.corePairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(
            coreConnections,
            coreColors,
            pair,
            state.nodePositions,
            state.points,
            (cluster) => getThreadCategoryColor(cluster, CONFIG.COLORS),
            semanticEdges ? 0.38 : 0.28
        )
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 0 })
    })
    edgeSets.wispyPairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(
            wispyConnections,
            wispyColors,
            pair,
            state.nodePositions,
            state.points,
            (cluster) => getThreadCategoryColor(cluster, CONFIG.COLORS),
            semanticEdges ? 0.22 : 0.16
        )
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 1 })
    })
    edgeSets.bridgePairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(
            bridgeConnections,
            bridgeColors,
            pair,
            state.nodePositions,
            state.points,
            (cluster) => getThreadCategoryColor(cluster, CONFIG.COLORS),
            semanticEdges ? 0.32 : 0.24
        )
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 2 })
    })

    webglContext.myceliumGroup = new Group()
    const profile = getMyceliumPresentationProfile()
    webglContext.myceliumCoreLines = createLineSegments(
        coreConnections,
        coreColors,
        profile.core,
        profile.linewidth.core
    )
    webglContext.myceliumWispyLines = createLineSegments(
        wispyConnections,
        wispyColors,
        profile.wispy,
        profile.linewidth.wispy
    )
    webglContext.myceliumBridgeLines = createLineSegments(
        bridgeConnections,
        bridgeColors,
        profile.bridge,
        profile.linewidth.bridge
    )

    if (webglContext.myceliumCoreLines) webglContext.myceliumGroup.add(webglContext.myceliumCoreLines)
    if (webglContext.myceliumWispyLines) webglContext.myceliumGroup.add(webglContext.myceliumWispyLines)
    if (webglContext.myceliumBridgeLines) webglContext.myceliumGroup.add(webglContext.myceliumBridgeLines)
    if (!webglContext.scene) return
    webglContext.pointsMesh.add(webglContext.myceliumGroup)

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
        colorFn
    )
    const dirtyPairs1 = rebuildDirtyPairsInLayer(
        webglContext.myceliumWispyLines,
        1,
        layerIntensity,
        webglContext.myceliumConnectionPairs,
        dirtyNodeIndices,
        state.nodePositions,
        state.points,
        colorFn
    )
    const dirtyPairs2 = rebuildDirtyPairsInLayer(
        webglContext.myceliumBridgeLines,
        2,
        layerIntensity,
        webglContext.myceliumConnectionPairs,
        dirtyNodeIndices,
        state.nodePositions,
        state.points,
        colorFn
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
