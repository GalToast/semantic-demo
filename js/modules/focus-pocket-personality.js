import { state } from '../state.js';
import { normalizeCityForFilter } from './utils/geo-data.js';
import { getSemanticThreadCandidates } from './thread-inspector.js';
import { getFocusConstellationViewportProfile, seededUnit } from './focus-pocket-geometry.js';

export function getSemanticCandidateSlice(index, limit = 8) {
    return getSemanticThreadCandidates(index).slice(0, limit);
}

export function getNeighborhoodPersonality(index) {
    const viewportProfile = getFocusConstellationViewportProfile();
    const primaryCandidates = getSemanticCandidateSlice(index, viewportProfile.primaryLimit);
    const degree = primaryCandidates.length;
    const rawAvgScore = primaryCandidates.reduce((sum, c) => sum + (Number.isFinite(c.semanticScore) ? c.semanticScore : (Number.isFinite(c.score) ? c.score : 0)), 0) / (degree || 1);
    const avgScore = Number.isFinite(rawAvgScore) ? rawAvgScore : 0;

    const cities = new Set(primaryCandidates.map((c) => normalizeCityForFilter(state.points[c.index]?.city)));

    let personality = {
        type: 'STANDARD',
        motifOverride: null,
        cameraDuration: 980,
        cameraArc: 'standard',
        staggerMult: 1.0,
        compressionMult: 1.0,
        easing: 'easeInOutCubic',
        microVariation: {
            rotation: (seededUnit(index, degree, avgScore) - 0.5) * 0.16,
            scale: 0.97 + seededUnit(index, degree, cities.size) * 0.06
        }
    };

    const recent = state.recentArrangements.slice(-4);

    if (state.trailDepth === 2) {
        personality.type = 'DEEP_DIVE';
        personality.motifOverride = 'rosette';
        personality.compressionMult = 0.84;
        personality.cameraDuration = 1100;
        personality.cameraArc = 'tight';
        personality.easing = 'easeOutBack';
        personality.staggerMult = 0.8;
        return personality;
    }

    const countInRecent = (type) => recent.filter((t) => t === type).length;

    const candidates = [
        {
            type: 'DENSE_HUB',
            condition: degree >= 8 && Number.isFinite(avgScore) && avgScore >= 0.85,
            cameraDuration: 1240,
            cameraArc: 'wide',
            staggerMult: 1.35,
            compressionMult: 0.82,
            easing: 'easeOutQuint',
        },
        {
            type: 'BRIDGE_NODE',
            condition: degree >= 4 && cities.size >= 2,
            cameraDuration: 1120,
            cameraArc: 'side',
            staggerMult: 1.15,
            motifOverride: 'lattice',
        },
        {
            type: 'EDGE_NODE',
            condition: degree > 0 && degree <= 3,
            cameraDuration: 840,
            staggerMult: 0.8,
            compressionMult: 1.18,
            easing: 'easeOutBack',
            motifOverride: 'delta',
        },
        {
            type: 'TIGHT_CLUSTER',
            condition: avgScore >= 0.92 && Number.isFinite(avgScore),
            cameraDuration: 880,
            easing: 'easeOutQuint',
            compressionMult: 1.08,
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
        personality.cameraArc = cand.cameraArc || 'standard';
        personality.staggerMult = cand.staggerMult;
        personality.compressionMult = cand.compressionMult !== undefined ? cand.compressionMult : 1.0;
        personality.easing = cand.easing || 'easeInOutCubic';
        personality.motifOverride = cand.motifOverride || null;
        break;
    }

    if (Array.isArray(state.recentArrangements)) {
        state.recentArrangements.push(personality.type);
        if (state.recentArrangements.length > 5) state.recentArrangements.shift();
    }

    return personality;
}
