/**
 * journey-neighborhood.ts
 *
 * TypeScript shadow of journey-neighborhood.js
 * Neighborhood manifest, bounded walk candidates, trail seed, and route index derivation.
 */

import { state, withStateMutation } from '@lib/engine/state-bridge';

import { isCompactFocusStageViewport } from './utils/ui-presentation.ts';
import { isPointVisible } from './utils/geo-data.ts';
import {
    normalizeLeadId,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex,
    type ThreadCandidate
} from './journey-thread-model.ts';
import { setTrailNavState } from './navigation-state.ts';
import { setFocusPocketMeta } from '@lib/journey/focus-pocket';
import { isCompactLandscape, isUltraCompactPortrait } from './environment.ts';
import { appState } from '@lib/state/app.svelte';

// Boundary cast: neighborhood-specific nav fields are not in the typed NavState
// interface yet. These accessors narrow the cast to a readable shape.
function navNeighborhood(): any {
    return appState.navState as any;
}

function toIndexSet(value: unknown): Set<number> {
    if (!value) return new Set();
    const values = Array.isArray(value)
        ? value
        : value instanceof Set
            ? [...value]
            : typeof (value as any)?.[Symbol.iterator] === 'function'
                ? [...(value as Iterable<unknown>)]
                : typeof value === 'object'
                    ? Object.values(value as Record<string, unknown>)
                    : [];
    return new Set(values.filter((index): index is number => Number.isFinite(index)));
}

interface NeighborhoodAdapter {
    isThreadCandidateVisibleOnCanvas: (index: number) => boolean;
    setTrailFromSeed: (seedIndex: number) => void;
    applyLocalNeighborhoodFocus: (seedIndex: number) => void;
}

export function initJourneyNeighborhoodAdapter(deps: Partial<NeighborhoodAdapter> = {}): void {
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
} as NeighborhoodAdapter;

function isCondensedFocusStageViewport(): boolean {
    return appState.currentView === 'galaxy' && (isCompactLandscape() || isUltraCompactPortrait());
}

export function getSemanticThreadDisplayLimit(): number {
    if (isCondensedFocusStageViewport()) return 12;
    if (isCompactFocusStageViewport()) return 12;
    return 18;
}

export function getSemanticPeerThreadDisplayLimit(candidateCount: number): number {
    const peerCount = Math.max(0, (candidateCount || 1) - 1);
    if (isCondensedFocusStageViewport()) return Math.min(7, peerCount);
    if (isCompactFocusStageViewport()) return Math.min(7, peerCount);
    return Math.min(14, peerCount);
}

export function getNeighborhoodRouteIndices(): number[] {
    if (!Number.isFinite(navNeighborhood().neighborhoodAnchorIndex)) return [];
    return [
        navNeighborhood().neighborhoodAnchorIndex,
        ...(navNeighborhood().neighborhoodIndices || []).filter((index: any) => Number.isFinite(index))
    ];
}

export function isBoundedNeighborhoodActive(): boolean {
    return (
        appState.currentView === 'galaxy' &&
        navNeighborhood().neighborhoodSource === 'semantic' &&
        getNeighborhoodRouteIndices().length > 1
    );
}

export function getNeighborhoodCandidateForIndex(index: number): ThreadCandidate | null {
    if (!Number.isFinite(index)) return null;
    const isStoredNeighborhoodMember: boolean =
        index === navNeighborhood().neighborhoodAnchorIndex ||
        (navNeighborhood().neighborhoodIndices || []).includes(index);
    const candidate: ThreadCandidate | undefined =
        (navNeighborhood().threadCandidates || []).find((item: any) => item && item.index === index) ||
        (Number.isFinite(navNeighborhood().neighborhoodAnchorIndex)
            ? getSemanticThreadCandidates(navNeighborhood().neighborhoodAnchorIndex).find(
                  (item: any) => item && item.index === index
              )
            : undefined);
    if (!candidate && !isStoredNeighborhoodMember) return null;
    return {
        ...(candidate || {}),
        index,
        source: 'semantic',
        score: (candidate as any)?.score ?? 0,
        semanticScore: (candidate as any)?.semanticScore ?? 0,
        reason:
            candidate?.reason ||
            navNeighborhood().neighborhoodReasonByIndex?.get(index) ||
            (index === navNeighborhood().neighborhoodAnchorIndex
                ? 'returned to the neighborhood center'
                : 'semantic neighbor')
    } as ThreadCandidate;
}

export function getSemanticNeighborRecordBetween(sourceIndex: number, targetIndex: number): any {
    if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex >= (appState.points?.length ?? 0)) return null;
    const points = appState.points!;
    const sourcePoint = points[sourceIndex];
    if (!sourcePoint) return null;
    const sourceLeadId = normalizeLeadId((sourcePoint as any).lead_id);
    if (!sourceLeadId || !Number.isFinite(targetIndex)) return null;
    const sourceNode = appState.semanticNeighborMapByLeadId.get(sourceLeadId);
    if (!sourceNode?.neighbors?.length) return null;
    return (
        sourceNode.neighbors.find((neighbor: any) => {
            const candidateIndex = appState.pointIndexByLeadId.get(neighbor.leadId);
            return candidateIndex === targetIndex;
        }) || null
    );
}

interface NeighborhoodManifestCandidate {
    index: number;
    role: string;
    slotNumber: number;
    leadId: string | null;
    anchorThread: { path: number[]; type: string; reason: string };
    peerThreads: Array<{ peerIndex: number; score: number; reason: string }>;
    score: number;
    semanticScore: number;
    reason: string;
    source: string;
    sameCity?: boolean;
    sameStatus?: boolean;
    threadType?: string;
}

interface NeighborhoodManifest {
    anchorIndex: number;
    displayLimit: number;
    candidates: Map<number, NeighborhoodManifestCandidate>;
    edges: Array<{ a: number; b: number; score: number; role: string; reason: string }>;
    candidateIndices: number[];
    anchorEdgeCount: number;
    peerEdgeCount: number;
    totalPeerEdgeCandidates: number;
    peerEdgesCulled: number;
    hairballRisk: boolean;
}

export function buildNeighborhoodManifest(anchorIndex: number, routeIndices: number[], options: { displayLimit?: number } = {}): NeighborhoodManifest | null {
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= (appState.points?.length ?? 0)) return null;
    const displayLimit: number = Number.isFinite(options.displayLimit)
        ? Math.max(0, options.displayLimit!)
        : getSemanticThreadDisplayLimit();
    const uniqueRoute: number[] = [];
    const seen = new Set<number>([anchorIndex]);
    (routeIndices || []).forEach((candidateIndex: number) => {
        if (
            !Number.isFinite(candidateIndex) ||
            seen.has(candidateIndex) ||
            candidateIndex === anchorIndex ||
            !isPointVisible(candidateIndex, appState.points!, null, appState.activeFilters) ||
            !(appState.nodePositions as any)[candidateIndex]
        ) {
            return;
        }
        seen.add(candidateIndex);
        uniqueRoute.push(candidateIndex);
    });

    const candidates = new Map<number, NeighborhoodManifestCandidate>();
    const edges: Array<{ a: number; b: number; score: number; role: string; reason: string }> = [];
    const anchorLeadId = normalizeLeadId((appState.points![anchorIndex] as any)?.lead_id);
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
        .map((candidateIndex: number) => {
            const candidate = getNeighborhoodCandidateForIndex(candidateIndex) || ({} as ThreadCandidate);
            const anchorRecord = getSemanticNeighborRecordBetween(anchorIndex, candidateIndex);
            const score = Number(
                (candidate as any).semanticScore ||
                    (candidate as any).score ||
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
        if (!Number.isFinite(candidateIndex) || candidateIndex < 0 || candidateIndex >= (state.points as any).length) return;
        const leadId = normalizeLeadId((state.points[candidateIndex] as any)?.lead_id);
        const reason =
            (candidate as any).reason ||
            anchorRecord?.reason ||
            navNeighborhood().neighborhoodReasonByIndex?.get(candidateIndex) ||
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
            semanticScore: Number((candidate as any).semanticScore || anchorRecord?.semanticScore || score || 0),
            sameCity: Boolean((candidate as any).sameCity || anchorRecord?.sameCity),
            sameStatus: Boolean((candidate as any).sameStatus || anchorRecord?.sameStatus),
            threadType: (candidate as any).threadType || anchorRecord?.threadType || 'local_semantic_neighbor',
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

    const peerEdges: Array<{ a: number; b: number; score: number; role: string; reason: string }> = [];
    for (const [candidateIndex, candidate] of candidates) {
        if (candidate.role !== 'peer') continue;
        const candidateNode = (state.semanticNeighborMapByLeadId as Map<string, any>).get(candidate.leadId!);
        if (!candidateNode?.neighbors?.length) continue;
        candidateNode.neighbors.forEach((neighbor: any) => {
            const peerIndex = (state.pointIndexByLeadId as Map<string | number, number>).get(neighbor.leadId);
            if (
                !Number.isFinite(peerIndex) ||
                peerIndex === anchorIndex ||
                peerIndex === candidateIndex ||
                !candidates.has(peerIndex!)
            ) {
                return;
            }
            const a = Math.min(candidateIndex, peerIndex!);
            const b = Math.max(candidateIndex, peerIndex!);
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

export function getBoundedNeighborhoodWalkCandidate(step: number = 1, currentIndex: number = (appState.navState as any).focusedIndex, options: { commit?: boolean } = {}): ThreadCandidate | null {
    if (!isBoundedNeighborhoodActive()) return null;
    const route = getNeighborhoodRouteIndices();
    if (route.length === 0) return null;
    if (route.length <= 1) return null;
    const currentCursor = route.findIndex((index: number) => index === currentIndex);
    const fromCursor = currentCursor >= 0 ? currentCursor : navNeighborhood().neighborhoodCursor || 0;
    const direction = step < 0 ? -1 : 1;
    const nextCursor = (fromCursor + direction + route.length) % route.length;
    if (options.commit) {
        withStateMutation(() => {
            navNeighborhood().neighborhoodCursor = nextCursor;
        });
    }
    return getNeighborhoodCandidateForIndex(route[nextCursor]!);
}

export function getNextWalkCandidateForIndex(currentIndex: number, options: { allowNeighborhood?: boolean; commitNeighborhood?: boolean; requireSemantic?: boolean; requireOnCanvas?: boolean } = {}): ThreadCandidate | null {
    if (!Number.isFinite(currentIndex)) return null;
    if (options.allowNeighborhood !== false && isBoundedNeighborhoodActive()) {
        return getBoundedNeighborhoodWalkCandidate(1, currentIndex, { commit: !!options.commitNeighborhood });
    }
    const historySet = toIndexSet((state.navState as any).walkHistoryIndices);
    const allCandidates = getThreadCandidatesForIndex(currentIndex)
        .filter((candidate: ThreadCandidate) => candidate.index !== currentIndex)
        .sort((a: ThreadCandidate, b: ThreadCandidate) => {
            const as = (a as any).semanticScore || 0;
            const bs = (b as any).semanticScore || 0;
            if (bs !== as) return bs - as;
            const sa = a.score || 0;
            const sb = b.score || 0;
            if (sb !== sa) return sb - sa;
            return a.index - b.index;
        });
    const requireSemantic: boolean = options.requireSemantic ?? state.currentView === 'galaxy';
    const requireOnCanvas: boolean = options.requireOnCanvas ?? state.currentView === 'galaxy';
    const candidatePool = requireSemantic
        ? allCandidates.filter((candidate: ThreadCandidate) => (candidate as any)?.source === 'semantic')
        : allCandidates;
    const visibleCandidatePool = requireOnCanvas
        ? candidatePool
            .filter((candidate: ThreadCandidate) => isPointVisible(candidate.index, appState.points!, null, appState.activeFilters))
            .filter((candidate: ThreadCandidate) => initJourneyNeighborhoodAdapter.adapter.isThreadCandidateVisibleOnCanvas(candidate.index))
        : candidatePool.filter((candidate: ThreadCandidate) => isPointVisible(candidate.index, appState.points!, null, appState.activeFilters));
    const nextCandidate =
        visibleCandidatePool.find((candidate: ThreadCandidate) => !historySet.has(candidate.index)) ||
        visibleCandidatePool[0] ||
        null;
    if (nextCandidate || requireSemantic || requireOnCanvas) return nextCandidate;
    return (
        ((state.navState as any).threadCandidates || []).find(
            (candidate: any) => candidate && candidate.index !== currentIndex && isPointVisible(candidate.index, state.points, null, state.activeFilters)
        ) || null
    );
}

export function getCurrentTrailFocusIndex(): number | null {
    if (state.currentView === 'map') {
        if (state.selectedPoint && state.points) {
            const selectedIndex = state.points.indexOf(state.selectedPoint);
            if (selectedIndex >= 0) return selectedIndex;
        }
        return (state.navState as any).focusedIndex ?? null;
    }
    return appState.focusedNode;
}

export function ensureBoundedNeighborhoodFromActivePocket(seedIndex: number): void {
    if (!Number.isFinite(seedIndex)) return;
    if (isBoundedNeighborhoodActive()) {
        if (appState.navState?.focusPocketMeta && !(appState.navState!.focusPocketMeta as any).boundedLoop) {
            setFocusPocketMeta({
            ...(appState.navState!.focusPocketMeta as any),
                boundedLoop: true,
                motifLabel: navNeighborhood().focusPocketMeta?.motifLabel || 'selected neighborhood loop'
            });
        }
        if (!navNeighborhood().neighborhoodManifest) {
            navNeighborhood().neighborhoodManifest = buildNeighborhoodManifest(
                seedIndex,
                (navNeighborhood().neighborhoodIndices || []).filter(Number.isFinite),
                { displayLimit: getSemanticThreadDisplayLimit() }
            );
        }
        return;
    }
    if (!(navNeighborhood().focusPocketMeta as any)?.active) return;
    const hasSemanticSource =
        (state.navState as any).threadSource === 'semantic' ||
        ((state.navState as any).threadCandidates || []).some((candidate: any) => (candidate as any)?.source === 'semantic') ||
        ((navNeighborhood().focusPocketMeta as any)?.motifLabel || '').toLowerCase().includes('semantic');
    if (!hasSemanticSource) return;
    const limit = getSemanticThreadDisplayLimit();
    const threadRoute = ((state.navState as any).threadCandidates || [])
        .filter((candidate: any) => (candidate as any)?.source === 'semantic')
        .map((candidate: any) => candidate.index);
    const pocketRoute = [...threadRoute, ...(navNeighborhood().focusPocketIndices || [])]
        .filter((candidateIndex: number) => Number.isFinite(candidateIndex) && candidateIndex !== seedIndex)
        .filter((candidateIndex: number) => {
            const role = navNeighborhood().focusPocketRoleByIndex?.get(candidateIndex);
            return !role || role === 'primary' || role === 'support';
        })
        .filter((candidateIndex: number, order: number, list: number[]) => list.indexOf(candidateIndex) === order)
        .slice(0, limit);
    if (!pocketRoute.length) return;
    const manifest = buildNeighborhoodManifest(seedIndex, pocketRoute, { displayLimit: limit });
    if (!manifest?.candidateIndices?.length) return;
    withStateMutation(() => {
        navNeighborhood().neighborhoodAnchorIndex = seedIndex;
        navNeighborhood().neighborhoodIndices = manifest.candidateIndices;
        navNeighborhood().neighborhoodCursor = 0;
        navNeighborhood().neighborhoodReasonByIndex = new Map(
            manifest.candidateIndices.map((candidateIndex: number) => [
                candidateIndex,
                manifest.candidates?.get(candidateIndex)?.reason ||
                navNeighborhood().threadReasonByIndex?.get(candidateIndex) ||
                    getNeighborhoodCandidateForIndex(candidateIndex)?.reason ||
                    'tied stop in this selected neighborhood'
            ])
        );
        navNeighborhood().neighborhoodSource = 'semantic';
        navNeighborhood().neighborhoodManifest = manifest;
    });
    setFocusPocketMeta({
            ...((appState.navState as any).focusPocketMeta || {}),
        boundedLoop: true,
        motifLabel: 'selected neighborhood loop'
    });
}

export function primeBoundedSemanticNeighborhoodForTraversal(seedIndex: number): boolean {
    if (!Number.isFinite(seedIndex)) return false;
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    if (isBoundedNeighborhoodActive()) return true;

    initJourneyNeighborhoodAdapter.adapter.setTrailFromSeed(seedIndex);
    if ((state.navState as any).threadSource !== 'semantic') return false;
    initJourneyNeighborhoodAdapter.adapter.applyLocalNeighborhoodFocus(seedIndex);
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    return isBoundedNeighborhoodActive();
}

export function setTrailFromSeed(seedIndex: number): void {
    const semanticCandidates = getSemanticThreadCandidates(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    const allCandidates = (semanticCandidates.length ? semanticCandidates : getGeometricThreadCandidates(seedIndex))
        .sort((a: ThreadCandidate, b: ThreadCandidate) => {
            const as = (a as any).semanticScore || 0;
            const bs = (b as any).semanticScore || 0;
            if (bs !== as) return bs - as;
            const sa = a.score || 0;
            const sb = b.score || 0;
            if (sb !== sa) return sb - sa;
            return a.index - b.index;
        });
    const candidates = allCandidates
        .filter((candidate: ThreadCandidate) => isPointVisible(candidate.index, appState.points!, null, appState.activeFilters))
        .slice(0, limit);
    const source = semanticCandidates.length ? 'semantic' : ((candidates[0] as any)?.source || 'geometric-fallback');
    const reasonByIndex = new Map<number, string>(candidates.map((candidate: ThreadCandidate) => [candidate.index, (candidate as any).reason]));
    const neighborIndices = candidates.map((candidate: ThreadCandidate) => candidate.index);
    const cursor = (() => {
        const tc = candidates.findIndex((candidate: ThreadCandidate) => candidate.index === (state.navState as any).focusedIndex);
        return tc >= 0 ? tc : 0;
    })();
    setTrailNavState(seedIndex, { candidates, source, reasonByIndex, neighborIndices, cursor });
}

export function updateTrailIndices(seedIndex: number | null = getCurrentTrailFocusIndex()): void {
    state.trailIndices.clear();
    if (seedIndex === null || seedIndex === undefined || seedIndex < 0 || seedIndex >= (state.points as any).length) return;
    if (!isPointVisible(seedIndex, state.points, null, state.activeFilters)) return;
    state.trailIndices.add(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    ((state.navState as any).threadCandidates.length ? (state.navState as any).threadCandidates : getThreadCandidatesForIndex(seedIndex).slice(0, limit))
        .filter((candidate: any) => isPointVisible(candidate.index, appState.points!, null, appState.activeFilters))
        .forEach((candidate: any) => state.trailIndices.add(candidate.index));
}
