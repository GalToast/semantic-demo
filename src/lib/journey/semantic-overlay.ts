/**
 * @lib/journey/semantic-overlay.ts — Focus-stage semantic thread overlay rendering
 *
 * Ported from:
 * GLSL-enhanced Line2 material for semantic thread visualization.
 */

import { appState as state } from '@lib/state/app.svelte'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { Vector3, Vector2, Color, Float32BufferAttribute } from 'three'
import { Vec3 } from '@lib/utils/math-vec3'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { buildFocusThreadLineMaterial, type SemanticLineMaterial } from './semantic-overlay-material'
import { isPointVisible } from '@lib/utils/geo-data'
import { getNextExploreCandidateForIndex } from '@lib/journey/thread-model'
import { getCurrentTrailFocusIndex, getNextWalkCandidateForIndex } from '@lib/journey/neighborhood'
import { getFocusThreadCurvePoint, getFocusThreadCurvePointInto } from '@lib/journey/focus-pocket'
import type { ThreadEdge } from '@lib/journey/focus-pocket-geometry'
import type { ThreadCandidateRef } from '@lib/types/state'
import type { FocusConnectionSegment } from '@lib/state/state-types'
import { prefersReducedMotion } from '@lib/utils/environment'
import { CLUSTER_COLORS, FOCUS_SEMANTIC_COLORS } from '@lib/utils/design-tokens'
import { getLineSegmentCount } from '@lib/journey/webgl-utils'
import { registerDiagnosticProbe } from '@lib/utils'
import {
    overlayDebug,
    setOverlayDebugRfso,
    setOverlayDebugOverlayN,
    setOverlayDebugPushRef,
    setOverlayDebugPushN,
    setOverlayDebugRefreshEnd,
    setOverlayDebugPairsLen,
    setOverlayDebugEndRef,
    setOverlayDebugPushEndEq
} from '@lib/debug/overlay-debug'

/** Local typed extension of LineMaterial for the custom uniforms our GLSL shader injects.
 *  Three.js' LineMaterial type doesn't include these custom fields; we use this
 *  locally to avoid untyped casts at every uniforms / shader access site. */

// Phase 3: Declarative synchronization
subscribeKeyed('semantic-overlay:CAMERA_NODE_FOCUSED', EVENTS.CAMERA_NODE_FOCUSED, () => {
    refreshFocusSemanticOverlay()
})

export function resetFocusThreadDiagnostics(reason: string = 'inactive'): void {
    state.focusThreadDiagnostics = {
        active: false,
        reason,
        edgeCount: 0,
        directEdgeCount: 0,
        supportEdgeCount: 0,
        subduedEdgeCount: 0,
        segmentCount: 0,
        vertexCount: 0,
        overlayNodeCount: 0,
        nextCueSegments: 0,
        denseBundleMode: false,
        buildMs: 0,
        avgFrameMs: state.focusFrameDiagnostics?.avgFrameMs || 0,
        maxFrameMs: state.focusFrameDiagnostics?.maxFrameMs || 0
    }
}

export function removeFocusSemanticOverlay(): void {
    if (!state.focusSemanticLines) return
    const parent = state.focusSemanticLines.parent || state.myceliumGroup || state.scene
    if (parent) parent.remove(state.focusSemanticLines)
    state.focusSemanticLines.geometry?.dispose?.()
    const mat = state.focusSemanticLines.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.())
    else mat?.dispose?.()
    state.focusSemanticLines = null
    state.focusSemanticConnectionPairs = []
    setOverlayDebugRfso(overlayDebug.rfso + 1)
}

/**
 * Sync the focus semantic overlay LineMaterial.resolution to the current
 * drawing-buffer size. Call on canvas resize while an overlay is mounted.
 * (Same TS-port regression as the mycelium threads — the legacy per-frame
 * sync was dropped during the port.)
 */
export function syncFocusSemanticOverlayResolution(): void {
    if (!state.focusSemanticLines || !state.renderer) return
    const size = new Vector2()
    state.renderer.getSize(size)
    const dpr = state.renderer.getPixelRatio()
    const mat = (state.focusSemanticLines as { material?: { resolution?: { x: number; y: number } } }).material
    if (mat?.resolution) {
        mat.resolution.x = Math.max(1, Math.round(size.x * dpr))
        mat.resolution.y = Math.max(1, Math.round(size.y * dpr))
    }
}

function recordFocusOverlayFrame(now: number, elapsed: number, edgeCount: number, pairCount: number): void {
    const fd = state.focusFrameDiagnostics
    fd.lastFrameAt = now
    fd.sampleCount = Math.min(600, (fd.sampleCount || 0) + 1)
    fd.lastOverlayMs = elapsed
    fd.lastOverlayEdgeCount = edgeCount
    fd.lastOverlayPairs = pairCount
    const divisor = Math.max(1, Math.min(fd.sampleCount, 120))
    fd.avgFrameMs = ((fd.avgFrameMs || 0) * (divisor - 1) + elapsed) / divisor
    fd.maxFrameMs = Math.max(elapsed, (fd.maxFrameMs || 0) * 0.992)
}

function getFocusCurvePointLocal(edge: ThreadEdge, t: number): Vector3 {
    if (typeof getFocusThreadCurvePoint === 'function') {
        const point = getFocusThreadCurvePoint(edge, t)
        return new Vector3(point.x, point.y, point.z)
    }
    const a = state.nodePositions[edge.a]
    const b = state.nodePositions[edge.b]
    if (!a || !b) return new Vector3()
    const ax = Number.isFinite(a.x) ? a.x : 0
    const ay = Number.isFinite(a.y) ? a.y : 0
    const az = Number.isFinite(a.z) ? a.z : 0
    const bx = Number.isFinite(b.x) ? b.x : 0
    const by = Number.isFinite(b.y) ? b.y : 0
    const bz = Number.isFinite(b.z) ? b.z : 0
    return new Vector3(ax, ay, az).lerp(new Vector3(bx, by, bz), t)
}

function getActiveNextFocusIndex(): number | null {
    const focusedIndex = Number.isFinite(state.navState.focusedIndex)
        ? state.navState.focusedIndex
        : getCurrentTrailFocusIndex(state.navState.focusedIndex ?? null)
    if (!Number.isFinite(focusedIndex)) return null
    const candidate = getNextExploreCandidateForIndex(focusedIndex, getNextWalkCandidateForIndex, {
        requireOnCanvas: state.currentView === 'galaxy'
    })
    if (!candidate) return null
    return Number.isFinite(candidate.index) ? candidate.index : null
}

function selectPocketThreadIndices(
    focusPocketIndices: readonly number[] | undefined,
    focusIndex: number,
    roleByIndex: Map<number, string>
): number[] {
    const roleBudgets: Record<string, number> = { primary: 12, support: 6, halo: 3, trail: 4 }
    const roleOrder: Record<string, number> = { primary: 0, support: 1, halo: 2, trail: 3 }
    const roleCounts: Record<string, number> = { primary: 0, support: 0, halo: 0, trail: 0 }
    return (focusPocketIndices || [])
        .filter((index: number) => Number.isFinite(index) && index !== focusIndex)
        .sort((a: number, b: number) => {
            const roleA = roleByIndex.get(a) || 'trail'
            const roleB = roleByIndex.get(b) || 'trail'
            return (roleOrder[roleA] ?? 4) - (roleOrder[roleB] ?? 4)
        })
        .filter((index: number) => {
            const role = roleByIndex.get(index) || 'trail'
            const budget = roleBudgets[role] ?? roleBudgets.trail
            const count = roleCounts[role] ?? 0
            if (count >= (budget ?? 0)) return false
            roleCounts[role] = count + 1
            return true
        })
}

function getPocketEdgePriority(
    index: number,
    order: number,
    roleByIndex: Map<number, string>,
    pocketSet: Set<number>
): number {
    const role = roleByIndex.get(index)
    if (role === 'primary') return 0.78
    if (role === 'support') return 0.54
    if (role === 'halo') return 0.34
    return pocketSet.has(index) ? 0.62 : 0.58 - order * 0.025
}

interface _BuildOverlayEdgesResult {
    pairs: FocusConnectionSegment[]
    nextCueSegments: number
    directEdgeCount: number
    supportEdgeCount: number
    subduedEdgeCount: number
    localEdgeKeys: Set<string>
}

function _buildOverlayEdges({
    focusIndex,
    focusCluster,
    pocketSet,
    overlayIndices,
    nextFocusIndex,
    focusColor,
    cueColor,
    roleByIndex
}: {
    focusIndex: number
    focusCluster: number
    pocketSet: Set<number>
    overlayIndices: number[]
    nextFocusIndex: number | null
    focusColor: Color
    cueColor: Color
    roleByIndex: Map<number, string>
}): _BuildOverlayEdgesResult {
    const positions: number[] = []
    const colors: number[] = []
    const progress: number[] = []
    const cue: number[] = []
    const priority: number[] = []
    const lane: number[] = []
    const semanticScore: number[] = []
    const localEdgeKeys = new Set<string>()
    let nextCueSegments = 0
    let directEdgeCount = 0
    let supportEdgeCount = 0
    let subduedEdgeCount = 0

    const addEdge = (a: number, b: number, role: string = 'direct', edgePriority: number = 0.66): void => {
        const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`
        if (localEdgeKeys.has(edgeKey)) return
        if (!state.nodePositions[a] || !state.nodePositions[b]) return
        localEdgeKeys.add(edgeKey)
        if (role === 'direct') directEdgeCount += 1
        else supportEdgeCount += 1
        if (edgePriority < 0.42) subduedEdgeCount += 1

        const isNextEdge =
            Number.isFinite(nextFocusIndex) &&
            ((a === focusIndex && b === nextFocusIndex) || (b === focusIndex && a === nextFocusIndex))
        const candidateCluster = state.points[b]?.cluster ?? focusCluster
        const candidateColor = new Color(CLUSTER_COLORS[candidateCluster % CLUSTER_COLORS.length]).lerp(
            isNextEdge ? cueColor : new Color(FOCUS_SEMANTIC_COLORS.candidate),
            isNextEdge ? 0.58 : 0.24
        )
        const edge = {
            a,
            b,
            side: (a * 31 + b * 17) % 2 === 0 ? 1 : -1,
            rise: (((a + b) % 5) - 2) / 2 || 0.45,
            depth: role === 'direct' ? 0.9 : 0.42,
            curveLift: role === 'direct' ? (pocketSet.has(b) ? 0.68 : 0.54) : 0.34,
            motifBraid: 0.56,
            anchorPull: role === 'direct' ? 0.14 : 0.24,
            role,
            priority: edgePriority
        }

        for (let segment = 0; segment < state.FOCUS_THREAD_SEGMENTS; segment += 1) {
            const t0 = segment / state.FOCUS_THREAD_SEGMENTS
            const t1 = (segment + 1) / state.FOCUS_THREAD_SEGMENTS
            const segmentEdge: FocusConnectionSegment = { ...edge, t0, t1, cue: isNextEdge ? 1 : 0 }
            state.focusSemanticConnectionPairs.push(segmentEdge)
            setOverlayDebugPushRef(state.focusSemanticConnectionPairs)
            setOverlayDebugPushN(overlayDebug.pushN + 1)
            const p0 = getFocusCurvePointLocal(segmentEdge, t0)
            const p1 = getFocusCurvePointLocal(segmentEdge, t1)
            const c0 = focusColor.clone().lerp(candidateColor, t0)
            const c1 = focusColor.clone().lerp(candidateColor, t1)
            if (isNextEdge) {
                c0.lerp(cueColor, 0.34)
                c1.lerp(cueColor, 0.44)
                nextCueSegments += 1
            }
            positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
            colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b)
            progress.push(t0, t1)
            cue.push(isNextEdge ? 1 : 0, isNextEdge ? 1 : 0)
            priority.push(edgePriority, edgePriority)
            lane.push(edge.side, edge.side)
            semanticScore.push(edgePriority, edgePriority)
        }
    }

    overlayIndices.forEach((index: number, order: number) => {
        const isNext = index === nextFocusIndex
        const pocketRole = roleByIndex.get(index)
        const edgeRole = pocketRole === 'support' || pocketRole === 'halo' ? 'support' : 'direct'
        addEdge(focusIndex, index, edgeRole, isNext ? 1 : getPocketEdgePriority(index, order, roleByIndex, pocketSet))
    })

    return {
        pairs: state.focusSemanticConnectionPairs,
        nextCueSegments,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        localEdgeKeys
    }
}

function _buildOverlayEdgeArrays(pairs: readonly FocusConnectionSegment[]): {
    positions: number[]
    colors: number[]
    progress: number[]
    cue: number[]
    priority: number[]
    lane: number[]
    semanticScore: number[]
} {
    const positions: number[] = []
    const colors: number[] = []
    const progress: number[] = []
    const cue: number[] = []
    const priority: number[] = []
    const lane: number[] = []
    const semanticScore: number[] = []
    for (const segmentEdge of pairs) {
        const _t0 = segmentEdge.t0
        const _t1 = segmentEdge.t1
        const p0 = getFocusCurvePointLocal(segmentEdge, segmentEdge.t0!)
        const p1 = getFocusCurvePointLocal(segmentEdge, segmentEdge.t1!)
        const a = segmentEdge.a
        const focusCluster = state.points[a]?.cluster ?? 0
        const focusColor = new Color(CLUSTER_COLORS[focusCluster % CLUSTER_COLORS.length]).lerp(
            new Color(FOCUS_SEMANTIC_COLORS.focusLerp),
            0.42
        )
        const candidateCluster = state.points[segmentEdge.b]?.cluster ?? focusCluster
        const candidateLerp = segmentEdge.cue ? segmentEdge.cue : 0
        const candidateColor = new Color(CLUSTER_COLORS[candidateCluster % CLUSTER_COLORS.length]).lerp(
            new Color(FOCUS_SEMANTIC_COLORS.candidate),
            candidateLerp ? 0.58 : 0.24
        )
        const c0 = focusColor.clone().lerp(candidateColor, segmentEdge.t0!)
        const c1 = focusColor.clone().lerp(candidateColor, segmentEdge.t1!)
        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
        colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b)
        progress.push(segmentEdge.t0!, segmentEdge.t1!)
        cue.push(segmentEdge.cue ?? 0, segmentEdge.cue ?? 0)
        priority.push(segmentEdge.priority ?? 0, segmentEdge.priority ?? 0)
        lane.push(segmentEdge.side ?? 0, segmentEdge.side ?? 0)
        semanticScore.push(segmentEdge.priority ?? 0, segmentEdge.priority ?? 0)
    }
    return { positions, colors, progress, cue, priority, lane, semanticScore }
}

export function refreshFocusSemanticOverlay(): void {
    const startedAt = performance.now()
    removeFocusSemanticOverlay()
    resetFocusThreadDiagnostics('refreshing')

    const focusLineParent = state.myceliumGroup || state.scene
    if (!focusLineParent) {
        resetFocusThreadDiagnostics('no-mycelium')
        return
    }
    if (!Number.isFinite(state.navState.focusedIndex)) {
        resetFocusThreadDiagnostics('no-focus')
        return
    }
    // Gate (widened F15, 2026-07-15): build anchor ties whenever the focus pocket
    // is active — the pocket IS the honest anchor→neighbor relationship data
    // (focusPocketIndices + roles come from semanticScore). The threadSource gate
    // remains for the next-cue/staged-thread extras, but on 'geometric-fallback'
    // boots the pocket ties must still render, or the constellation loses its
    // connective tissue for every non-semantic-manifest node.
    const pocketActiveForTies = (state.navState.focusPocketIndices || []).length > 0
    if (state.navState.threadSource !== 'semantic' && !pocketActiveForTies) {
        resetFocusThreadDiagnostics('non-semantic-thread')
        return
    }

    const focusIndexRaw = state.navState.focusedIndex
    const nextFocusIndex = getActiveNextFocusIndex()
    if (focusIndexRaw === null || focusIndexRaw === undefined) {
        resetFocusThreadDiagnostics('missing-focused-index')
        return
    }
    const focusIndex: number = focusIndexRaw
    const focusPointAtFocus =
        Number.isFinite(focusIndex) && focusIndex >= 0 && focusIndex < state.points.length
            ? state.points[focusIndex]
            : null
    const focusCluster = focusPointAtFocus?.cluster ?? 0
    const semanticCandidates = (state.navState.threadCandidates || [])
        .filter((candidate: ThreadCandidateRef) => candidate?.source === 'semantic' && candidate.index !== focusIndex)
        .filter((candidate: ThreadCandidateRef) =>
            isPointVisible(candidate.index, state.points, null, state.activeFilters)
        )
        .slice(0, 10)
    const roleByIndex =
        state.navState.focusPocketRoleByIndex instanceof Map ? state.navState.focusPocketRoleByIndex : new Map()
    const pocketThreadIndices = selectPocketThreadIndices(state.navState.focusPocketIndices, focusIndex, roleByIndex)
    const pocketThreadSet = new Set(pocketThreadIndices)
    const stagedSemanticIndices = semanticCandidates
        .map((candidate: ThreadCandidateRef) => candidate.index)
        .filter((index: number) => pocketThreadSet.has(index))
    const overlayIndices = [...new Set([nextFocusIndex, ...pocketThreadIndices, ...stagedSemanticIndices])].filter(
        (index): index is number => Number.isFinite(index) && index !== focusIndex
    )

    if (!overlayIndices.length) {
        setOverlayDebugOverlayN(overlayDebug.overlayN || 0)
        resetFocusThreadDiagnostics('empty-overlay')
        return
    }
    setOverlayDebugOverlayN(overlayIndices.length)

    const pocketSet = new Set(state.navState.focusPocketIndices || [])
    const focusColor = new Color(CLUSTER_COLORS[focusCluster % CLUSTER_COLORS.length]).lerp(
        new Color(FOCUS_SEMANTIC_COLORS.focusLerp),
        0.42
    )
    const cueColor = new Color(FOCUS_SEMANTIC_COLORS.cue)

    const edges = _buildOverlayEdges({
        focusIndex,
        focusCluster,
        pocketSet,
        overlayIndices,
        nextFocusIndex: Number.isFinite(nextFocusIndex) ? nextFocusIndex : null,
        focusColor,
        cueColor,
        roleByIndex
    })
    const { positions, colors, progress, cue, priority, lane, semanticScore } = _buildOverlayEdgeArrays(edges.pairs)
    const nextCueSegments = edges.nextCueSegments
    const directEdgeCount = edges.directEdgeCount
    const supportEdgeCount = edges.supportEdgeCount
    const subduedEdgeCount = edges.subduedEdgeCount

    const lineGeometry = new LineGeometry()
    lineGeometry.setPositions(positions)
    lineGeometry.setColors(colors)

    lineGeometry.setAttribute('progress', new Float32BufferAttribute(progress, 1))
    lineGeometry.setAttribute('cue', new Float32BufferAttribute(cue, 1))
    lineGeometry.setAttribute('priority', new Float32BufferAttribute(priority, 1))
    lineGeometry.setAttribute('lane', new Float32BufferAttribute(lane, 1))
    lineGeometry.setAttribute('semanticScore', new Float32BufferAttribute(semanticScore, 1))

    const denseBundleMode = overlayIndices.length >= 6 ? 1 : 0
    const lineMaterial = buildFocusThreadLineMaterial()
    lineMaterial.userData.denseBundleMode = denseBundleMode
    const avgSemanticScore =
        semanticScore.length > 0 ? semanticScore.reduce((s: number, v: number) => s + v, 0) / semanticScore.length : 0.5
    if (lineMaterial.userData?.shader) {
        lineMaterial.userData.shader.uniforms.semanticScore.value = avgSemanticScore
        lineMaterial.userData.shader.uniforms.denseBundleMode.value = denseBundleMode
    }
    if (lineMaterial.uniforms?.semanticScore) {
        lineMaterial.uniforms.semanticScore.value = avgSemanticScore
    }
    if (lineMaterial.uniforms?.denseBundleMode) {
        lineMaterial.uniforms.denseBundleMode.value = denseBundleMode
    }

    state.focusSemanticLines = new Line2(lineGeometry, lineMaterial)
    state.focusSemanticLines!.computeLineDistances()
    // Sync LineMaterial.resolution to the drawing buffer so the linewidth
    // shader renders thin filaments (same TS-port regression as the mycelium
    // threads — see thread-manager.syncMyceliumLineResolution).
    if (state.renderer) {
        const _size = new Vector2()
        state.renderer.getSize(_size)
        const _dpr = state.renderer.getPixelRatio()
        const _w = Math.max(1, Math.round(_size.x * _dpr))
        const _h = Math.max(1, Math.round(_size.y * _dpr))
        lineMaterial.resolution.x = _w
        lineMaterial.resolution.y = _h
    }
    state.focusSemanticLines!.userData = {
        focusedIndex: focusIndex,
        nextIndex: Number.isFinite(nextFocusIndex) ? nextFocusIndex : null,
        pocketIndexCount: (state.navState.focusPocketIndices || []).length,
        nextCueSegments,
        edgeCount: edges.localEdgeKeys.size,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        segmentCount: state.focusSemanticConnectionPairs.length,
        vertexCount: positions.length / 3,
        overlayNodeCount: overlayIndices.length,
        parentKind: state.myceliumGroup ? 'mycelium' : 'scene',
        denseBundleMode,
        buildMs: performance.now() - startedAt
    }
    focusLineParent.add(state.focusSemanticLines)
    state.focusFrameDiagnostics = {
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0,
        lastOverlayMs: 0,
        lastOverlayEdgeCount: 0,
        lastOverlayPairs: 0
    }
    state.focusThreadDiagnostics = {
        active: true,
        reason: 'built',
        edgeCount: edges.localEdgeKeys.size,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        segmentCount: state.focusSemanticConnectionPairs.length,
        vertexCount: positions.length / 3,
        overlayNodeCount: overlayIndices.length,
        parentKind: state.myceliumGroup ? 'mycelium' : 'scene',
        denseBundleMode: denseBundleMode === 1,
        nextCueSegments,
        buildMs: performance.now() - startedAt,
        avgFrameMs: 0,
        maxFrameMs: 0
    }
}

export function updateFocusSemanticOverlayPositions(now: number = performance.now()): void {
    const line = state.focusSemanticLines
    // Pocket-settle rebuild (F15, 2026-07-15): the overlay first builds at
    // focus-entry — often just the next-cue edge — before focusPocketIndices
    // populate. When pocket membership changes, rebuild so the anchor ties
    // appear deterministically instead of waiting on a UI-path re-trigger.
    // Self-settling: the rebuild records the new count; on focus exit the
    // count drops to 0 and refreshFocusSemanticOverlay tears the line down.
    if (line) {
        const currentPocketCount = (state.navState.focusPocketIndices || []).length
        const builtPocketCount =
            typeof line.userData?.pocketIndexCount === 'number' ? line.userData.pocketIndexCount : -1
        const needsPocketCountRebuild = currentPocketCount !== builtPocketCount
        // F15 position-settle: the first build may run while pocket node positions
        // are still being staged, producing a line with zero segments. Rebuild once
        // the pocket has settled and positions exist, even if the pocket count has
        // not changed.
        const builtSegmentCount = line.userData?.segmentCount ?? 0
        const needsPositionSettleRebuild = builtSegmentCount === 0 && currentPocketCount > 0 && builtPocketCount > 0
        if (needsPocketCountRebuild || needsPositionSettleRebuild) {
            refreshFocusSemanticOverlay()
            return
        }
    } else {
        // Bootstrap (F15): programmatic focus paths (focusOnNode without camera
        // choreography, e.g. nodemo/headless boots) never publish
        // CAMERA_NODE_FOCUSED, so no event fires to build the overlay. When a
        // pocket exists with an active focus and no line, build it here.
        const currentPocketCount = (state.navState.focusPocketIndices || []).length
        if (currentPocketCount > 0 && Number.isFinite(state.navState.focusedIndex)) {
            refreshFocusSemanticOverlay()
        }
        return
    }
    const pairs = (state.focusSemanticConnectionPairs || []) as Array<{
        t0: number
        t1: number
        cue: number
        a: number
        b: number
        layer: number
    }>
    if (!line?.geometry?.attributes?.instanceStart || !pairs.length) {
        // Idle path: no pairs to update — record zero-cost frame.
        recordFocusOverlayFrame(now, 0, 0, 0)
        return
    }

    // ── Instrumentation gate: measure actual synchronous buffer work ──────
    const startedAt = performance.now()
    const pairCount = pairs.length

    const reducedMotion = prefersReducedMotion()
    const startAttr = line.geometry.attributes.instanceStart!
    const endAttr = line.geometry.attributes.instanceEnd!
    // Reusable output targets — eliminate per-pair heap allocations.
    // _p0/_p1 are caller-owned Vec3s; getFocusThreadCurvePointInto writes
    // into them without allocating. The fallback path (tests) allocates
    // temporary Vector3s, which is fine — not the hot path.
    const _p0 = new Vec3()
    const _p1 = new Vec3()
    const _hasInto = typeof getFocusThreadCurvePointInto === 'function'
    let offset = 0
    pairs.forEach((edge) => {
        if (_hasInto) {
            getFocusThreadCurvePointInto(edge, edge.t0, _p0)
            getFocusThreadCurvePointInto(edge, edge.t1, _p1)
        } else {
            // Fallback for test/mock environments where focus-pocket is
            // stubbed (getFocusThreadCurvePointInto is undefined).
            const pt0 = getFocusCurvePointLocal(edge, edge.t0)
            const pt1 = getFocusCurvePointLocal(edge, edge.t1)
            _p0.set(pt0.x, pt0.y, pt0.z)
            _p1.set(pt1.x, pt1.y, pt1.z)
        }
        startAttr.array[offset] = Number.isFinite(_p0.x) ? _p0.x : 0
        startAttr.array[offset + 1] = Number.isFinite(_p0.y) ? _p0.y : 0
        startAttr.array[offset + 2] = Number.isFinite(_p0.z) ? _p0.z : 0
        endAttr.array[offset] = Number.isFinite(_p1.x) ? _p1.x : 0
        endAttr.array[offset + 1] = Number.isFinite(_p1.y) ? _p1.y : 0
        endAttr.array[offset + 2] = Number.isFinite(_p1.z) ? _p1.z : 0
        offset += 3
    })
    startAttr.needsUpdate = true
    endAttr.needsUpdate = true
    const edgeCount = offset / 3

    const elapsed = performance.now() - startedAt

    // ── Write diagnostics: scalar in-place mutation, no allocation ────────
    recordFocusOverlayFrame(now, elapsed, edgeCount, pairCount)
    const mat = line.material as SemanticLineMaterial | undefined
    if (mat?.userData?.shader) {
        mat.userData.shader.uniforms.reducedMotion!.value = reducedMotion ? 1 : 0
        mat.userData.shader.uniforms.denseBundleMode!.value = line.userData?.denseBundleMode ? 1 : 0
        if (!reducedMotion) {
            mat.userData.shader.uniforms.time!.value = now / 1000
        }
    }
    if (!reducedMotion && mat?.uniforms?.time) {
        mat.uniforms.time.value = now / 1000
    }
    if (mat?.uniforms?.reducedMotion) {
        mat.uniforms.reducedMotion.value = reducedMotion ? 1 : 0
    }
    if (mat?.uniforms?.denseBundleMode) {
        mat.uniforms.denseBundleMode.value = line.userData?.denseBundleMode ? 1 : 0
    }
}

/**
 * Lightweight per-frame sync of the focus semantic overlay's `time` uniform
 * (drives the flow/breath shader animation). Does NOT recompute edge
 * positions — only advances the shader clock. The legacy js/modules render
 * loop synced this every frame; the TS port dropped it, freezing the
 * overlay's flow/breath animation between focus events.
 */
export function updateFocusSemanticOverlayTime(now: number = performance.now()): void {
    const line = state.focusSemanticLines
    if (!line) return
    const rawMat = line.material
    const mat: SemanticLineMaterial | undefined = Array.isArray(rawMat)
        ? (rawMat[0] as SemanticLineMaterial | undefined)
        : (rawMat as SemanticLineMaterial | undefined)
    if (!mat) return
    const reducedMotion = prefersReducedMotion()
    if (!reducedMotion) {
        if (mat.userData?.shader?.uniforms?.time) {
            mat.userData.shader.uniforms.time.value = now / 1000
        }
        if (mat.uniforms?.time) {
            mat.uniforms.time.value = now / 1000
        }
    }
    // DIAG
    if (typeof window !== 'undefined') {
        setOverlayDebugRefreshEnd(overlayDebug.refreshEnd + 1)
        setOverlayDebugPairsLen(state.focusSemanticConnectionPairs.length)
        setOverlayDebugEndRef(state.focusSemanticConnectionPairs)
        setOverlayDebugPushEndEq(overlayDebug.pushRef === state.focusSemanticConnectionPairs)
    }
}

export function getSemanticFocusCueProbeSnapshot(): Record<string, unknown> {
    return {
        visible: !!state.focusSemanticLines && !!state.focusThreadDiagnostics?.active,
        threadSource: state.navState.threadSource || null,
        focusedIndex: Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null,
        nextIndex: Number.isFinite(state.focusSemanticLines?.userData?.nextIndex)
            ? state.focusSemanticLines!.userData.nextIndex
            : null,
        lineNextIndex: Number.isFinite(state.focusSemanticLines?.userData?.nextIndex)
            ? state.focusSemanticLines!.userData.nextIndex
            : null,
        nextCueSegments:
            state.focusSemanticLines?.userData?.nextCueSegments || state.focusThreadDiagnostics?.nextCueSegments || 0,
        focusThreadSegments: state.focusSemanticLines ? getLineSegmentCount(state.focusSemanticLines) : 0,
        threadDiagnostics: { ...(state.focusThreadDiagnostics || {}) }
    }
}

// Window exposures for inline scripts and compatibility
if (typeof window !== 'undefined') {
    registerDiagnosticProbe('__semanticFocusCueProbe', getSemanticFocusCueProbeSnapshot)
}
