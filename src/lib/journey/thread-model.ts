/**
 * @lib/journey/thread-model.ts — Thread candidate derivation
 *
 * Ported from: js/modules/journey-thread-model.js
 *
 * Pure derivation functions for semantic and geometric thread candidates.
 * No state mutation, no side effects.
 */

import type { BusinessRecord } from '@lib/types/business';
import type { Point3D } from '@lib/types/webgl';
import { normalizeCityForFilter } from '@lib/utils/geo-data';
import { normalizeRelationshipRole, type RelationshipRole, UNCLASSIFIED_RELATIONSHIP_ROLE } from '@lib/utils/relationship-roles';

// Re-export normalizeLeadId from data-mapper or define locally
export function normalizeLeadId(value: string | number | null | undefined): string | null {
	if (value === null || value === undefined || value === '') return null;
	return String(value);
}

/**
 * Try-semantic-then-fallback wrapper over getNextWalkCandidateForIndex.
 * Exists as a pure helper so callers can share the same candidate fallback
 * without importing journey.js and creating lifecycle cycles.
 */
export function getNextExploreCandidateForIndex(
	currentIndex: number | null,
	getNextWalkCandidateFn: (index: number, options: WalkCandidateOptions) => WalkCandidate | null,
	options: WalkCandidateOptions = {}
): WalkCandidate | null {
	if (typeof getNextWalkCandidateFn !== 'function') return null;

	return (
		getNextWalkCandidateFn(currentIndex!, {
			requireSemantic: true,
			requireOnCanvas: true,
			commitNeighborhood: false,
			...options
		}) ||
		getNextWalkCandidateFn(currentIndex!, {
			requireSemantic: false,
			requireOnCanvas: false,
			commitNeighborhood: false,
			...options
		}) ||
		null
	);
}

export interface WalkCandidateOptions {
	requireSemantic?: boolean;
	requireOnCanvas?: boolean;
	commitNeighborhood?: boolean;
}

export interface WalkCandidate {
	index: number;
	score?: number;
	semanticScore?: number;
	sameCity?: boolean;
	sameStatus?: boolean;
	bridgeScore?: number;
	signalScore?: number;
	threadType?: string;
	relationshipRole?: string;
	relationshipAxis?: string;
	roleReason?: string;
	reason?: string;
	source?: string;
}

export interface ThreadCandidate {
	index: number;
	score: number;
	semanticScore: number;
	sameCity: boolean;
	sameStatus: boolean;
	bridgeScore: number;
	signalScore: number;
	threadType: string;
	relationshipRole: RelationshipRole;
	relationshipAxis: string;
	roleReason: string;
	reason: string;
	source: string;
}

/**
 * Build a spatial grid for projected neighbor lookups.
 * Ported from journey-thread-model.js buildSpatialGrid().
 */
export function buildSpatialGrid(
	originalPositions: readonly Point3D[],
	cellSize: number = 0.12
): { grid: Map<string, number[]>; cellSize: number } {
	const grid = new Map<string, number[]>();
	for (let i = 0; i < originalPositions.length; i++) {
		const pos = originalPositions[i];
		if (!pos) continue;
		const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`;
		if (!grid.has(key)) grid.set(key, []);
		grid.get(key)!.push(i);
	}
	return { grid, cellSize };
}

/**
 * Get projected neighbor candidates using spatial grid.
 * Ported from journey-thread-model.js getProjectedNeighborCandidates().
 */
export function getProjectedNeighborCandidates(
	index: number,
	originalPositions: readonly Point3D[],
	points: readonly BusinessRecord[],
	signalScores: readonly number[],
	bridgeScores: readonly number[],
	projectedNeighborGrid: { grid: Map<string, number[]>; cellSize: number },
	projectedNeighborCache: Map<number, number[]>
): number[] {
	if (projectedNeighborCache.has(index)) {
		return projectedNeighborCache.get(index)!;
	}

	const { grid, cellSize } = projectedNeighborGrid;
	const origin = originalPositions[index];
	if (!origin) return [];
	if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return [];

	const gx = Math.floor(origin.x / cellSize);
	const gy = Math.floor(origin.y / cellSize);
	const gz = Math.floor(origin.z / cellSize);
	const candidates: Array<{ index: number; score: number; dist: number }> = [];
	const seen = new Set<number>();

	for (let dx = -2; dx <= 2; dx++) {
		for (let dy = -2; dy <= 2; dy++) {
			for (let dz = -2; dz <= 2; dz++) {
				const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
				if (!bucket) continue;
				for (const otherIndex of bucket) {
					if (otherIndex === index || seen.has(otherIndex)) continue;
					if (!Number.isFinite(otherIndex) || otherIndex < 0 || otherIndex >= points.length) continue;
					const pos = originalPositions[otherIndex];
					if (!pos) continue;
					const ox = pos.x, oy = pos.y, oz = pos.z;
					if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) continue;
					const dist = Math.hypot(ox - origin.x, oy - origin.y, oz - origin.z);
					if (!Number.isFinite(dist)) continue;
					const selfCity = points[index]?.city ?? '';
					const otherCity = points[otherIndex]?.city ?? '';
					let score = 1 / Math.max(dist, 0.0001);
					if (normalizeCityForFilter(otherCity) === normalizeCityForFilter(selfCity)) score += 0.9;
score += (Number.isFinite(signalScores[otherIndex]) ? (signalScores[otherIndex] as number) : 0) * 0.12;
				score += (Number.isFinite(bridgeScores[otherIndex]) ? (bridgeScores[otherIndex] as number) : 0) * 0.08;
					const selfCluster = points[index]?.cluster;
					const otherCluster = points[otherIndex]?.cluster;
					if (otherCluster === selfCluster && Number.isFinite(selfCluster)) score += 0.45;

					candidates.push({ index: otherIndex, score, dist });
				}
			}
		}
	}

	const ranked = candidates
		.sort((a, b) => b.score - a.score || a.dist - b.dist)
		.slice(0, 24)
		.map((entry) => entry.index);

	projectedNeighborCache.set(index, ranked);
	return ranked;
}

/**
 * Get semantic thread candidates from the semantic neighbor map.
 * Ported from journey-thread-model.js getSemanticThreadCandidates().
 */
export function getSemanticThreadCandidates(
	index: number,
	points: readonly BusinessRecord[],
	semanticNeighborMapByLeadId: Map<string, { neighbors: Array<{
		leadId: string;
		score?: number;
		semanticScore?: number;
		sameCity?: boolean;
		sameStatus?: boolean;
		bridgeScore?: number;
		signalScore?: number;
		threadType?: string;
		relationshipRole?: string;
		relationshipAxis?: string;
		roleReason?: string;
		reason?: string;
	}> }>,
	pointIndexByLeadId: Map<string, number>
): ThreadCandidate[] {
	if (!Number.isFinite(index) || index < 0 || index >= points.length) return [];
	const point = points[index];
	const leadId = normalizeLeadId(point?.lead_id);
	if (!leadId) return [];

	const threadNode = semanticNeighborMapByLeadId.get(leadId);
	if (!threadNode?.neighbors?.length) return [];

	const results: ThreadCandidate[] = [];
	for (const neighbor of threadNode.neighbors) {
		const candidateIndex = pointIndexByLeadId.get(neighbor.leadId);
		if (candidateIndex === undefined || candidateIndex === index) continue;

		const n = neighbor;
		const score = Number.isFinite(n.score) ? n.score! : 0;
		const semanticScore = Number.isFinite(n.semanticScore) ? n.semanticScore! : 0;
		const bridgeScore = Number.isFinite(n.bridgeScore) ? n.bridgeScore! : 0;
		const signalScore = Number.isFinite(n.signalScore) ? n.signalScore! : 0;

		results.push({
			index: candidateIndex,
			score,
			semanticScore,
			sameCity: Boolean(n.sameCity),
			sameStatus: Boolean(n.sameStatus),
			bridgeScore,
			signalScore,
			threadType: n.threadType ?? 'local_semantic_neighbor',
			relationshipRole: normalizeRelationshipRole(n.relationshipRole),
			relationshipAxis: n.relationshipAxis ?? '',
			roleReason: n.roleReason ?? '',
			reason: n.reason ?? 'semantic neighbor',
			source: 'semantic'
		});
	}
	return results;
}

/**
 * Get geometric thread candidates as fallback.
 * Ported from journey-thread-model.js getGeometricThreadCandidates().
 */
export function getGeometricThreadCandidates(
	index: number,
	points: readonly BusinessRecord[],
	getProjectedNeighborCandidatesFn: (index: number) => number[],
	signalScores: readonly number[],
	bridgeScores: readonly number[]
): ThreadCandidate[] {
	if (!Number.isFinite(index) || index < 0 || index >= points.length) return [];
	const selfCity = normalizeCityForFilter(points[index]?.city);
	const selfStatus = points[index]?.status ?? 'active';
	return getProjectedNeighborCandidatesFn(index).map((candidateIndex): ThreadCandidate => ({
		index: candidateIndex,
		score: 0,
		semanticScore: 0,
		sameCity: normalizeCityForFilter(points[candidateIndex]?.city) === selfCity,
		sameStatus: (points[candidateIndex]?.status ?? 'active') === selfStatus,
		bridgeScore: bridgeScores[candidateIndex] ?? 0,
		signalScore: signalScores[candidateIndex] ?? 0,
		threadType: 'approximate_projected_neighbor',
		relationshipRole: UNCLASSIFIED_RELATIONSHIP_ROLE,
		relationshipAxis: '',
		roleReason: '',
		reason: 'approximate projected neighbor from the current cloud layout',
		source: 'geometric-fallback'
	}));
}

/**
 * Get thread candidates for index — semantic first, then geometric fallback.
 * Ported from journey-thread-model.js getThreadCandidatesForIndex().
 */
export function getThreadCandidatesForIndex(
	index: number,
	getSemanticThreadCandidatesFn: (index: number) => ThreadCandidate[],
	getGeometricThreadCandidatesFn: (index: number) => ThreadCandidate[]
): ThreadCandidate[] {
	const semanticCandidates = getSemanticThreadCandidatesFn(index);
	if (semanticCandidates.length) return semanticCandidates;
	return getGeometricThreadCandidatesFn(index);
}