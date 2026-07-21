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
import { Vector3, Vector2, Object3D, LineSegments, NormalBlending, Group, BufferAttribute } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { appState as state } from '@lib/state/app.svelte'
import { withStateMutation } from '@lib/state/with-state-mutation'
import { CONFIG } from './config'
import { disposeObject3D } from './resource-tracker'
import { getThreadCategoryColor } from '@lib/utils/ui-presentation-three'
import { yieldToBrowser } from '@lib/engine/three-engine-timers'
import type { SemanticNeighborDetail } from '@lib/types/business'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Number of straight line segments each mycelium bezier curve is broken into.
 * 5 was visibly angular; 10 gives smooth filaments without bloating the buffer. */
const BEZIER_SEGMENTS_PER_PAIR = 10

type EdgePair = { a: number; b: number }
type MyceliumEdgeSets = {
    corePairs: EdgePair[]
    wispyPairs: EdgePair[]
    bridgePairs: EdgePair[]
}

function pairKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`
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

let _cachedBezierViewVector: Vector3 | null = null

function getBezierControlPoint(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    side = 0,
    rise = 0
): Vector3 {
    const a = new Vector3(start.x, start.y, start.z)
    const b = new Vector3(end.x, end.y, end.z)
    const mid = a.clone().lerp(b, 0.5)
    const span = new Vector3().subVectors(b, a)
    const spanLength = Math.max(span.length(), 0.001)
    const viewVector = _cachedBezierViewVector
        ? _cachedBezierViewVector.clone()
        : webglContext.camera
          ? new Vector3().subVectors(webglContext.camera.position, mid).normalize()
          : new Vector3(0.28, 0.2, 1).normalize()
    const up = new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(up, viewVector)
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0)
    right.normalize()
    const lift = Math.min(0.12, Math.max(0.018, spanLength * 0.18))
    return mid
        .addScaledVector(right, side * lift * 0.52)
        .addScaledVector(new Vector3().crossVectors(viewVector, right).normalize(), -(lift * 0.78) + rise * lift * 0.32)
        .addScaledVector(viewVector, lift * 0.14)
}

function pushBezierLinePair(positions: number[], colors: number[], pair: EdgePair, intensity = 1, segments = BEZIER_SEGMENTS_PER_PAIR): void {
    const start = state.nodePositions[pair.a]
    const end = state.nodePositions[pair.b]
    if (!start || !end) return
    const control = getBezierControlPoint(
        start,
        end,
        (pair.a * 31 + pair.b * 17) % 2 === 0 ? 1 : -1,
        (((pair.a + pair.b) % 5) - 2) / 2 || 0.3
    )
    const startColor = getThreadCategoryColor(state.points[pair.a]?.cluster || 0, CONFIG.COLORS)
    const endColor = getThreadCategoryColor(state.points[pair.b]?.cluster || 0, CONFIG.COLORS)
    const samples: Array<{ x: number; y: number; z: number; r: number; g: number; b: number }> = []

    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments
        const inv = 1 - t
        const x = inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x
        const y = inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y
        const z = inv * inv * start.z + 2 * inv * t * control.z + t * t * end.z
        samples.push({
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0,
            r: (startColor.r + (endColor.r - startColor.r) * t) * intensity,
            g: (startColor.g + (endColor.g - startColor.g) * t) * intensity,
            b: (startColor.b + (endColor.b - startColor.b) * t) * intensity
        })
    }

    for (let i = 0; i < samples.length - 1; i += 1) {
        const a = samples[i]!
        const b = samples[i + 1]!
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
        colors.push(a.r, a.g, a.b, b.r, b.g, b.b)
    }
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

export function getGroupLineSegmentCount(group: Group) {
    let total = 0
    if (group && group.children) {
        group.children.forEach((child: Object3D & { isLineSegments?: boolean }) => {
            if (child.isLineSegments) {
                total += getLineSegmentCount(child as unknown as LineSegments)
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
        // Plain FOCUS profile (no semantic-dive, no deep trail). In this branch
        // three-engine-frame-updates applies semanticDiveThreadScale = 1, so these
        // base opacities are used directly as the line opacities. The previous
        // 0.16/0.055/0.085 made the focus-neighborhood threads (the core
        // "dots close together do similar things" connection display) nearly
        // invisible on the most important view. Bumped toward Overview
        // readability (0.58/0.28/0.42) while staying a touch subordinate so the
        // focused point and pocket dots still dominate. Widths raised slightly
        // to match so the threads read clearly without overpowering the pocket.
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
    if (state.trailDepth >= 1) {
        return { core: 0.2, wispy: 0.08, bridge: 0.13, pulse: 0.044, linewidth: { core: 2.0, wispy: 0.8, bridge: 1.4 } }
    }
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
    _cachedBezierViewVector = webglContext.camera
        ? new Vector3().subVectors(webglContext.camera.position, new Vector3(0.5, 0.5, 0.5)).normalize()
        : new Vector3(0.28, 0.2, 1).normalize()

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
        pushBezierLinePair(coreConnections, coreColors, pair, semanticEdges ? 0.38 : 0.28)
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 0 })
    })
    edgeSets.wispyPairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(wispyConnections, wispyColors, pair, semanticEdges ? 0.22 : 0.16)
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 1 })
    })
    edgeSets.bridgePairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(bridgeConnections, bridgeColors, pair, semanticEdges ? 0.32 : 0.24)
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

    withStateMutation(() => {
        state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6
        state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6
        state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6
    })

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

// ── updateMyceliumThreads helpers ─────────────────────────────────────────

/**
 * Per-layer intensity values matching createMycelium() vertex color baking.
 * Without these, rebuilt threads flash to full brightness (intensity=1)
 * when nodes move, breaking the visual continuity of the mycelium layers.
 */
function computeLayerIntensityMap(): Record<number, number> {
    const hasSemantic = !!state.semanticNeighborMapByLeadId?.size
    return {
        0: hasSemantic ? 0.38 : 0.28, // core
        1: hasSemantic ? 0.22 : 0.16, // wispy
        2: hasSemantic ? 0.32 : 0.24 // bridge
    }
}

/**
 * Rebuild only dirty pairs for a single mycelium line layer, writing
 * bezier segments IN-PLACE at their original buffer offset. Clean pairs
 * are left untouched — no repacking, no zeroing.
 */
function rebuildDirtyPairsInLayer(
    line: LineSegments2 | null,
    layer: number,
    layerIntensity: Record<number, number>
): void {
    const SEGMENTS_PER_PAIR = BEZIER_SEGMENTS_PER_PAIR
    const FLOATS_PER_SEGMENT = 6 // 3 start + 3 end

    const geom = line?.geometry as LineGeometry | undefined
    const startAttr = geom?.getAttribute('instanceStart') as BufferAttribute | undefined
    const endAttr = geom?.getAttribute('instanceEnd') as BufferAttribute | undefined
    const colorStartAttr = geom?.getAttribute('instanceColorStart') as BufferAttribute | undefined
    const colorEndAttr = geom?.getAttribute('instanceColorEnd') as BufferAttribute | undefined
    if (!startAttr || !endAttr) return

    const startArray = startAttr.array as Float32Array
    const endArray = endAttr.array as Float32Array
    const colorStartArray = colorStartAttr?.array as Float32Array | undefined
    const colorEndArray = colorEndAttr?.array as Float32Array | undefined

    let layerPairIndex = 0
    webglContext.myceliumConnectionPairs.forEach((pair) => {
        if (pair.layer !== layer) return
        const pairIsDirty = dirtyNodeIndices.has(pair.a) || dirtyNodeIndices.has(pair.b)
        layerPairIndex += 1
        if (!pairIsDirty) return

        const pairPositions: number[] = []
        const pairColors: number[] = []
        pushBezierLinePair(
            pairPositions,
            pairColors,
            { a: pair.a, b: pair.b },
            layerIntensity[layer] ?? 1,
            SEGMENTS_PER_PAIR
        )

        // Write this pair's segments to its original buffer offset.
        // Pair N in the layer starts at segment (N-1)*SEGMENTS_PER_PAIR.
        const baseSeg = (layerPairIndex - 1) * SEGMENTS_PER_PAIR
        const maxSegsForPair = Math.min(
            SEGMENTS_PER_PAIR,
            Math.floor(startArray.length / 3) - baseSeg,
            Math.floor(pairPositions.length / FLOATS_PER_SEGMENT)
        )
        for (let s = 0; s < maxSegsForPair; s += 1) {
            const pi = s * FLOATS_PER_SEGMENT
            const si = (baseSeg + s) * 3
            startArray[si] = Number.isFinite(pairPositions[pi]) ? pairPositions[pi]! : 0
            startArray[si + 1] = Number.isFinite(pairPositions[pi + 1]) ? pairPositions[pi + 1]! : 0
            startArray[si + 2] = Number.isFinite(pairPositions[pi + 2]) ? pairPositions[pi + 2]! : 0
            endArray[si] = Number.isFinite(pairPositions[pi + 3]) ? pairPositions[pi + 3]! : 0
            endArray[si + 1] = Number.isFinite(pairPositions[pi + 4]) ? pairPositions[pi + 4]! : 0
            endArray[si + 2] = Number.isFinite(pairPositions[pi + 5]) ? pairPositions[pi + 5]! : 0
        }
        if (colorStartArray && colorEndArray && pairColors.length) {
            const maxColorSegsForPair = Math.min(
                SEGMENTS_PER_PAIR,
                Math.floor(colorStartArray.length / 3) - baseSeg,
                Math.floor(pairColors.length / FLOATS_PER_SEGMENT)
            )
            for (let s = 0; s < maxColorSegsForPair; s += 1) {
                const ci = s * FLOATS_PER_SEGMENT
                const si = (baseSeg + s) * 3
                colorStartArray[si] = pairColors[ci] ?? 0
                colorStartArray[si + 1] = pairColors[ci + 1] ?? 0
                colorStartArray[si + 2] = pairColors[ci + 2] ?? 0
                colorEndArray[si] = pairColors[ci + 3] ?? 0
                colorEndArray[si + 1] = pairColors[ci + 4] ?? 0
                colorEndArray[si + 2] = pairColors[ci + 5] ?? 0
            }
            colorStartAttr!.needsUpdate = true
            colorEndAttr!.needsUpdate = true
        }
    })
    startAttr.needsUpdate = true
    endAttr.needsUpdate = true
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export function updateMyceliumThreads(): void {
    if (!webglContext.myceliumConnectionPairs?.length) return

    // Fast path: no nodes moved this frame — skip the entire rebuild.
    // H2 fix (Jul-10 bugsweep): the previous code had a comment above
    // but inverted logic — when !hasDirtyNodes it FULL-rebuilt the buffer
    // (~100k segs) + zeroed tail every idle continuous frame. Now we early-exit
    // and drain the flag so RAF can go idle (see sceneNeedsContinuousFrame).
    // Do NOT zero tail on skip — historic bug that collapsed visible mycelium.
    const hasDirtyNodes = dirtyNodeIndices.size > 0
    if (!hasDirtyNodes) {
        dirtyNodeIndices.clear()
        state.myceliumDirty = false
        return
    }

    const layerIntensity = computeLayerIntensityMap()

    rebuildDirtyPairsInLayer(webglContext.myceliumCoreLines as unknown as LineSegments2, 0, layerIntensity)
    rebuildDirtyPairsInLayer(webglContext.myceliumWispyLines as unknown as LineSegments2, 1, layerIntensity)
    rebuildDirtyPairsInLayer(webglContext.myceliumBridgeLines as unknown as LineSegments2, 2, layerIntensity)

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
