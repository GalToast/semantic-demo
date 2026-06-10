/**
 * journey-thread-settler.ts
 *
 * TypeScript shadow of journey-thread-settler.js
 * Thread walk traversal, neighbor timers, inspection settle flow, and inside preview state.
 */

import { state } from '../state.ts';
import { formatBusinessName, cleanOptionalValue } from './utils/dom-formatters.ts';
import { normalizeCityForFilter } from './utils/geo-data.ts';
import { focusOnNode } from './camera-controls.ts';
import { dispatchNavTransition, focusOnPoint, updateJourneyCompass } from './lifecycle.ts';
import {
    renderThreadInspection,
    inspectThreadNeighbor,
    clearThreadInspection,
    syncInspectedStrandOverlay
} from './thread-inspector.ts';
import { showExperienceToast } from './ui-feedback.ts';
import { syncSemanticDiveUi } from './semantic-dive-ui.ts';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.ts';
import { setStrandContinuityState, clearStrandContinuityState, getStrandArrivalNote } from './strand-continuity.ts';
import {
    getRelationshipRoleCopy,
    getRelationshipRoleLabel,
    describeRelationshipRoleReason,
    UNCLASSIFIED_RELATIONSHIP_ROLE
} from './relationship-roles.ts';
import {
    getCurrentTrailFocusIndex,
    isBoundedNeighborhoodActive,
    primeBoundedSemanticNeighborhoodForTraversal,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex
} from './journey-neighborhood.ts';
import { syncFocusStage } from './journey-selected-card.ts';
import type { Point, StrandContinuityState } from '../../types/state.ts';

// Direct import sentinel for the inspected-strand overlay dewindowing contract.
void syncInspectedStrandOverlay;

let _setTimer: (fn: () => void, delay: number) => ReturnType<typeof setTimeout> | undefined = (fn, delay) => typeof setTimeout !== 'undefined' ? setTimeout(fn, delay) : undefined;
let _clearTimer: (id: ReturnType<typeof setTimeout>) => void = (id) => typeof clearTimeout !== 'undefined' ? clearTimeout(id) : undefined;

const timerAdapter = {
    setTimer: (fn: () => void, delay: number) => _setTimer(fn, delay),
    clearTimer: (id: ReturnType<typeof setTimeout>) => _clearTimer(id)
};

const _threadTimers = new Map<string, ReturnType<typeof setTimeout> | undefined>();

function _trackTimer(purpose: string, id: ReturnType<typeof setTimeout> | undefined): void {
    if (_threadTimers.has(purpose)) {
        const priorId = _threadTimers.get(purpose);
        if (priorId !== undefined) timerAdapter.clearTimer(priorId);
    }
    _threadTimers.set(purpose, id);
}

function _clearTrackedTimer(purpose: string): void {
    if (_threadTimers.has(purpose)) {
        const id = _threadTimers.get(purpose);
        if (id !== undefined) timerAdapter.clearTimer(id);
        _threadTimers.delete(purpose);
    }
}

export function cancelAllThreadTimers(): void {
    for (const [, id] of _threadTimers) {
        if (id !== undefined) timerAdapter.clearTimer(id);
    }
    _threadTimers.clear();
}

const PROJECTED_NEIGHBOR_FALLBACK_REASON = 'approximate projected neighbor from the current cloud layout';

export function initJourneyTimerAdapter(deps: { setTimer?: typeof _setTimer; clearTimer?: typeof _clearTimer } = {}): void {
    if (deps.setTimer) _setTimer = deps.setTimer;
    if (deps.clearTimer) _clearTimer = deps.clearTimer;
}

export { getStrandArrivalNote };

export function getInsideRelationshipLabel(candidate: Record<string, any> = {}, point: Point | null = null, focusPoint: Point | null = null): string {
    if (candidate.relationshipRole) return getRelationshipRoleLabel(candidate.relationshipRole, 'inside');
    const sameCity: boolean =
        !!Boolean(candidate.sameCity) ||
        !!(
            point &&
            focusPoint &&
            normalizeCityForFilter(point.city!) === normalizeCityForFilter(focusPoint.city!)
        );
    const sharedTopic = getSharedTrailTopicLabel(point, focusPoint);
    if (sharedTopic) return sameCity ? `On the same ${sharedTopic} trail` : sharedTopic;
    if (candidate.source === 'semantic' || (state.navState as any).threadSource === 'semantic')
        return 'related connection';
    if (sameCity) return 'On the same trail';
    if (candidate.sameStatus) return 'Same trail layer';
    return 'Nearby connection';
}

export function summarizeNeighborReason(candidate: Record<string, any> = {}, point: Point | null = null, focusPoint: Point | null = null): string {
    const reason = cleanOptionalValue(candidate.reason);
    const roleLabel: string = candidate.relationshipRole ? getRelationshipRoleLabel(candidate.relationshipRole, 'title') : '';
    const roleReason: string = candidate.relationshipRole
        ? describeRelationshipRoleReason(candidate.relationshipRole, candidate.roleReason)
        : cleanOptionalValue(candidate.roleReason) ?? '';
    const sameCity: boolean =
        !!candidate.sameCity ||
        !!(
            point &&
            focusPoint &&
            normalizeCityForFilter(point.city) === normalizeCityForFilter(focusPoint.city)
        );
    const sharedTopic = getSharedTrailTopicLabel(point, focusPoint);

    if (reason) {
        const normalizedReason = reason
            .replace(/\.$/, '')
            .replace(/^close semantic neighbor,\s*/i, '')
            .replace(/\bsame city,?\s*/i, sameCity ? '' : 'same city, ')
            .replace(/\bsemantic neighbor\b/i, 'semantic link')
            .replace(
                /\bshared service language\b/i,
                sharedTopic ? `shared ${sharedTopic} patterns` : 'shared record language'
            )
            .replace(
                /\bsame business sector\b/i,
                sharedTopic ? `same ${sharedTopic} topic` : 'nearby business sector'
            )
            .replace(
                /\bmatching business category\b/i,
                sharedTopic ? `matching ${sharedTopic} signal` : 'matching category signal'
            )
            .replace(/\bmatching record status\b/i, 'matching record layer')
            .replace(/\bstrong contact signal\b/i, 'contactable public record')
            .replace(/\s*,\s*,+/g, ', ')
            .replace(/\s+/g, ' ')
            .replace(/^[,\s]+|[,\s]+$/g, '');

        const prefix: string =
            sameCity && sharedTopic
                ? `same-city ${sharedTopic} connection`
                : sameCity
                  ? 'same-city relationship'
                  : 'deep record relationship';

        const isBoilerplateLayer = /^matching record layer$/i.test(normalizedReason);
        if (isBoilerplateLayer) {
            return truncateMicrocopy(normalizedReason.charAt(0).toUpperCase() + normalizedReason.slice(1));
        }

        if (!roleReason && normalizedReason === PROJECTED_NEIGHBOR_FALLBACK_REASON) {
            return getRelationshipRoleCopy(UNCLASSIFIED_RELATIONSHIP_ROLE).reason;
        }

        if (!roleReason) {
            const fallbackReason = `${prefix} grounded in ${normalizedReason}`;
            return truncateMicrocopy(fallbackReason.charAt(0).toUpperCase() + fallbackReason.slice(1));
        }

        return truncateMicrocopy(roleReason.charAt(0).toUpperCase() + roleReason.slice(1));
    }

    if (roleLabel) {
        return truncateMicrocopy(roleReason || roleLabel);
    }

    const threadType = String(candidate.threadType || '')
        .replace(/_/g, ' ')
        .trim();

    if (sameCity && sharedTopic) return truncateMicrocopy(`On the same trail, ${sharedTopic} stop.`);
    if (sameCity) return 'On the same trail.';
    if (candidate.sameStatus) return 'Same trail layer.';
    if (threadType) return truncateMicrocopy(threadType.charAt(0).toUpperCase() + threadType.slice(1));
    return (state.navState as any).threadSource === 'semantic' ? 'Linked stop' : 'Nearby cloud stop.';
}

interface WalkThreadNeighborOptions {
    fromIndex?: number;
    surface?: string;
    reason?: string;
    restoreHistory?: boolean;
    arrivalDelay?: number;
    settleDelay?: number;
    expandNeighborhood?: boolean;
    fromCanvasNode?: boolean;
}

export function walkThreadNeighbor(index: number, options: WalkThreadNeighborOptions = {}): { targetIndex: number; fromIndex: number | null; reason: string } | null {
    if (!Number.isFinite(index)) return null;
    const fromIndex: number | null = Number.isFinite(options.fromIndex) ? options.fromIndex! : getCurrentTrailFocusIndex();
    const candidate = ((state.navState as any).threadCandidates || []).find((item: any) => item && item.index === index);
    const targetPoint: Point | null = (Number.isFinite(index) && index >= 0 && index < (state.points as any).length) ? (state.points as any)[index] : null;
    const reason: string =
        summarizeNeighborReason(
            candidate || {},
            targetPoint,
            (Number.isFinite(fromIndex) && fromIndex! >= 0 && fromIndex! < (state.points as any).length) ? (state.points as any)[fromIndex!] : null
        ) ||
        candidate?.reason ||
        options.reason ||
        'nearby business relationship';
    (state as any).pinnedThreadIndex = null;
    (state as any).inspectedThreadIndex = null;
    cancelAllThreadTimers();
    setStrandContinuityState('exploring', { targetIndex: index, fromIndex, reason });
    dispatchNavTransition('WALK_TO', { index, fromIndex, appendHistory: !options.restoreHistory });
    renderThreadInspection(null, { force: true, surface: 'idle' });
    (state.navState as any).lastTraversalReason = reason;
    const preserveNeighborhood: boolean =
        state.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expandNeighborhood;
    if (state.currentView === 'map') {
        focusOnPoint(targetPoint, {
            fromTraversal: true,
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex
        });
    } else {
        focusOnNode(index, {
            fromCanvasNode: !!options.fromCanvasNode,
            fromTraversal: true,
            preserveNeighborhood,
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex
        });
    }
    clearThreadInspection({ preserveJourney: true });
    syncSemanticDiveUi();
    updateJourneyCompass();
    showExperienceToast(
        'Following connection',
        `Moving along the semantic trail to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
    );
    const capturedIndex = index;
    const capturedFromIndex = fromIndex;
    const capturedReason = reason;
    const arrivalTid = timerAdapter.setTimer(() => {
        if (!state.points) return;
        if ((state.strandContinuityState as StrandContinuityState).phase === 'exploring' && (state.strandContinuityState as StrandContinuityState).targetIndex === capturedIndex) {
            _clearTrackedTimer('arrival');
            setStrandContinuityState('arrived', { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason });
            const pointAtArrival: Point | null = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < (state.points as any).length) ? (state.points as any)[capturedIndex] : null;
            syncFocusStage(pointAtArrival || state.selectedPoint || null);
            updateJourneyCompass();
            if (state.semanticDiveMode) {
                previewInsideNextThread({ force: true });
                syncSemanticDiveUi();
            } else {
                clearThreadInspection({ force: true, preserveJourney: true });
            }
        }
    }, options.arrivalDelay || 820);
    _trackTimer('arrival', arrivalTid);
    const settleTid = timerAdapter.setTimer(() => {
        if (!state.points) return;
        if ((state.strandContinuityState as StrandContinuityState).phase === 'arrived' && (state.strandContinuityState as StrandContinuityState).targetIndex === capturedIndex) {
            _clearTrackedTimer('settle');
            clearStrandContinuityState('arrival-settled');
            const pointAtSettle: Point | null = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < (state.points as any).length) ? (state.points as any)[capturedIndex] : null;
            syncFocusStage(pointAtSettle || state.selectedPoint || null);
        }
    }, options.settleDelay || 5200);
    _trackTimer('settle', settleTid);
    return { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason };
}

export function traverseNeighbor(step: number): void {
    const currentIndex = getCurrentTrailFocusIndex();
    if (currentIndex === null || currentIndex === undefined) return;
    if (!primeBoundedSemanticNeighborhoodForTraversal(currentIndex)) return;

    if (step < 0) {
        const previousCandidate = getBoundedNeighborhoodWalkCandidate(-1, currentIndex, { commit: true });
        if (previousCandidate) {
            walkThreadNeighbor(previousCandidate.index, {
                fromIndex: currentIndex,
                surface: 'neighborhood-loop',
                reason: previousCandidate.reason || 'previous stop in this bounded neighborhood'
            });
            return;
        }
        if (((state.navState as any).walkHistoryIndices || []).length <= 1) return;
        const previousIndex = (state.navState as any).walkHistoryIndices?.[(state.navState as any).walkHistoryIndices.length - 2];
        if (!Number.isFinite(previousIndex)) return;
        dispatchNavTransition('BACKTRACK', { step: -1, fromIndex: currentIndex, targetIndex: previousIndex, restoreHistory: true });
        walkThreadNeighbor(previousIndex, {
            fromIndex: currentIndex,
            restoreHistory: true,
            surface: 'backtrack',
            reason: 'backtracked to the previous business in your walk'
        });
        return;
    }

    const nextCandidate = getNextWalkCandidateForIndex(currentIndex, {
        requireSemantic: state.currentView === 'galaxy',
        requireOnCanvas: state.currentView === 'galaxy',
        commitNeighborhood: true
    });
    if (!nextCandidate) {
        showExperienceToast(
            'End of path',
            'No more connected neighbors are ready.'
        );
        return;
    }
    walkThreadNeighbor(nextCandidate.index, {
        fromIndex: currentIndex,
        surface: isBoundedNeighborhoodActive() ? 'neighborhood-loop' : 'walk',
        reason: nextCandidate.reason || 'nearby business relationship'
    });
}

export function walkInsideToNextStop(): void {
    if (
        state.semanticDiveMode
        && Number.isFinite((state as any).inspectedThreadIndex)
        && document.body.dataset.threadInspectSurface === 'inside-cue'
    ) {
        walkThreadNeighbor((state as any).inspectedThreadIndex, { surface: 'inside-cue' });
        return;
    }
    traverseNeighbor(1);
}

interface PreviewInsideOptions {
    force?: boolean;
    [key: string]: unknown;
}

export function previewInsideNextThread(options: PreviewInsideOptions = {}): any {
    if (!state.semanticDiveMode || state.currentView !== 'galaxy') return null;
    const currentIndex = getCurrentTrailFocusIndex();
    if (!Number.isFinite(currentIndex)) return null;
    const nextCandidate = getNextWalkCandidateForIndex(currentIndex!, {
        requireSemantic: true,
        requireOnCanvas: true,
        commitNeighborhood: false
    }) || getNextWalkCandidateForIndex(currentIndex!, {
        requireSemantic: false,
        requireOnCanvas: false,
        commitNeighborhood: false
    });
    if (!nextCandidate || !Number.isFinite(nextCandidate.index)) return null;
    return inspectThreadNeighbor(nextCandidate.index, {
        ...options,
        force: true,
        preserveJourney: true,
        surface: 'inside-cue'
    } as any);
}
