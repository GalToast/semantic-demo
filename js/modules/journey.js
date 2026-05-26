import { state } from '../state.js';
import * as adapter from './journey-lifecycle-adapter.js';
import * as THREE from 'three';
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
} from './ui-renderers.js';
import { focusOnNode, noteSceneInteraction, releaseFocusCameraAssist } from './camera-controls.js';
import { syncInspectedStrandOverlay } from './thread-inspector.js';
import { refreshCompositionState, dispatchNavTransition, NAV_TRANSITION_ACTIONS, focusOnPoint, updateJourneyCompass } from './lifecycle.js';
import { setTrailNavState } from './navigation-state.js';
import { applyLocalNeighborhoodFocus, setFocusPocketMeta } from './focus-pocket.js';
import { applyClusterUiAccent } from './cluster-ui-accent.js';
import { showExperienceToast } from './ui-feedback.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import {
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics,
    resetRouteTraceDiagnostics,
    setRouteChoreographyPhase
} from './journey-webgl.js';

export {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics,
    resetRouteTraceDiagnostics,
    setRouteChoreographyPhase
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
    if (typeof window === 'undefined' || typeof matchMedia !== 'function') return false;
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
        syncArrivalHandoffOverlay();
    } else if (normalizedPhase === 'idle') {
        disposeArrivalHandoffOverlay();
    }
    return state.strandContinuityState;
}

export function clearStrandContinuityState(reason = 'clear') {
    setStrandContinuityState('idle', { reason });
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
    syncSemanticDiveUi();
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
    syncSemanticDiveUi();
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
    // navTransitionReducer owns walkHistoryIndices for WALK_TO traversal.
    // The traversal engine below retains camera, focus pocket, strand, and URL side effects.
    dispatchNavTransition('WALK_TO', { index, fromIndex, appendHistory: !options.restoreHistory });
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
    // WALK_TO above sets trail mode canonically inside the navTransitionReducer.
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
    const arrivalTid = window.setTimeout(() => {
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
            setFocusPocketMeta({
                ...state.navState.focusPocketMeta,
                boundedLoop: true,
                motifLabel: state.navState.focusPocketMeta.motifLabel || 'selected neighborhood loop'
            });
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
    setFocusPocketMeta({
        ...state.navState.focusPocketMeta,
        boundedLoop: true,
        motifLabel: 'selected neighborhood loop'
    });
}

export function primeBoundedSemanticNeighborhoodForTraversal(seedIndex) {
    if (!Number.isFinite(seedIndex)) return false;
    ensureBoundedNeighborhoodFromActivePocket(seedIndex);
    if (isBoundedNeighborhoodActive()) return true;

    setTrailFromSeed(seedIndex);
    if (state.navState.threadSource !== 'semantic') return false;
    adapter.applyLocalNeighborhoodFocus(seedIndex);
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
        // navTransitionReducer owns walkHistoryIndices pop for BACKTRACK.
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

// --- Bounded Neighborhood Explored ---

/**
 * Backward-compatible delegating alias for semantic-dive mode.
 * The authoritative implementation lives in lifecycle.js as window.setSemanticDiveMode.
 * This export exists so any legacy code that imports journey.setSemanticDiveMode
 * directly still routes through the authoritative lifecycle owner.
 *
 * Additional side effects not covered by lifecycle:
 * - previewInsideNextThread (enter): pre-loads next candidate for inside-cue UI
 * - clearThreadInspection  (exit):  clears stale thread overlays
 * These are safe to call redundantly (idempotent checks inside each function).
 */
export function setSemanticDiveMode(enabled) {
    const active = Boolean(enabled);

    // Delegate to lifecycle's authoritative window wrapper — all canonical state
    // management (semanticDiveMode, navState.mode, trailDepth, camera, URL) lives there.
    if (typeof adapter.setSemanticDiveMode === 'function') {
        adapter.setSemanticDiveMode(enabled);
    } else {
        return false;
    }

    // Additional side effects that lifecycle's window wrapper handles via
    // window.previewInsideNextThread / window.clearThreadInspection.
    // Calling them here too is safe (each has idempotent guards) and ensures
    // they run even when the window bridge is absent.
    if (active) {
        previewInsideNextThread({ force: true });
    } else {
        if (document.body.dataset.threadInspectSurface === 'inside-cue') {
            clearThreadInspection({ force: true, preserveJourney: true });
        } else {
            clearThreadInspection({ force: true, preserveJourney: false });
        }
    }
    return true;
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

    const cleanupFocusStageTrap = () => {
        if (stage._focusStageKeydownListener) {
            stage.removeEventListener('keydown', stage._focusStageKeydownListener);
            stage._focusStageKeydownListener = null;
        }
        if (adapter.getPreviouslyFocusedFocusStage()) {
            try {
                adapter.getPreviouslyFocusedFocusStage().focus();
            } catch (e) {
                console.warn('Failed to restore focus stage previous element:', e);
            }
            adapter.setPreviouslyFocusedFocusStage(null);
        }
    };

    if (point === null) {
        applyClusterUiAccent(stageCard, null);
        stage.classList.remove('active');
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        refreshCompositionState();
        return;
    }

    const effectivePoint = point
        || state.selectedPoint
        || ((state.focusedNode !== null && state.focusedNode !== undefined && Number.isFinite(state.focusedNode) && state.focusedNode >= 0 && state.focusedNode < state.points.length) ? state.points[state.focusedNode] : null);

    if (!effectivePoint || state.currentView !== 'galaxy' || state.focusedNode === null) {
        applyClusterUiAccent(stageCard, null);
        stage.classList.remove('active');
        stage.hidden = true;
        stage.setAttribute('aria-hidden', 'true');
        cleanupFocusStageTrap();
        refreshCompositionState();
        return;
    }

    const wasActive = stage.classList.contains('active') && !stage.hidden;

    applyClusterUiAccent(stageCard, effectivePoint);
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    stage.classList.add('active');

    if (!wasActive) {
        adapter.setPreviouslyFocusedFocusStage(document.activeElement);

        const keydownHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = Array.from(
                stage.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => {
                if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            });
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        };

        if (stage._focusStageKeydownListener) {
            stage.removeEventListener('keydown', stage._focusStageKeydownListener);
        }
        stage._focusStageKeydownListener = keydownHandler;
        stage.addEventListener('keydown', keydownHandler);
    }

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
    if (triviaEl && typeof adapter.getInterestingBusinessNote === 'function') {
        const interestingNote = adapter.getInterestingBusinessNote(effectivePoint);
        const matchNarrative = typeof adapter.buildSelectedMatchNarrative === 'function' ? adapter.buildSelectedMatchNarrative(effectivePoint) : '';
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
        } else if (typeof adapter.hasColdDegradedSemanticFallback === 'function' && adapter.hasColdDegradedSemanticFallback()) {
            const copyFn = adapter.getColdDegradedRouteCopy;
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
    refreshCompositionState();
}

export function setTrailFromSeed(seedIndex) {
    const semanticCandidates = getSemanticThreadCandidates(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    const candidates = (semanticCandidates.length ? semanticCandidates : getGeometricThreadCandidates(seedIndex))
        .filter((candidate) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, limit);
    const source = semanticCandidates.length ? 'semantic' : (candidates[0]?.source || 'geometric-fallback');
    const reasonByIndex = new Map(candidates.map((candidate) => [candidate.index, candidate.reason]));
    const neighborIndices = candidates.map((candidate) => candidate.index);
    const cursor = (() => {
        const tc = candidates.findIndex((candidate) => candidate.index === state.navState.focusedIndex);
        return tc >= 0 ? tc : 0;
    })();
    // Canonical owner for trail/thread nav state fields is navigation-state.js.
    // Route all writes through the owner API to keep ownership auditable.
    setTrailNavState(seedIndex, { candidates, source, reasonByIndex, neighborIndices, cursor });
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

export function restoreFocusTrailState(priorFocused = state.focusedNode) {
    if (!Number.isFinite(priorFocused) || priorFocused < 0 || priorFocused >= state.points.length) return;

    const priorHistory = [...(state.navState.explorationHistoryIndices || [priorFocused])];

    setTrailFromSeed(priorFocused);
    // explorationHistoryIndices is owned by the FOCUS_NODE reducer in navigation-state.js.
    // Route the restore through the canonical dispatch to keep the ownership boundary
    // auditable at the reducer level, matching how RESET_FOCUS clears it explicitly.
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY, { history: priorHistory });
    state.navState.lastTraversalReason = state.navState.lastTraversalReason || null;

    updateTrailIndices(priorFocused);
    refreshFocusSemanticOverlay();
    applyLocalNeighborhoodFocus(priorFocused);
    applyPointFilterColors();

    const priorPoint = state.points[priorFocused] || null;
    syncFocusStage(priorPoint || state.selectedPoint || null);
    updateTraversalUi();
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
        if (cardEl) applyClusterUiAccent(cardEl, null);
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
    if (cardEl) applyClusterUiAccent(cardEl, point);
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
    if (roleEl && typeof adapter.getSelectedBusinessRoleLabel === 'function') roleEl.textContent = adapter.getSelectedBusinessRoleLabel(point);
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

    const interestingNote = typeof adapter.getInterestingBusinessNote === 'function' ? adapter.getInterestingBusinessNote(point) : null;
    if (triviaEl) {
        const matchNarrative = typeof adapter.buildSelectedMatchNarrative === 'function' ? adapter.buildSelectedMatchNarrative(point) : '';
        const showTrivia = interestingNote && !matchNarrative.includes(interestingNote);
        triviaEl.textContent = showTrivia ? interestingNote : '';
        triviaEl.style.display = showTrivia ? 'block' : 'none';
    }

    const suppressAutoRevealForFieldNode = options.revealCard !== true && typeof adapter.isFieldNodeFocusContext === 'function' && adapter.isFieldNodeFocusContext();
    if (options.revealCard !== false && !suppressAutoRevealForFieldNode) {
        if (typeof adapter.revealSelectedBusinessCard === 'function') adapter.revealSelectedBusinessCard();
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

    if (threadEl && typeof adapter.describeThreadLensForPoint === 'function') {
        threadEl.textContent = adapter.describeThreadLensForPoint(point);
    }

    updateTraversalUi();

    if (!options.skipHydrate && !interestingNote && !point.website && !point.email && !point.phone) {
        if (typeof adapter.hydrateLeadContext === 'function') void adapter.hydrateLeadContext(point, { refreshSelected: true });
    }
}

function hasColdDegradedSemanticFallback() {
    return typeof adapter.hasColdDegradedSemanticFallback === 'function'
        ? adapter.hasColdDegradedSemanticFallback()
        : false;
}

function shouldUseFloatingFocusJourneyOnly() {
    return typeof adapter.shouldUseFloatingFocusJourneyOnly === 'function'
        ? adapter.shouldUseFloatingFocusJourneyOnly()
        : false;
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
            adapter.setLastCanvasNodePick(raycastCandidate);
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
    adapter.setLastCanvasNodePick(resolved);
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
        adapter.setLastCanvasNodeHover(null);
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
    adapter.setLastCanvasNodeHover(stableCandidate);
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
        const stable = state.stableCanvasHover;
        const stableIsThreadNeighbor = stable
            && Number.isFinite(stable.index)
            && stable.index !== state.navState.focusedIndex
            && isPointVisible(stable.index, state.points, null, state.activeFilters)
            && (state.navState.threadCandidates || []).some((item) => item && item.index === stable.index);
        if (stableIsThreadNeighbor) {
            const stableDistance = Math.hypot((stable.screenX ?? event.clientX) - event.clientX, (stable.screenY ?? event.clientY) - event.clientY);
            if (stableDistance <= 96) {
                const threadCandidate = (state.navState.threadCandidates || []).find((item) => item && item.index === stable.index);
                candidate = {
                    ...threadCandidate,
                    ...stable,
                    reason: threadCandidate?.reason || stable.reason || 'hovered 3D related node',
                    source: stable.source || 'stable-hover'
                };
            }
        }
        if (!candidate && document.body.dataset.threadInspectSurface === 'canvas' && Number.isFinite(state.inspectedThreadIndex)) {
            candidate = (state.navState.threadCandidates || []).find((item) => item && item.index === state.inspectedThreadIndex)
                || { index: state.inspectedThreadIndex, reason: 'inspected 3D related node' };
        }
        if (!candidate) candidate = getNearestCanvasThreadCandidate(event, 96);
        if (!candidate) return false;
        event.preventDefault();
        adapter.setLastCanvasNodePick(candidate);
        adapter.setLastCanvasNodeFocusPick(candidate);
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
        releaseFocusCameraAssist('field-click');
        noteSceneInteraction(state.AUTO_ROTATE_MANUAL_IDLE_MS);
        return focusOnNode(candidate.index, {
            fromCanvasNode: true,
            revealCard: true,
            historyMode: 'push'
        });
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

export function updateFocusNeighborRail() {
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
        const button = document.createElement('button');
        button.className = 'focus-stage-neighbor-pill';
        button.type = 'button';
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
            dispatchNavTransition('WALK_TO', {
                index: targetIndex,
                restoreHistoryIndices: history.slice(0, targetOrder + 1),
                appendHistory: false
            });
            focusOnNode(targetIndex, {
                fromTraversal: true,
                restoreHistory: true,
                historyMode: 'push'
            });
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
    const colorStateKey = [
        state.filterVersion,
        state.navState.mode || 'overview',
        state.navState.focusedIndex ?? 'none',
        state.focusedNode ?? 'none',
        state.trailDepth ?? 0,
        state.myceliumMode || 'default',
        state.navState.threadSource || 'none',
        (state.navState.trailNeighborIndices || []).slice(0, 12).join(','),
        (state.navState.focusPocketIndices || []).slice(0, 18).join(','),
        (state.navState.walkHistoryIndices || []).slice(-6).join(',')
    ].join('|');
    if (state.filterColorStateKey === colorStateKey) return;
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
    state.filterColorStateKey = colorStateKey;
    if (typeof syncNodeSporeColorsFromPointColors === 'function') {
        syncNodeSporeColorsFromPointColors();
    }
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
    window.setTrailFromSeed = setTrailFromSeed;
    window.updateTrailIndices = updateTrailIndices;
    window.updateSelectedBusiness = updateSelectedBusiness;
    window.applyPointFilterColors = applyPointFilterColors;
    window.walkThreadNeighbor = walkThreadNeighbor;
    window.traverseNeighbor = traverseNeighbor;
    window.walkInsideToNextStop = walkInsideToNextStop;
    window.previewInsideNextThread = previewInsideNextThread;
    window.getCurrentTrailFocusIndex = getCurrentTrailFocusIndex;
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
    window.__semanticCanvasThreadProbe = () => ({
        focusedIndex: Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null,
        pinnedIndex: Number.isFinite(state.pinnedThreadIndex) ? state.pinnedThreadIndex : null,
        inspectedIndex: Number.isFinite(state.inspectedThreadIndex) ? state.inspectedThreadIndex : null,
        candidates: getFocusThreadScreenCandidates(),
        inspector: getThreadInspectionState(),
        strandVisual: { ...(state.inspectedStrandDiagnostics || {}) },
        focusCue: __semanticFocusCueProbe()
    });
}

export function describeThreadLensForPoint(point) {
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
}
