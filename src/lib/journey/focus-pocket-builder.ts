// focus-pocket-builder.ts
// Build the focus pocket: PocketEntry shape, staged positions for each entry,
// and the higher-level "semantic pocket" assembly that pulls neighborhood
// candidates via getSemanticCandidateSlice. This is the orchestrator that
// composes the geometry primitives in `focus-pocket-profiles.ts` and the pure
// math in `focus-pocket-math.ts` into a ready-to-render pocket + motion map.
//
// Pure-move refactor of `src/lib/journey/focus-pocket-geometry.ts` lines 624-1014.

import { Vec3 } from '@lib/utils/math-vec3'
import { appState } from '@lib/state/app.svelte'
const state = appState
import {
    getSemanticCandidateSlice,
    type NeighborhoodPersonality,
    type SemanticCandidate
} from '@lib/journey/focus-pocket-personality'
import { normalizeCityForFilter } from '@lib/utils/geo-data'
import { debugWarn } from '@lib/utils/debug'
import type { PocketMotionWithFrame } from '@lib/types/state'
import { clampNumber, seededUnit, safeUnitScore } from './focus-pocket-math'
import {
    getFocusViewBasis,
    getFocusConstellationMotifForPersonality,
    getFocusConstellationViewportProfile,
    getFocusConstellationPlacement,
    applyRelationshipRolePlacementBias,
    type ConstellationMotif,
    type ViewportProfile
} from './focus-pocket-profiles'

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

// --- Helpers for buildFocusedPocketStagedPositions ---

interface EntryLayout {
    primaryEntries: PocketEntry[]
    supportEntries: PocketEntry[]
    haloEntries: PocketEntry[]
    personality: NeighborhoodPersonality
    motif: ConstellationMotif
    vpProfile: ViewportProfile
}

function _computeEntryLayout(index: number, pocketEntries: Map<number, PocketEntry>): EntryLayout | null {
    if (!state.points || !Array.isArray(state.points) || !state.originalPositions) return null
    const focusOrig = state.originalPositions[index]
    if (!focusOrig) return null

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

    return { primaryEntries, supportEntries, haloEntries, personality, motif, vpProfile }
}

function _initializeAnchorMotion(
    index: number,
    motifKey: string,
    personality: NeighborhoodPersonality
): { motion: Map<number, PocketMotionWithFrame>; roles: Map<number, string> } {
    const motion = new Map<number, PocketMotionWithFrame>()
    const roles = new Map<number, string>([[index, 'anchor']])
    motion.set(index, {
        role: 'anchor',
        delay: 0,
        duration: personality.cameraDuration * 0.7,
        speed: 0.42,
        motif: motifKey,
        breatheAmp: 0.0022,
        personality: personality.type
    })
    return { motion, roles }
}

interface PlaceEntryContext {
    index: number
    focusOrig: { x: number; y: number; z: number }
    focusVector: Vec3
    rightVector: Vec3
    upVector: Vec3
    primaryCount: number
    supportCount: number
    haloCount: number
    motif: ConstellationMotif
    vpProfile: ViewportProfile
    personality: NeighborhoodPersonality
}

function _placeSingleEntry(
    entry: PocketEntry,
    order: number,
    group: string,
    ctx: PlaceEntryContext,
    pocketPositions: Map<number, { x: number; y: number; z: number }>,
    motion: Map<number, PocketMotionWithFrame>,
    roles: Map<number, string>
): void {
    const original = state.originalPositions[entry.index]
    if (!original) return
    const score = safeUnitScore(entry.score, 0)
    const safeEntry = { ...entry, score }
    const isPrimary = group === 'primary'
    const isHalo = group === 'halo'
    const total = isPrimary ? ctx.primaryCount : isHalo ? ctx.haloCount : ctx.supportCount
    const placement = {
        ...getFocusConstellationPlacement(ctx.motif, safeEntry, order, group, total, ctx.vpProfile, ctx.personality)
    }
    applyRelationshipRolePlacementBias(placement, safeEntry.relationshipRole || '', order, group)
    const relationSeed = seededUnit(ctx.index, entry.index, order, total, score)
    const relationSwing = isPrimary ? 0.18 : isHalo ? 0.16 : 0.24
    placement.angle += (relationSeed - 0.5) * relationSwing
    placement.radius *= 0.94 + seededUnit(entry.index, ctx.index, group.length, order) * (isPrimary ? 0.13 : 0.17)
    placement.radius *= isPrimary
        ? ctx.vpProfile.primarySpreadScale || 1
        : isHalo
          ? ctx.vpProfile.haloSpreadScale || 1
          : ctx.vpProfile.supportSpreadScale || 1
    if (isPrimary) {
        placement.radius = clampNumber(
            placement.radius,
            ctx.vpProfile.primaryRadiusFloor || 0.24,
            ctx.vpProfile.primaryRadiusCeiling || 0.52
        )
    } else if (!isHalo) {
        placement.radius = clampNumber(
            placement.radius,
            ctx.vpProfile.supportRadiusFloor || 0.3,
            ctx.vpProfile.supportRadiusCeiling || 0.66
        )
    }

    const stagedOffset = new Vec3()
        .addScaledVector(ctx.rightVector, Math.cos(placement.angle) * placement.radius)
        .addScaledVector(ctx.upVector, Math.sin(placement.angle) * placement.radius)
        .addScaledVector(ctx.focusVector, placement.zOffset)

    if (ctx.personality.microVariation) {
        stagedOffset.applyAxisAngle(ctx.focusVector, ctx.personality.microVariation.rotation)
        stagedOffset.multiplyScalar(ctx.personality.microVariation.scale)
    }

    const originalOffset = new Vec3(
        original.x - ctx.focusOrig.x,
        original.y - ctx.focusOrig.y,
        original.z - ctx.focusOrig.z
    )
    const originalDistance = originalOffset.length()
    if (originalDistance > 0.0001) {
        originalOffset.normalize().multiplyScalar(Math.min(originalDistance, placement.radius * 1.35))
    }

    stagedOffset.multiplyScalar(
        isPrimary
            ? (ctx.vpProfile.primaryStagedBlend ?? 0.82)
            : isHalo
              ? (ctx.vpProfile.haloStagedBlend ?? 0.9)
              : (ctx.vpProfile.supportStagedBlend ?? 0.86)
    )
    originalOffset.multiplyScalar(
        isPrimary
            ? (ctx.vpProfile.primaryOriginBlend ?? 0.18)
            : isHalo
              ? (ctx.vpProfile.haloOriginBlend ?? 0.055)
              : (ctx.vpProfile.supportOriginBlend ?? 0.12)
    )
    const finalVector = ctx.focusVector.clone().add(stagedOffset).add(originalOffset)
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
        motif: ctx.motif.key,
        delay: baseDelay * ctx.personality.staggerMult,
        duration: baseDuration * (ctx.personality.cameraDuration / 980),
        speed: isPrimary ? 0.24 : isHalo ? 0.14 : 0.19,
        breatheAmp: placement.breatheAmp,
        phase: placement.angle,
        personality: ctx.personality.type,
        _originPos: { x: origin.x, y: origin.y, z: origin.z },
        _firstFrameApplied: false
    })
}

export function buildFocusedPocketStagedPositions(
    index: number,
    pocketEntries: Map<number, PocketEntry>
): PocketStagedResult {
    const empty: PocketStagedResult = {
        positions: new Map(),
        motion: new Map(),
        roles: new Map(),
        motif: null,
        viewportProfile: null
    }
    const layout = _computeEntryLayout(index, pocketEntries)
    if (!layout) return empty

    const focusOrig = state.originalPositions[index]
    if (!focusOrig) return empty

    const focusVector = new Vec3(focusOrig.x, focusOrig.y, focusOrig.z)
    const { rightVector, upVector } = getFocusViewBasis(focusVector)

    const pocketPositions = new Map<number, { x: number; y: number; z: number }>()
    pocketPositions.set(index, { x: focusOrig.x, y: focusOrig.y, z: focusOrig.z })

    const { primaryEntries, supportEntries, haloEntries, personality, motif, vpProfile } = layout
    const { motion, roles } = _initializeAnchorMotion(index, motif.key, personality)

    const placeCtx: PlaceEntryContext = {
        index,
        focusOrig,
        focusVector,
        rightVector,
        upVector,
        primaryCount: primaryEntries.length,
        supportCount: supportEntries.length,
        haloCount: haloEntries.length,
        motif,
        vpProfile,
        personality
    }

    primaryEntries.forEach((entry, order) =>
        _placeSingleEntry(entry, order, 'primary', placeCtx, pocketPositions, motion, roles)
    )
    supportEntries.forEach((entry, order) =>
        _placeSingleEntry(entry, order, 'support', placeCtx, pocketPositions, motion, roles)
    )
    haloEntries.forEach((entry, order) =>
        _placeSingleEntry(entry, order, 'halo', placeCtx, pocketPositions, motion, roles)
    )
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

    const missingRoleCount = [...pocketEntries.values()].filter((entry) => !entry.relationshipRole).length
    if (missingRoleCount > 0) {
        debugWarn(
            `focus-pocket-geometry: ${missingRoleCount}/${pocketEntries.size} semantic pocket entries lack relationshipRole (geometric placement fallback used)`
        )
    }

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
