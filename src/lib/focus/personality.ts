import { normalizeCityForFilter } from '@lib/utils/geo-data';
import {
  getBusinessRecords,
  getPointIndexByLeadId,
  getSemanticNeighborMap,
} from '@lib/data-store';
import { getSemanticThreadCandidates } from '@lib/journey/thread-model';
import { FOCUS_CONSTELLATION_MOTIFS } from '@lib/stores/focus';
import { trailDepth } from '@lib/stores/journey';

import type { ConstellationMotif } from '@lib/stores/focus';
import type { ThreadCandidate } from '@lib/journey/thread-model';

export interface MicroVariation {
  rotation: number;
  scale: number;
}

export type PersonalityType =
  | 'STANDARD'
  | 'DEEP_DIVE'
  | 'DENSE_HUB'
  | 'BRIDGE_NODE'
  | 'EDGE_NODE'
  | 'TIGHT_CLUSTER';

export type CameraArc = 'standard' | 'wide' | 'side' | 'tight';
export type EasingName = 'easeInOutCubic' | 'easeOutQuint' | 'easeOutBack';

export interface FocusPersonality {
  [key: string]: unknown;
  type: PersonalityType;
  motifOverride: string | null;
  cameraDuration: number;
  cameraArc: CameraArc;
  staggerMult: number;
  compressionMult: number;
  easing: EasingName;
  microVariation: MicroVariation;
}

/** Multi-arg seeded hash matching the JS focus-pocket-geometry implementation. */
function seededUnitMulti(...values: number[]): number {
  const seed = values.reduce((sum, value, index) => sum + (Number(value) || 0) * (index + 1) * 12.9898, 78.233);
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

/** Bridge accessor for state.recentArrangements — not yet in a store. */
function getRecentArrangements(): string[] {
  const semanticState = (globalThis as unknown as { __semanticState?: { recentArrangements?: string[] } }).__semanticState;
  return semanticState?.recentArrangements ?? [];
}

function pushRecentArrangement(type: string): void {
  const semanticState = (globalThis as unknown as { __semanticState?: { recentArrangements?: string[] } }).__semanticState;
  if (!semanticState) return;
  if (!Array.isArray(semanticState.recentArrangements)) {
    semanticState.recentArrangements = [];
  }
  semanticState.recentArrangements.push(type);
  if (semanticState.recentArrangements.length > 5) {
    semanticState.recentArrangements.shift();
  }
}

export function getSemanticCandidateSlice(index: number, limit = 8): ThreadCandidate[] {
  return getSemanticThreadCandidates(
    index,
    getBusinessRecords(),
    getSemanticNeighborMap(),
    getPointIndexByLeadId(),
  ).slice(0, limit);
}

export function getNeighborhoodPersonality(
  index: number,
  primaryCandidates: Array<{ index: number; semanticScore?: number; score?: number }> = getSemanticCandidateSlice(index, 8),
  _viewportProfile: { primaryLimit: number } = { primaryLimit: 8 },
): FocusPersonality {
  const degree = primaryCandidates.length;

  const rawAvgScore =
    primaryCandidates.reduce((sum, c) => {
      const semanticScore = Number(c.semanticScore);
      const score = Number(c.score);
      const s = Number.isFinite(semanticScore) ? semanticScore : Number.isFinite(score) ? score : 0;
      return sum + s;
    }, 0) / (degree || 1);
  const avgScore = Number.isFinite(rawAvgScore) ? rawAvgScore : 0;

  const semanticState = (globalThis as unknown as { __semanticState?: { points?: Array<Record<string, unknown> | undefined> } }).__semanticState;
  const points = semanticState?.points;
  const cities = new Set(
    primaryCandidates.map((c) => {
      const city = points?.[c.index]?.city;
      return normalizeCityForFilter(city as string | undefined);
    }),
  );

  const personality: FocusPersonality = {
    type: 'STANDARD',
    motifOverride: null,
    cameraDuration: 980,
    cameraArc: 'standard',
    staggerMult: 1.0,
    compressionMult: 1.0,
    easing: 'easeInOutCubic',
    microVariation: {
      rotation: (seededUnitMulti(index, degree, avgScore) - 0.5) * 0.16,
      scale: 0.97 + seededUnitMulti(index, degree, cities.size) * 0.06,
    },
  };

  const recent = getRecentArrangements().slice(-4);
  const currentTrailDepth = trailDepth();

  if (currentTrailDepth === 2) {
    personality.type = 'DEEP_DIVE';
    personality.motifOverride = 'rosette';
    personality.compressionMult = 0.84;
    personality.cameraDuration = 1100;
    personality.cameraArc = 'tight';
    personality.easing = 'easeOutBack';
    personality.staggerMult = 0.8;
    return personality;
  }

  const countInRecent = (type: string) => recent.filter((t) => t === type).length;

  const candidates: Array<{
    type: PersonalityType;
    condition: boolean;
    cameraDuration: number;
    cameraArc: CameraArc;
    staggerMult: number;
    compressionMult: number;
    easing: EasingName;
    motifOverride: string | null;
  }> = [
    {
      type: 'DENSE_HUB',
      condition: degree >= 8 && Number.isFinite(avgScore) && avgScore >= 0.85,
      cameraDuration: 1240,
      cameraArc: 'wide',
      staggerMult: 1.35,
      compressionMult: 0.82,
      easing: 'easeOutQuint',
      motifOverride: null,
    },
    {
      type: 'BRIDGE_NODE',
      condition: degree >= 4 && cities.size >= 2,
      cameraDuration: 1120,
      cameraArc: 'side',
      staggerMult: 1.15,
      compressionMult: 1.0,
      easing: 'easeInOutCubic',
      motifOverride: 'lattice',
    },
    {
      type: 'EDGE_NODE',
      condition: degree > 0 && degree <= 3,
      cameraDuration: 840,
      cameraArc: 'standard',
      staggerMult: 0.8,
      compressionMult: 1.18,
      easing: 'easeOutBack',
      motifOverride: 'delta',
    },
    {
      type: 'TIGHT_CLUSTER',
      condition: avgScore >= 0.92 && Number.isFinite(avgScore),
      cameraDuration: 880,
      cameraArc: 'standard',
      staggerMult: 1.0,
      compressionMult: 1.08,
      easing: 'easeOutQuint',
      motifOverride: 'civic',
    },
  ];

  for (const cand of candidates) {
    if (!cand.condition) continue;
    const count = countInRecent(cand.type);
    if (count >= 3) continue;

    const weight = count === 2 ? 0.4 : count === 1 ? 0.15 : 1.0;
    if (weight < 1.0) {
      const standardWeight = 0.5 * (1 - weight);
      if (standardWeight > 0 && personality.type === 'STANDARD') {
        continue;
      }
    }

    personality.type = cand.type;
    personality.cameraDuration = cand.cameraDuration;
    personality.cameraArc = cand.cameraArc;
    personality.staggerMult = cand.staggerMult;
    personality.compressionMult = cand.compressionMult;
    personality.easing = cand.easing;
    personality.motifOverride = cand.motifOverride;
    break;
  }

  pushRecentArrangement(personality.type);
  return personality;
}
