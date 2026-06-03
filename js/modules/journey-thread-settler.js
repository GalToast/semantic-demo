import { state } from '../state.js';
import { formatBusinessName, cleanOptionalValue } from './utils/dom-formatters.js';
import { normalizeCityForFilter } from './utils/geo-data.js';
import { focusOnNode } from './camera-controls.js';
import { dispatchNavTransition, focusOnPoint, updateJourneyCompass } from './lifecycle.js';
import {
    renderThreadInspection,
    inspectThreadNeighbor,
    clearThreadInspection,
    syncInspectedStrandOverlay
} from './thread-inspector.js';
import { showExperienceToast } from './ui-feedback.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.js';
import { setStrandContinuityState, clearStrandContinuityState, getStrandArrivalNote } from './strand-continuity.js';
import { getRelationshipRoleLabel, describeRelationshipRoleReason } from './relationship-roles.js';
import {
    getCurrentTrailFocusIndex,
    isBoundedNeighborhoodActive,
    primeBoundedSemanticNeighborhoodForTraversal,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex
} from './journey-neighborhood.js';
import { syncFocusStage } from './journey-selected-card.js';

// Direct import sentinel for the inspected-strand overlay dewindowing contract.
void syncInspectedStrandOverlay;

let _setTimer = (fn, delay) => typeof setTimeout !== 'undefined' ? setTimeout(fn, delay) : undefined;
let _clearTimer = (id) => typeof clearTimeout !== 'undefined' ? clearTimeout(id) : undefined;

const timerAdapter = {
    setTimer: (fn, delay) => _setTimer(fn, delay),
    clearTimer: (id) => _clearTimer(id)
};

export function initJourneyTimerAdapter(deps = {}) {
    if (deps.setTimer) _setTimer = deps.setTimer;
    if (deps.clearTimer) _clearTimer = deps.clearTimer;
}

export { getStrandArrivalNote };

export function getInsideRelationshipLabel(candidate = {}, point = null, focusPoint = null) {
    if (candidate.relationshipRole) return getRelationshipRoleLabel(candidate.relationshipRole, 'inside');
    const sameCity =
        Boolean(candidate.sameCity) ||
        (point &&
            focusPoint &&
            normalizeCityForFilter(point.city) === normalizeCityForFilter(focusPoint.city));
    const sharedTopic = getSharedTrailTopicLabel(point, focusPoint);
    if (sharedTopic) return sameCity ? `On the same ${sharedTopic} trail` : sharedTopic;
    if (candidate.source === 'semantic' || state.navState.threadSource === 'semantic')
        return 'related connection';
    if (sameCity) return 'On the same trail';
    if (candidate.sameStatus) return 'Same trail layer';
    return 'Nearby connection';
}

// getThreadInspectionState removed (delegated to thread-inspector.js)

export function summarizeNeighborReason(candidate = {}, point = null, focusPoint = null) {
    const reason = cleanOptionalValue(candidate.reason);
    const roleLabel = candidate.relationshipRole ? getRelationshipRoleLabel(candidate.relationshipRole, 'title') : '';
    const roleReason = candidate.relationshipRole
        ? describeRelationshipRoleReason(candidate.relationshipRole, candidate.roleReason)
        : cleanOptionalValue(candidate.roleReason);
    const sameCity =
        Boolean(candidate.sameCity) ||
        (point &&
            focusPoint &&
            normalizeCityForFilter(point.city) === normalizeCityForFilter(focusPoint.city));
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

        const prefix =
            sameCity && sharedTopic
                ? `same-city ${sharedTopic} connection`
                : sameCity
                  ? 'same-city relationship'
                  : 'deep record relationship';

        const isBoilerplateLayer = /^matching record layer$/i.test(normalizedReason);
        if (isBoilerplateLayer) {
            return truncateMicrocopy(normalizedReason.charAt(0).toUpperCase() + normalizedReason.slice(1));
        }

        // "X grounded in Y" reads as academic; the "X — Y" form repeats the
        // role. The roleReason (e.g., "Same trail. Same trade.") is already
        // warm and tactile — use it as the full card copy.
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
    return state.navState.threadSource === 'semantic' ? 'Linked stop' : 'Nearby cloud stop.';
}

// UI Inspection functions removed (delegated to thread-inspector.js)

export function walkThreadNeighbor(index, options = {}) {
    if (!Number.isFinite(index)) return null;
    const fromIndex = Number.isFinite(options.fromIndex) ? options.fromIndex : getCurrentTrailFocusIndex();
    const candidate = (state.navState.threadCandidates || []).find((item) => item && item.index === index);
    const targetPoint = (Number.isFinite(index) && index >= 0 && index < state.points.length) ? state.points[index] : null;
    const priorArrivalTimeoutId = state.strandContinuityState?.arrivalTimeoutId;
    const priorSettleTimeoutId = state.strandContinuityState?.settleTimeoutId;
    const reason =
        summarizeNeighborReason(
            candidate || {},
            targetPoint,
            (Number.isFinite(fromIndex) && fromIndex >= 0 && fromIndex < state.points.length) ? state.points[fromIndex] : null
        ) ||
        candidate?.reason ||
        options.reason ||
        'nearby business relationship';
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = index;
    setStrandContinuityState('exploring', { targetIndex: index, fromIndex, reason });
    dispatchNavTransition('WALK_TO', { index, fromIndex, appendHistory: !options.restoreHistory });
    if (Number.isFinite(priorArrivalTimeoutId)) {
        timerAdapter.clearTimer(priorArrivalTimeoutId);
    }
    if (Number.isFinite(priorSettleTimeoutId)) {
        timerAdapter.clearTimer(priorSettleTimeoutId);
    }
    renderThreadInspection(index, { force: true, surface: options.surface || 'walk' });
    state.navState.lastTraversalReason = reason;
    const preserveNeighborhood =
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
    showExperienceToast(
        'Following connection',
        `Moving along the semantic trail to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
    );
    const capturedIndex = index;
    const capturedFromIndex = fromIndex;
    const capturedReason = reason;
    const arrivalTid = timerAdapter.setTimer(() => {
        if (!state.points) return;
        if (state.strandContinuityState.phase === 'exploring' && state.strandContinuityState.targetIndex === capturedIndex) {
            setStrandContinuityState('arrived', { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason });
            const pointAtArrival = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < state.points.length) ? state.points[capturedIndex] : null;
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
    state.strandContinuityState.arrivalTimeoutId = arrivalTid;
    const settleTid = timerAdapter.setTimer(() => {
        if (!state.points) return;
        if (state.strandContinuityState.phase === 'arrived' && state.strandContinuityState.targetIndex === capturedIndex) {
            clearStrandContinuityState('arrival-settled');
            const pointAtSettle = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < state.points.length) ? state.points[capturedIndex] : null;
            syncFocusStage(pointAtSettle || state.selectedPoint || null);
        }
    }, options.settleDelay || 5200);
    state.strandContinuityState.settleTimeoutId = settleTid;
    return { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason };
}

export function traverseNeighbor(step) {
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
        if ((state.navState.walkHistoryIndices || []).length <= 1) return;
        const previousIndex = state.navState.walkHistoryIndices?.[state.navState.walkHistoryIndices.length - 2];
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

export function walkInsideToNextStop() {
    if (
        state.semanticDiveMode
        && Number.isFinite(state.inspectedThreadIndex)
        && document.body.dataset.threadInspectSurface === 'inside-cue'
    ) {
        walkThreadNeighbor(state.inspectedThreadIndex, { surface: 'inside-cue' });
        return;
    }
    traverseNeighbor(1);
}

export function previewInsideNextThread(options = {}) {
    if (!state.semanticDiveMode || state.currentView !== 'galaxy') return null;
    const currentIndex = getCurrentTrailFocusIndex();
    if (!Number.isFinite(currentIndex)) return null;
    const nextCandidate = getNextWalkCandidateForIndex(currentIndex, {
        requireSemantic: true,
        requireOnCanvas: true,
        commitNeighborhood: false
    }) || getNextWalkCandidateForIndex(currentIndex, {
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
    });
}
