import { state } from '../state.js';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
    describeCluster,
    sanitizePublicFacingNote,
    getBusinessNamePresentation,
    formatBusinessName,
    escapeHtml,
    cleanOptionalValue,
    isCompactFocusStageViewport,
    stripTerminalPunctuation,
    isPointVisible,
    normalizeCityForFilter,
    getPublicRecordStatusLabel,
    updateDocumentMeta
} from '../utils.js';
import {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex
} from './journey-thread-model.js';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.js';
import {
    renderSignalBadges,
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    setActiveSearchResultRow,
} from './ui-renderers.js';

export {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex
};

export {
    truncateMicrocopy,
    getSharedTrailTopicLabel
};

// Ensure all state variables used are initialized if they weren't in state.js
export function initJourneyState() {
    state.trailIndices = state.trailIndices || new Set();
    state.inspectedThreadIndex ??= null;
    state.pinnedThreadIndex ??= null;
    state.canvasThreadInspectionClearTimer ??= null;
    state.threadInspectorPointerInside ??= false;
    state.inspectedStrandDiagnostics ??= { active: false };
    state.arrivalHandoffDiagnostics ??= { active: false, fromIndex: null, targetIndex: null, phase: 'idle', segmentCount: 0, endpointCount: 0, opacity: 0 };
    state.strandContinuityState ??= { phase: 'idle', targetIndex: null, fromIndex: null, reason: '', startedAt: 0 };
    state.myceliumMode ??= 'default';
    state.bloomIndices ??= new Set();
    state.bridgeIndices ??= new Set();
    state.projectedNeighborGrid ??= null;
    state.projectedNeighborCache ??= new Map();
    state.canvasFieldHoverClearTimer ??= null;
    state.stableCanvasHover ??= null;
    state.pointIndexByLeadId ??= new Map();
    state.signalScores ??= [];
    state.bridgeScores ??= [];
    state.semanticDiveMode ??= false;
    state.focusPocketTransitionStartedAt ??= 0;
    state.focusPocketMotionByIndex ??= new Map();
}

// Auto-init on first import — set up state defaults immediately
initJourneyState();

const COPY = Object.freeze({
    selectedFiledAs: (raw) => {
        if (!raw || raw === '-' || raw.trim() === '') return 'Not provided';
        return `Filed as ${raw}`;
    },
    selectedEmptyFacts: 'MoCo business record',
    selectedEmptyTheme: 'Theme',
    selectedEmptyStatus: 'Record status',
    selectedEmptyMap: 'No geocoded point yet',
    selectedEmptyThread: 'Waiting for a related path.',
    selectedEmptyName: 'Business Name',
    selectedEmptyWhat: 'What they do',
    selectedEmptyRole: 'Record',
});

const CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS = 5200;
const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;
const STABLE_HOVER_STICKY_PX = 9;
const ROUTE_TRACE_SEGMENT_STEPS = 7;
const ARRIVAL_HANDOFF_SEGMENT_STEPS = 9;

// --- Helper Functions ---

function isCondensedFocusStageViewport() {
    return (
        state.currentView === 'galaxy' &&
        (window.matchMedia('(max-width: 768px) and (max-height: 740px)').matches ||
            window.matchMedia('(max-width: 430px) and (min-height: 741px) and (max-height: 860px)').matches)
    );
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

export function isThreadCandidateVisibleOnCanvas(index, margin = 18) {
    if (state.currentView !== 'galaxy') return true;
    if (!Number.isFinite(index)) return false;
    const position = state.nodePositions[index] || state.targetPositions[index] || state.originalPositions[index];
    const canvas = state.renderer?.domElement;
    if (!position || !state.camera || !canvas?.getBoundingClientRect) return true;

    const rect = canvas.getBoundingClientRect();
    const projection = new THREE.Vector3(position.x, position.y, position.z).project(state.camera);
    if (projection.z < -1 || projection.z > 1) return false;

    const screenX = ((projection.x + 1) / 2) * rect.width + rect.left;
    const screenY = ((-projection.y + 1) / 2) * rect.height + rect.top;
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return false;
    if (
        screenX < rect.left + margin ||
        screenY < rect.top + margin ||
        screenX > rect.right - margin ||
        screenY > rect.bottom - margin
    ) {
        return false;
    }

    const topEl = document.elementFromPoint(screenX, screenY);
    return !topEl || topEl === canvas || canvas.contains(topEl);
}

// --- Extraction Start ---

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

        // 10/10 Polish: Avoid "grounded in matching record layer" boilerplate
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

export function setStrandContinuityState(phase = 'idle', options = {}) {
    const normalizedPhase = ['idle', 'preview', 'pinned', 'exploring', 'arrived', 'returning'].includes(phase)
        ? phase
        : 'idle';
    state.strandContinuityState = {
        phase: normalizedPhase,
        targetIndex: Number.isFinite(options.targetIndex) ? options.targetIndex : null,
        fromIndex: Number.isFinite(options.fromIndex) ? options.fromIndex : null,
        reason: cleanOptionalValue(options.reason) || '',
        startedAt: performance.now()
    };
    if (document.body) {
        document.body.dataset.strandJourney = normalizedPhase;
        document.body.dataset.strandJourneyTarget = Number.isFinite(state.strandContinuityState.targetIndex)
            ? String(state.strandContinuityState.targetIndex)
            : '';
        document.body.dataset.strandJourneyFrom = Number.isFinite(state.strandContinuityState.fromIndex)
            ? String(state.strandContinuityState.fromIndex)
            : '';
        document.body.dataset.strandJourneyReason = state.strandContinuityState.reason;
    }
    if (['exploring', 'arrived'].includes(normalizedPhase)) {
        if (typeof window.syncArrivalHandoffOverlay === 'function') window.syncArrivalHandoffOverlay();
    } else if (normalizedPhase === 'idle') {
        if (typeof window.disposeArrivalHandoffOverlay === 'function') window.disposeArrivalHandoffOverlay();
    }
    return state.strandContinuityState;
}

export function clearStrandContinuityState(reason = 'clear') {
    setStrandContinuityState('idle', { reason });
}

export function renderThreadInspection(index = state.inspectedThreadIndex, options = {}) {
    const inspector = document.getElementById('focus-thread-inspector');
    const inspectionState = getThreadInspectionState(index, options);
    if (typeof window.syncInspectedStrandOverlay === 'function') window.syncInspectedStrandOverlay(inspectionState, options);
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
                    window.clearTimeout(state.canvasThreadInspectionClearTimer);
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
        window.clearTimeout(state.canvasThreadInspectionClearTimer);
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
        window.clearTimeout(state.canvasThreadInspectionClearTimer);
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
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    return inspectionState;
}

export function unpinThreadInspection() {
    if (state.canvasThreadInspectionClearTimer) {
        window.clearTimeout(state.canvasThreadInspectionClearTimer);
        state.canvasThreadInspectionClearTimer = null;
    }
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = null;
    clearStrandContinuityState('unpin');
    const inspectionState = renderThreadInspection(null, { surface: 'idle', force: true });
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    return inspectionState;
}

export function scheduleCanvasThreadInspectionClear(delay = 1800) {
    if (state.canvasThreadInspectionClearTimer) window.clearTimeout(state.canvasThreadInspectionClearTimer);
    state.canvasThreadInspectionClearTimer = window.setTimeout(() => {
        state.canvasThreadInspectionClearTimer = null;
        if (state.threadInspectorPointerInside || state.pinnedThreadIndex !== null) return;
        if (document.body.dataset.threadInspectSurface === 'canvas') {
            clearThreadInspection();
        }
    }, delay);
}

export function clearThreadInspection(options = {}) {
    if (options.force && state.canvasThreadInspectionClearTimer) {
        window.clearTimeout(state.canvasThreadInspectionClearTimer);
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
    if (!options.restoreHistory) {
        const history = [...(state.navState.walkHistoryIndices || [])];
        if (Number.isFinite(fromIndex) && history[history.length - 1] !== fromIndex) history.push(fromIndex);
        if (history[history.length - 1] !== index) history.push(index);
        state.navState.walkHistoryIndices = history;
    } else if (!Array.isArray(state.navState.walkHistoryIndices)) {
        state.navState.walkHistoryIndices = Number.isFinite(index) ? [index] : [];
    }
    if (Number.isFinite(state.strandContinuityState.arrivalTimeoutId)) {
        clearTimeout(state.strandContinuityState.arrivalTimeoutId);
        state.strandContinuityState.arrivalTimeoutId = undefined;
    }
    if (Number.isFinite(state.strandContinuityState.settleTimeoutId)) {
        clearTimeout(state.strandContinuityState.settleTimeoutId);
        state.strandContinuityState.settleTimeoutId = undefined;
    }
    renderThreadInspection(index, { force: true, surface: options.surface || 'walk' });
    state.navState.lastTraversalReason = reason;
    state.navState.mode = 'trail';
    const preserveNeighborhood =
        state.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expandNeighborhood;
    if (state.currentView === 'map') {
        if (typeof window.focusOnPoint === 'function') {
            window.focusOnPoint(targetPoint, {
                fromTraversal: true,
                appendHistory: !options.restoreHistory,
                restoreHistory: !!options.restoreHistory,
                fromIndex
            });
        }
    } else {
        if (typeof window.focusOnNode === 'function') {
            window.focusOnNode(index, {
                fromCanvasNode: !!options.fromCanvasNode,
                fromTraversal: true,
                preserveNeighborhood,
                appendHistory: !options.restoreHistory,
                restoreHistory: !!options.restoreHistory,
                fromIndex
            });
        }
    }
    if (typeof window.showExperienceToast === 'function') {
        window.showExperienceToast(
            'Following connection',
            `Moving along the semantic trail to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
        );
    }
    const capturedIndex = index;
    const capturedFromIndex = fromIndex;
    const capturedReason = reason;
    const arrivalTid = window.setTimeout(() => {
        if (!state.points) return;
        if (state.strandContinuityState.phase === 'exploring' && state.strandContinuityState.targetIndex === capturedIndex) {
            setStrandContinuityState('arrived', { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason });
            const pointAtArrival = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < state.points.length) ? state.points[capturedIndex] : null;
            syncFocusStage(pointAtArrival || state.selectedPoint || null);
            if (typeof window.updateJourneyCompass === 'function') window.updateJourneyCompass();
            primeNextThreadInspectionAfterWalk(capturedIndex);
            if (state.semanticDiveMode) {
                if (typeof window.previewInsideNextThread === 'function') window.previewInsideNextThread({ force: true });
                if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
            }
        }
    }, options.arrivalDelay || 820);
    state.strandContinuityState.arrivalTimeoutId = arrivalTid;
    const settleTid = window.setTimeout(() => {
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

export function getNeighborhoodRouteIndices() {
    if (!Number.isFinite(state.navState.neighborhoodAnchorIndex)) return [];
    return [
        state.navState.neighborhoodAnchorIndex,
        ...(state.navState.neighborhoodIndices || []).filter((index) => Number.isFinite(index))
    ];
}

export function isBoundedNeighborhoodActive() {
    return (
        state.currentView === 'galaxy' &&
        state.navState.neighborhoodSource === 'semantic' &&
        getNeighborhoodRouteIndices().length > 1
    );
}

export function getNeighborhoodCandidateForIndex(index) {
    if (!Number.isFinite(index)) return null;
    const isStoredNeighborhoodMember =
        index === state.navState.neighborhoodAnchorIndex ||
        (state.navState.neighborhoodIndices || []).includes(index);
    const candidate =
        (state.navState.threadCandidates || []).find((item) => item && item.index === index) ||
        (Number.isFinite(state.navState.neighborhoodAnchorIndex)
            ? getSemanticThreadCandidates(state.navState.neighborhoodAnchorIndex).find(
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
            state.navState.neighborhoodReasonByIndex?.get(index) ||
            (index === state.navState.neighborhoodAnchorIndex
                ? 'returned to the neighborhood center'
                : 'semantic neighbor')
    };
}

export function getSemanticNeighborRecordBetween(sourceIndex, targetIndex) {
    if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex >= state.points.length) return null;
    const sourcePoint = state.points[sourceIndex];
    if (!sourcePoint) return null;
    const sourceLeadId = normalizeLeadId(sourcePoint?.lead_id);
    if (!sourceLeadId || !Number.isFinite(targetIndex)) return null;
    const sourceNode = state.semanticNeighborMapByLeadId.get(sourceLeadId);
    if (!sourceNode?.neighbors?.length) return null;
    return (
        sourceNode.neighbors.find((neighbor) => {
            const candidateIndex = state.pointIndexByLeadId.get(neighbor.leadId);
            return candidateIndex === targetIndex;
        }) || null
    );
}

export function buildNeighborhoodManifest(anchorIndex, routeIndices, options = {}) {
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= state.points.length) return null;
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
            !isPointVisible(candidateIndex, state.points, null, state.activeFilters) || // Note: cluster filter is null here
            !state.nodePositions[candidateIndex]
        ) {
            return;
        }
        seen.add(candidateIndex);
        uniqueRoute.push(candidateIndex);
    });

    const candidates = new Map();
    const edges = [];
    const anchorLeadId = normalizeLeadId(state.points[anchorIndex]?.lead_id);
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
    if (options.commit) state.navState.neighborhoodCursor = nextCursor;
    return getNeighborhoodCandidateForIndex(route[nextCursor]);
}

export function getNextWalkCandidateForIndex(currentIndex, options = {}) {
    if (!Number.isFinite(currentIndex)) return null;
    if (options.allowNeighborhood !== false && isBoundedNeighborhoodActive()) {
        return getBoundedNeighborhoodWalkCandidate(1, currentIndex, { commit: !!options.commitNeighborhood });
    }
    const historySet = new Set(state.navState.walkHistoryIndices || []);
    const semanticWalkCandidateLimit = getSemanticThreadDisplayLimit();
    const candidates = getThreadCandidatesForIndex(currentIndex)
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters) && candidate.index !== currentIndex)
        .slice(0, semanticWalkCandidateLimit);
    const requireSemantic = options.requireSemantic ?? state.currentView === 'galaxy';
    const requireOnCanvas = options.requireOnCanvas ?? state.currentView === 'galaxy';
    const candidatePool = requireSemantic
        ? candidates.filter((candidate) => candidate?.source === 'semantic')
        : candidates;
    const visibleCandidatePool = requireOnCanvas
        ? candidatePool.filter((candidate) => isThreadCandidateVisibleOnCanvas(candidate.index))
        : candidatePool;
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
    return state.focusedNode;
}

export function ensureBoundedNeighborhoodFromActivePocket(seedIndex) {
    if (!Number.isFinite(seedIndex)) return;
    if (isBoundedNeighborhoodActive()) {
        if (state.navState.focusPocketMeta?.active && !state.navState.focusPocketMeta.boundedLoop) {
            state.navState.focusPocketMeta = {
                ...state.navState.focusPocketMeta,
                boundedLoop: true,
                motifLabel: state.navState.focusPocketMeta.motifLabel || 'selected neighborhood loop'
            };
        }
        if (!state.navState.neighborhoodManifest) {
            state.navState.neighborhoodManifest = buildNeighborhoodManifest(
                seedIndex,
                (state.navState.neighborhoodIndices || []).filter(Number.isFinite),
                { displayLimit: getSemanticThreadDisplayLimit() }
            );
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
    state.navState.focusPocketMeta = {
        ...state.navState.focusPocketMeta,
        boundedLoop: true,
        motifLabel: 'selected neighborhood loop'
    };
}

export function primeBoundedSemanticNeighborhoodForTraversal(seedIndex) {
    if (!Number.isFinite(seedIndex)) return false;
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    if (isBoundedNeighborhoodActive()) return true;

    setTrailFromSeed(seedIndex);
    if (state.navState.threadSource !== 'semantic') return false;
    if (typeof window.applyLocalNeighborhoodFocus === 'function') window.applyLocalNeighborhoodFocus(seedIndex);
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    return isBoundedNeighborhoodActive();
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
        state.navState.walkHistoryIndices = state.navState.walkHistoryIndices.slice(0, -1);
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
        if (typeof window.showExperienceToast === 'function') {
            window.showExperienceToast(
                'End of path',
                'No more connected neighbors are ready.'
            );
        }
        return;
    }
    walkThreadNeighbor(nextCandidate.index, {
        fromIndex: currentIndex,
        surface: isBoundedNeighborhoodActive() ? 'neighborhood-loop' : 'walk',
        reason: nextCandidate.reason || 'nearby business relationship'
    });
}

// --- Semantic Dive Mode ---

export function setSemanticDiveMode(enabled) {
    state.semanticDiveMode = Boolean(enabled);
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    
    // 10/10 Polish: Trigger the 'Sonic Boom' transition effect
    if (state.semanticDiveMode && document.body) {
        document.body.dataset.semanticDive = 'transitioning';
        window.setTimeout(() => {
            if (state.semanticDiveMode && document.body.dataset.semanticDive === 'transitioning') {
                document.body.dataset.semanticDive = 'active';
            }
        }, 820);
    }

    if (state.semanticDiveMode) {
        previewInsideNextThread({ force: true });
    } else {
        // Always clear thread inspection state on dive exit to avoid stale overlays.
        // For inside-cue path, preserveJourney keeps the strand continuity alive so
        // the user can still follow or backtrack. For all other surfaces, clear fully.
        if (document.body.dataset.threadInspectSurface === 'inside-cue') {
            clearThreadInspection({ force: true, preserveJourney: true });
        } else {
            clearThreadInspection({ force: true, preserveJourney: false });
        }
    }
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

// --- Original Functions Continued ---

export function syncFocusStage(point) {
    if (!state.points) return;
    const stage = document.getElementById('focus-stage');
    const stageCard = stage?.querySelector('.focus-stage-card');
    if (!stage || !stageCard) return;

    if (point === null) {
        if (typeof window.applyClusterUiAccent === 'function') window.applyClusterUiAccent(stageCard, null);
        stage.classList.remove('active');
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
        return;
    }

    const effectivePoint = point
        || state.selectedPoint
        || ((state.focusedNode !== null && state.focusedNode !== undefined && Number.isFinite(state.focusedNode) && state.focusedNode >= 0 && state.focusedNode < state.points.length) ? state.points[state.focusedNode] : null);

    if (!effectivePoint || state.currentView !== 'galaxy' || state.focusedNode === null) {
        if (typeof window.applyClusterUiAccent === 'function') window.applyClusterUiAccent(stageCard, null);
        stage.classList.remove('active');
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
        return;
    }

    if (typeof window.applyClusterUiAccent === 'function') window.applyClusterUiAccent(stageCard, effectivePoint);
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    stage.classList.add('active');

    const presentation = getBusinessNamePresentation(effectivePoint.name);
    const filedEl = document.getElementById('focus-stage-filed');
    const metaEl = document.getElementById('focus-stage-meta');
    const noteEl = document.getElementById('focus-stage-note');

    const nameEl = document.getElementById('focus-stage-name');
    const whatEl = document.getElementById('focus-stage-what');
    const badgesEl = document.getElementById('focus-stage-badges');
    const triviaEl = document.getElementById('focus-stage-trivia');
    
    if (nameEl) nameEl.textContent = presentation.display;
    if (whatEl) whatEl.textContent = sanitizePublicFacingNote(effectivePoint.what) || 'Montgomery County business record';
    
    // 10/10 Polish: Signal badges for focus stage
    if (badgesEl && typeof renderSignalBadges === 'function') {
        badgesEl.innerHTML = renderSignalBadges(effectivePoint);
        // Ensure badges container is visible when it has content
        badgesEl.style.display = badgesEl.innerHTML ? '' : 'none';
    }

    // Weather sensitivity for focus stage
    const focusSensitivityEl = document.getElementById('focus-stage-sensitivity');
    if (focusSensitivityEl) {
        const sensitivityBadges = [];
        if (effectivePoint.weather_sensitive) {
            sensitivityBadges.push('<span class="signal-badge weather">Weather Sensitive</span>');
        }
        if (effectivePoint.sensitivity_flags && effectivePoint.sensitivity_flags.length) {
            effectivePoint.sensitivity_flags.forEach((flag) => {
                sensitivityBadges.push(`<span class="signal-badge flag">${escapeHtml(flag)}</span>`);
            });
        }
        focusSensitivityEl.innerHTML = sensitivityBadges.join('');
        focusSensitivityEl.style.display = sensitivityBadges.length ? '' : 'none';
    }

    // 10/10 Polish: Interesting trivia for focus stage
    if (triviaEl && typeof window.getInterestingBusinessNote === 'function') {
        const interestingNote = window.getInterestingBusinessNote(effectivePoint);
        const matchNarrative = typeof window.buildSelectedMatchNarrative === 'function' ? window.buildSelectedMatchNarrative(effectivePoint) : '';
        const showTrivia = interestingNote && !matchNarrative.includes(interestingNote);
        triviaEl.textContent = showTrivia ? interestingNote : '';
        if (showTrivia) {
            triviaEl.removeAttribute('hidden');
        } else {
            triviaEl.setAttribute('hidden', '');
        }
    }

    // --- Dynamic Meta-Tag Hydration ---
    const pageTitle = `Focus: ${presentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(effectivePoint.what) || 'Exploring Montgomery County business records through semantic search and visualization.';
    updateDocumentMeta(pageTitle, pageDesc);
    // ----------------------------------

    if (filedEl) {
        if (presentation.showRaw && presentation.raw) {
            filedEl.textContent = COPY.selectedFiledAs(presentation.raw);
            filedEl.removeAttribute('hidden');
        } else {
            filedEl.setAttribute('hidden', '');
            filedEl.textContent = '';
        }
    }

    if (metaEl) {
        const chips = [
            effectivePoint.city || 'Montgomery County',
            describeCluster(effectivePoint.cluster),
            getPublicRecordStatusLabel(effectivePoint.status)
        ];
        metaEl.innerHTML = chips.map((chip) => `<span class="focus-stage-chip">${escapeHtml(chip)}</span>`).join('');
    }

    if (noteEl) {
        const strandArrivalNote = getStrandArrivalNote(effectivePoint);
        if (strandArrivalNote) {
            noteEl.textContent = strandArrivalNote;
        } else if (typeof window.hasColdDegradedSemanticFallback === 'function' && window.hasColdDegradedSemanticFallback()) {
            const copyFn = window.getColdDegradedRouteCopy;
            noteEl.textContent = (copyFn && copyFn())?.focusStageNote || '';
        } else if (state.navState.threadSource === 'semantic') {
            noteEl.textContent = state.currentSearchSummary
                ? 'Connections are live here. The route stays active while this stage keeps the node centered.'
                : 'Connections are live here. Overview steps back to the county; Refocus Neighborhood re-frames the local field around the selected business.';
        } else if (state.semanticThreadsStatus === 'loading') {
            noteEl.textContent = 'Connections are still loading, so this stage is using the live cloud for now.';
        } else {
            noteEl.textContent = 'Connections are not ready here yet, so this stage is using the live cloud as an approximate guide.';
        }
    }

    stage.classList.add('active');
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    const onboardingHint = document.getElementById('onboarding-hint');
    if (onboardingHint) {
        onboardingHint.classList.remove('visible');
        onboardingHint.setAttribute('aria-hidden', 'true');
        onboardingHint._dismissedThisSession = true;
        if (onboardingHint._autoHideTimer) clearTimeout(onboardingHint._autoHideTimer);
    }
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
}

export function setTrailFromSeed(seedIndex) {
    state.navState.trailSeedIndex = seedIndex;
    const semanticCandidates = getSemanticThreadCandidates(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    const candidates = (semanticCandidates.length ? semanticCandidates : getGeometricThreadCandidates(seedIndex))
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, limit);
    state.navState.threadCandidates = candidates;
    state.navState.threadReasonByIndex = new Map(candidates.map((candidate) => [candidate.index, candidate.reason]));
    state.navState.threadSource = semanticCandidates.length ? 'semantic' : (candidates[0]?.source || 'geometric-fallback');
    state.navState.trailNeighborIndices = candidates.map((candidate) => candidate.index);
    state.navState.trailCursor = (() => {
        const tc = candidates.findIndex((candidate) => candidate.index === state.navState.focusedIndex);
        return tc >= 0 ? tc : 0;
    })();
}

export function updateTrailIndices(seedIndex = getCurrentTrailFocusIndex()) {
    state.trailIndices.clear();
    if (seedIndex === null || seedIndex === undefined || seedIndex < 0 || seedIndex >= state.points.length) return;
    if (!isPointVisible(seedIndex, state.points, null, state.activeFilters)) return;
    state.trailIndices.add(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    (state.navState.threadCandidates.length ? state.navState.threadCandidates : getThreadCandidatesForIndex(seedIndex).slice(0, limit))
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .forEach((candidate) => state.trailIndices.add(candidate.index));
}

export function updateSelectedBusiness(point, options = {}) {
    const emptyEl = document.getElementById('selected-empty');
    const detailsEl = document.getElementById('selected-details');
    const cardEl = document.getElementById('selected-card');
    if (!emptyEl || !detailsEl) return;

    if (typeof updateSelectedCardHeading === 'function') updateSelectedCardHeading(point || null);

    if (!point) {
        if (cardEl) cardEl.style.opacity = '0';
        setTimeout(() => {
            emptyEl.classList.add('active');
            detailsEl.classList.remove('active');
            emptyEl.style.display = 'block';
            detailsEl.style.display = 'none';
            if (cardEl) cardEl.style.opacity = '1';
        }, 180);
        if (cardEl && typeof window.applyClusterUiAccent === 'function') window.applyClusterUiAccent(cardEl, null);
        if (cardEl) cardEl.classList.add('is-empty');
        if (typeof renderSelectedMetaStrip === 'function') renderSelectedMetaStrip(null);
        if (typeof renderSelectedMatchPanel === 'function') renderSelectedMatchPanel(null);
        if (typeof renderSelectedActionRow === 'function') renderSelectedActionRow(null);
        const roleEl = document.getElementById('selected-role-badge');
        if (roleEl) roleEl.textContent = COPY.selectedEmptyRole;
        const nameEl = document.getElementById('selected-name');
        if (nameEl) nameEl.textContent = COPY.selectedEmptyName;
        const whatEl = document.getElementById('selected-what');
        if (whatEl) whatEl.textContent = COPY.selectedEmptyWhat;
        const badgesEl = document.getElementById('selected-badges');
        if (badgesEl) badgesEl.innerHTML = '';
        const triviaEl = document.getElementById('selected-trivia');
        if (triviaEl) {
            triviaEl.textContent = '';
            triviaEl.style.display = 'none';
        }
        const factsEl = document.getElementById('selected-facts');
        if (factsEl) factsEl.textContent = COPY.selectedEmptyFacts;
        const sensitivityEl = document.getElementById('selected-sensitivity');
        if (sensitivityEl) { sensitivityEl.innerHTML = ''; sensitivityEl.style.display = 'none'; }
        const themeEl = document.getElementById('selected-theme');
        if (themeEl) themeEl.textContent = COPY.selectedEmptyTheme;
        const statusEl = document.getElementById('selected-status');
        if (statusEl) statusEl.textContent = COPY.selectedEmptyStatus;
        const mapEl = document.getElementById('selected-map');
        if (mapEl) mapEl.textContent = COPY.selectedEmptyMap;
        const threadEl = document.getElementById('selected-thread');
        if (threadEl) threadEl.textContent = COPY.selectedEmptyThread;
        const trailContextEl = document.getElementById('trail-context');
        if (trailContextEl) {
            trailContextEl.textContent = '';
            trailContextEl.style.display = 'none';
        }
        const filedAsEl = document.getElementById('selected-filed-as');
        if (filedAsEl) {
            filedAsEl.style.display = 'none';
            filedAsEl.textContent = '';
        }
        syncFocusStage(null);
        updateTraversalUi();
        document.title = 'Semantic Explorer | MoCo Business Mycelium';
        return;
    }

    // Bug 3 fix: Only flash opacity when transitioning FROM empty card TO populated card
    const cardWasEmpty = cardEl && cardEl.classList.contains('is-empty');
    if (cardWasEmpty) {
        cardEl.style.opacity = '0';
        emptyEl.classList.remove('active');
        detailsEl.classList.add('active');
        emptyEl.style.display = 'none';
        detailsEl.style.display = 'block';
        setTimeout(() => {
            cardEl.style.opacity = '1';
        }, 180);
    } else {
        // Just show details without the flash animation
        emptyEl.classList.remove('active');
        detailsEl.classList.add('active');
        emptyEl.style.display = 'none';
        detailsEl.style.display = 'block';
    }
    if (typeof window.applyClusterUiAccent === 'function') window.applyClusterUiAccent(cardEl, point);
    if (cardEl) cardEl.classList.remove('is-empty');

    const cascadeBg = document.getElementById('vector-cascade-bg');
    if (cascadeBg) {
        cascadeBg.innerHTML = '';
        cascadeBg.classList.remove('active');
        cascadeBg.classList.add('active');
        const generateVectorLine = () => Array.from({length: 6}, () => (Math.random() * 2 - 1).toFixed(3)).join('  ');
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const line = document.createElement('div');
                line.className = 'vector-cascade-line';
                line.textContent = generateVectorLine();
                cascadeBg.appendChild(line);
                setTimeout(() => line.remove(), 3000);
            }, i * 150);
        }
        setTimeout(() => cascadeBg.classList.remove('active'), 2000);
    }

    const namePresentation = getBusinessNamePresentation(point.name);
    const nameEl = document.getElementById('selected-name');
    if (nameEl) nameEl.textContent = namePresentation.display;

    // --- Dynamic Meta-Tag Hydration ---
    const pageTitle = `${namePresentation.display} | Semantic Explorer`;
    const pageDesc = sanitizePublicFacingNote(point.what) || 'Montgomery County business record details.';
    updateDocumentMeta(pageTitle, pageDesc);
    // ----------------------------------

    const roleEl = document.getElementById('selected-role-badge');
    if (roleEl && typeof window.getSelectedBusinessRoleLabel === 'function') roleEl.textContent = window.getSelectedBusinessRoleLabel(point);
    const filedAsEl = document.getElementById('selected-filed-as');
    if (filedAsEl) {
        const raw = namePresentation.raw;
        const isEmptyRaw = !raw || raw === '-' || raw.trim() === '';
        if (namePresentation.showRaw && !isEmptyRaw) {
            filedAsEl.textContent = COPY.selectedFiledAs(raw);
            filedAsEl.style.display = 'block';
        } else {
            filedAsEl.style.display = 'none';
            filedAsEl.textContent = '';
        }
    }
    const whatEl = document.getElementById('selected-what');
    if (whatEl) whatEl.textContent = sanitizePublicFacingNote(point.what) || 'Montgomery County business record';
    if (typeof renderSignalBadges === 'function') {
        const badgesEl = document.getElementById('selected-badges');
        if (badgesEl) badgesEl.innerHTML = renderSignalBadges(point);
    }
    if (typeof renderSelectedMetaStrip === 'function') renderSelectedMetaStrip(point);
    if (typeof renderSelectedMatchPanel === 'function') renderSelectedMatchPanel(point);
    if (typeof renderSelectedActionRow === 'function') renderSelectedActionRow(point);

    const factsEl = document.getElementById('selected-facts');
    const themeEl = document.getElementById('selected-theme');
    const statusEl = document.getElementById('selected-status');
    const mapEl = document.getElementById('selected-map');
    const threadEl = document.getElementById('selected-thread');

    const triviaEl = document.getElementById('selected-trivia');
    if (!factsEl) return;

    const interestingNote = typeof window.getInterestingBusinessNote === 'function' ? window.getInterestingBusinessNote(point) : null;
    if (triviaEl) {
        const matchNarrative = typeof window.buildSelectedMatchNarrative === 'function' ? window.buildSelectedMatchNarrative(point) : '';
        const showTrivia = interestingNote && !matchNarrative.includes(interestingNote);
        triviaEl.textContent = showTrivia ? interestingNote : '';
        triviaEl.style.display = showTrivia ? 'block' : 'none';
    }

    const suppressAutoRevealForFieldNode = options.revealCard !== true && typeof window.isFieldNodeFocusContext === 'function' && window.isFieldNodeFocusContext();
    if (options.revealCard !== false && !suppressAutoRevealForFieldNode) {
        if (typeof window.revealSelectedBusinessCard === 'function') window.revealSelectedBusinessCard();
    }
    syncFocusStage(point);

    const factParts = [];
    if (point.city) factParts.push(point.city);
    if (point.website) {
        const websiteLabel = escapeHtml(point.website.replace(/^https?:\/\//, '').replace(/\/$/, ''));
        const href = point.website.match(/^https?:\/\//)
            ? point.website
            : `https://${point.website}`;
        factParts.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${websiteLabel}</a>`);
    }
    if (point.email) factParts.push(`<a href="mailto:${escapeHtml(point.email)}">${escapeHtml(point.email)}</a>`);
    if (point.phone) factParts.push(`<a href="tel:${escapeHtml(point.phone)}">${escapeHtml(point.phone)}</a>`);
    // Only add pipe separators between populated fields — never render a bare " | " trailing
    factsEl.innerHTML = factParts.length
        ? factParts.join(' &nbsp;|&nbsp; ')
        : '<span class="facts-none">No contact info on file</span>';

    // Weather sensitivity for selected card
    const sensitivityEl = document.getElementById('selected-sensitivity');
    if (sensitivityEl) {
        const sensitivityBadges = [];
        if (point.weather_sensitive) {
            sensitivityBadges.push('<span class="signal-badge weather">Weather Sensitive</span>');
        }
        if (point.sensitivity_flags && point.sensitivity_flags.length) {
            point.sensitivity_flags.forEach((flag) => {
                sensitivityBadges.push(`<span class="signal-badge flag">${escapeHtml(flag)}</span>`);
            });
        }
        sensitivityEl.innerHTML = sensitivityBadges.join('');
        sensitivityEl.style.display = sensitivityBadges.length ? '' : 'none';
    }

    themeEl.textContent = describeCluster(point.cluster);
    statusEl.textContent = getPublicRecordStatusLabel(point.status);

    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
        mapEl.textContent = `Mapped at ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
    } else {
        mapEl.textContent = 'No geocoded point';
    }

    if (threadEl && typeof window.describeThreadLensForPoint === 'function') {
        threadEl.textContent = window.describeThreadLensForPoint(point);
    }

    updateTraversalUi();

    if (!options.skipHydrate && !interestingNote && !point.website && !point.email && !point.phone) {
        if (typeof window.hydrateLeadContext === 'function') void window.hydrateLeadContext(point, { refreshSelected: true });
    }
}

function hasColdDegradedSemanticFallback() {
    return typeof window.hasColdDegradedSemanticFallback === 'function'
        ? window.hasColdDegradedSemanticFallback()
        : false;
}

function shouldUseFloatingFocusJourneyOnly() {
    return typeof window.shouldUseFloatingFocusJourneyOnly === 'function'
        ? window.shouldUseFloatingFocusJourneyOnly()
        : false;
}

function getActiveNextFocusIndex() {
    const focusedIndex = Number.isFinite(state.navState.focusedIndex)
        ? state.navState.focusedIndex
        : getCurrentTrailFocusIndex();
    const candidate = getNextWalkCandidateForIndex(focusedIndex, {
        requireSemantic: state.currentView === 'galaxy',
        requireOnCanvas: state.currentView === 'galaxy'
    });
    return Number.isFinite(candidate?.index) ? candidate.index : null;
}

function getLineSegmentCount(lineObject) {
    const positionAttr = lineObject?.geometry?.attributes?.position;
    return positionAttr ? Math.floor(positionAttr.count / 2) : 0;
}

function disposeLineObject(lineObject) {
    lineObject?.geometry?.dispose?.();
    lineObject?.material?.dispose?.();
}

function getNodeVector(index) {
    const pos = state.nodePositions[index] || state.targetPositions[index] || state.originalPositions[index];
    if (!pos) return null;
    const px = Number.isFinite(pos.x) ? pos.x : 0;
    const py = Number.isFinite(pos.y) ? pos.y : 0;
    const pz = Number.isFinite(pos.z) ? pos.z : 0;
    return new THREE.Vector3(px, py, pz);
}

function getArcPoint(from, to, t, lift = 0.08, side = 0) {
    if (!from || !to) return null;
    const distance = from.distanceTo(to);
    if (!Number.isFinite(distance)) return null;
    const point = from.clone().lerp(to, t);
    const arch = Math.sin(Math.PI * t) * Math.max(0.018, distance * lift);
    point.y += arch;
    if (side) {
        point.x += Math.sin(Math.PI * t) * side * distance * 0.025;
        point.z -= Math.sin(Math.PI * t) * side * distance * 0.018;
    }
    return point;
}

function pushArcSegments(positions, colors, fromIndex, toIndex, color, options = {}) {
    const from = getNodeVector(fromIndex);
    const to = getNodeVector(toIndex);
    if (!from || !to) return 0;
    const steps = options.steps || ROUTE_TRACE_SEGMENT_STEPS;
    const lift = options.lift ?? 0.08;
    const side = options.side || 0;
    for (let segment = 0; segment < steps; segment += 1) {
        const t0 = segment / steps;
        const t1 = (segment + 1) / steps;
        const p0 = getArcPoint(from, to, t0, lift, side);
        const p1 = getArcPoint(from, to, t1, lift, side);
        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    return steps;
}

// ShaderMaterial with glow effect for route trace lines (LineSegments-based overview lines)
function buildRouteTraceMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: performance.now() / 1000 },
            opacity: { value: 0.22 },
            baseOpacity: { value: 0.22 }
        },
        vertexShader: `
            varying vec3 vColor;
            void main() {
                vColor = color;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float baseOpacity;
            varying vec3 vColor;
            
            // Simple noise for spore effect
            float hash(float n) { return fract(sin(n) * 43758.5453123); }
            
            void main() {
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 gold = vec3(1.0, 0.85, 0.38);
                vec3 pearl = vec3(0.92, 1.0, 0.96);
                
                // Mycelium "spore" movement
                float pulse = sin(time * 3.5 + gl_FragCoord.x * 0.05) * 0.5 + 0.5;
                float noise = hash(floor(time * 8.0 + gl_FragCoord.y * 0.1));
                
                // Subtle glow breathing effect
                float breath = 0.85 + sin(time * 2.8) * 0.15;
                
                // Warm accent glow pulse
                float accentPulse = 0.5 + sin(time * 1.5) * 0.3;
                
                // Mix base color with accent colors
                vec3 warmColor = mix(teal, gold, vColor.g);
                vec3 finalColor = mix(vColor, warmColor, 0.42);
                
                // Add moving "spore" highlights
                float spore = step(0.97, fract(pulse + noise)) * 0.15;
                finalColor += pearl * spore;
                
                finalColor = mix(finalColor, pearl, accentPulse * 0.14);
                float alpha = baseOpacity * breath * (0.9 + spore * 2.0);
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
}

function resetRouteTraceDiagnostics(reason = 'inactive') {
    state.routeTraceDiagnostics = {
        active: false,
        reason,
        phase: document.body.dataset.journeyPhase || 'overview',
        indexCount: 0,
        edgeCount: 0,
        segmentCount: 0,
        anchorIndex: null,
        mapPointCount: state.routeTraceDiagnostics?.mapPointCount || 0,
        mapPathActive: !!state.routeTraceDiagnostics?.mapPathActive
    };
}

function removeRouteTraceOverlay() {
    if (!state.routeTraceLines) return;
    if (state.myceliumGroup) state.myceliumGroup.remove(state.routeTraceLines);
    disposeLineObject(state.routeTraceLines);
    state.routeTraceLines = null;
    state.routeTraceConnectionPairs = [];
}

function getRouteEmbodimentIndices() {
    const indices = [];
    const push = (index) => {
        if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return;
        if (!indices.includes(index)) indices.push(index);
    };
    if (Number.isFinite(state.navState.focusedIndex)) push(state.navState.focusedIndex);
    (state.navState.walkHistoryIndices || []).forEach(push);
    if (state.currentSearchSummary?.anchorIndex !== undefined) push(state.currentSearchSummary.anchorIndex);
    (state.currentSearchSummary?.resultIndices || []).slice(0, 7).forEach(push);
    (state.navState.threadCandidates || []).slice(0, 6).forEach((candidate) => push(candidate?.index));
    return indices;
}

export function setRouteChoreographyPhase(phase = 'overview', details = {}) {
    state.routeChoreographyState = {
        ...(state.routeChoreographyState || {}),
        ...details,
        phase,
        reason: details.reason || state.routeChoreographyState?.reason || 'state',
        startedAt: performance.now()
    };
    if (document.body?.dataset) {
        document.body.dataset.routeMotion = state.currentView === 'galaxy' ? phase : 'inactive';
    }
    refreshRouteTraceOverlay({ reason: details.reason || phase });
}

export function refreshRouteTraceOverlay(options = {}) {
    removeRouteTraceOverlay();
    if (!state.myceliumGroup || state.currentView !== 'galaxy') {
        resetRouteTraceDiagnostics('inactive-view');
        return;
    }
    const indices = getRouteEmbodimentIndices().filter((index) => isPointVisible(index, state.points, null, state.activeFilters));
    const anchorIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : indices[0];
    if (!Number.isFinite(anchorIndex) || indices.length < 2) {
        resetRouteTraceDiagnostics(indices.length ? 'single-node' : 'not-built');
        return;
    }

    const routeColor = new THREE.Color(0x4ecdc4);
    const cueColor = new THREE.Color(0xffdf6e);
    const positions = [];
    const colors = [];
    let edgeCount = 0;
    let segmentCount = 0;
    indices.forEach((index, order) => {
        if (index === anchorIndex) return;
        const color = order <= 2 ? cueColor : routeColor;
        const side = (order % 3) - 1;
        const added = pushArcSegments(positions, colors, anchorIndex, index, color, { lift: 0.11, side });
        if (added) {
            edgeCount += 1;
            segmentCount += added;
        }
    });
    if (!segmentCount) {
        resetRouteTraceDiagnostics('empty');
        return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = buildRouteTraceMaterial();
    if (state.semanticDiveMode) {
        material.uniforms.baseOpacity.value = 0.34;
        material.uniforms.opacity.value = 0.34;
    }
    state.routeTraceLines = new THREE.LineSegments(geometry, material);
    state.routeTraceConnectionPairs = indices
        .filter((index) => index !== anchorIndex)
        .map((index, order) => ({ a: anchorIndex, b: index, side: (order % 3) - 1 }));
    state.myceliumGroup.add(state.routeTraceLines);
    state.routeTraceDiagnostics = {
        active: true,
        reason: options.reason || state.routeChoreographyState?.reason || 'route',
        phase: document.body.dataset.journeyPhase || state.routeChoreographyState?.phase || 'focus',
        indexCount: indices.length,
        edgeCount,
        segmentCount,
        anchorIndex,
        mapPointCount: state.routeTraceDiagnostics?.mapPointCount || 0,
        mapPathActive: !!state.routeTraceDiagnostics?.mapPathActive
    };
}

export function updateRouteTraceOverlayPositions(now = performance.now()) {
    const line = state.routeTraceLines;
    const pairs = state.routeTraceConnectionPairs || [];
    if (!line?.geometry?.attributes?.position || !pairs.length) return;
    const positions = line.geometry.attributes.position.array;
    let offset = 0;
    pairs.forEach((pair) => {
        const from = getNodeVector(pair.a);
        const to = getNodeVector(pair.b);
        if (!from || !to) return;
        for (let segment = 0; segment < ROUTE_TRACE_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side);
            const p1 = getArcPoint(from, to, (segment + 1) / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side);
            positions[offset++] = p0.x;
            positions[offset++] = p0.y;
            positions[offset++] = p0.z;
            positions[offset++] = p1.x;
            positions[offset++] = p1.y;
            positions[offset++] = p1.z;
        }
    });
    line.geometry.attributes.position.needsUpdate = true;
    // Update ShaderMaterial uniforms for glow animation
    if (line.material?.uniforms) {
        line.material.uniforms.time.value = now / 1000;
        const targetOpacity = state.semanticDiveMode ? 0.34 : 0.22;
        line.material.uniforms.baseOpacity.value = targetOpacity;
        line.material.uniforms.opacity.value = targetOpacity;
    }
    state.routeTraceDiagnostics.segmentCount = getLineSegmentCount(line);
}

function removeArrivalHandoffOverlay() {
    if (!state.arrivalHandoffGroup) return;
    state.scene?.remove(state.arrivalHandoffGroup);
    state.arrivalHandoffGroup.traverse?.((child) => disposeLineObject(child));
    state.arrivalHandoffGroup = null;
    state.arrivalHandoffDiagnostics = {
        active: false,
        fromIndex: null,
        targetIndex: null,
        phase: 'idle',
        segmentCount: 0,
        endpointCount: 0,
        opacity: 0
    };
}

function buildArrivalHandoffOverlay(fromIndex, targetIndex) {
    const from = getNodeVector(fromIndex);
    const to = getNodeVector(targetIndex);
    if (!from || !to || !state.scene) return;
    removeArrivalHandoffOverlay();
    const group = new THREE.Group();
    group.name = 'arrival-memory-strand';
    group.userData = { fromIndex, targetIndex };
    const positions = [];
    const colors = [];
    const color = new THREE.Color(0xffdf6e);
    [-1, 0, 1, 2].forEach((side) => {
        pushArcSegments(positions, colors, fromIndex, targetIndex, color, {
            steps: ARRIVAL_HANDOFF_SEGMENT_STEPS,
            lift: 0.16,
            side: side * 0.42
        });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    group.add(new THREE.LineSegments(geometry, material));
    state.scene.add(group);
    state.arrivalHandoffGroup = group;
    state.arrivalHandoffDiagnostics = {
        active: true,
        fromIndex,
        targetIndex,
        phase: state.strandContinuityState.phase,
        segmentCount: getLineSegmentCount(group.children[0]),
        endpointCount: 2,
        opacity: material.opacity
    };
}

export function disposeArrivalHandoffOverlay() {
    removeArrivalHandoffOverlay();
}

export function syncArrivalHandoffOverlay() {
    const phase = state.strandContinuityState?.phase;
    const fromIndex = state.strandContinuityState?.fromIndex;
    const targetIndex = state.strandContinuityState?.targetIndex;
    if (!['exploring', 'arrived'].includes(phase) || !Number.isFinite(fromIndex) || !Number.isFinite(targetIndex)) {
        removeArrivalHandoffOverlay();
        return;
    }
    const existing = state.arrivalHandoffGroup?.userData || {};
    if (
        !state.arrivalHandoffGroup
        || existing.fromIndex !== fromIndex
        || existing.targetIndex !== targetIndex
    ) {
        buildArrivalHandoffOverlay(fromIndex, targetIndex);
    }
    updateArrivalHandoffOverlay();
}

export function updateArrivalHandoffOverlay() {
    const group = state.arrivalHandoffGroup;
    const phase = state.strandContinuityState?.phase;
    if (!group || !['exploring', 'arrived'].includes(phase)) {
        if (group) removeArrivalHandoffOverlay();
        return;
    }
    const line = group.children[0];
    const fromIndex = group.userData?.fromIndex;
    const targetIndex = group.userData?.targetIndex;
    const from = getNodeVector(fromIndex);
    const to = getNodeVector(targetIndex);
    if (!line?.geometry?.attributes?.position || !from || !to) return;
    const positions = line.geometry.attributes.position.array;
    let offset = 0;
    [-1, 0, 1, 2].forEach((side) => {
        for (let segment = 0; segment < ARRIVAL_HANDOFF_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ARRIVAL_HANDOFF_SEGMENT_STEPS, 0.16, side * 0.42);
            const p1 = getArcPoint(from, to, (segment + 1) / ARRIVAL_HANDOFF_SEGMENT_STEPS, 0.16, side * 0.42);
            positions[offset++] = p0.x;
            positions[offset++] = p0.y;
            positions[offset++] = p0.z;
            positions[offset++] = p1.x;
            positions[offset++] = p1.y;
            positions[offset++] = p1.z;
        }
    });
    line.geometry.attributes.position.needsUpdate = true;
    const age = Math.max(0, performance.now() - (state.strandContinuityState.startedAt || performance.now()));
    const opacity = phase === 'exploring'
        ? 0.5
        : THREE.MathUtils.clamp(0.5 - Math.max(0, age - 650) / 6200, 0.12, 0.5);
    line.material.opacity = opacity;
    state.arrivalHandoffDiagnostics = {
        active: true,
        fromIndex,
        targetIndex,
        phase,
        segmentCount: getLineSegmentCount(line),
        endpointCount: 2,
        opacity
    };
}

function resetFocusThreadDiagnostics(reason = 'inactive') {
    state.focusThreadDiagnostics = {
        active: false,
        reason,
        edgeCount: 0,
        directEdgeCount: 0,
        supportEdgeCount: 0,
        subduedEdgeCount: 0,
        segmentCount: 0,
        vertexCount: 0,
        overlayNodeCount: 0,
        nextCueSegments: 0,
        denseBundleMode: false,
        buildMs: 0,
        avgFrameMs: state.focusFrameDiagnostics.avgFrameMs || 0,
        maxFrameMs: state.focusFrameDiagnostics.maxFrameMs || 0
    };
}

function removeFocusSemanticOverlay() {
    if (!state.focusSemanticLines) return;
    if (state.myceliumGroup) state.myceliumGroup.remove(state.focusSemanticLines);
    state.focusSemanticLines.geometry?.dispose?.();
    state.focusSemanticLines.material?.dispose?.();
    state.focusSemanticLines = null;
    state.focusSemanticConnectionPairs = [];
}

function getFocusCurvePoint(edge, t) {
    if (typeof window.getFocusThreadCurvePoint === 'function') {
        return window.getFocusThreadCurvePoint(edge, t);
    }
    const a = state.nodePositions[edge.a];
    const b = state.nodePositions[edge.b];
    if (!a || !b) return new THREE.Vector3();
    const ax = Number.isFinite(a.x) ? a.x : 0;
    const ay = Number.isFinite(a.y) ? a.y : 0;
    const az = Number.isFinite(a.z) ? a.z : 0;
    const bx = Number.isFinite(b.x) ? b.x : 0;
    const by = Number.isFinite(b.y) ? b.y : 0;
    const bz = Number.isFinite(b.z) ? b.z : 0;
    return new THREE.Vector3(ax, ay, az).lerp(new THREE.Vector3(bx, by, bz), t);
}

function isReducedMotionPreferred() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}


/**
 * Builds a LineMaterial-compatible ShaderMaterial for use with THREE.Line2.
 * Produces thick, scalable-width glowing strands with teal-gold gradient,
 * spore animation, breath animation, and semanticScore reaction.
 */
function buildFocusThreadLineMaterial() {
    const baseOpacity = state.navState.focusPocketMeta?.active ? 0.18 : 0.24;
    const lineMaterial = new LineMaterial({
        linewidth: 1.35,
        transparent: true,
        opacity: baseOpacity,
        vertexColors: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });

    lineMaterial.onBeforeCompile((shader) => {
        // Add custom per-vertex attributes to vertex shader
        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            `attribute float progress;
            attribute float cue;
            attribute float priority;
            attribute float lane;
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;
            void main() {`
        );
        // Expose custom attributes as varyings
        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_pars_vertex>',
            `#include <color_pars_vertex>
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;`
        );
        // Set varyings before gl_Position
        shader.vertexShader = shader.vertexShader.replace(
            'gl_Position = clip;',
            `vProgress = progress;
            vCue = cue;
            vPriority = priority;
            vLane = lane;
            gl_Position = clip;`
        );
        // Declare custom uniforms and varyings in fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
            'uniform float opacity;',
            `uniform float opacity;
            uniform float time;
            uniform float semanticScore;
            uniform float reducedMotion;
            varying float vProgress;
            varying float vCue;
            varying float vPriority;
            varying float vLane;`
        );
        // Inject visual effects into fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, alpha );',
            `vec4 diffuseColor = vec4( diffuse, alpha );

            vec3 teal = vec3(0.43, 1.0, 0.91);
            vec3 gold = vec3(1.0, 0.85, 0.38);
            vec3 pearl = vec3(0.92, 1.0, 0.96);

            vec3 gradientColor = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));
            vec3 baseColor = mix(diffuseColor.rgb, gradientColor, 0.58);

            float motionScale = 1.0 - step(0.5, reducedMotion);
            float flow = fract(vProgress - time * 0.82 * motionScale);
            float pulseFreq = 0.52 + (semanticScore * 1.6);
            float sporeFlow = fract(vProgress - time * pulseFreq * motionScale + abs(vLane) * 0.08);
            float sporeSize = 1.8 + (semanticScore * 3.2);
            float spore = pow(1.0 - abs(sporeFlow - 0.58) * 2.0, sporeSize) * motionScale;
            float bead = pow(1.0 - abs(flow - 0.58) * 2.0, 3.0) * motionScale;
            float breath = mix(1.0, 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16, motionScale);

            vec3 finalColor = mix(baseColor, pearl, spore * 0.36);
            vec3 cueColor = vec3(1.0, 0.82, 0.34);
            finalColor = mix(finalColor, cueColor, vCue * (0.42 + bead * 0.1));
            float priorityFloor = mix(0.16, 0.72, smoothstep(0.18, 1.0, vPriority));
            float alpha = diffuseColor.a * breath * priorityFloor
                + spore * 0.06
                + bead * 0.025
                + vCue * 0.055
                + semanticScore * 0.045;
            diffuseColor = vec4(finalColor, min(alpha, 0.42));`
        );

        // Register custom uniforms
        shader.uniforms.time = { value: performance.now() / 1000 };
        shader.uniforms.semanticScore = { value: 0.5 };
        shader.uniforms.reducedMotion = { value: isReducedMotionPreferred() ? 1 : 0 };

        // Store shader reference for uniform updates
        lineMaterial.userData.shader = shader;
    });

    return lineMaterial;
}

export function refreshFocusSemanticOverlay() {
    const startedAt = performance.now();
    removeFocusSemanticOverlay();
    resetFocusThreadDiagnostics('refreshing');

    if (!state.myceliumGroup) {
        resetFocusThreadDiagnostics('no-mycelium');
        return;
    }
    if (!Number.isFinite(state.navState.focusedIndex)) {
        resetFocusThreadDiagnostics('no-focus');
        return;
    }
    if (state.navState.threadSource !== 'semantic') {
        resetFocusThreadDiagnostics('non-semantic-thread');
        return;
    }

    const focusIndex = state.navState.focusedIndex;
    const nextFocusIndex = getActiveNextFocusIndex();
    const focusPointAtFocus = (Number.isFinite(focusIndex) && focusIndex >= 0 && focusIndex < state.points.length) ? state.points[focusIndex] : null;
    const focusCluster = focusPointAtFocus?.cluster ?? 0;
    const semanticCandidates = (state.navState.threadCandidates || [])
        .filter((candidate) => candidate?.source === 'semantic' && candidate.index !== focusIndex)
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, 10);
    const roleByIndex = state.navState.focusPocketRoleByIndex instanceof Map
        ? state.navState.focusPocketRoleByIndex
        : new Map();
    const roleBudgets = { primary: 12, support: 6, halo: 3, trail: 4 };
    const roleOrder = { primary: 0, support: 1, halo: 2, trail: 3 };
    const roleCounts = { primary: 0, support: 0, halo: 0, trail: 0 };
    const pocketThreadIndices = (state.navState.focusPocketIndices || [])
        .filter((index) => Number.isFinite(index) && index !== focusIndex)
        .sort((a, b) => {
            const roleA = roleByIndex.get(a) || 'trail';
            const roleB = roleByIndex.get(b) || 'trail';
            return (roleOrder[roleA] ?? 4) - (roleOrder[roleB] ?? 4);
        })
        .filter((index) => {
            const role = roleByIndex.get(index) || 'trail';
            const budget = roleBudgets[role] ?? roleBudgets.trail;
            if (roleCounts[role] >= budget) return false;
            roleCounts[role] += 1;
            return true;
        });
    const pocketThreadSet = new Set(pocketThreadIndices);
    const stagedSemanticIndices = semanticCandidates
        .map((candidate) => candidate.index)
        .filter((index) => pocketThreadSet.has(index));
    const overlayIndices = [...new Set([
        nextFocusIndex,
        ...pocketThreadIndices,
        ...stagedSemanticIndices
    ])].filter((index) => Number.isFinite(index) && index !== focusIndex);

    if (!overlayIndices.length) {
        resetFocusThreadDiagnostics('empty-overlay');
        return;
    }

    const positions = [];
    const colors = [];
    const progress = [];
    const cue = [];
    const priority = [];
    const lane = [];
    const semanticScore = [];
    const localEdgeKeys = new Set();
    const pocketSet = new Set(state.navState.focusPocketIndices || []);
    const focusColor = new THREE.Color(state.COLORS[focusCluster % state.COLORS.length]).lerp(new THREE.Color(0xffd66b), 0.42);
    const cueColor = new THREE.Color(0xffe27a);
    let nextCueSegments = 0;
    let directEdgeCount = 0;
    let supportEdgeCount = 0;
    let subduedEdgeCount = 0;

    const addEdge = (a, b, role = 'direct', edgePriority = 0.66) => {
        const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (localEdgeKeys.has(edgeKey)) return;
        if (!state.nodePositions[a] || !state.nodePositions[b]) return;
        localEdgeKeys.add(edgeKey);
        if (role === 'direct') directEdgeCount += 1;
        else supportEdgeCount += 1;
        if (edgePriority < 0.42) subduedEdgeCount += 1;

        const isNextEdge = Number.isFinite(nextFocusIndex)
            && ((a === focusIndex && b === nextFocusIndex) || (b === focusIndex && a === nextFocusIndex));
        const candidateCluster = state.points[b]?.cluster ?? focusCluster;
        const candidateColor = new THREE.Color(state.COLORS[candidateCluster % state.COLORS.length]).lerp(
            isNextEdge ? cueColor : new THREE.Color(0x56d8d1),
            isNextEdge ? 0.58 : 0.24
        );
        const edge = {
            a,
            b,
            side: ((a * 31 + b * 17) % 2 === 0) ? 1 : -1,
            rise: (((a + b) % 5) - 2) / 2 || 0.45,
            depth: role === 'direct' ? 0.9 : 0.42,
            curveLift: role === 'direct' ? (pocketSet.has(b) ? 0.68 : 0.54) : 0.34,
            motifBraid: 0.56,
            anchorPull: role === 'direct' ? 0.14 : 0.24,
            role,
            priority: edgePriority
        };

        for (let segment = 0; segment < state.FOCUS_THREAD_SEGMENTS; segment += 1) {
            const t0 = segment / state.FOCUS_THREAD_SEGMENTS;
            const t1 = (segment + 1) / state.FOCUS_THREAD_SEGMENTS;
            const segmentEdge = { ...edge, t0, t1, cue: isNextEdge ? 1 : 0 };
            state.focusSemanticConnectionPairs.push(segmentEdge);
            const p0 = getFocusCurvePoint(segmentEdge, t0);
            const p1 = getFocusCurvePoint(segmentEdge, t1);
            const c0 = focusColor.clone().lerp(candidateColor, t0);
            const c1 = focusColor.clone().lerp(candidateColor, t1);
            if (isNextEdge) {
                c0.lerp(cueColor, 0.34);
                c1.lerp(cueColor, 0.44);
                nextCueSegments += 1;
            }
            positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
            progress.push(t0, t1);
            cue.push(isNextEdge ? 1 : 0, isNextEdge ? 1 : 0);
            priority.push(edgePriority, edgePriority);
            lane.push(edge.side, edge.side);
            semanticScore.push(edgePriority, edgePriority);
        }
    };

    const getPocketEdgePriority = (index, order) => {
        const role = roleByIndex.get(index);
        if (role === 'primary') return 0.78;
        if (role === 'support') return 0.54;
        if (role === 'halo') return 0.34;
        return pocketSet.has(index) ? 0.62 : 0.58 - order * 0.025;
    };

    overlayIndices.forEach((index, order) => {
        const isNext = index === nextFocusIndex;
        const pocketRole = roleByIndex.get(index);
        const edgeRole = pocketRole === 'support' || pocketRole === 'halo' ? 'support' : 'direct';
        addEdge(focusIndex, index, edgeRole, isNext ? 1 : getPocketEdgePriority(index, order));
    });

    overlayIndices.slice(0, 3).forEach((index) => {
        getThreadCandidatesForIndex(index)
            .filter((candidate) => overlayIndices.includes(candidate.index) && candidate.index !== focusIndex)
            .slice(0, 1)
            .forEach((candidate) => addEdge(index, candidate.index, 'support', 0.28));
    });

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(positions);
    lineGeometry.setColors(colors);

    // Set custom attributes on the geometry for our shader effects
    lineGeometry.setAttribute('progress', new THREE.Float32BufferAttribute(progress, 1));
    lineGeometry.setAttribute('cue', new THREE.Float32BufferAttribute(cue, 1));
    lineGeometry.setAttribute('priority', new THREE.Float32BufferAttribute(priority, 1));
    lineGeometry.setAttribute('lane', new THREE.Float32BufferAttribute(lane, 1));
    lineGeometry.setAttribute('semanticScore', new THREE.Float32BufferAttribute(semanticScore, 1));

    const lineMaterial = buildFocusThreadLineMaterial();
    // Use average semanticScore across all segments to drive the material's reaction
    const avgSemanticScore = semanticScore.length > 0
        ? semanticScore.reduce((s, v) => s + v, 0) / semanticScore.length
        : 0.5;
    // Set the semanticScore on the compiled shader uniforms
    if (lineMaterial.userData?.shader) {
        lineMaterial.userData.shader.uniforms.semanticScore.value = avgSemanticScore;
    }
    // Also try direct uniform access for ShaderMaterial fallback
    if (lineMaterial.uniforms?.semanticScore) {
        lineMaterial.uniforms.semanticScore.value = avgSemanticScore;
    }

    state.focusSemanticLines = new Line2(lineGeometry, lineMaterial);
    state.focusSemanticLines.computeLineDistances();
    state.focusSemanticLines.userData = {
        focusedIndex: focusIndex,
        nextIndex: Number.isFinite(nextFocusIndex) ? nextFocusIndex : null,
        nextCueSegments,
        edgeCount: localEdgeKeys.size,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        segmentCount: state.focusSemanticConnectionPairs.length,
        vertexCount: positions.length / 3,
        overlayNodeCount: overlayIndices.length,
        buildMs: performance.now() - startedAt
    };
    state.focusFrameDiagnostics = {
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0
    };
    state.focusThreadDiagnostics = {
        active: true,
        reason: 'built',
        edgeCount: localEdgeKeys.size,
        directEdgeCount,
        supportEdgeCount,
        subduedEdgeCount,
        segmentCount: state.focusSemanticConnectionPairs.length,
        vertexCount: positions.length / 3,
        overlayNodeCount: overlayIndices.length,
        nextCueSegments,
        denseBundleMode: overlayIndices.length >= 6,
        buildMs: performance.now() - startedAt,
        avgFrameMs: 0,
        maxFrameMs: 0
    };
    state.myceliumGroup.add(state.focusSemanticLines);
}

function updateFocusSemanticOverlayPositions(now = performance.now()) {
    const line = state.focusSemanticLines;
    const pairs = state.focusSemanticConnectionPairs || [];
    if (!line?.geometry?.attributes?.instanceStart || !pairs.length) return;
    const reducedMotion = isReducedMotionPreferred();
    const startAttr = line.geometry.attributes.instanceStart;
    const endAttr = line.geometry.attributes.instanceEnd;
    let offset = 0;
    pairs.forEach((edge) => {
        const p0 = getFocusCurvePoint(edge, edge.t0);
        const p1 = getFocusCurvePoint(edge, edge.t1);
        startAttr.array[offset] = Number.isFinite(p0.x) ? p0.x : 0;
        startAttr.array[offset + 1] = Number.isFinite(p0.y) ? p0.y : 0;
        startAttr.array[offset + 2] = Number.isFinite(p0.z) ? p0.z : 0;
        endAttr.array[offset] = Number.isFinite(p1.x) ? p1.x : 0;
        endAttr.array[offset + 1] = Number.isFinite(p1.y) ? p1.y : 0;
        endAttr.array[offset + 2] = Number.isFinite(p1.z) ? p1.z : 0;
        offset += 3;
    });
    startAttr.needsUpdate = true;
    endAttr.needsUpdate = true;
    // Update time uniform on the compiled shader
    if (line.material?.userData?.shader) {
        line.material.userData.shader.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
        if (!reducedMotion) {
            line.material.userData.shader.uniforms.time.value = now / 1000;
        }
    }
    if (!reducedMotion && line.material?.uniforms?.time) {
        line.material.uniforms.time.value = now / 1000;
    }
    if (line.material?.uniforms?.reducedMotion) {
        line.material.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
    }
}

function getFocusThreadScreenCandidates() {
    const canvas = state.renderer?.domElement;
    if (!canvas || !state.camera) return [];
    const rect = canvas.getBoundingClientRect();
    const focusIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    return (state.navState.threadCandidates || [])
        .filter((candidate) => candidate?.source === 'semantic' && candidate.index !== focusIndex)
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, getSemanticThreadDisplayLimit())
        .map((candidate) => {
            const pos = state.nodePositions[candidate.index] || state.targetPositions[candidate.index] || state.originalPositions[candidate.index];
            if (!pos) return null;
            const px = Number.isFinite(pos.x) ? pos.x : 0;
            const py = Number.isFinite(pos.y) ? pos.y : 0;
            const pz = Number.isFinite(pos.z) ? pos.z : 0;
            const vector = new THREE.Vector3(px, py, pz);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(vector);
            const projected = vector.clone().project(state.camera);
            const screenX = ((projected.x + 1) / 2) * rect.width + rect.left;
            const screenY = ((-projected.y + 1) / 2) * rect.height + rect.top;
            const inViewport = projected.z >= -1 && projected.z <= 1
                && screenX >= rect.left && screenX <= rect.right
                && screenY >= rect.top && screenY <= rect.bottom;
            const element = inViewport ? document.elementFromPoint(screenX, screenY) : null;
            const candidatePoint = (candidate && Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < state.points.length) ? state.points[candidate.index] : null;
            const focusPointForReason = (Number.isFinite(focusIndex) && focusIndex >= 0 && focusIndex < state.points.length) ? state.points[focusIndex] : null;
            const focusPos = state.nodePositions[focusIndex];
            const distFocus = Number.isFinite(focusIndex) && focusPos
                ? new THREE.Vector3(px, py, pz).distanceTo(new THREE.Vector3(
                    Number.isFinite(focusPos.x) ? focusPos.x : 0,
                    Number.isFinite(focusPos.y) ? focusPos.y : 0,
                    Number.isFinite(focusPos.z) ? focusPos.z : 0
                ))
                : null;
            return {
                index: candidate.index,
                reason: summarizeNeighborReason(candidate, candidatePoint, focusPointForReason),
                source: candidate.source,
                screenX,
                screenY,
                inViewport,
                canvasReachable: element === canvas,
                distanceFromFocus: distFocus
            };
        })
        .filter(Boolean);
}

function getNearestCanvasThreadCandidate(event, maxDistance = 34) {
    const candidates = getFocusThreadScreenCandidates().filter((candidate) => candidate.inViewport && candidate.canvasReachable);
    let nearest = null;
    let nearestDistance = Infinity;
    candidates.forEach((candidate) => {
        const distance = Math.hypot(candidate.screenX - event.clientX, candidate.screenY - event.clientY);
        if (distance < nearestDistance) {
            nearest = candidate;
            nearestDistance = distance;
        }
    });
    return nearest && nearestDistance <= maxDistance ? nearest : null;
}

function getCanvasPointerPosition(event) {
    const canvas = state.renderer?.domElement;
    if (!canvas || !event) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = Number(event.clientX);
    const clientY = Number(event.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    return {
        x: clientX,
        y: clientY,
        rect
    };
}

function getCanvasFieldNodeClickRadius(event) {
    const pointerType = event?.pointerType || '';
    if (pointerType === 'touch' || pointerType === 'pen') return 34;
    return window.matchMedia?.('(pointer: coarse)')?.matches ? 34 : 26;
}

const canvasFieldRaycaster = new THREE.Raycaster();

function compareCanvasNodePickCandidates(a, b) {
    // 10/10 Polish: Prioritize screen-space pixel proximity for "what you see is what you get" accuracy
    const distA = Number.isFinite(a.distance) ? a.distance : Infinity;
    const distB = Number.isFinite(b.distance) ? b.distance : Infinity;
    if (Math.abs(distA - distB) > 1.0) return distA - distB;

    // Tie-break with camera depth (world distance)
    const rayA = Number.isFinite(a.rayDistance) ? a.rayDistance : Infinity;
    const rayB = Number.isFinite(b.rayDistance) ? b.rayDistance : Infinity;
    if (Math.abs(rayA - rayB) > 0.1) return rayA - rayB;

    // Final tie-break with precision ray distance if available (Points picking)
    const rayToRayA = Number.isFinite(a.distanceToRay) ? a.distanceToRay : Infinity;
    const rayToRayB = Number.isFinite(b.distanceToRay) ? b.distanceToRay : Infinity;
    return rayToRayA - rayToRayB;
}

function getCanvasNodePickingMode() {
    const urlMode = new URLSearchParams(window.location.search).get('picking');
    const datasetMode = document.body?.dataset?.canvasPickingMode;
    return urlMode === 'nearest' || datasetMode === 'nearest' ? 'nearest' : 'raycast';
}

function getCanvasPointWorldThreshold(pixelRadius, rect) {
    if (!state.camera || !rect?.height) return 0.035;
    const cloudCenter = state.pointsMesh?.position || new THREE.Vector3(0, 0, 0);
    const distance = Math.max(0.25, state.camera.position.distanceTo(cloudCenter));
    const fov = Number.isFinite(state.camera.fov) ? THREE.MathUtils.degToRad(state.camera.fov) : THREE.MathUtils.degToRad(45);
    const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / rect.height;
    return THREE.MathUtils.clamp(worldPerPixel * pixelRadius * 0.42, 0.012, 0.09);
}

function getCanvasNodeScreenCandidate(index, pointer) {
    const position = state.nodePositions[index];
    if (!position || !state.camera || !state.pointsMesh) return null;
    const vector = new THREE.Vector3(position.x, position.y, position.z);
    if (state.pointsMesh.localToWorld) state.pointsMesh.localToWorld(vector);
    const projected = vector.clone().project(state.camera);
    if (projected.z < -1 || projected.z > 1) return null;
    const screenX = ((projected.x + 1) / 2) * pointer.rect.width + pointer.rect.left;
    const screenY = ((-projected.y + 1) / 2) * pointer.rect.height + pointer.rect.top;
    const distance = Math.hypot(screenX - pointer.x, screenY - pointer.y);
    return {
        index,
        distance,
        screenX,
        screenY,
        point: state.points[index] || null
    };
}

function findRaycastCanvasFieldNode(event, pointer, maxDistance) {
    if (!state.camera || !state.pointsMesh || !state.points?.length) return null;
    const ndc = new THREE.Vector2(
        ((pointer.x - pointer.rect.left) / pointer.rect.width) * 2 - 1,
        -(((pointer.y - pointer.rect.top) / pointer.rect.height) * 2 - 1)
    );
    canvasFieldRaycaster.setFromCamera(ndc, state.camera);
    const sporePickMesh = state.nodeSporeHitMesh || state.nodeSporeMesh;
    if (sporePickMesh) {
        const sporeHits = canvasFieldRaycaster.intersectObject(sporePickMesh, false)
            .filter((hit) => Number.isFinite(hit.instanceId) && isPointVisible(hit.instanceId, state.points, null, state.activeFilters))
            .map((hit) => {
                const candidate = getCanvasNodeScreenCandidate(hit.instanceId, pointer);
                if (!candidate) return null;
                return {
                    ...candidate,
                    source: 'instanced-raycast',
                    rayDistance: hit.distance,
                    distanceToRay: null
                };
            })
            .filter((candidate) => candidate && candidate.distance <= maxDistance + 12);
        if (sporeHits.length) {
            sporeHits.sort(compareCanvasNodePickCandidates);
            return sporeHits[0];
        }
    }
    canvasFieldRaycaster.params.Points ??= {};
    canvasFieldRaycaster.params.Points.threshold = getCanvasPointWorldThreshold(maxDistance, pointer.rect);
    const intersections = canvasFieldRaycaster.intersectObject(state.pointsMesh, false)
        .filter((hit) => Number.isFinite(hit.index) && isPointVisible(hit.index, state.points, null, state.activeFilters))
        .map((hit) => {
            const candidate = getCanvasNodeScreenCandidate(hit.index, pointer);
            if (!candidate) return null;
            return {
                ...candidate,
                source: 'raycast',
                rayDistance: hit.distance,
                distanceToRay: Number.isFinite(hit.distanceToRay) ? hit.distanceToRay : null
            };
        })
        .filter((candidate) => candidate && candidate.distance <= maxDistance + 8);
    if (!intersections.length) return null;
    intersections.sort(compareCanvasNodePickCandidates);
    return intersections[0];
}

function findNearestCanvasFieldNode(event, maxDistance = getCanvasFieldNodeClickRadius(event)) {
    const pointer = getCanvasPointerPosition(event);
    if (!pointer || !state.camera || !state.pointsMesh || !state.nodePositions?.length) return null;
    if (getCanvasNodePickingMode() === 'raycast') {
        const raycastCandidate = findRaycastCanvasFieldNode(event, pointer, maxDistance);
        if (raycastCandidate) {
            window.__lastCanvasNodePick = raycastCandidate;
            return raycastCandidate;
        }
    }
    let nearest = null;
    let nearestDistance = Infinity;

    state.nodePositions.forEach((position, index) => {
        if (!position || !isPointVisible(index, state.points, null, state.activeFilters)) return;
        const candidate = getCanvasNodeScreenCandidate(index, pointer);
        if (candidate && candidate.distance < nearestDistance) {
            nearestDistance = candidate.distance;
            nearest = {
                ...candidate,
                source: 'nearest'
            };
        }
    });

    const resolved = nearest && nearestDistance <= maxDistance ? nearest : null;
    window.__lastCanvasNodePick = resolved;
    return resolved;
}

function clearCanvasFieldHover(canvas, { force = false } = {}) {
    if (state.canvasFieldHoverClearTimer) {
        window.clearTimeout(state.canvasFieldHoverClearTimer);
        state.canvasFieldHoverClearTimer = null;
    }
    const clear = () => {
        state.hoverHighlightIndex = -1;
        state.stableCanvasHover = null;
        if (canvas) canvas.style.cursor = '';
        window.__lastCanvasNodeHover = null;
    };
    if (force) {
        clear();
        return;
    }
    state.canvasFieldHoverClearTimer = window.setTimeout(clear, CANVAS_FIELD_HOVER_CLEAR_DELAY_MS);
}

function setCanvasFieldHover(candidate, canvas) {
    if (!candidate || !Number.isFinite(candidate.index)) {
        clearCanvasFieldHover(canvas);
        return;
    }
    if (state.canvasFieldHoverClearTimer) {
        window.clearTimeout(state.canvasFieldHoverClearTimer);
        state.canvasFieldHoverClearTimer = null;
    }

    const prev = state.stableCanvasHover;
    let stableCandidate = candidate;
    if (prev && Number.isFinite(prev.index)) {
        const dx = candidate.screenX - prev.screenX;
        const dy = candidate.screenY - prev.screenY;
        const moved = Math.hypot(dx, dy);
        if (moved > STABLE_HOVER_STICKY_PX) {
            state.stableCanvasHover = candidate;
        } else {
            stableCandidate = prev;
        }
    } else {
        state.stableCanvasHover = candidate;
    }

    state.hoverHighlightIndex = stableCandidate.index;
    if (canvas) canvas.style.cursor = 'pointer';
    window.__lastCanvasNodeHover = stableCandidate;
}

export function ensureCanvasNodeInteractionBindings() {
    const canvas = state.renderer?.domElement;
    if (!canvas || canvas.dataset.threadInteractionBound === 'true') return;
    canvas.dataset.threadInteractionBound = 'true';
    let suppressNextCanvasClick = false;
    const isUiPointerTarget = (target) => !!target?.closest?.([
        'button',
        'a',
        'input',
        'textarea',
        'select',
        '.info-panel',
        '.focus-stage-card',
        '.summary-card',
        '.controls',
        '.view-toggle',
        '.journey-compass',
        '.legend-panel',
        '.weather-widget',
        '.share-toggle'
    ].join(','));
    const isPrimaryPointerRelease = (event) => !Number.isFinite(event.button) || event.button <= 0;
    const walkCanvasThreadFromPointerEvent = (event) => {
        if (state.currentView !== 'galaxy' || !Number.isFinite(state.navState.focusedIndex)) return false;
        let candidate = null;
        if (document.body.dataset.threadInspectSurface === 'canvas' && Number.isFinite(state.inspectedThreadIndex)) {
            candidate = (state.navState.threadCandidates || []).find((item) => item && item.index === state.inspectedThreadIndex)
                || { index: state.inspectedThreadIndex, reason: 'inspected 3D related node' };
        }
        if (!candidate) candidate = getNearestCanvasThreadCandidate(event, 96);
        if (!candidate) return false;
        event.preventDefault();
        walkThreadNeighbor(candidate.index, {
            fromCanvasNode: true,
            surface: 'canvas',
            reason: candidate.reason || 'direct 3D related node'
        });
        return true;
    };
    const focusCanvasFieldNodeFromPointerEvent = (event) => {
        if (state.currentView !== 'galaxy') return false;
        const stable = state.stableCanvasHover;
        const stableIsValid = stable
            && Number.isFinite(stable.index)
            && isPointVisible(stable.index, state.points, null, state.activeFilters);
        const candidate = stableIsValid
            ? { ...stable, source: stable.source || 'stable-hover' }
            : findNearestCanvasFieldNode(event);
        if (!candidate) return false;
        window.__lastCanvasNodePick = candidate;
        window.__lastCanvasNodeFocusPick = candidate;
        event.preventDefault();
        if (typeof window.releaseFocusCameraAssist === 'function') window.releaseFocusCameraAssist('field-click');
        if (typeof window.noteSceneInteraction === 'function') window.noteSceneInteraction(state.AUTO_ROTATE_MANUAL_IDLE_MS);
        if (typeof window.focusOnNode === 'function') {
            return window.focusOnNode(candidate.index, {
                fromCanvasNode: true,
                revealCard: true,
                historyMode: 'push'
            });
        }
        return false;
    };
    canvas.addEventListener('pointermove', (event) => {
        if (state.currentView !== 'galaxy') {
            clearCanvasFieldHover(canvas);
            return;
        }
        if (Number.isFinite(state.navState.focusedIndex)) {
            const candidate = getNearestCanvasThreadCandidate(event);
            if (candidate) {
                setCanvasFieldHover(candidate, canvas);
                inspectThreadNeighbor(candidate.index, { surface: 'canvas' });
                return;
            } else if (document.body.dataset.threadInspectSurface === 'canvas') {
                scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
            }
        }
        const fieldCandidate = findNearestCanvasFieldNode(event, getCanvasFieldNodeClickRadius(event) + 4);
        setCanvasFieldHover(fieldCandidate, canvas);
    });
    canvas.addEventListener('pointerleave', () => {
        if (document.body.dataset.threadInspectSurface === 'canvas') scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
        clearCanvasFieldHover(canvas, { force: true });
    });
    canvas.addEventListener('pointerup', (event) => {
        if (isPrimaryPointerRelease(event) && walkCanvasThreadFromPointerEvent(event)) {
            suppressNextCanvasClick = true;
        }
    });
    canvas.addEventListener('click', (event) => {
        if (suppressNextCanvasClick) {
            suppressNextCanvasClick = false;
            event.preventDefault();
            return;
        }
        if (walkCanvasThreadFromPointerEvent(event)) return;
        focusCanvasFieldNodeFromPointerEvent(event);
    });
    if (document.documentElement.dataset.threadCanvasDocumentWalkBound !== 'true') {
        document.documentElement.dataset.threadCanvasDocumentWalkBound = 'true';
        document.addEventListener('pointerup', (event) => {
            if (!isPrimaryPointerRelease(event) || isUiPointerTarget(event.target)) return;
            if (event.target === canvas) return;
            if (walkCanvasThreadFromPointerEvent(event)) return;
            focusCanvasFieldNodeFromPointerEvent(event);
        }, true);
    }
}

function updateFocusNeighborRail() {
    const rail = document.getElementById('focus-stage-neighbors');
    const list = document.getElementById('focus-stage-neighbor-list');
    const countEl = document.getElementById('focus-stage-neighbor-count');
    if (!rail || !list) return;

    if (!Number.isFinite(state.navState.focusedIndex) || hasColdDegradedSemanticFallback()) {
        rail.classList.remove('active');
        list.innerHTML = '';
        if (countEl) countEl.textContent = '0 visible neighbors';
        clearThreadInspection({ force: true, preserveJourney: ['exploring', 'arrived'].includes(state.strandContinuityState.phase) });
        return;
    }

    const candidates = (state.navState.threadCandidates || [])
        .filter((candidate) => candidate && candidate.index !== state.navState.focusedIndex)
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, isCondensedFocusStageViewport() ? 3 : (isCompactFocusStageViewport() ? 4 : 5));

    if (!candidates.length) {
        rail.classList.remove('active');
        list.innerHTML = '<div class="empty-state">No neighboring stops found in this area.</div>';
        if (countEl) countEl.textContent = '0 visible neighbors';
        clearThreadInspection({ force: true, preserveJourney: ['exploring', 'arrived'].includes(state.strandContinuityState.phase) });
        return;
    }

    list.innerHTML = '';
    if (countEl) {
        const source = state.navState.threadSource === 'semantic' ? 'neighbors' : 'neighbors';
        countEl.textContent = `${candidates.length} visible ${source}`;
    }

    candidates.forEach((candidate, order) => {
        const point = (Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < state.points.length)
            ? state.points[candidate.index]
            : null;
        const button = document.createElement('div');
        button.className = 'focus-stage-neighbor-pill';
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.dataset.index = String(candidate.index);
        button.dataset.role = state.navState.focusPocketRoleByIndex?.get(candidate.index) || 'trail';
        button.dataset.reason = candidate.reason || 'semantic neighbor';
        const name = formatBusinessName(point?.name || 'Nearby business');
        const city = cleanOptionalValue(point?.city) || 'Montgomery County';
        const focusIdx = state.navState.focusedIndex;
        const focusPoint = (Number.isFinite(focusIdx) && focusIdx >= 0 && focusIdx < state.points.length) ? state.points[focusIdx] : null;
        const reason = summarizeNeighborReason(candidate, point, focusPoint);
        const reasonLabel = isCompactFocusStageViewport()
            ? truncateMicrocopy(reason, 58)
            : `${truncateMicrocopy(reason, 72)} | ${city}`;
        button.setAttribute('aria-label', `Explore ${name}: ${reason}. Use the inner buttons to inspect or pin this connection without following.`);
        button.innerHTML = `
            <span class="focus-stage-neighbor-index">${String(order + 1).padStart(2, '0')}</span>
            <span class="focus-stage-neighbor-copy">
                <span class="focus-stage-neighbor-name">${escapeHtml(name)}</span>
                <span class="focus-stage-neighbor-reason">${escapeHtml(reasonLabel)}</span>
            </span>
            <span class="focus-stage-neighbor-actions" aria-label="Strand actions">
                <button class="focus-stage-neighbor-action" type="button" data-neighbor-action="inspect" aria-label="Inspect connection">Inspect</button>
                <button class="focus-stage-neighbor-action primary" type="button" data-neighbor-action="pin" aria-label="Pin connection">Pin</button>
            </span>
        `;
        list.appendChild(button);
    });

    list.querySelectorAll('[data-index]').forEach((button) => {
        const inspectIndex = () => {
            const nextIndex = Number(button.dataset.index);
            if (!Number.isFinite(nextIndex)) return;
            inspectThreadNeighbor(nextIndex);
        };
        const walkToIndex = () => {
            const nextIndex = Number(button.dataset.index);
            if (!Number.isFinite(nextIndex)) return;
            walkThreadNeighbor(nextIndex, { surface: 'rail', reason: button.dataset.reason || 'nearby business relationship' });
        };
        button.onmouseenter = inspectIndex;
        button.onfocus = inspectIndex;
        button.onmouseleave = () => clearThreadInspection();
        button.onclick = (event) => {
            if (event.target?.closest?.('[data-neighbor-action]')) return;
            walkToIndex();
        };
        button.onkeydown = (event) => {
            if (event.target?.closest?.('[data-neighbor-action]')) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            walkToIndex();
        };
        button.querySelectorAll('[data-neighbor-action]').forEach((actionButton) => {
            actionButton.onfocus = inspectIndex;
            actionButton.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                const nextIndex = Number(button.dataset.index);
                if (!Number.isFinite(nextIndex)) return;
                if (actionButton.dataset.neighborAction === 'pin') {
                    pinThreadNeighbor(nextIndex, { surface: 'pinned' });
                } else {
                    setStrandContinuityState('preview', {
                        targetIndex: nextIndex,
                        fromIndex: state.navState.focusedIndex,
                        reason: 'rail-inspect'
                    });
                    inspectThreadNeighbor(nextIndex, { force: true, surface: 'rail' });
                }
            };
        });
    });

    rail.classList.add('active');
}

function updateWalkBreadcrumb(hasFocus = false) {
    const breadcrumb = document.getElementById('walk-breadcrumb');
    if (!breadcrumb) return;

    const history = (state.navState.walkHistoryIndices || [])
        .filter((index) => Number.isFinite(index) && state.points[index])
        .filter((index, order, list) => list.indexOf(index) === order || order === list.length - 1);

    if (!hasFocus || history.length <= 1) {
        breadcrumb.hidden = true;
        breadcrumb.classList.remove('visible');
        breadcrumb.innerHTML = '';
        return;
    }

    breadcrumb.hidden = false;
    breadcrumb.classList.add('visible');
    breadcrumb.innerHTML = `
        <span class="walk-breadcrumb-label">Trail</span>
        ${history.map((index, order) => {
            const point = state.points[index];
            const name = formatBusinessName(point?.name || 'Stop');
            const isCurrent = order === history.length - 1;
            return `
                <button class="walk-breadcrumb-chip${isCurrent ? ' current' : ''}" type="button"
                    data-walk-index="${index}" data-walk-order="${order}"
                    ${isCurrent ? 'aria-current="step"' : ''}
                    aria-label="${escapeHtml(isCurrent ? `Current stop: ${name}` : `Return to ${name}`)}">
                    ${escapeHtml(name)}
                </button>
            `;
        }).join('<span class="walk-breadcrumb-sep" aria-hidden="true">/</span>')}
    `;

    breadcrumb.querySelectorAll('.walk-breadcrumb-chip:not(.current)').forEach((chip) => {
        chip.onclick = () => {
            const targetIndex = Number(chip.dataset.walkIndex);
            const targetOrder = Number(chip.dataset.walkOrder);
            if (!Number.isFinite(targetIndex) || !Number.isFinite(targetOrder)) return;
            state.navState.walkHistoryIndices = history.slice(0, targetOrder + 1);
            if (typeof window.focusOnNode === 'function') {
                window.focusOnNode(targetIndex, {
                    fromTraversal: true,
                    restoreHistory: true,
                    historyMode: 'push'
                });
            }
        };
    });
}

export function updateTraversalUi() {
    const controlsEl = document.getElementById('trail-controls');
    const contextEl = document.getElementById('trail-context');
    const prevBtn = document.getElementById('btn-prev-node');
    const nextBtn = document.getElementById('btn-next-node');
    const focusJourneyEl = document.getElementById('focus-stage-journey');
    const focusPrevBtn = document.getElementById('btn-focus-prev');
    const focusNextBtn = document.getElementById('btn-focus-next');
    const focusProgressEl = document.getElementById('focus-stage-progress');
    const focusNextEl = document.getElementById('focus-stage-next');
    const focusRouteEl = document.getElementById('focus-stage-route');
    const focusCenterBtn = document.getElementById('btn-focus-center');
    const currentFocusPoint = state.currentView === 'map'
        ? state.selectedPoint
        : (Number.isFinite(state.navState.focusedIndex) ? state.points[state.navState.focusedIndex] : null);
    const hasFocus = !!currentFocusPoint;
    const neighborCount = state.navState.trailNeighborIndices.length;
    const coldDegradedNoRail = hasColdDegradedSemanticFallback();

    if (!controlsEl || !contextEl || !prevBtn || !nextBtn || !focusJourneyEl || !focusPrevBtn || !focusNextBtn || !focusProgressEl) return;

    controlsEl.classList.toggle('active', hasFocus && (state.currentView === 'map' || !shouldUseFloatingFocusJourneyOnly()));
    contextEl.classList.toggle('active', hasFocus);
    focusJourneyEl.classList.toggle('active', hasFocus && state.currentView === 'galaxy');
    if (focusCenterBtn) focusCenterBtn.disabled = !hasFocus;
    ensureCanvasNodeInteractionBindings();

    if (!hasFocus) {
        updateWalkBreadcrumb(false);
        focusProgressEl.textContent = 'Pick a business, then explore its nearby neighbors.';
        if (focusNextEl) focusNextEl.textContent = 'Choose a nearby business to continue the path.';
        if (focusRouteEl) focusRouteEl.dataset.state = 'idle';
        updateFocusNeighborRail();
        removeFocusSemanticOverlay();
        resetFocusThreadDiagnostics('no-focus');
        return;
    }

    const canGoBack = (state.navState.walkHistoryIndices || []).length > 1;
    [prevBtn, focusPrevBtn].forEach(btn => {
        if (!btn) return;
        btn.disabled = !canGoBack;
        btn.setAttribute('aria-disabled', String(!canGoBack));
        if (!canGoBack) btn.title = 'No previous stops in this walk history';
        else btn.removeAttribute('title');
    });
    [nextBtn, focusNextBtn].forEach(btn => {
        if (!btn) return;
        const noNext = neighborCount === 0;
        btn.disabled = noNext;
        btn.setAttribute('aria-disabled', String(noNext));
        if (noNext) btn.title = 'No nearby stops to continue to';
        else btn.removeAttribute('title');
    });

    const currentName = formatBusinessName(currentFocusPoint?.name || 'this business');
    const currentCandidate = state.navState.mode === 'trail' && state.navState.trailCursor >= 0 && neighborCount > 0
        ? state.navState.threadCandidates[state.navState.trailCursor]
        : null;
    const sourceLabel = state.navState.threadSource === 'semantic'
        ? 'semantic thread'
        : 'approximate cloud projection fallback';
    const currentIndexForWalk = state.navState.focusedIndex ?? getCurrentTrailFocusIndex();
    const nextWalkCandidate = getNextWalkCandidateForIndex(currentIndexForWalk);
    const nextWalkPoint = nextWalkCandidate ? state.points[nextWalkCandidate.index] : null;
    const nextWalkName = nextWalkPoint ? formatBusinessName(nextWalkPoint.name || 'next business') : null;
    const nextWalkReason = nextWalkCandidate ? summarizeNeighborReason(nextWalkCandidate, nextWalkPoint, currentFocusPoint) : '';
    if (focusRouteEl) focusRouteEl.dataset.state = neighborCount ? (state.navState.mode === 'trail' ? 'walking' : 'ready') : 'empty';

    if (coldDegradedNoRail) {
        const queryLabel = state.semanticLaneSnapshot?.query ? `"${state.semanticLaneSnapshot.query}"` : 'this semantic trail';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        focusPrevBtn.disabled = true;
        focusNextBtn.disabled = true;
        contextEl.textContent = `${currentName} restored from this shared link, but the ${queryLabel} did not restore while the semantic lane is degraded. Retry now to rebuild it, or use Overview to step back to the county.`;
        focusProgressEl.textContent = `Semantic trail unavailable for ${queryLabel} while the lane is degraded.`;
        if (focusNextEl) focusNextEl.textContent = 'Retry the semantic lane before continuing this trail.';
        updateWalkBreadcrumb(false);
        updateFocusNeighborRail();
        removeFocusSemanticOverlay();
        resetFocusThreadDiagnostics('cold-degraded');
        return;
    }

    if (state.trailDepth >= 1 && (state.navState.walkHistoryIndices || []).length >= 0) {
        const reason = state.navState.lastTraversalReason || currentCandidate?.reason || 'nearby business relationship';
        const walkLength = (state.navState.walkHistoryIndices || []).length;
        // stepNumber: walkHistory starts empty at anchor, first traversal adds first stop
        // so length=0 means we're at stop 1 (the anchor itself), length=1 means stop 2, etc.
        const stepNumber = walkLength + 1;
        contextEl.textContent = `Stop ${stepNumber}: ${currentName}. Why here: ${reason}. Source: ${sourceLabel}. Use Prev to go back or Next to continue.`;
        focusProgressEl.textContent = `Stop ${stepNumber} of ${neighborCount}`;
        if (focusNextEl) {
            focusNextEl.textContent = nextWalkName
                ? `Next: ${nextWalkName} — ${nextWalkReason.length > 40 ? nextWalkReason.slice(0, 37) + '...' : nextWalkReason}.`
                : 'This exploration has no unseen visible stop left in the current slice.';

        }
    } else if (neighborCount === 0 && state.navState.threadSource === 'semantic') {
        contextEl.textContent = `Semantic connections exist around ${currentName}, but none survive the current slice. Broaden the view to see the record-backed relationship.`;
        focusProgressEl.textContent = `No visible nearby records from ${currentName} in this slice.`;
        if (focusNextEl) focusNextEl.textContent = 'No visible next stop in this filtered slice.';
    } else {
        const fallbackLeadIn = state.semanticThreadsStatus === 'loading'
            ? 'Semantic connections are still loading, so this is a temporary cloud fallback.'
            : 'Semantic relationship data is missing here, so this trail is using the current cloud as an approximate fallback.';
        const pocketNote = state.navState.threadSource === 'semantic' && state.navState.focusPocketMeta?.active
            ? ` Focus lens is staging ${state.navState.focusPocketMeta.nodeCount} related records as a ${state.navState.focusPocketMeta.motifLabel || 'semantic constellation'} for readability; the links still come from the semantic trail.`
            : '';
        contextEl.textContent = `${neighborCount} candidate steps around ${currentName}. ${state.navState.threadSource === 'semantic' ? 'These come from record-backed relationships, and the bright spokes show the same links even when spacing stays approximate.' : fallbackLeadIn}${pocketNote} Use Prev / Next to continue.`;
        focusProgressEl.textContent = neighborCount
            ? `${neighborCount} nearby ready from ${currentName}`
            : `Start with ${currentName}, then explore the neighborhood.`;
        if (focusNextEl) {
            focusNextEl.textContent = nextWalkName
                ? `Next: ${nextWalkName} — ${nextWalkReason.length > 40 ? nextWalkReason.slice(0, 37) + '...' : nextWalkReason}.`
                : 'Choose a nearby business to continue the path.';
        }
    }

    updateFocusNeighborRail();
    updateWalkBreadcrumb(hasFocus);
    refreshFocusSemanticOverlay();
    updateFocusSemanticOverlayPositions();
}

export function applyPointFilterColors() {
    if (!state.pointsMesh || !state.pointBaseColors) return;
    const capturedVersion = state.filterColorVersion;
    if (capturedVersion === state.filterVersion) return;
    const colors = state.pointsMesh.geometry.attributes.color.array;
    const focusLocalIndices = state.navState.focusedIndex !== null
        ? new Set([
            state.navState.focusedIndex,
            ...state.navState.trailNeighborIndices.slice(0, 12),
            ...(state.navState.focusPocketIndices || [])
        ])
        : new Set();

    const historySet = new Set(state.navState.walkHistoryIndices || []);

    if (!state.points || !state.pointBaseColors || state.pointBaseColors.length < state.points.length * 3) return;
    const signalScores = state.signalScores || [];
    const bridgeScores = state.bridgeScores || [];

    for (let i = 0; i < state.points.length; i++) {
        const colorOffset = i * 3;
        const baseR = state.pointBaseColors[colorOffset] ?? 0;
        const baseG = state.pointBaseColors[colorOffset + 1] ?? 0;
        const baseB = state.pointBaseColors[colorOffset + 2] ?? 0;
        const visible = isPointVisible(i, state.points, null, state.activeFilters);
        const isVisited = historySet.has(i);
        let factor = visible ? 1 : 0.08;
        if (visible) {
            const nodeMinFloor = 0.65;
            if (state.navState.focusedIndex !== null) {
                const semanticFocus = state.navState.threadSource === 'semantic';
                if (state.navState.mode === 'trail') {
                    factor = state.trailIndices.size
                        ? (state.trailIndices.has(i) ? (i === state.navState.focusedIndex ? 2.14 : (semanticFocus ? 1.74 : 1.48)) : (isVisited ? 1.18 : (semanticFocus ? 0.24 : 0.18)))
                        : (isVisited ? 1.18 : 0.28);
                } else {
                    const inPocket = state.navState.focusPocketIndices?.includes(i);
                    const role = state.navState.focusPocketRoleByIndex?.get(i);
                    const raw = focusLocalIndices.has(i)
                        ? (i === state.navState.focusedIndex
                            ? 3.18
                            : (role === 'primary'
                                ? 2.52
                                : (role === 'support'
                                    ? 1.78
                                    : (inPocket ? 2.1 : (semanticFocus ? 1.8 : 1.34)))))
                        : (isVisited ? 1.28 : (semanticFocus ? 0.32 : 0.22));
                    factor = Math.max(raw, nodeMinFloor);
                }
            } else if (state.myceliumMode === 'bloom') {
                factor = state.bloomIndices.has(i)
                    ? 1.08
                    : Math.max(0.22, Math.min(0.66, 0.30 + (signalScores[i] ?? 0) * 0.08));
            } else if (state.myceliumMode === 'bridge') {
                factor = state.bridgeIndices.has(i) ? 1.38 : Math.max(0.16, Math.min(0.88, 0.22 + (bridgeScores[i] ?? 0) * 0.32));
            } else if (state.myceliumMode === 'trail') {
                factor = state.trailIndices.size
                    ? (state.trailIndices.has(i) ? (i === state.focusedNode ? 1.48 : 1.18) : 0.12)
                    : 0.34;
            }
        }
        colors[colorOffset] = baseR * factor;
        colors[colorOffset + 1] = baseG * factor;
        colors[colorOffset + 2] = baseB * factor;
    }
    state.pointsMesh.geometry.attributes.color.needsUpdate = true;
    state.pointColorStateVersion += 1;
    state.filterColorVersion = state.filterVersion;
    if (state.searchGlowActive && state.searchGlowIndices && state.searchGlowIndices.size > 0) {
        state.searchGlowRenderStateKey = '';
        if (typeof window.syncSearchStatusForFocus === 'function') {
            const topIndex = state.searchGlowTopIndex ?? (state.searchGlowIndices.values().next().value ?? -1);
            const topPoint = Number.isFinite(topIndex) ? state.points[topIndex] : null;
            window.syncSearchStatusForFocus(topPoint, { fromSearchResult: true, skipTraversalUiUpdate: true });
        }
    }
}

// Window shim for inline script backward compat:
if (typeof window !== 'undefined') {
    window.syncFocusStage = syncFocusStage;
    window.setTrailFromSeed = setTrailFromSeed;
    window.updateTrailIndices = updateTrailIndices;
    window.updateSelectedBusiness = updateSelectedBusiness;
    window.applyPointFilterColors = applyPointFilterColors;
    window.updateTraversalUi = updateTraversalUi;
    window.refreshFocusSemanticOverlay = refreshFocusSemanticOverlay;
    window.updateFocusSemanticOverlayPositions = updateFocusSemanticOverlayPositions;
    window.walkThreadNeighbor = walkThreadNeighbor;
    window.traverseNeighbor = traverseNeighbor;
    window.setSemanticDiveMode = setSemanticDiveMode;
    window.walkInsideToNextStop = walkInsideToNextStop;
    window.previewInsideNextThread = previewInsideNextThread;
    window.refreshRouteTraceOverlay = refreshRouteTraceOverlay;
    window.updateRouteTraceOverlayPositions = updateRouteTraceOverlayPositions;
    window.setRouteChoreographyPhase = setRouteChoreographyPhase;
    window.syncArrivalHandoffOverlay = syncArrivalHandoffOverlay;
    window.updateArrivalHandoffOverlay = updateArrivalHandoffOverlay;
    window.disposeArrivalHandoffOverlay = disposeArrivalHandoffOverlay;
    window.getCurrentTrailFocusIndex = getCurrentTrailFocusIndex;
    window.getNextWalkCandidateForIndex = getNextWalkCandidateForIndex;
    window.getBoundedNeighborhoodWalkCandidate = getBoundedNeighborhoodWalkCandidate;
    window.isBoundedNeighborhoodActive = isBoundedNeighborhoodActive;
    window.primeBoundedSemanticNeighborhoodForTraversal = primeBoundedSemanticNeighborhoodForTraversal;
    window.ensureBoundedNeighborhoodFromActivePocket = ensureBoundedNeighborhoodFromActivePocket;
    window.getNeighborhoodRouteIndices = getNeighborhoodRouteIndices;
    window.getNeighborhoodCandidateForIndex = getNeighborhoodCandidateForIndex;
    window.buildNeighborhoodManifest = buildNeighborhoodManifest;
    window.getSemanticNeighborRecordBetween = getSemanticNeighborRecordBetween;
    window.getSemanticThreadCandidates = getSemanticThreadCandidates;
    window.getGeometricThreadCandidates = getGeometricThreadCandidates;
    window.getThreadCandidatesForIndex = getThreadCandidatesForIndex;
    window.summarizeNeighborReason = summarizeNeighborReason;
    window.setStrandContinuityState = setStrandContinuityState;
    window.clearStrandContinuityState = clearStrandContinuityState;
    window.renderThreadInspection = renderThreadInspection;
    window.inspectThreadNeighbor = inspectThreadNeighbor;
    window.pinThreadNeighbor = pinThreadNeighbor;
    window.unpinThreadInspection = unpinThreadInspection;
    window.clearThreadInspection = clearThreadInspection;
    window.__semanticThreadInspectorProbe = () => getThreadInspectionState();
    window.__semanticFocusCueProbe = () => ({
        visible: !!state.focusSemanticLines && !!state.focusThreadDiagnostics?.active,
        threadSource: state.navState.threadSource || null,
        focusedIndex: Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null,
        nextIndex: Number.isFinite(state.focusSemanticLines?.userData?.nextIndex) ? state.focusSemanticLines.userData.nextIndex : null,
        lineNextIndex: Number.isFinite(state.focusSemanticLines?.userData?.nextIndex) ? state.focusSemanticLines.userData.nextIndex : null,
        nextCueSegments: state.focusSemanticLines?.userData?.nextCueSegments || state.focusThreadDiagnostics?.nextCueSegments || 0,
        focusThreadSegments: getLineSegmentCount(state.focusSemanticLines),
        threadDiagnostics: { ...(state.focusThreadDiagnostics || {}) }
    });
    window.__semanticCanvasThreadProbe = () => ({
        focusedIndex: Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null,
        pinnedIndex: Number.isFinite(state.pinnedThreadIndex) ? state.pinnedThreadIndex : null,
        inspectedIndex: Number.isFinite(state.inspectedThreadIndex) ? state.inspectedThreadIndex : null,
        candidates: getFocusThreadScreenCandidates(),
        inspector: getThreadInspectionState(),
        strandVisual: { ...(state.inspectedStrandDiagnostics || {}) },
        focusCue: window.__semanticFocusCueProbe()
    });

    // describeThreadLensForPoint — returns a human-readable description of the
    // semantic thread neighborhood around a given point by inspecting
    // state.semanticNeighborMapByLeadId (populated by semantic-threads.js).
    window.describeThreadLensForPoint = function (point) {
        if (!point) return 'Waiting for a semantic thread.';

        const leadId = point.lead_id !== undefined && point.lead_id !== null
            ? String(point.lead_id).trim()
            : null;

        // Look up the semantic neighbor record for this point's lead_id
        const neighborRecord = leadId && state.semanticNeighborMapByLeadId
            ? state.semanticNeighborMapByLeadId.get(leadId)
            : null;

        if (!neighborRecord) {
            // Fallback: describe using mycelium mode and cluster
            const mode = state.myceliumMode || 'default';
            const clusterLabel = describeCluster(point.cluster);
            const LENS_BY_MODE = {
                bloom: 'Signal-rich — surfaced for businesses with a website plus email or phone',
                bridge: 'Between neighborhoods — highlighted for businesses linking neighborhoods',
                trail: 'Connection Trail — focused on semantic neighbors of ' + (point.name ? formatBusinessName(point.name) : 'the focused business'),
                default: clusterLabel ? clusterLabel + ' neighborhood' : 'County View'
            };
            const base = LENS_BY_MODE[mode] || LENS_BY_MODE.default;
            if (point.status === 'disqualified') return 'Archive layer — ' + base;
            return base;
        }

        const neighborCount = Array.isArray(neighborRecord.neighbors) ? neighborRecord.neighbors.length : 0;
        const clusterLabel = describeCluster(point.cluster);

        if (neighborCount === 0) {
            return 'Isolated node — no semantic connections yet.';
        }
        if (neighborCount <= 3) {
            return 'Sparse node — only ' + neighborCount + ' connection' + (neighborCount === 1 ? '' : 's') + '.';
        }
        if (neighborCount >= 20) {
            const anchorWord = clusterLabel ? clusterLabel : 'County';
            return 'Strong anchor in ' + anchorWord + ' cluster with ' + neighborCount + ' semantic neighbors.';
        }
        // Medium density
        return 'Connected node — ' + neighborCount + ' semantic neighbors in ' + (clusterLabel || 'local') + ' cluster.';
    };
}
