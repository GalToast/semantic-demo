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
import {
    Vector3,
    Object3D,
    BufferGeometry,
    Float32BufferAttribute,
    LineSegments,
    LineBasicMaterial,
    NormalBlending,
    Group,
    BufferAttribute
} from 'three'
import { appState as state } from '@lib/state/app.svelte'
import { withStateMutation } from '@lib/state/with-state-mutation'
import { CONFIG } from './config'
import { disposeObject3D } from './resource-tracker'
import { getThreadCategoryColor } from '@lib/utils/ui-presentation-three'
import type { SemanticNeighborDetail } from '@lib/types/business'

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function buildSemanticMyceliumEdges(): MyceliumEdgeSets | null {
    if (!state.semanticNeighborMapByLeadId?.size || !state.pointIndexByLeadId?.size) return null
    const seen = new Set<string>()
    const corePairs: EdgePair[] = []
    const wispyPairs: EdgePair[] = []
    const bridgePairs: EdgePair[] = []
    const coreDegree = new Map<number, number>()
    const wispyDegree = new Map<number, number>()
    const bridgeDegree = new Map<number, number>()

    state.points.forEach((point, index: number) => {
        const leadId = point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id)
        if (!leadId) return
        const record = state.semanticNeighborMapByLeadId.get(leadId)
        record?.neighbors?.forEach((neighbor: SemanticNeighborDetail) => {
            const otherIndex = state.pointIndexByLeadId.get(String(neighbor.leadId))
            if (otherIndex === undefined || otherIndex === index) return
            const key = pairKey(index, otherIndex)
            if (seen.has(key)) return
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
                seen.add(key)
                return
            }

            if (semanticScore >= 0.62 || (semanticScore >= 0.56 && sameCity)) {
                const aDegree = coreDegree.get(index) || 0
                const bDegree = coreDegree.get(otherIndex) || 0
                if (aDegree >= 4 || bDegree >= 4) return
                coreDegree.set(index, aDegree + 1)
                coreDegree.set(otherIndex, bDegree + 1)
                corePairs.push({ a: index, b: otherIndex })
                seen.add(key)
            } else if (semanticScore >= 0.42 || sameCity) {
                const aDegree = wispyDegree.get(index) || 0
                const bDegree = wispyDegree.get(otherIndex) || 0
                if (aDegree >= 5 || bDegree >= 5) return
                wispyDegree.set(index, aDegree + 1)
                wispyDegree.set(otherIndex, bDegree + 1)
                wispyPairs.push({ a: index, b: otherIndex })
                seen.add(key)
            }
        })
    })

    return corePairs.length || wispyPairs.length || bridgePairs.length ? { corePairs, wispyPairs, bridgePairs } : null
}

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
    const viewVector = webglContext.camera
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

function pushBezierLinePair(positions: number[], colors: number[], pair: EdgePair, intensity = 1, segments = 5): void {
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

function createLineSegments(positions: number[], colors: number[], opacity: number) {
    if (!positions.length) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return new LineSegments(
        geometry,
        new LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity,
            linewidth: 1,
            depthWrite: true,
            blending: NormalBlending
        })
    )
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
        return { core: 0.58, wispy: 0.28, bridge: 0.42, pulse: 0.04 }
    }
    if (state.focusedNode !== null && state.focusedNode !== undefined) {
        return { core: 0.16, wispy: 0.055, bridge: 0.085, pulse: 0.008 }
    }
    if (state.currentSearchSummary || state.searchGlowActive) {
        return { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 }
    }
    if (state.trailDepth >= 1) {
        return { core: 0.2, wispy: 0.08, bridge: 0.13, pulse: 0.044 }
    }
    return { core: 0.2, wispy: 0.08, bridge: 0.13, pulse: 0.044 }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function shouldRenderThreads() {
    const currentMode = getNavigationMode()
    const { trailDepth } = state.navState || {}
    const { currentSearchSummary } = state
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

export function createMycelium() {
    if (!webglContext.pointsMesh || !state.points?.length || !state.nodePositions?.length) return

    disposeMycelium()

    state.myceliumDirty = true

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

    const semanticEdges = buildSemanticMyceliumEdges()
    const edgeSets = (semanticEdges || buildGeometricMyceliumEdges(clusterMembers, clusterCentroids)) as
        | MyceliumEdgeSets
        | undefined
    if (!edgeSets) return
    const coreConnections: number[] = []
    const coreColors: number[] = []
    const wispyConnections: number[] = []
    const wispyColors: number[] = []
    const bridgeConnections: number[] = []
    const bridgeColors: number[] = []

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
    webglContext.myceliumCoreLines = createLineSegments(coreConnections, coreColors, profile.core)
    webglContext.myceliumWispyLines = createLineSegments(wispyConnections, wispyColors, profile.wispy)
    webglContext.myceliumBridgeLines = createLineSegments(bridgeConnections, bridgeColors, profile.bridge)

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
}

export function updateMyceliumThreads(): void {
    if (!webglContext.myceliumConnectionPairs?.length) return

    const updateLayer = (line: LineSegments | null, layer: number): void => {
        const positionAttr = line?.geometry?.attributes?.position as BufferAttribute | undefined
        if (!positionAttr) return

        const nextPositions: number[] = []
        const nextColors: number[] = []
        webglContext.myceliumConnectionPairs.forEach((pair) => {
            if (pair.layer !== layer) return
            pushBezierLinePair(nextPositions, nextColors, { a: pair.a, b: pair.b }, 1, 5)
        })

        const array = positionAttr.array as Float32Array
        const limit = Math.min(array.length, nextPositions.length)
        for (let i = 0; i < limit; i += 1) {
            array[i] = Number.isFinite(nextPositions[i]) ? nextPositions[i]! : 0
        }
        for (let i = limit; i < array.length; i += 1) {
            array[i] = 0
        }
        positionAttr.needsUpdate = true
    }

    updateLayer(webglContext.myceliumCoreLines, 0)
    updateLayer(webglContext.myceliumWispyLines, 1)
    updateLayer(webglContext.myceliumBridgeLines, 2)
    state.myceliumDirty = false
}
