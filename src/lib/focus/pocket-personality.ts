/**
 * @lib/focus/pocket-personality.ts — Native port of focus-pocket-personality.ts
 *
 * Neighborhood personality derivation for focus pocket layout.
 * Exactly matches the legacy API surface consumed by the bridge.
 */

import { appState } from '@lib/state/app.svelte'
import { normalizeCityForFilter } from '@lib/utils/geo-data'
import { getSemanticThreadCandidates } from '@lib/journey/thread-model'
import { getFocusConstellationViewportProfile } from '@lib/journey/focus-pocket-geometry'

export interface SemanticCandidate {
    index: number
    semanticScore?: number
    score?: number
    relationshipRole?: string
    relationshipAxis?: string
    roleReason?: string
    reason?: string
    [key: string]: unknown
}

export interface NeighborhoodPersonality {
    type: string
    motifOverride: string | null
    cameraDuration: number
    cameraArc: string
    staggerMult: number
    compressionMult: number
    easing: string
    microVariation: {
        rotation: number
        scale: number
    }
}

/** Multi-arg seeded hash matching the legacy focus-pocket-geometry implementation. */
function seededUnitMulti(...values: number[]): number {
    const seed = values.reduce((sum, value, index) => sum + (Number(value) || 0) * (index + 1) * 12.9898, 78.233)
    const x = Math.sin(seed) * 43758.5453
    return x - Math.floor(x)
}

/**
 * Get a slice of semantic thread candidates for a given index.
 */
export function getSemanticCandidateSlice(index: number, limit: number = 8): SemanticCandidate[] {
    return (getSemanticThreadCandidates(index) as SemanticCandidate[]).slice(0, limit)
}

/**
 * Derive the personality for a given node's neighborhood.
 */
export function getNeighborhoodPersonality(index: number): NeighborhoodPersonality {
    const viewportProfile = getFocusConstellationViewportProfile()
    const primaryCandidates = getSemanticCandidateSlice(index, viewportProfile.primaryLimit)
    const degree = primaryCandidates.length
    const rawAvgScore =
        primaryCandidates.reduce(
            (sum: number, c: SemanticCandidate) =>
                sum + (Number.isFinite(c.semanticScore) ? c.semanticScore! : Number.isFinite(c.score) ? c.score! : 0),
            0
        ) / (degree || 1)
    const avgScore = Number.isFinite(rawAvgScore) ? rawAvgScore : 0

    const cities = new Set(
        primaryCandidates.map((c: SemanticCandidate) => normalizeCityForFilter((appState.points as any)[c.index]?.city))
    )

    const personality: NeighborhoodPersonality = {
        type: 'STANDARD',
        motifOverride: null,
        cameraDuration: 980,
        cameraArc: 'standard',
        staggerMult: 1.0,
        compressionMult: 1.0,
        easing: 'easeInOutCubic',
        microVariation: {
            rotation: (seededUnitMulti(index, degree, avgScore) - 0.5) * 0.16,
            scale: 0.97 + seededUnitMulti(index, degree, cities.size) * 0.06
        }
    }

    const recent = (appState.recentArrangements as string[]).slice(-4)

    if (appState.trailDepth === 2) {
        personality.type = 'DEEP_DIVE'
        personality.motifOverride = 'rosette'
        personality.compressionMult = 0.84
        personality.cameraDuration = 1100
        personality.cameraArc = 'tight'
        personality.easing = 'easeOutBack'
        personality.staggerMult = 0.8
        return personality
    }

    const countInRecent = (type: string): number => recent.filter((t) => t === type).length

    const candidates = [
        {
            type: 'DENSE_HUB',
            condition: degree >= 8 && Number.isFinite(avgScore) && avgScore >= 0.85,
            cameraDuration: 1240,
            cameraArc: 'wide',
            staggerMult: 1.35,
            compressionMult: 0.82,
            easing: 'easeOutQuint'
        },
        {
            type: 'BRIDGE_NODE',
            condition: degree >= 4 && cities.size >= 2,
            cameraDuration: 1120,
            cameraArc: 'side',
            staggerMult: 1.15,
            motifOverride: 'lattice'
        },
        {
            type: 'EDGE_NODE',
            condition: degree > 0 && degree <= 3,
            cameraDuration: 840,
            staggerMult: 0.8,
            compressionMult: 1.18,
            easing: 'easeOutBack',
            motifOverride: 'delta'
        },
        {
            type: 'TIGHT_CLUSTER',
            condition: avgScore >= 0.92 && Number.isFinite(avgScore),
            cameraDuration: 880,
            easing: 'easeOutQuint',
            compressionMult: 1.08,
            motifOverride: 'civic'
        }
    ]

    for (const cand of candidates) {
        if (!cand.condition) continue
        const count = countInRecent(cand.type)
        if (count >= 3) continue
        const weight = count === 2 ? 0.4 : count === 1 ? 0.15 : 1.0
        if (weight < 1.0) {
            const standardWeight = 0.5 * (1 - weight)
            if (standardWeight > 0 && personality.type === 'STANDARD') {
                continue
            }
        }
        personality.type = cand.type
        personality.cameraDuration = cand.cameraDuration
        personality.cameraArc = cand.cameraArc || 'standard'
        personality.staggerMult = cand.staggerMult ?? 1.0
        personality.compressionMult = cand.compressionMult !== undefined ? cand.compressionMult : 1.0
        personality.easing = cand.easing || 'easeInOutCubic'
        personality.motifOverride = (cand as any).motifOverride || null
        break
    }

    if (Array.isArray(appState.recentArrangements)) {
        ;(appState.recentArrangements as string[]).push(personality.type)
        if ((appState.recentArrangements as string[]).length > 5) (appState.recentArrangements as string[]).shift()
    }

    return personality
}
