/**
 * js/modules/pathfinding.ts
 *
 * Phase 3: Semantic Pathfinding Prototype
 * Finds the shortest semantic path between two arbitrary business nodes.
 * Uses semantic neighbor scores as edge weights.
 */

import { state } from '../state.js';
import { debugWarn } from './diagnostic-adapter.js';
import type { SemanticNeighbor } from '../../types/state';

export function findSemanticPath(startLeadId: string | number, targetLeadId: string | number): string[] | null {
    if (!state.semanticNeighborMapByLeadId || !state.pointIndexByLeadId) {
        debugWarn('[pathfinding] Required data maps not loaded.');
        return null;
    }

    const startIdx = state.pointIndexByLeadId.get(String(startLeadId));
    const targetIdx = state.pointIndexByLeadId.get(String(targetLeadId));

    if (startIdx === undefined || targetIdx === undefined) {
        debugWarn('[pathfinding] Start or target lead ID not found in points list.', { startLeadId, targetLeadId });
        return null;
    }

    const openSet: string[] = [String(startLeadId)];
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    gScore.set(String(startLeadId), 0);

    let iterations = 0;
    const maxIterations = 5000;

    while (openSet.length > 0) {
        iterations++;
        if (iterations > maxIterations) {
            debugWarn('[pathfinding] Max iterations reached.');
            return null;
        }

        openSet.sort((a, b) => (gScore.get(a) || Infinity) - (gScore.get(b) || Infinity));
        const currentId = openSet.shift()!;

        if (currentId === String(targetLeadId)) {
            return reconstructPath(cameFrom, currentId);
        }

        const currentData = state.semanticNeighborMapByLeadId.get(currentId);
        if (!currentData || !currentData.neighbors) continue;

        for (const neighbor of currentData.neighbors) {
            const neighborId = String(neighbor.leadId);
            const edgeWeight = getSemanticEdgeWeight(neighbor);
            const tentativeGScore = (gScore.get(currentId) || 0) + edgeWeight;

            if (tentativeGScore < (gScore.get(neighborId) || Infinity)) {
                cameFrom.set(neighborId, currentId);
                gScore.set(neighborId, tentativeGScore);

                if (!openSet.includes(neighborId)) {
                    openSet.push(neighborId);
                }
            }
        }
    }

    debugWarn('[pathfinding] No path found between', startLeadId, 'and', targetLeadId);
    return null;
}

function getSemanticEdgeWeight(neighbor: SemanticNeighbor): number {
    const rawScore = Number.isFinite(neighbor?.semanticScore)
        ? neighbor.semanticScore
        : (Number.isFinite(neighbor?.score) ? neighbor.score : 0);
    const score = Math.min(1, Math.max(0, rawScore!));
    return Math.max(0.05, 1 - score);
}

function reconstructPath(cameFrom: Map<string, string>, currentId: string): string[] {
    const totalPath: string[] = [currentId];
    while (cameFrom.has(currentId)) {
        currentId = cameFrom.get(currentId)!;
        totalPath.unshift(currentId);
    }
    return totalPath;
}
