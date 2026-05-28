import { state } from '../state.js';
import {
    formatBusinessName,
    cleanOptionalValue,
    stripTerminalPunctuation,
    normalizeCityForFilter,
} from '../utils.js';
import { focusOnNode } from './camera-controls.js';
import { dispatchNavTransition, focusOnPoint, updateJourneyCompass } from './lifecycle.js';
import { syncInspectedStrandOverlay } from './thread-inspector.js';
import { showExperienceToast } from './ui-feedback.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.js';
import { setStrandContinuityState, clearStrandContinuityState } from './strand-continuity.js';
import {
    getCurrentTrailFocusIndex,
    isBoundedNeighborhoodActive,
    primeBoundedSemanticNeighborhoodForTraversal,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex
} from './journey-neighborhood.js';
import { syncFocusStage } from './journey-selected-card.js';

const CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS = 5200;

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

export function getStrandArrivalNote(point = null) {
    if (state.strandContinuityState.phase !== 'arrived') return '';
    const targetIndex = state.strandContinuityState.targetIndex;
    const targetPoint = (Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex < state.points.length) ? state.points[targetIndex] : null;
    const currentPoint = point || targetPoint;
    if (!currentPoint || targetPoint !== currentPoint) return '';
    const fromPoint = (Number.isFinite(state.strandContinuityState.fromIndex) && state.strandContinuityState.fromIndex >= 0 && state.strandContinuityState.fromIndex < state.points.length)
        ? state.points[state.strandContinuityState.fromIndex]
        : null;
    const fromName = fromPoint ? formatBusinessName(fromPoint.name || 'the prior stop') : 'the prior stop';
    const targetName = formatBusinessName(currentPoint.name || 'this stop');
    return truncateMicrocopy(
        `Arrived by connection from ${fromName}. ${targetName} is now the anchor; inspect another connection, follow it, or backtrack without losing the trail.`,
        154
    );
}

export function getInsideRelationshipLabel(candidate = {}, point = null, focusPoint = null) {
    const sameCity =
        Boolean(candidate.sameCity) ||
        (point &&
            focusPoint &&
            normalizeCityForFilter(point.city) === normalizeCityForFilter(focusPoint.city));
    const sharedTopic = getSharedTrailTopicLabel(point, focusPoint);
    if (sharedTopic) return sameCity ? `same-city ${sharedTopic}` : sharedTopic;
    if (candidate.source === 'semantic' || state.navState.threadSource === 'semantic')
        return 'related connection';
    if (sameCity) return 'same-city connection';
    if (candidate.sameStatus) return 'matching record layer';
    return 'nearby connection';
}

export function getThreadInspectionState(index = state.inspectedThreadIndex, options = {}) {
    const focusedIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    const focusPoint = (focusedIndex !== null && focusedIndex >= 0 && focusedIndex < state.points.length) ? state.points[focusedIndex] : null;
    const candidate = Number.isFinite(index)
        ? (state.navState.threadCandidates || []).find((item) => item && item.index === index)
        : null;
    const point = (candidate && Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < state.points.length)
        ? state.points[candidate.index]
        : null;
    const active = !!(candidate && point && focusPoint);
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const targetName = point ? formatBusinessName(point.name || 'nearby stop') : '';
    const reason = active ? summarizeNeighborReason(candidate, point, focusPoint) : '';
    const role = active
        ? state.navState.focusPocketRoleByIndex?.get(candidate.index) || candidate.role || 'trail'
        : '';
    const source = active
        ? candidate.source === 'semantic' || state.navState.threadSource === 'semantic'
            ? 'semantic relationship'
            : 'current cloud fallback'
        : '';
    const title = active ? `${focusName} -> ${targetName}` : 'Select a nearby stop';
    const pinned = active && state.pinnedThreadIndex === candidate.index;
    const journeyPhase =
        active && state.strandContinuityState.targetIndex === candidate.index
            ? state.strandContinuityState.phase
            : pinned
              ? 'pinned'
              : active
                ? 'preview'
                : 'idle';
    const cleanReason = stripTerminalPunctuation(reason);
    const displayReason =
        active && reason.includes('...')
            ? getInsideRelationshipLabel(candidate, point, focusPoint)
            : cleanReason;
    const copy = active
        ? journeyPhase === 'exploring'
            ? `${displayReason}. Following this connection into the next neighborhood.`
            : journeyPhase === 'arrived'
              ? `${displayReason}. You arrived through this connection; inspect another connection or backtrack to compare.`
              : pinned
                ? `${displayReason}. This connection is pinned for comparison; follow it, keep it pinned, or clear it.`
                : `${displayReason}. Preview the relationship, pin it for comparison, or follow it to the next stop.`
        : 'Select a neighbor to preview why it belongs here, then pin it or follow it.';
    const meta = active
        ? `${source} | ${journeyPhase} connection | Layout: staged for readability`
        : 'Preview connection';
    return {
        active,
        index: active ? candidate.index : null,
        focusedIndex,
        focusName,
        targetName,
        reason,
        role,
        source,
        pinned,
        journeyPhase,
        surface: pinned ? 'pinned' : options.surface || document.body.dataset.threadInspectSurface || null,
        title,
        copy,
        meta,
        strandVisual: {
            active: !!state.inspectedStrandDiagnostics.active,
            source: state.inspectedStrandDiagnostics.source || 'none',
            segmentCount: state.inspectedStrandDiagnostics.segmentCount || 0,
            braidCount: state.inspectedStrandDiagnostics.braidCount || 0,
            endpointCount: state.inspectedStrandDiagnostics.endpointCount || 0
        },
        threadSource: state.navState.threadSource || null
    };
}

export function summarizeNeighborReason(candidate = {}, point = null, focusPoint = null) {
    const reason = cleanOptionalValue(candidate.reason);
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

        const narrative = `${prefix} grounded in ${normalizedReason}`;
        return truncateMicrocopy(narrative.charAt(0).toUpperCase() + narrative.slice(1));
    }

    const threadType = String(candidate.threadType || '')
        .replace(/_/g, ' ')
        .trim();

    if (sameCity && sharedTopic) return truncateMicrocopy(`Same-city ${sharedTopic} connection`);
    if (sameCity) return 'Same-city relationship';
    if (candidate.sameStatus) return 'Matching record layer';
    if (threadType) return truncateMicrocopy(threadType.charAt(0).toUpperCase() + threadType.slice(1));
    return state.navState.threadSource === 'semantic' ? 'Linked stop' : 'Nearby cloud stop';
}

export function renderThreadInspection(index = state.inspectedThreadIndex, options = {}) {
    const inspector = document.getElementById('focus-thread-inspector');
    const inspectionState = getThreadInspectionState(index, options);
    syncInspectedStrandOverlay(inspectionState, options);
    if (document.body) {
        document.body.dataset.threadInspectSurface = inspectionState.active
            ? inspectionState.surface || options.surface || 'rail'
            : 'idle';
    }
    if (!inspector) return inspectionState;
    if (!inspector.dataset.pointerGuardBound) {
        inspector.dataset.pointerGuardBound = 'true';
        if (state.currentView === 'galaxy') {
            const onPointerEnter = () => {
                state.threadInspectorPointerInside = true;
                if (state.canvasThreadInspectionClearTimer) {
                    timerAdapter.clearTimer(state.canvasThreadInspectionClearTimer);
                    state.canvasThreadInspectionClearTimer = null;
                }
            };
            const onPointerLeave = () => {
                state.threadInspectorPointerInside = false;
                if (document.body.dataset.threadInspectSurface === 'canvas' && state.pinnedThreadIndex === null) {
                    scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
                }
            };
            inspector._pointerEnterListener = onPointerEnter;
            inspector._pointerLeaveListener = onPointerLeave;
            inspector.addEventListener('pointerenter', onPointerEnter);
            inspector.addEventListener('pointerleave', onPointerLeave);
        }
    }
    if (inspectionState.active && state.canvasThreadInspectionClearTimer) {
        timerAdapter.clearTimer(state.canvasThreadInspectionClearTimer);
        state.canvasThreadInspectionClearTimer = null;
    }
    inspector.classList.toggle('active', inspectionState.active);
    inspector.classList.toggle('from-canvas', inspectionState.active && options.surface === 'canvas');
    inspector.classList.toggle('is-pinned', inspectionState.pinned);
    inspector.setAttribute('aria-hidden', inspectionState.active ? 'false' : 'true');
    const titleEl = document.getElementById('focus-thread-inspector-title');
    const copyEl = document.getElementById('focus-thread-inspector-copy');
    const metaEl = document.getElementById('focus-thread-inspector-meta');
    const pinBtn = document.getElementById('btn-thread-pin');
    const followBtn = document.getElementById('btn-thread-follow');
    const clearBtn = document.getElementById('btn-thread-clear');
    if (titleEl) titleEl.textContent = inspectionState.title;
    if (copyEl) copyEl.textContent = inspectionState.copy;
    if (metaEl) metaEl.textContent = inspectionState.meta;
    if (pinBtn) {
        pinBtn.disabled = !inspectionState.active;
        pinBtn.textContent = inspectionState.pinned ? 'Unpin Connection' : 'Pin Connection';
        pinBtn.setAttribute('aria-pressed', String(!!inspectionState.pinned));
        pinBtn.onclick = () => {
            if (!inspectionState.active) return;
            if (inspectionState.pinned) {
                unpinThreadInspection();
            } else {
                pinThreadNeighbor(inspectionState.index, { surface: 'pinned' });
            }
        };
    }
    if (followBtn) {
        const followTargetsCurrent =
            inspectionState.active &&
            Number.isFinite(inspectionState.index) &&
            inspectionState.index === state.navState.focusedIndex;
        followBtn.disabled = !inspectionState.active || followTargetsCurrent || inspectionState.journeyPhase === 'exploring';
        followBtn.setAttribute('aria-disabled', String(followBtn.disabled));
        followBtn.setAttribute('aria-busy', String(inspectionState.journeyPhase === 'exploring'));
        followBtn.textContent = inspectionState.journeyPhase === 'exploring'
            ? 'Following'
            : followTargetsCurrent
              ? 'Current Stop'
              : 'Follow This Stop';
        followBtn.setAttribute(
            'aria-label',
            inspectionState.journeyPhase === 'exploring'
                ? 'Following this connection'
                : followTargetsCurrent
                  ? 'This connection is the current path stop'
                  : 'Follow this connection as the next path stop'
        );
        followBtn.onclick = () => {
            if (!inspectionState.active || followTargetsCurrent || inspectionState.journeyPhase === 'exploring') return;
            walkThreadNeighbor(inspectionState.index, { surface: inspectionState.surface || options.surface || 'inspector' });
        };
    }
    if (clearBtn) {
        clearBtn.disabled = !inspectionState.active && state.pinnedThreadIndex === null;
        clearBtn.setAttribute('aria-disabled', String(clearBtn.disabled));
        clearBtn.setAttribute(
            'aria-label',
            state.pinnedThreadIndex !== null ? 'Clear pinned connection' : 'Clear connection preview'
        );
        clearBtn.onclick = () => unpinThreadInspection();
    }
    document.querySelectorAll('.focus-stage-neighbor-pill.is-inspected').forEach((item) => {
        item.classList.remove('is-inspected');
    });
    document.querySelectorAll('.focus-stage-neighbor-pill.is-pinned').forEach((item) => {
        item.classList.remove('is-pinned');
    });
    document.querySelectorAll('.focus-stage-neighbor-pill.is-exploring').forEach((item) => {
        item.classList.remove('is-exploring');
    });
    if (inspectionState.active) {
        const railItem = document.querySelector(`.focus-stage-neighbor-pill[data-index="${inspectionState.index}"]`);
        if (!railItem) return;
        railItem.classList.add('is-inspected');
        railItem.classList.toggle('is-pinned', inspectionState.pinned);
        railItem.classList.toggle('is-exploring', inspectionState.journeyPhase === 'exploring');
    }
    return inspectionState;
}

export function inspectThreadNeighbor(index, options = {}) {
    if (state.pinnedThreadIndex !== null && !options.force) {
        return renderThreadInspection(state.pinnedThreadIndex, { surface: 'pinned', pinned: true });
    }
    state.inspectedThreadIndex = Number.isFinite(index) ? index : null;
    if (Number.isFinite(state.inspectedThreadIndex) && !options.preserveJourney) {
        setStrandContinuityState('preview', {
            targetIndex: state.inspectedThreadIndex,
            fromIndex: state.navState.focusedIndex,
            reason: options.surface || 'inspect'
        });
    }
    return renderThreadInspection(state.inspectedThreadIndex, options);
}

export function pinThreadNeighbor(index, options = {}) {
    if (!Number.isFinite(index)) return clearThreadInspection({ force: true });
    if (state.canvasThreadInspectionClearTimer) {
        timerAdapter.clearTimer(state.canvasThreadInspectionClearTimer);
        state.canvasThreadInspectionClearTimer = null;
    }
    state.pinnedThreadIndex = index;
    state.inspectedThreadIndex = index;
    setStrandContinuityState('pinned', {
        targetIndex: index,
        fromIndex: state.navState.focusedIndex,
        reason: options.reason || 'pin'
    });
    const inspectionState = renderThreadInspection(index, { ...options, surface: 'pinned', pinned: true });
    syncSemanticDiveUi();
    return inspectionState;
}

export function unpinThreadInspection() {
    if (state.canvasThreadInspectionClearTimer) {
        timerAdapter.clearTimer(state.canvasThreadInspectionClearTimer);
        state.canvasThreadInspectionClearTimer = null;
    }
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = null;
    clearStrandContinuityState('unpin');
    const inspectionState = renderThreadInspection(null, { surface: 'idle', force: true });
    syncSemanticDiveUi();
    return inspectionState;
}

export function scheduleCanvasThreadInspectionClear(delay = 1800) {
    if (state.canvasThreadInspectionClearTimer) timerAdapter.clearTimer(state.canvasThreadInspectionClearTimer);
    state.canvasThreadInspectionClearTimer = timerAdapter.setTimer(() => {
        state.canvasThreadInspectionClearTimer = null;
        if (state.threadInspectorPointerInside || state.pinnedThreadIndex !== null) return;
        if (document.body.dataset.threadInspectSurface === 'canvas') {
            clearThreadInspection();
        }
    }, delay);
}

export function clearThreadInspection(options = {}) {
    if (options.force && state.canvasThreadInspectionClearTimer) {
        timerAdapter.clearTimer(state.canvasThreadInspectionClearTimer);
        state.canvasThreadInspectionClearTimer = null;
    }
    if (options.force) {
        state.pinnedThreadIndex = null;
        if (!options.preserveJourney) clearStrandContinuityState('force-clear');
    }
    if (state.pinnedThreadIndex !== null && !options.force) {
        return renderThreadInspection(state.pinnedThreadIndex, { surface: 'pinned', pinned: true });
    }
    if (!options.preserveJourney && state.strandContinuityState.phase === 'preview') {
        clearStrandContinuityState('preview-clear');
    }
    state.inspectedThreadIndex = null;
    state.threadInspectorPointerInside = false;
    const inspector = document.getElementById('focus-thread-inspector');
    if (inspector && inspector._pointerEnterListener) {
        inspector.removeEventListener('pointerenter', inspector._pointerEnterListener);
        inspector.removeEventListener('pointerleave', inspector._pointerLeaveListener);
        delete inspector._pointerEnterListener;
        delete inspector._pointerLeaveListener;
        delete inspector.dataset.pointerGuardBound;
    }
    return renderThreadInspection(null, { surface: 'idle' });
}

function primeNextThreadInspectionAfterWalk(focusedIndex) {
    if (!Number.isFinite(focusedIndex)) return null;
    const nextCandidate = (state.navState.threadCandidates || []).find((item) => {
        return item && Number.isFinite(item.index) && item.index !== focusedIndex;
    });
    if (!nextCandidate) {
        state.inspectedThreadIndex = null;
        return renderThreadInspection(null, { surface: 'idle', preserveJourney: true });
    }
    state.inspectedThreadIndex = nextCandidate.index;
    return renderThreadInspection(nextCandidate.index, {
        force: true,
        surface: 'walk-next',
        preserveJourney: true
    });
}

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
            primeNextThreadInspectionAfterWalk(capturedIndex);
            if (state.semanticDiveMode) {
                previewInsideNextThread({ force: true });
                syncSemanticDiveUi();
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
