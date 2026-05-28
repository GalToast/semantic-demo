import { state } from '../state.js';

/**
 * Phase 3: Semantic Pathfinding Prototype
 * Finds the shortest semantic path between two arbitrary business nodes.
 * Uses semantic neighbor scores as edge weights.
 */

export function findSemanticPath(startLeadId, targetLeadId) {
    if (!state.semanticNeighborMapByLeadId || !state.pointIndexByLeadId) {
        console.warn('[pathfinding] Required data maps not loaded.');
        return null;
    }

    const startIdx = state.pointIndexByLeadId.get(String(startLeadId));
    const targetIdx = state.pointIndexByLeadId.get(String(targetLeadId));

    if (startIdx === undefined || targetIdx === undefined) {
        console.warn('[pathfinding] Start or target lead ID not found in points list.', { startLeadId, targetLeadId });
        return null;
    }

    const openSet = [String(startLeadId)];
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(String(startLeadId), 0);

    let iterations = 0;
    const maxIterations = 5000; // Guard against infinite loops or too deep searches

    while (openSet.length > 0) {
        iterations++;
        if (iterations > maxIterations) {
            console.warn('[pathfinding] Max iterations reached.');
            return null;
        }

        // Dijkstra: get open node with lowest known semantic path cost.
        openSet.sort((a, b) => (gScore.get(a) || Infinity) - (gScore.get(b) || Infinity));
        const currentId = openSet.shift();

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

    console.warn('[pathfinding] No path found between', startLeadId, 'and', targetLeadId);
    return null;
}

function getSemanticEdgeWeight(neighbor) {
    const rawScore = Number.isFinite(neighbor?.semanticScore)
        ? neighbor.semanticScore
        : (Number.isFinite(neighbor?.score) ? neighbor.score : 0);
    const score = Math.min(1, Math.max(0, rawScore));
    return Math.max(0.05, 1 - score);
}

function reconstructPath(cameFrom, currentId) {
    const totalPath = [currentId];
    while (cameFrom.has(currentId)) {
        currentId = cameFrom.get(currentId);
        totalPath.unshift(currentId);
    }
    return totalPath;
}
