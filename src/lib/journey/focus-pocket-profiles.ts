// focus-pocket-profiles.ts
// Focus constellation geometry: view basis, motif selection, responsive viewport
// profile, beacon declutter, and per-entry placement (motif-specific layout + role
// bias). All read-only lookups against appState / viewport; no orchestration.
//
// Pure-move refactor of `src/lib/journey/focus-pocket-geometry.ts` lines 44-464.

import { Vec3 } from '@lib/utils/math-vec3'
import { appState } from '@lib/state/app.svelte'
const state = appState
import { FOCUS_CONSTELLATION_MOTIFS } from '@lib/engine/config'
import type { ConstellationMotifName } from '@lib/state/state-types'
import { getViewportSize } from '@lib/utils/environment'
import { describeCluster } from '@lib/utils/ui-presentation'
import type { NeighborhoodPersonality } from '@lib/journey/focus-pocket-personality'
import { safeUnitScore } from './focus-pocket-math'

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
    const motifs = FOCUS_CONSTELLATION_MOTIFS
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
    const motifs = FOCUS_CONSTELLATION_MOTIFS
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
