import { state, withStateMutation } from '../state.js';
import {
    getCurrentView, getNavState, getPoints, getActiveFilters, getNodePositions,
    getSemanticNeighborMapByLeadId, getPointIndexByLeadId, getFocusedNode
} from '../state/selectors/index.js';
// event-bus import removed — the sole subscriber was a duplicate of journey.js
import { isCompactFocusStageViewport } from './utils/ui-presentation.js';
import { isPointVisible } from './utils/geo-data.js';
import {
    normalizeLeadId,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex
} from './journey-thread-model.js';
import { setTrailNavState } from './navigation-state.js';
import { setFocusPocketMeta } from './focus-pocket.js';
import { isCompactLandscape, isUltraCompactPortrait } from './environment.js';

export function initJourneyNeighborhoodAdapter(deps = {}) {
    if (!initJourneyNeighborhoodAdapter.adapter) {
        initJourneyNeighborhoodAdapter.adapter = {
            isThreadCandidateVisibleOnCanvas: () => true,
            setTrailFromSeed: () => {},
            applyLocalNeighborhoodFocus: () => {}
        };
    }
    const adapter = initJourneyNeighborhoodAdapter.adapter;
    if (typeof deps.isThreadCandidateVisibleOnCanvas === 'function') {
        adapter.isThreadCandidateVisibleOnCanvas = deps.isThreadCandidateVisibleOnCanvas;
    }
    if (typeof deps.setTrailFromSeed === 'function') {
        adapter.setTrailFromSeed = deps.setTrailFromSeed;
    }
    if (typeof deps.applyLocalNeighborhoodFocus === 'function') {
        adapter.applyLocalNeighborhoodFocus = deps.applyLocalNeighborhoodFocus;
    }
}
initJourneyNeighborhoodAdapter.adapter = {
    isThreadCandidateVisibleOnCanvas: () => true,
    setTrailFromSeed: () => {},
    applyLocalNeighborhoodFocus: () => {}
};

function isCondensedFocusStageViewport() {
    return getCurrentView() === 'galaxy' && (isCompactLandscape() || isUltraCompactPortrait());
}

export function getSemanticThreadDisplayLimit() {
    if (isCondensedFocusStageViewport()) return 12;
    if (isCompactFocusStageViewport()) return 12;
    return 18;
}

export function getSemanticPeerThreadDisplayLimit(candidateCount) {
    const peerCount = Math.max(0, (candidateCount || 1) - 1);
    if (isCondensedFocusStageViewport()) return Math.min(7, peerCount);
    if (isCompactFocusStageViewport()) return Math.min(7, peerCount);
    return Math.min(14, peerCount);
}

export function getNeighborhoodRouteIndices() {
    if (!Number.isFinite(getNavState().neighborhoodAnchorIndex)) return [];
    return [
        getNavState().neighborhoodAnchorIndex,
        ...(getNavState().neighborhoodIndices || []).filter((index) => Number.isFinite(index))
    ];
}

export function isBoundedNeighborhoodActive() {
    return (
        getCurrentView() === 'galaxy' &&
        getNavState().neighborhoodSource === 'semantic' &&
        getNeighborhoodRouteIndices().length > 1
    );
}

export function getNeighborhoodCandidateForIndex(index) {
    if (!Number.isFinite(index)) return null;
    const isStoredNeighborhoodMember =
        index === getNavState().neighborhoodAnchorIndex ||
        (getNavState().neighborhoodIndices || []).includes(index);
    const candidate =
        (getNavState().threadCandidates || []).find((item) => item && item.index === index) ||
        (Number.isFinite(getNavState().neighborhoodAnchorIndex)
            ? getSemanticThreadCandidates(getNavState().neighborhoodAnchorIndex).find(
                  (item) => item && item.index === index
              )
            : null);
    if (!candidate && !isStoredNeighborhoodMember) return null;
    return {
        ...(candidate || {}),
        index,
        source: 'semantic',
        reason:
            candidate?.reason ||
            getNavState().neighborhoodReasonByIndex?.get(index) ||
            (index === getNavState().neighborhoodAnchorIndex
                ? 'returned to the neighborhood center'
                : 'semantic neighbor')
    };
}

export function getSemanticNeighborRecordBetween(sourceIndex, targetIndex) {
    if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex >= getPoints().length) return null;
    const sourcePoint = getPoints()[sourceIndex];
    if (!sourcePoint) return null;
    const sourceLeadId = normalizeLeadId(sourcePoint?.lead_id);
    if (!sourceLeadId || !Number.isFinite(targetIndex)) return null;
    const sourceNode = getSemanticNeighborMapByLeadId().get(sourceLeadId);
    if (!sourceNode?.neighbors?.length) return null;
    return (
        sourceNode.neighbors.find((neighbor) => {
            const candidateIndex = getPointIndexByLeadId().get(neighbor.leadId);
            return candidateIndex === targetIndex;
        }) || null
    );
}

export function buildNeighborhoodManifest(anchorIndex, routeIndices, options = {}) {
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= getPoints().length) return null;
    const displayLimit = Number.isFinite(options.displayLimit)
        ? Math.max(0, options.displayLimit)
        : getSemanticThreadDisplayLimit();
    const uniqueRoute = [];
    const seen = new Set([anchorIndex]);
    (routeIndices || []).forEach((candidateIndex) => {
        if (
            !Number.isFinite(candidateIndex) ||
            seen.has(candidateIndex) ||
            candidateIndex === anchorIndex ||
            !isPointVisible(candidateIndex, getPoints(), null, getActiveFilters()) ||
            !getNodePositions()[candidateIndex]
        ) {
            return;
        }
        seen.add(candidateIndex);
        uniqueRoute.push(candidateIndex);
    });

    const candidates = new Map();
    const edges = [];
    const anchorLeadId = normalizeLeadId(getPoints()[anchorIndex]?.lead_id);
    candidates.set(anchorIndex, {
        index: anchorIndex,
        role: 'anchor',
        slotNumber: 0,
        leadId: anchorLeadId,
        anchorThread: { path: [anchorIndex], type: 'anchor', reason: 'neighborhood anchor' },
        peerThreads: [],
        score: 1,
        semanticScore: 1,
        reason: 'neighborhood anchor',
        source: 'semantic'
    });

    const scoredRoute = uniqueRoute
        .map((candidateIndex) => {
            const candidate = getNeighborhoodCandidateForIndex(candidateIndex) || {};
            const anchorRecord = getSemanticNeighborRecordBetween(anchorIndex, candidateIndex);
            const score = Number(
                candidate.semanticScore ||
                    candidate.score ||
                    anchorRecord?.semanticScore ||
                    anchorRecord?.score ||
                    0
            );
            return { candidateIndex, candidate, anchorRecord, score };
        })
        .filter((entry) => entry.anchorRecord)
        .sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex)
        .slice(0, displayLimit);

    scoredRoute.forEach((entry, order) => {
        const { candidateIndex, candidate, anchorRecord, score } = entry;
        if (!Number.isFinite(candidateIndex) || candidateIndex < 0 || candidateIndex >= state.points.length) return;
        const leadId = normalizeLeadId(state.points[candidateIndex]?.lead_id);
        const reason =
            candidate.reason ||
            anchorRecord?.reason ||
            state.navState.neighborhoodReasonByIndex?.get(candidateIndex) ||
            'semantic neighbor';
        candidates.set(candidateIndex, {
            index: candidateIndex,
            role: 'peer',
            slotNumber: order + 1,
            leadId,
            anchorThread: {
                path: [anchorIndex, candidateIndex],
                type: 'direct',
                reason
            },
            peerThreads: [],
            score,
            semanticScore: Number(candidate.semanticScore || anchorRecord?.semanticScore || score || 0),
            sameCity: Boolean(candidate.sameCity || anchorRecord?.sameCity),
            sameStatus: Boolean(candidate.sameStatus || anchorRecord?.sameStatus),
            threadType: candidate.threadType || anchorRecord?.threadType || 'local_semantic_neighbor',
            reason,
            source: 'semantic'
        });
        edges.push({
            a: anchorIndex,
            b: candidateIndex,
            score,
            role: 'anchor-peer',
            reason
        });
    });

    const peerEdges = [];
    for (const [candidateIndex, candidate] of candidates) {
        if (candidate.role !== 'peer') continue;
        const candidateNode = state.semanticNeighborMapByLeadId.get(candidate.leadId);
        if (!candidateNode?.neighbors?.length) continue;
        candidateNode.neighbors.forEach((neighbor) => {
            const peerIndex = state.pointIndexByLeadId.get(neighbor.leadId);
            if (
                !Number.isFinite(peerIndex) ||
                peerIndex === anchorIndex ||
                peerIndex === candidateIndex ||
                !candidates.has(peerIndex)
            ) {
                return;
            }
            const a = Math.min(candidateIndex, peerIndex);
            const b = Math.max(candidateIndex, peerIndex);
            if (peerEdges.some((edge) => edge.a === a && edge.b === b)) return;
            const score = Number(neighbor.semanticScore || neighbor.score || 0);
            peerEdges.push({
                a,
                b,
                score,
                role: 'peer-peer',
                reason: neighbor.reason || 'shared semantic thread'
            });
        });
    }

    const maxPeerEdges = getSemanticPeerThreadDisplayLimit(candidates.size);
    peerEdges.sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
    const displayedPeerEdges = peerEdges.slice(0, maxPeerEdges);
    displayedPeerEdges.forEach((edge) => {
        edges.push(edge);
        const aCandidate = candidates.get(edge.a);
        const bCandidate = candidates.get(edge.b);
        if (aCandidate) {
            aCandidate.peerThreads.push({
                peerIndex: edge.b,
                score: edge.score,
                reason: edge.reason
            });
        }
        if (bCandidate) {
            bCandidate.peerThreads.push({
                peerIndex: edge.a,
                score: edge.score,
                reason: edge.reason
            });
        }
    });

    return {
        anchorIndex,
        displayLimit,
        candidates,
        edges,
        candidateIndices: [...candidates.keys()].filter((candidateIndex) => candidateIndex !== anchorIndex),
        anchorEdgeCount: edges.filter((edge) => edge.role === 'anchor-peer').length,
        peerEdgeCount: displayedPeerEdges.length,
        totalPeerEdgeCandidates: peerEdges.length,
        peerEdgesCulled: Math.max(0, peerEdges.length - displayedPeerEdges.length),
        hairballRisk: displayedPeerEdges.length > candidates.size * 2
    };
}

export function getBoundedNeighborhoodWalkCandidate(step = 1, currentIndex = state.navState.focusedIndex, options = {}) {
    if (!isBoundedNeighborhoodActive()) return null;
    const route = getNeighborhoodRouteIndices();
    if (route.length === 0) return null;
    if (route.length <= 1) return null;
    const currentCursor = route.findIndex((index) => index === currentIndex);
    const fromCursor = currentCursor >= 0 ? currentCursor : state.navState.neighborhoodCursor || 0;
    const direction = step < 0 ? -1 : 1;
    const nextCursor = (fromCursor + direction + route.length) % route.length;
    if (options.commit) withStateMutation(() => { state.navState.neighborhoodCursor = nextCursor; });
    return getNeighborhoodCandidateForIndex(route[nextCursor]);
}

export function getNextWalkCandidateForIndex(currentIndex, options = {}) {
    if (!Number.isFinite(currentIndex)) return null;
    if (options.allowNeighborhood !== false && isBoundedNeighborhoodActive()) {
        return getBoundedNeighborhoodWalkCandidate(1, currentIndex, { commit: !!options.commitNeighborhood });
    }
    const historySet = new Set(state.navState.walkHistoryIndices || []);
    // Sort by quality BEFORE filtering by visibility/canvas so the "next
    // stop" is the highest-quality neighbor in the underlying data, not
    // the highest-quality neighbor in whatever subset is visible on the
    // current viewport. Otherwise the same anchor on desktop vs mobile gets
    // different recommendations.
    const allCandidates = getThreadCandidatesForIndex(currentIndex)
        .filter((candidate) => candidate.index !== currentIndex)
        .sort((a, b) => {
            const as = a.semanticScore || 0;
            const bs = b.semanticScore || 0;
            if (bs !== as) return bs - as;
            const sa = a.score || 0;
            const sb = b.score || 0;
            if (sb !== sa) return sb - sa;
            return a.index - b.index;
        });
    const requireSemantic = options.requireSemantic ?? state.currentView === 'galaxy';
    const requireOnCanvas = options.requireOnCanvas ?? state.currentView === 'galaxy';
    const candidatePool = requireSemantic
        ? allCandidates.filter((candidate) => candidate?.source === 'semantic')
        : allCandidates;
    const visibleCandidatePool = requireOnCanvas
        ? candidatePool
            .filter((candidate) => isPointVisible(candidate.index, getPoints(), null, getActiveFilters()))
            .filter((candidate) => initJourneyNeighborhoodAdapter.adapter.isThreadCandidateVisibleOnCanvas(candidate.index))
        : candidatePool.filter((candidate) => isPointVisible(candidate.index, getPoints(), null, getActiveFilters()));
    const nextCandidate =
        visibleCandidatePool.find((candidate) => !historySet.has(candidate.index)) ||
        visibleCandidatePool[0] ||
        null;
    if (nextCandidate || requireSemantic || requireOnCanvas) return nextCandidate;
    return (
        (state.navState.threadCandidates || []).find(
            (candidate) => candidate && candidate.index !== currentIndex && isPointVisible(candidate.index, state.points, null, state.activeFilters)
        ) || null
    );
}

export function getCurrentTrailFocusIndex() {
    if (state.currentView === 'map') {
        if (state.selectedPoint && state.points) {
            const selectedIndex = state.points.indexOf(state.selectedPoint);
            if (selectedIndex >= 0) return selectedIndex;
        }
        return state.navState.focusedIndex ?? null;
    }
    return getFocusedNode();
}

export function ensureBoundedNeighborhoodFromActivePocket(seedIndex) {
    if (!Number.isFinite(seedIndex)) return;
    if (isBoundedNeighborhoodActive()) {
        if (getNavState().focusPocketMeta?.active && !getNavState().focusPocketMeta.boundedLoop) {
            setFocusPocketMeta({
            ...getNavState().focusPocketMeta,
                boundedLoop: true,
                motifLabel: state.navState.focusPocketMeta.motifLabel || 'selected neighborhood loop'
            });
        }
        if (!state.navState.neighborhoodManifest) {
            withStateMutation(() => {
                state.navState.neighborhoodManifest = buildNeighborhoodManifest(
                    seedIndex,
                    (state.navState.neighborhoodIndices || []).filter(Number.isFinite),
                    { displayLimit: getSemanticThreadDisplayLimit() }
                );
            });
        }
        return;
    }
    if (!state.navState.focusPocketMeta?.active) return;
    const hasSemanticSource =
        state.navState.threadSource === 'semantic' ||
        (state.navState.threadCandidates || []).some((candidate) => candidate?.source === 'semantic') ||
        (state.navState.focusPocketMeta?.motifLabel || '').toLowerCase().includes('semantic');
    if (!hasSemanticSource) return;
    const limit = getSemanticThreadDisplayLimit();
    const threadRoute = (state.navState.threadCandidates || [])
        .filter((candidate) => candidate?.source === 'semantic')
        .map((candidate) => candidate.index);
    const pocketRoute = [...threadRoute, ...(state.navState.focusPocketIndices || [])]
        .filter((candidateIndex) => Number.isFinite(candidateIndex) && candidateIndex !== seedIndex)
        .filter((candidateIndex) => {
            const role = state.navState.focusPocketRoleByIndex?.get(candidateIndex);
            return !role || role === 'primary' || role === 'support';
        })
        .filter((candidateIndex, order, list) => list.indexOf(candidateIndex) === order)
        .slice(0, limit);
    if (!pocketRoute.length) return;
    const manifest = buildNeighborhoodManifest(seedIndex, pocketRoute, { displayLimit: limit });
    if (!manifest?.candidateIndices?.length) return;
    withStateMutation(() => {
        state.navState.neighborhoodAnchorIndex = seedIndex;
        state.navState.neighborhoodIndices = manifest.candidateIndices;
        state.navState.neighborhoodCursor = 0;
        state.navState.neighborhoodReasonByIndex = new Map(
            manifest.candidateIndices.map((candidateIndex) => [
                candidateIndex,
                manifest.candidates?.get(candidateIndex)?.reason ||
                state.navState.threadReasonByIndex?.get(candidateIndex) ||
                    getNeighborhoodCandidateForIndex(candidateIndex)?.reason ||
                    'tied stop in this selected neighborhood'
            ])
        );
        state.navState.neighborhoodSource = 'semantic';
        state.navState.neighborhoodManifest = manifest;
    });
    setFocusPocketMeta({
            ...getNavState().focusPocketMeta,
        boundedLoop: true,
        motifLabel: 'selected neighborhood loop'
    });
}

export function primeBoundedSemanticNeighborhoodForTraversal(seedIndex) {
    if (!Number.isFinite(seedIndex)) return false;
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    if (isBoundedNeighborhoodActive()) return true;

    initJourneyNeighborhoodAdapter.adapter.setTrailFromSeed(seedIndex);
    if (state.navState.threadSource !== 'semantic') return false;
    initJourneyNeighborhoodAdapter.adapter.applyLocalNeighborhoodFocus(seedIndex);
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    return isBoundedNeighborhoodActive();
}

export function setTrailFromSeed(seedIndex) {
    const semanticCandidates = getSemanticThreadCandidates(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    // Sort by quality BEFORE filtering by visibility so the "next stop" is
    // the highest-quality neighbor in the underlying data, not the highest-
    // quality neighbor in whatever subset happens to be visible on the
    // current viewport. Otherwise the same anchor on desktop vs mobile
    // gets different "next stop" recommendations.
    const allCandidates = (semanticCandidates.length ? semanticCandidates : getGeometricThreadCandidates(seedIndex))
        .sort((a, b) => {
            const as = a.semanticScore || 0;
            const bs = b.semanticScore || 0;
            if (bs !== as) return bs - as;
            const sa = a.score || 0;
            const sb = b.score || 0;
            if (sb !== sa) return sb - sa;
            // Final tiebreaker on index so the "next stop" is fully
            // deterministic across loads and viewports, even when upstream
            // neighbor order varies.
            return a.index - b.index;
        });
    const candidates = allCandidates
        .filter((candidate) => isPointVisible(candidate.index, getPoints(), null, getActiveFilters()))
        .slice(0, limit);
    const source = semanticCandidates.length ? 'semantic' : (candidates[0]?.source || 'geometric-fallback');
    const reasonByIndex = new Map(candidates.map((candidate) => [candidate.index, candidate.reason]));
    const neighborIndices = candidates.map((candidate) => candidate.index);
    const cursor = (() => {
        const tc = candidates.findIndex((candidate) => candidate.index === state.navState.focusedIndex);
        return tc >= 0 ? tc : 0;
    })();
    setTrailNavState(seedIndex, { candidates, source, reasonByIndex, neighborIndices, cursor });
}

export function updateTrailIndices(seedIndex = getCurrentTrailFocusIndex()) {
    state.trailIndices.clear();
    if (seedIndex === null || seedIndex === undefined || seedIndex < 0 || seedIndex >= state.points.length) return;
    if (!isPointVisible(seedIndex, state.points, null, state.activeFilters)) return;
    state.trailIndices.add(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    (state.navState.threadCandidates.length ? state.navState.threadCandidates : getThreadCandidatesForIndex(seedIndex).slice(0, limit))
        .filter((candidate) => isPointVisible(candidate.index, getPoints(), null, getActiveFilters()))
        .forEach((candidate) => state.trailIndices.add(candidate.index));
}
