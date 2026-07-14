// focus-pocket-geometry.ts
// TypeScript shadow of focus-pocket-geometry.js
// Focus constellation geometry, seeded placement, screen-bounds, thread curve points.

import { Vec3, clamp } from '@lib/utils/math-vec3'
import { appState } from '@lib/state/app.svelte'
const state = appState
import { FOCUS_CONSTELLATION_MOTIFS } from '@lib/engine/config'
import type { ConstellationMotifName } from '@lib/state/state-types'
import { getViewportSize } from '@lib/utils/environment'
import { describeCluster } from '@lib/utils/ui-presentation'
import { normalizeCityForFilter } from '@lib/utils/geo-data'
import {
    getSemanticCandidateSlice,
    type NeighborhoodPersonality,
    type SemanticCandidate
} from '@lib/journey/focus-pocket-personality'
import { getFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode'
import type { PocketMotionWithFrame } from '@lib/types/state'

// === Pure geometry/easing utilities ===

export function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number(value) || 0))
}

export function easeOutQuint(t: number): number {
    return 1 - Math.pow(1 - t, 5)
}

export function seededUnit(...values: number[]): number {
    const seed = values.reduce((sum, value, index) => sum + (Number(value) || 0) * (index + 1) * 12.9898, 78.233)
    const x = Math.sin(seed) * 43758.5453
    return x - Math.floor(x)
}

export function safeUnitScore(value: unknown, fallback: number = 0): number {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.max(0, Math.min(1, numeric))
}

// === Focus constellation geometry ===

export interface FocusViewBasis {
    viewVector: Vec3
    rightVector: Vec3
    upVector: Vec3
}

export function getFocusViewBasis(focusVector: Vec3): FocusViewBasis {
    const viewVector = state.camera ? new Vec3().subVectors(state.camera.position, focusVector) : new Vec3(0.28, 0.2, 1)
    if (viewVector.lengthSq() < 0.0001) viewVector.set(0.28, 0.2, 1)
    viewVector.normalize()

    const worldUp = new Vec3(0, 1, 0)
    const rightVector = new Vec3().crossVectors(worldUp, viewVector)
    if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0)
    rightVector.normalize()
    const upVector = new Vec3().crossVectors(viewVector, rightVector).normalize()
    return { viewVector, rightVector, upVector }
}

export interface ConstellationMotif {
    key: string
    label: string
    directLift: number
    supportLift: number
    directPriority: number
    supportPriority: number
    braid: number
    seed: number
}

export function getFocusConstellationMotif(index: number): ConstellationMotif {
    const point = state.points[index] || {}
    const clusterLabel = (describeCluster(point.cluster ?? 0) || '').toLowerCase()
    let key: ConstellationMotifName = 'market'
    if (/(food|hospitality|beauty|wellness|arts|culture)/.test(clusterLabel)) {
        key = 'rosette'
    } else if (/(construction|trades|industrial|logistics|automotive|property|real estate)/.test(clusterLabel)) {
        key = 'lattice'
    } else if (/(agriculture|ranching|public agencies|economic development)/.test(clusterLabel)) {
        key = 'delta'
    } else if (
        /(church|faith|community|nonprofit|foundation|education|childcare|healthcare|medical|therapy|counseling)/.test(
            clusterLabel
        )
    ) {
        key = 'civic'
    }
    const motifKey = key as ConstellationMotifName
    const motifs = state.FOCUS_CONSTELLATION_MOTIFS || FOCUS_CONSTELLATION_MOTIFS
    const motif = motifs[motifKey] || motifs.market || FOCUS_CONSTELLATION_MOTIFS.market
    return {
        ...(motif as unknown as ConstellationMotif),
        key,
        seed: (point.cluster ?? 0) * 0.41 + (index % 11) * 0.07
    }
}

export function getFocusConstellationMotifForPersonality(
    index: number,
    personality: NeighborhoodPersonality | null
): ConstellationMotif {
    const fallback = getFocusConstellationMotif(index)
    const overrideKey = personality?.motifOverride
    if (!overrideKey) return fallback
    const overrideMotifKey = overrideKey as ConstellationMotifName
    const motifs = state.FOCUS_CONSTELLATION_MOTIFS || FOCUS_CONSTELLATION_MOTIFS
    const override = motifs[overrideMotifKey]
    if (!override) return fallback
    return {
        ...fallback,
        ...(override as unknown as ConstellationMotif),
        key: overrideKey,
        seed: fallback.seed
    }
}

export interface ViewportProfile {
    key: string
    primaryLimit: number
    supportLimit: number
    haloLimit: number
    primaryRadiusScale: number
    supportRadiusScale: number
    haloRadiusScale: number
    primarySpreadScale: number
    supportSpreadScale: number
    haloSpreadScale: number
    primaryRadiusFloor: number
    primaryRadiusCeiling: number
    supportRadiusFloor: number
    supportRadiusCeiling: number
    primaryStagedBlend: number
    supportStagedBlend: number
    haloStagedBlend: number
    primaryOriginBlend: number
    supportOriginBlend: number
    haloOriginBlend: number
    zScale: number
    beaconLimit: number
    overlayLimit: number
    primaryBeam: number
    supportBeam: number
    supportSeedLimit: number
    supportNeighborLimit: number
    cameraPadding?: number
    cameraDistanceMax?: number
    targetOffsetLimit?: number
    compositionRightOffset?: number
    compositionLift?: number
}

export function getFocusConstellationViewportProfile(): ViewportProfile {
    const vp = getViewportSize()
    const w = vp.width
    const h = vp.height
    const compact = w <= 768
    const short = h <= 540
    if (compact && short)
        return {
            key: 'condensed',
            primaryLimit: 5,
            supportLimit: 4,
            haloLimit: 3,
            primaryRadiusScale: 0.74,
            supportRadiusScale: 0.72,
            haloRadiusScale: 0.7,
            primarySpreadScale: 1.82,
            supportSpreadScale: 1.54,
            haloSpreadScale: 1.12,
            primaryRadiusFloor: 0.066,
            primaryRadiusCeiling: 0.12,
            supportRadiusFloor: 0.094,
            supportRadiusCeiling: 0.18,
            primaryStagedBlend: 0.94,
            supportStagedBlend: 0.9,
            haloStagedBlend: 0.9,
            primaryOriginBlend: 0.025,
            supportOriginBlend: 0.06,
            haloOriginBlend: 0.04,
            zScale: 0.72,
            beaconLimit: 6,
            overlayLimit: 5,
            primaryBeam: 8,
            supportBeam: 6,
            supportSeedLimit: 3,
            supportNeighborLimit: 3,
            cameraPadding: 1.52,
            cameraDistanceMax: 1.32,
            targetOffsetLimit: 0.036,
            compositionRightOffset: 0.004,
            compositionLift: 0.004
        }
    if (compact)
        return {
            key: 'compact',
            primaryLimit: 8,
            supportLimit: 6,
            haloLimit: 4,
            primaryRadiusScale: 0.78,
            supportRadiusScale: 0.76,
            haloRadiusScale: 0.74,
            primarySpreadScale: 1.74,
            supportSpreadScale: 1.46,
            haloSpreadScale: 1.12,
            primaryRadiusFloor: 0.074,
            primaryRadiusCeiling: 0.132,
            supportRadiusFloor: 0.105,
            supportRadiusCeiling: 0.2,
            primaryStagedBlend: 0.92,
            supportStagedBlend: 0.9,
            haloStagedBlend: 0.9,
            primaryOriginBlend: 0.03,
            supportOriginBlend: 0.065,
            haloOriginBlend: 0.045,
            zScale: 0.76,
            beaconLimit: 8,
            overlayLimit: 8,
            primaryBeam: 8,
            supportBeam: 6,
            supportSeedLimit: 4,
            supportNeighborLimit: 3,
            cameraPadding: 1.82,
            cameraDistanceMax: 1.58,
            targetOffsetLimit: 0.04,
            compositionRightOffset: 0.006,
            compositionLift: 0.006
        }
    return {
        key: 'roomy',
        primaryLimit: 12,
        supportLimit: 10,
        haloLimit: 8,
        primaryRadiusScale: 0.82,
        supportRadiusScale: 0.78,
        haloRadiusScale: 0.74,
        primarySpreadScale: 1.42,
        supportSpreadScale: 1.3,
        haloSpreadScale: 1.12,
        primaryRadiusFloor: 0.072,
        primaryRadiusCeiling: 0.15,
        supportRadiusFloor: 0.116,
        supportRadiusCeiling: 0.25,
        primaryStagedBlend: 0.9,
        supportStagedBlend: 0.88,
        haloStagedBlend: 0.9,
        primaryOriginBlend: 0.035,
        supportOriginBlend: 0.07,
        haloOriginBlend: 0.05,
        zScale: 0.78,
        beaconLimit: 12,
        overlayLimit: 12,
        primaryBeam: 10,
        supportBeam: 8,
        supportSeedLimit: 5,
        supportNeighborLimit: 4
    }
}

export function getFocusBeaconDeclutterProfile(viewportProfile: Record<string, unknown> = {}): Record<string, unknown> {
    const limit = Number.isFinite(viewportProfile.limit as number)
        ? viewportProfile.limit
        : Number.isFinite(viewportProfile.beaconLimit as number)
          ? viewportProfile.beaconLimit
          : 12
    return {
        ...viewportProfile,
        limit,
        scaleScale: Number.isFinite(viewportProfile.scaleScale as number) ? viewportProfile.scaleScale : 1,
        opacityScale: Number.isFinite(viewportProfile.opacityScale as number) ? viewportProfile.opacityScale : 1,
        pulseScale: Number.isFinite(viewportProfile.pulseScale as number) ? viewportProfile.pulseScale : 1,
        pulseOpacityScale: Number.isFinite(viewportProfile.pulseOpacityScale as number)
            ? viewportProfile.pulseOpacityScale
            : 1,
        reason: viewportProfile.reason || viewportProfile.key || 'default'
    }
}

export function getDeclutteredFocusBeaconIndices(rawIndices: number[], limit: number): number[] {
    const safeLimit = Number.isFinite(limit) ? limit : rawIndices.length
    return rawIndices.slice(0, safeLimit)
}

export interface PlacementParams {
    angle: number
    radius: number
    zOffset: number
    breatheAmp: number
    [key: string]: unknown
}

export function getFocusConstellationPlacement(
    motif: ConstellationMotif,
    entry: Record<string, unknown>,
    order: number,
    group: string,
    total: number,
    viewportProfile: ViewportProfile = getFocusConstellationViewportProfile(),
    personality: NeighborhoodPersonality | null = null
): PlacementParams {
    const score = safeUnitScore(entry.score, 0)
    const isPrimary = group === 'primary'
    const isHalo = group === 'halo'
    const normalized = total <= 1 ? 0 : order / Math.max(1, total - 1) - 0.5
    const absNormalized = Math.abs(normalized)
    const sameCityBias = entry.sameCity ? -0.018 : 0.018
    let angle = motif.seed
    let radius: number
    let zOffset: number
    // Default fallback matches the `else` (market/arc) branch. If a future
    // motif branch is added without assigning `breatheAmp`, this prevents
    // the downstream `undefined → NaN via *=` cascade that previously made
    // the delta motif nodes throb at 0.02 instead of the intended ~0.003
    // (see commit fixing the delta-branch gap).
    // eslint-disable-next-line no-useless-assignment -- safety net: future motif branches may forget to assign
    let breatheAmp = 0.003

    const compressionMult = personality?.compressionMult || 1.0

    if (motif.key === 'rosette') {
        const petalStep = (Math.PI * 2) / Math.max(5, total + (isPrimary ? 1 : 3))
        angle += (isPrimary ? -Math.PI * 0.48 : isHalo ? Math.PI * 0.46 : Math.PI * 0.18) + order * petalStep
        radius = isPrimary
            ? 0.145 + (order % 2) * 0.024 + (1 - score) * 0.014
            : isHalo
              ? 0.295 + absNormalized * 0.036
              : 0.245 + absNormalized * 0.05 + (entry.sameCity ? -0.014 : 0.012)
        zOffset = isPrimary ? 0.09 * Math.cos(order * petalStep) : isHalo ? -0.14 : -0.06 - (order % 2) * 0.018
        breatheAmp = isPrimary ? 0.0024 : isHalo ? 0.0028 : 0.0032
    } else if (motif.key === 'lattice') {
        const lane = order % 2 === 0 ? -1 : 1
        angle += (isPrimary ? -0.24 : isHalo ? Math.PI + 0.58 : Math.PI + 0.2) + normalized * Math.PI * 0.9
        radius = isPrimary
            ? 0.155 + absNormalized * 0.07 + sameCityBias
            : isHalo
              ? 0.286 + absNormalized * 0.05
              : 0.23 + absNormalized * 0.078
        zOffset = (isPrimary ? 0.012 : isHalo ? -0.038 : -0.03) + lane * (isHalo ? 0.012 : 0.018)
        breatheAmp = isPrimary ? 0.0028 : isHalo ? 0.003 : 0.0042
    } else if (motif.key === 'delta') {
        angle +=
            (isPrimary ? -0.04 : isHalo ? Math.PI + 0.46 : Math.PI + 0.1) +
            normalized * (isPrimary ? Math.PI * 0.72 : Math.PI * 1.08)
        radius = isPrimary
            ? 0.15 + order * 0.009 + (1 - score) * 0.02
            : isHalo
              ? 0.284 + order * 0.01
              : 0.238 + order * 0.018
        zOffset = isPrimary ? 0.03 - absNormalized * 0.018 : isHalo ? -0.034 - order * 0.003 : -0.018 - order * 0.006
        breatheAmp = isPrimary ? 0.0026 : isHalo ? 0.003 : 0.0036
    } else if (motif.key === 'civic') {
        angle += (isPrimary ? -Math.PI * 0.52 : isHalo ? Math.PI * 0.72 : Math.PI * 0.45) + normalized * Math.PI * 1.34
        radius = isPrimary
            ? 0.17 + absNormalized * 0.026 + sameCityBias
            : isHalo
              ? 0.302 + absNormalized * 0.034
              : 0.265 + absNormalized * 0.05
        zOffset = isPrimary ? 0.018 * Math.cos(normalized * Math.PI * 2) : isHalo ? -0.034 : -0.024
        breatheAmp = isPrimary ? 0.0026 : isHalo ? 0.003 : 0.0038
    } else {
        // Unknown motif key — explicit default (arc) placement. All four
        // placement fields (angle, radius, zOffset, breatheAmp) are assigned
        // below, so it is safe to fall through to the shared post-processing
        // (compression, score tension, personality, viewport scaling).
        const arcSpan = isPrimary
            ? Math.min(Math.PI * 1.28, 1.0 + total * 0.18)
            : Math.min(Math.PI * 1.5, 1.15 + total * 0.2)
        angle += (isPrimary ? -0.36 : isHalo ? Math.PI + 0.62 : Math.PI + 0.34) + normalized * arcSpan
        radius = isPrimary
            ? 0.154 + absNormalized * 0.052 + (1 - score) * 0.016
            : isHalo
              ? 0.302 + absNormalized * 0.038
              : 0.258 + absNormalized * 0.062 + (1 - score) * 0.022
        zOffset = isPrimary ? 0.03 * Math.cos(normalized * Math.PI) : isHalo ? -0.036 : -0.022 - (order % 2) * 0.016
        if (motif.key !== 'market' && import.meta.env.DEV) {
            console.warn(`[focus-pocket-geometry] Unknown motif key "${motif.key}" — using default placement.`)
        }
        breatheAmp = 0.003
    }

    radius *= compressionMult

    if (score > 0.01) {
        const tensionMult = Math.max(0.65, Math.min(1.4, 1.35 - Math.pow(score, 1.5)))
        radius *= tensionMult
        zOffset += score * 0.015
    }

    const pType = personality?.type || 'STANDARD'
    if (pType === 'DENSE_HUB') {
        zOffset *= 1.4
        radius *= 1.08
    } else if (pType === 'BRIDGE_NODE') {
        angle += normalized * Math.PI * 0.15
        zOffset *= 0.75
    } else if (pType === 'EDGE_NODE') {
        radius *= 1.12
        zOffset *= 1.25
    } else if (pType === 'TIGHT_CLUSTER') {
        radius *= 0.92
        zOffset *= 1.2
    }

    const radiusScale = isPrimary
        ? viewportProfile.primaryRadiusScale
        : isHalo
          ? viewportProfile.haloRadiusScale
          : viewportProfile.supportRadiusScale
    radius *= radiusScale || 0.7
    zOffset *= viewportProfile.zScale || 0.78
    breatheAmp *= isHalo ? 0.72 : 1

    return { angle, radius, zOffset, breatheAmp }
}

export function applyRelationshipRolePlacementBias(
    placement: PlacementParams,
    relationshipRole: string,
    order: number,
    group: string
): PlacementParams {
    const role = String(relationshipRole || '').trim()
    if (!role) return placement

    if (role === 'core_peer' || role === 'sibling' || role === 'variant') {
        placement.radius *= 0.76
        placement.zOffset += 0.012
        placement.angle += (order % 2 === 0 ? -1 : 1) * 0.06
    } else if (role === 'same_market' || role === 'competitor') {
        placement.radius *= 1.14
        placement.zOffset -= 0.024
        placement.angle += Math.PI * (group === 'primary' ? 0.1 : 0.05)
    } else if (role === 'upstream' || role === 'supplier' || role === 'vendor') {
        placement.zOffset -= 0.048
        placement.radius *= 1.06
    } else if (role === 'downstream' || role === 'customer' || role === 'client') {
        placement.zOffset += 0.038
        placement.radius *= 0.92
        placement.angle += 0.18
    } else if (role === 'complement' || role === 'partner' || role === 'affiliate') {
        placement.radius *= 0.88
        placement.angle -= 0.12
    } else if (role === 'geo_echo') {
        placement.radius *= 1.08
        placement.zOffset -= 0.012
        placement.angle += (order % 2 === 0 ? -1 : 1) * 0.1
    } else if (role === 'bridge') {
        placement.radius *= 1.18
        placement.zOffset += group === 'primary' ? 0.018 : 0.008
    } else if (role === 'investor' || role === 'parent') {
        placement.zOffset += 0.06
        placement.radius *= 0.84
    } else if (role === 'subsidiary' || role === 'acquired') {
        placement.zOffset -= 0.02
        placement.radius *= 0.78
    }

    return placement
}

export interface ThreadEdge {
    a: number
    b: number
    motifBraid?: number
    role?: string
    curveLift?: number
    side?: number
    rise?: number
    depth?: number
    anchorPull?: number
    [key: string]: unknown
}

export function getFocusThreadCurvePoint(edge: ThreadEdge, t: number): Vec3 {
    if (!state.nodePositions) return new Vec3()
    const a = state.nodePositions[edge.a]
    const b = state.nodePositions[edge.b]
    if (!a || !b || edge.a === null || edge.a === undefined || edge.b === null || edge.b === undefined)
        return new Vec3()

    if (
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(a.z) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y) ||
        !Number.isFinite(b.z)
    )
        return new Vec3()
    const start = new Vec3(a.x, a.y, a.z)
    const end = new Vec3(b.x, b.y, b.z)
    const mid = start.clone().lerp(end, 0.5)
    const span = new Vec3().subVectors(end, start)
    const spanLength = Math.max(span.length(), 0.001)
    // Use a stable view vector instead of the live camera, which shifts every
    // frame during transitions and causes thread curves to visibly wobble.
    const viewVector = new Vec3(0.28, 0.2, 1)
    viewVector.normalize()

    const worldUp = new Vec3(0, 1, 0)
    const rightVector = new Vec3().crossVectors(worldUp, viewVector)
    if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0)
    rightVector.normalize()
    const upVector = new Vec3().crossVectors(viewVector, rightVector).normalize()
    const motifBraid = Number.isFinite(edge.motifBraid) ? edge.motifBraid! : 0.52
    const roleLift = edge.role === 'support' ? 0.78 : 1
    const isFieldNodeWalk = getFocusPanelMode() === FOCUS_PANEL_MODE.FIELD_NODE
    const longArc = isFieldNodeWalk && edge.role === 'direct' ? clamp((spanLength - 0.18) / 0.34, 0, 1) : 0
    const bendCap = isFieldNodeWalk ? 0.17 + longArc * 0.14 : 0.16
    const bendFloor = isFieldNodeWalk ? 0.032 + longArc * 0.026 : 0.028
    const bend = Math.min(
        bendCap,
        Math.max(bendFloor, spanLength * (edge.curveLift as number) * roleLift * (1 + longArc * 0.72))
    )
    const anchorPull = Number.isFinite(edge.anchorPull) ? edge.anchorPull! : 0
    const control = mid
        .addScaledVector(rightVector, bend * (edge.side as number) * (0.62 + motifBraid * 0.34 + longArc * 0.58))
        .addScaledVector(upVector, bend * (0.34 * (edge.rise as number) + longArc * 0.42))
        .addScaledVector(viewVector, bend * ((edge.depth as number) + longArc * 0.72))

    if (anchorPull > 0 && Number.isFinite(state.navState.focusedIndex)) {
        const focusedIndex = state.navState.focusedIndex!
        const anchor = state.nodePositions[focusedIndex]
        if (anchor) {
            const anchorVector = new Vec3(anchor.x, anchor.y, anchor.z)
            const stem = anchorVector.lerp(mid, 0.42 + motifBraid * 0.16)
            control.lerp(stem, Math.min(0.44, anchorPull * (1 - longArc * 0.68)))
        }
    }

    if (longArc > 0.01) {
        const curveCenter = start.clone().lerp(end, 0.5)
        const arcBias = bend * (0.92 + longArc * 0.72)
        const controlA = start
            .clone()
            .lerp(curveCenter, 0.42)
            .addScaledVector(rightVector, arcBias * (edge.side as number) * (0.78 + motifBraid * 0.28))
            .addScaledVector(upVector, arcBias * (0.3 + Math.max(0, edge.rise as number) * 0.28))
            .addScaledVector(viewVector, arcBias * 0.62)
        const controlB = end
            .clone()
            .lerp(curveCenter, 0.42)
            .addScaledVector(rightVector, arcBias * (edge.side as number) * (1.04 + motifBraid * 0.34))
            .addScaledVector(upVector, arcBias * (0.46 + longArc * 0.24))
            .addScaledVector(viewVector, arcBias * (0.82 + longArc * 0.3))
        const inv = 1 - t
        return start
            .multiplyScalar(inv * inv * inv)
            .add(controlA.multiplyScalar(3 * inv * inv * t))
            .add(controlB.multiplyScalar(3 * inv * t * t))
            .add(end.multiplyScalar(t * t * t))
    }

    return start
        .multiplyScalar((1 - t) * (1 - t))
        .add(control.multiplyScalar(2 * (1 - t) * t))
        .add(end.multiplyScalar(t * t))
}

// === Build focused pocket staged positions ===

export interface PocketEntry {
    index: number
    kind: string
    score?: number
    relationshipRole?: string
    relationshipAxis?: string
    roleReason?: string
    sameCity?: boolean
    reason?: string
    [key: string]: unknown
}

export interface PocketStagedResult {
    positions: Map<number, { x: number; y: number; z: number }>
    motion: Map<number, PocketMotionWithFrame>
    roles: Map<number, string>
    motif: ConstellationMotif | null
    viewportProfile: ViewportProfile | null
}

export function buildFocusedPocketStagedPositions(
    index: number,
    pocketEntries: Map<number, PocketEntry>
): PocketStagedResult {
    if (!state.points || !Array.isArray(state.points) || !state.originalPositions)
        return { positions: new Map(), motion: new Map(), roles: new Map(), motif: null, viewportProfile: null }
    const focusOrig = state.originalPositions[index]
    if (!focusOrig)
        return { positions: new Map(), motion: new Map(), roles: new Map(), motif: null, viewportProfile: null }
    const focusVector = new Vec3(focusOrig.x, focusOrig.y, focusOrig.z)
    const { viewVector, rightVector, upVector } = getFocusViewBasis(focusVector)

    const pocketPositions = new Map<number, { x: number; y: number; z: number }>()
    pocketPositions.set(index, { x: focusOrig.x, y: focusOrig.y, z: focusOrig.z })

    const entries = [...pocketEntries.values()].sort((a: PocketEntry, b: PocketEntry) => {
        const rank: Record<string, number> = { primary: 0, support: 1, halo: 2 }
        if (a.kind !== b.kind) return (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3)
        return (b.score || 0) - (a.score || 0)
    })
    const primaryEntries = entries.filter((entry) => entry.kind === 'primary')
    const supportEntries = entries.filter((entry) => entry.kind === 'support')
    const haloEntries = entries.filter((entry) => entry.kind === 'halo')

    const fallbackPersonality: NeighborhoodPersonality = {
        type: 'STANDARD',
        motifOverride: null,
        cameraDuration: 980,
        cameraArc: 'standard',
        staggerMult: 1,
        compressionMult: 1,
        easing: 'easeInOutCubic',
        microVariation: { rotation: 0, scale: 1 }
    }
    const personality = (state.navState.currentPersonality as NeighborhoodPersonality | null) || fallbackPersonality
    const motif = getFocusConstellationMotifForPersonality(index, personality)

    const vpProfile = getFocusConstellationViewportProfile()
    const motion = new Map<number, PocketMotionWithFrame>()
    const roles = new Map<number, string>([[index, 'anchor']])
    motion.set(index, {
        role: 'anchor',
        delay: 0,
        duration: personality.cameraDuration * 0.7,
        speed: 0.42,
        motif: motif.key,
        breatheAmp: 0.0022,
        personality: personality.type
    })

    const placeEntry = (entry: PocketEntry, order: number, group: string): void => {
        const original = state.originalPositions[entry.index]
        if (!original) return
        const score = safeUnitScore(entry.score, 0)
        const safeEntry = { ...entry, score }
        const isPrimary = group === 'primary'
        const isHalo = group === 'halo'
        const total = isPrimary ? primaryEntries.length : isHalo ? haloEntries.length : supportEntries.length
        const placement = {
            ...getFocusConstellationPlacement(motif, safeEntry, order, group, total, vpProfile, personality)
        }
        applyRelationshipRolePlacementBias(placement, safeEntry.relationshipRole || '', order, group)
        const relationSeed = seededUnit(index, entry.index, order, total, score)
        const relationSwing = isPrimary ? 0.18 : isHalo ? 0.16 : 0.24
        placement.angle += (relationSeed - 0.5) * relationSwing
        placement.radius *= 0.94 + seededUnit(entry.index, index, group.length, order) * (isPrimary ? 0.13 : 0.17)
        placement.radius *= isPrimary
            ? vpProfile.primarySpreadScale || 1
            : isHalo
              ? vpProfile.haloSpreadScale || 1
              : vpProfile.supportSpreadScale || 1
        if (isPrimary) {
            placement.radius = clampNumber(
                placement.radius,
                vpProfile.primaryRadiusFloor || 0.24,
                vpProfile.primaryRadiusCeiling || 0.52
            )
        } else if (!isHalo) {
            placement.radius = clampNumber(
                placement.radius,
                vpProfile.supportRadiusFloor || 0.3,
                vpProfile.supportRadiusCeiling || 0.66
            )
        }

        const stagedOffset = new Vec3()
            .addScaledVector(rightVector, Math.cos(placement.angle) * placement.radius)
            .addScaledVector(upVector, Math.sin(placement.angle) * placement.radius)
            .addScaledVector(viewVector, placement.zOffset)

        if (personality.microVariation) {
            stagedOffset.applyAxisAngle(viewVector, personality.microVariation.rotation)
            stagedOffset.multiplyScalar(personality.microVariation.scale)
        }

        const originalOffset = new Vec3(original.x - focusOrig.x, original.y - focusOrig.y, original.z - focusOrig.z)
        const originalDistance = originalOffset.length()
        if (originalDistance > 0.0001) {
            originalOffset.normalize().multiplyScalar(Math.min(originalDistance, placement.radius * 1.35))
        }

        stagedOffset.multiplyScalar(
            isPrimary
                ? (vpProfile.primaryStagedBlend ?? 0.82)
                : isHalo
                  ? (vpProfile.haloStagedBlend ?? 0.9)
                  : (vpProfile.supportStagedBlend ?? 0.86)
        )
        originalOffset.multiplyScalar(
            isPrimary
                ? (vpProfile.primaryOriginBlend ?? 0.18)
                : isHalo
                  ? (vpProfile.haloOriginBlend ?? 0.055)
                  : (vpProfile.supportOriginBlend ?? 0.12)
        )
        const finalVector = focusVector.clone().add(stagedOffset).add(originalOffset)
        pocketPositions.set(entry.index, { x: finalVector.x, y: finalVector.y, z: finalVector.z })
        roles.set(entry.index, isPrimary ? 'primary' : isHalo ? 'halo' : 'support')

        const baseDelay = isPrimary ? order * 52 : isHalo ? 300 + order * 58 : 210 + order * 62
        const baseDuration = isPrimary ? 980 : isHalo ? 1280 : 1120

        const origin = state.nodePositions[entry.index] || state.originalPositions[entry.index] || finalVector
        motion.set(entry.index, {
            role: isPrimary ? 'primary' : isHalo ? 'halo' : 'support',
            relationshipRole: safeEntry.relationshipRole || '',
            relationshipAxis: safeEntry.relationshipAxis || '',
            roleReason: safeEntry.roleReason || '',
            motif: motif.key,
            delay: baseDelay * personality.staggerMult,
            duration: baseDuration * (personality.cameraDuration / 980),
            speed: isPrimary ? 0.24 : isHalo ? 0.14 : 0.19,
            breatheAmp: placement.breatheAmp,
            phase: placement.angle,
            personality: personality.type,
            _originPos: { x: origin.x, y: origin.y, z: origin.z },
            _firstFrameApplied: false
        })
    }

    primaryEntries.forEach((entry, order) => placeEntry(entry, order, 'primary'))
    supportEntries.forEach((entry, order) => placeEntry(entry, order, 'support'))
    haloEntries.forEach((entry, order) => placeEntry(entry, order, 'halo'))
    return { positions: pocketPositions, motion, roles, motif, viewportProfile: vpProfile }
}

// === Build focused semantic pocket ===

export interface SemanticPocketResult {
    positions: Map<number, { x: number; y: number; z: number }>
    indices: number[]
    motion: Map<number, PocketMotionWithFrame>
    roles: Map<number, string>
    meta: {
        active: boolean
        nodeCount: number
        primaryCount: number
        supportCount: number
        haloCount: number
        motif: string
        motifLabel: string
        viewportProfile: ViewportProfile
    }
}

export function buildFocusedSemanticPocket(index: number): SemanticPocketResult | null {
    const vpProfile = getFocusConstellationViewportProfile()
    const primaryCandidates = getSemanticCandidateSlice(index, vpProfile.primaryLimit)
    if (!primaryCandidates.length) return null

    const outerDirectCandidates = getSemanticCandidateSlice(index, vpProfile.primaryLimit + vpProfile.haloLimit).slice(
        vpProfile.primaryLimit
    )
    const focusPoint = Number.isFinite(index) && index >= 0 && index < state.points.length ? state.points[index] : null
    const focusCity = normalizeCityForFilter(focusPoint?.city)
    const pocketEntries = new Map<number, PocketEntry>()

    primaryCandidates.forEach((candidate: SemanticCandidate) => {
        pocketEntries.set(candidate.index, {
            index: candidate.index,
            kind: 'primary',
            score: candidate.semanticScore || candidate.score || 0,
            relationshipRole: candidate.relationshipRole || '',
            relationshipAxis: candidate.relationshipAxis || '',
            roleReason: candidate.roleReason || '',
            sameCity: normalizeCityForFilter(state.points[candidate.index]?.city) === focusCity,
            reason: candidate.reason || 'semantic neighbor'
        })
    })

    const supportScores = new Map<
        number,
        {
            count: number
            score: number
            sameCity: number
            relationshipRole: string
            relationshipAxis: string
            roleReason: string
        }
    >()
    primaryCandidates.slice(0, vpProfile.supportSeedLimit).forEach((candidate: SemanticCandidate) => {
        getSemanticCandidateSlice(candidate.index, vpProfile.supportNeighborLimit).forEach(
            (support: SemanticCandidate) => {
                if (support.index === index || pocketEntries.has(support.index)) return
                const current = supportScores.get(support.index) || {
                    count: 0,
                    score: 0,
                    sameCity: 0,
                    relationshipRole: '',
                    relationshipAxis: '',
                    roleReason: ''
                }
                current.count += 1
                current.score += support.semanticScore || support.score || 0
                if (normalizeCityForFilter(state.points[support.index]?.city) === focusCity) current.sameCity += 1
                if (!current.relationshipRole && support.relationshipRole)
                    current.relationshipRole = support.relationshipRole
                if (!current.relationshipAxis && support.relationshipAxis)
                    current.relationshipAxis = support.relationshipAxis
                if (!current.roleReason && support.roleReason) current.roleReason = support.roleReason
                supportScores.set(support.index, current)
            }
        )
    })
    ;[...supportScores.entries()]
        .filter(([, entry]) => entry.count >= 2 || (entry.count >= 1 && entry.sameCity >= 1 && entry.score >= 0.72))
        .sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score)
        .slice(0, vpProfile.supportLimit)
        .forEach(([supportIndex, entry]) => {
            pocketEntries.set(supportIndex, {
                index: supportIndex,
                kind: 'support',
                score: entry.score / Math.max(entry.count, 1),
                relationshipRole: entry.relationshipRole || '',
                relationshipAxis: entry.relationshipAxis || '',
                roleReason: entry.roleReason || '',
                sameCity: entry.sameCity > 0,
                reason: 'local semantic support'
            })
        })

    outerDirectCandidates
        .filter((candidate: SemanticCandidate) => !pocketEntries.has(candidate.index))
        .slice(0, vpProfile.haloLimit)
        .forEach((candidate: SemanticCandidate) => {
            pocketEntries.set(candidate.index, {
                index: candidate.index,
                kind: 'halo',
                score: (candidate.semanticScore || candidate.score || 0) * 0.86,
                relationshipRole: candidate.relationshipRole || '',
                relationshipAxis: candidate.relationshipAxis || '',
                roleReason: candidate.roleReason || '',
                sameCity: normalizeCityForFilter(state.points[candidate.index]?.city) === focusCity,
                reason: 'outer semantic echo'
            })
        })

    const pocketIndices = [index, ...[...pocketEntries.keys()]]
    if (pocketIndices.length < 2) return null
    const pocketLayout = buildFocusedPocketStagedPositions(index, pocketEntries)

    return {
        positions: pocketLayout.positions,
        indices: pocketIndices,
        motion: pocketLayout.motion,
        roles: pocketLayout.roles,
        meta: {
            active: true,
            nodeCount: pocketIndices.length,
            primaryCount: primaryCandidates.length,
            supportCount: [...pocketEntries.values()].filter((entry) => entry.kind === 'support').length,
            haloCount: [...pocketEntries.values()].filter((entry) => entry.kind === 'halo').length,
            motif: pocketLayout.motif?.key || 'market',
            motifLabel: pocketLayout.motif?.label || 'semantic constellation',
            viewportProfile: pocketLayout.viewportProfile || vpProfile
        }
    }
}
