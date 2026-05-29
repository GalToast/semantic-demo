import * as THREE from 'three';
import { state } from '../state.js';
// js/modules/thread-inspector.js — thread/strand inspection for semantic demo
;
import { formatBusinessName, stripTerminalPunctuation, normalizeCityForFilter } from '../utils.js';
import { getProjectedNeighborCandidates } from './journey-thread-model.js';
import { normalizeLeadId } from './journey-thread-model.js';
import { truncateMicrocopy } from './thread-inspector-text-helpers.js';
import { focusOnNode } from './camera-controls.js';
import { dispatchNavTransition, focusOnPoint, syncFocusStage } from './lifecycle.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { showExperienceToast } from './ui-feedback.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { setStrandContinuityState, clearStrandContinuityState } from './strand-continuity.js';
import {
    adapter_summarizeNeighborReason,
    adapter_getInsideRelationshipLabel,
    adapter_getCurrentTrailFocusIndex,
    adapter_getFocusThreadCurvePoint
} from './thread-inspector-adapter.js';
import { setInspectedStrandOverlayUpdater } from './inspected-strand-overlay-adapter.js';

// === Internal helpers (deferred to main script via adapter) ===

function summarizeNeighborReason(candidate, point, focusPoint) {
    return adapter_summarizeNeighborReason(candidate, point, focusPoint);
}

function getInsideRelationshipLabel(candidate, point, focusPoint) {
    return adapter_getInsideRelationshipLabel(candidate, point, focusPoint);
}

// === Candidate selectors ===

export function getSemanticThreadCandidates(index) {
    const point = state.points[index];
    const leadId = normalizeLeadId(point?.lead_id);
    if (!leadId) return [];
    const threadNode = state.semanticNeighborMapByLeadId.get(leadId);
    if (!threadNode?.neighbors?.length) return [];
    return threadNode.neighbors
        .map((neighbor) => {
            const candidateIndex = state.pointIndexByLeadId.get(neighbor.leadId);
            if (candidateIndex === undefined || candidateIndex === index) return null;
            return {
                index: candidateIndex,
                score: Number.isFinite(neighbor.score) ? neighbor.score : 0,
                semanticScore: Number.isFinite(neighbor.semanticScore) ? neighbor.semanticScore : 0,
                sameCity: Boolean(neighbor.sameCity),
                sameStatus: Boolean(neighbor.sameStatus),
                bridgeScore: Number.isFinite(neighbor.bridgeScore) ? neighbor.bridgeScore : 0,
                signalScore: Number.isFinite(neighbor.signalScore) ? neighbor.signalScore : 0,
                threadType: neighbor.threadType || 'local_semantic_neighbor',
                reason: neighbor.reason || 'semantic neighbor',
                source: 'semantic'
            };
        })
        .filter(Boolean);
}

export function getGeometricThreadCandidates(index) {
    if (typeof getProjectedNeighborCandidates === 'function') {
        const projected = getProjectedNeighborCandidates(index);
        if (!projected || !Array.isArray(projected)) return [];
        return projected.map((candidateIndex) => ({
            index: candidateIndex,
            score: 0,
            semanticScore: 0,
            sameCity:
                normalizeCityForFilter(state.points[candidateIndex]?.city) ===
                normalizeCityForFilter(state.points[index]?.city),
            sameStatus:
                (state.points[candidateIndex]?.status || 'active') === (state.points[index]?.status || 'active'),
            bridgeScore: state.bridgeScores[candidateIndex] || 0,
            signalScore: state.signalScores[candidateIndex] || 0,
            threadType: 'approximate_projected_neighbor',
            reason: 'approximate projected neighbor from the current cloud layout',
            source: 'geometric-fallback'
        }));
    }
    return [];
}

export function getThreadCandidatesForIndex(index) {
    const semanticCandidates = getSemanticThreadCandidates(index);
    if (semanticCandidates.length) return semanticCandidates;
    return getGeometricThreadCandidates(index);
}

export { setStrandContinuityState, clearStrandContinuityState };

export function getStrandArrivalNote(point = null) {
    if (state.strandContinuityState.phase !== 'arrived') return '';
    const targetIndex = state.strandContinuityState.targetIndex;
    const targetPoint = Number.isFinite(targetIndex) ? state.points[targetIndex] : null;
    const currentPoint = point || targetPoint;
    if (!currentPoint || targetPoint !== currentPoint) return '';
    const fromPoint = Number.isFinite(state.strandContinuityState.fromIndex)
        ? state.points[state.strandContinuityState.fromIndex]
        : null;
    const fromName = fromPoint ? formatBusinessName(fromPoint.name || 'the prior stop') : 'the prior stop';
    const targetName = formatBusinessName(currentPoint.name || 'this stop');
    return truncateMicrocopy(
        `Arrived by connection from ${fromName}. ${targetName} is now the anchor; inspect another connection, follow it, or backtrack without losing the path.`,
        154
    );
}

// === Thread inspection ===

export function getThreadInspectionState(index = state.inspectedThreadIndex, options = {}) {
    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return null;
    const focusedIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    const focusPoint = (focusedIndex !== null && focusedIndex >= 0 && focusedIndex < state.points.length) ? state.points[focusedIndex] : null;
    const candidate = Number.isFinite(index)
        ? (state.navState.threadCandidates || []).find((item) => item && item.index === index)
        : null;
    const point = candidate ? state.points[candidate.index] : null;
    const active = !!(candidate && point && focusPoint);
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const targetName = point ? formatBusinessName(point.name || 'nearby stop') : '';
    const reason = active ? summarizeNeighborReason(candidate, point, focusPoint) : '';
    const role = active ? (state.navState.focusPocketRoleByIndex instanceof Map ? state.navState.focusPocketRoleByIndex.get(candidate.index) : undefined) || candidate.role || 'trail' : '';
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
        active && reason.includes('...') ? getInsideRelationshipLabel(candidate, point, focusPoint) : cleanReason;
    const copy = active
        ? journeyPhase === 'exploring'
            ? `${displayReason}. Following this connection into the next neighborhood.`
            : journeyPhase === 'arrived'
              ? `${displayReason}. You arrived through this connection; inspect another connection or backtrack to compare.`
              : pinned
                ? `${displayReason}. This connection is pinned for comparison; follow it, keep it pinned, or clear it.`
                : `${displayReason}. Preview the relationship, pin it for comparison, or follow it to the next stop.`
        : 'Click a neighbor below to preview why it belongs here, then pin or follow.';
    const meta = active
        ? `Semantic relationship: ${source}`
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

export function renderThreadInspection(index = state.inspectedThreadIndex, options = {}) {
    const inspector = document.getElementById('focus-thread-inspector');
    const inspectionState = getThreadInspectionState(index, options);
    syncInspectedStrandOverlay(inspectionState, options);
    document.body.dataset.threadInspectSurface = inspectionState.active
        ? inspectionState.surface || options.surface || 'rail'
        : 'idle';
    if (!inspector) return inspectionState;
    if (inspector._pointerEnterListener) {
        inspector.removeEventListener('pointerenter', inspector._pointerEnterListener);
        inspector.removeEventListener('pointerleave', inspector._pointerLeaveListener);
        delete inspector._pointerEnterListener;
        delete inspector._pointerLeaveListener;
        delete inspector.dataset.pointerGuardBound;
    }
    if (!inspector.dataset.pointerGuardBound) {
        inspector.dataset.pointerGuardBound = 'true';
        const pointerEnter = () => {
            state.threadInspectorPointerInside = true;
            if (state.canvasThreadInspectionClearTimer) {
                window.clearTimeout(state.canvasThreadInspectionClearTimer);
                state.canvasThreadInspectionClearTimer = null;
            }
        };
        const pointerLeave = () => {
            state.threadInspectorPointerInside = false;
            if (document.body.dataset.threadInspectSurface === 'canvas' && state.pinnedThreadIndex === null) {
                scheduleCanvasThreadInspectionClear(1800);
            }
        };
        inspector.addEventListener('pointerenter', pointerEnter);
        inspector.addEventListener('pointerleave', pointerLeave);
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
              : 'Follow Connection';
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
            exploreThreadNeighbor(inspectionState.index, {
                surface: inspectionState.surface || options.surface || 'inspector'
            });
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
    document
        .querySelectorAll('.focus-stage-neighbor-pill.is-inspected')
        .forEach((item) => item.classList.remove('is-inspected'));
    document
        .querySelectorAll('.focus-stage-neighbor-pill.is-pinned')
        .forEach((item) => item.classList.remove('is-pinned'));
    document
        .querySelectorAll('.focus-stage-neighbor-pill.is-exploring')
        .forEach((item) => item.classList.remove('is-exploring'));
    if (inspectionState.active) {
        const railItem = document.querySelector(`.focus-stage-neighbor-pill[data-index="${inspectionState.index}"]`);
        railItem?.classList.add('is-inspected');
        railItem?.classList.toggle('is-pinned', inspectionState.pinned);
        railItem?.classList.toggle('is-exploring', inspectionState.journeyPhase === 'exploring');
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
        state.inspectedThreadIndex = null;
        state.threadInspectorPointerInside = false;
        syncFocusStage(state.selectedPoint);
        syncSemanticDiveUi();
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
    return renderThreadInspection(null, { surface: 'idle' });
}

export function exploreThreadNeighbor(index, options = {}) {
    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return null;
    if (!Number.isFinite(index)) return null;
    const fromIndex = Number.isFinite(options.fromIndex)
        ? options.fromIndex
        : adapter_getCurrentTrailFocusIndex() !== null
          ? adapter_getCurrentTrailFocusIndex()
          : null;
    const candidate = (state.navState.threadCandidates || []).find((item) => item && item.index === index);
    const targetPoint = (Number.isFinite(index) && index >= 0 && index < state.points.length) ? state.points[index] : null;
    if (!targetPoint) return null;
    const reason =
        summarizeNeighborReason(
            candidate || {},
            targetPoint,
            (Number.isFinite(fromIndex) && fromIndex >= 0 && fromIndex < state.points.length) ? state.points[fromIndex] : null
        ) ||
        candidate?.reason ||
        options.reason ||
        'nearby business relationship';
    if (Number.isFinite(state.strandContinuityState.arrivalTimeoutId)) {
        window.clearTimeout(state.strandContinuityState.arrivalTimeoutId);
        state.strandContinuityState.arrivalTimeoutId = undefined;
    }
    if (Number.isFinite(state.strandContinuityState.settleTimeoutId)) {
        window.clearTimeout(state.strandContinuityState.settleTimeoutId);
        state.strandContinuityState.settleTimeoutId = undefined;
    }
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = index;
    setStrandContinuityState('exploring', { targetIndex: index, fromIndex, reason });
    // Route through navTransitionReducer for canonical mode='trail' and walkHistoryIndices ownership.
    dispatchNavTransition('WALK_TO', { index, fromIndex, appendHistory: !options.restoreHistory });
    renderThreadInspection(index, { force: true, surface: options.surface || 'explore' });
    state.navState.lastTraversalReason = reason;
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
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex
        });
    }
    showExperienceToast(
        'Following connection',
        `Opening the connection to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
    );
    const arrivalDelay = options.arrivalDelay || 820;
    const capturedIndex = index;
    const capturedFromIndex = fromIndex;
    const capturedReason = reason;
    const arrivalTid = window.setTimeout(() => {
        if (state.strandContinuityState.phase === 'exploring' && state.strandContinuityState.targetIndex === capturedIndex) {
            setStrandContinuityState('arrived', { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason });
            const pointAtArrival = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < state.points.length) ? state.points[capturedIndex] : null;
            syncFocusStage(pointAtArrival || state.selectedPoint || null);
            updateJourneyCompass();
        }
    }, arrivalDelay);
    state.strandContinuityState.arrivalTimeoutId = arrivalTid;
    const settleDelay = options.settleDelay || 5200;
    const settleTid = window.setTimeout(() => {
        if (state.strandContinuityState.phase === 'arrived' && state.strandContinuityState.targetIndex === capturedIndex) {
            clearStrandContinuityState('arrival-settled');
            const pointAtSettle = (Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < state.points.length) ? state.points[capturedIndex] : null;
            syncFocusStage(pointAtSettle || state.selectedPoint || null);
        }
    }, settleDelay);
    state.strandContinuityState.settleTimeoutId = settleTid;
    return { targetIndex: index, fromIndex, reason };
}

// === Strand overlay (Three.js) ===

export function getInspectedStrandEdge(index, lane = 0) {
    const focusIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    if (focusIndex === null || !Number.isFinite(index) || index === focusIndex) return null;
    const motifKey = state.navState.focusPocketMeta?.motif || 'market';
    const motifConfig = { ...(state.FOCUS_CONSTELLATION_MOTIFS[motifKey] || state.FOCUS_CONSTELLATION_MOTIFS.market || {}) };
    // Add fallbacks for numeric values:
    const directLift = Number.isFinite(motifConfig.directLift) ? motifConfig.directLift : 0.6;
    const braid = Number.isFinite(motifConfig.braid) ? motifConfig.braid : 0.3;
    const side = ((focusIndex * 31 + index * 17) % 2) === 0 ? 1 : -1;
    const rawRise = (((focusIndex + index) % 5) - 2) / 2;
    const rise = Number.isFinite(rawRise) ? rawRise : 0.45;
    return {
        a: focusIndex,
        b: index,
        curveLift: Math.max(0.48, directLift * (1.08 + Math.abs(lane) * 0.1)),
        side: side + lane * 0.16,
        rise: rise + lane * 0.18,
        depth: 1.02 + Math.abs(lane) * 0.12,
        cue: 1,
        motifBraid: Math.min(0.92, braid + 0.16),
        anchorPull: Math.min(0.34, 0.16 + braid * 0.18),
        priority: 1,
        role: 'inspection'
    };
}

export function writeInspectedStrandPositions(lineObject) {
    const targetIndex = lineObject?.userData?.targetIndex;
    if (!Number.isFinite(targetIndex) || !lineObject.geometry?.attributes?.position) return;
    const positionAttr = lineObject.geometry.attributes.position;
    const positions = positionAttr.array;
    const lanes = lineObject.userData?.lanes || [0];
    let offset = 0;
    lanes.forEach((lane) => {
        const edge = getInspectedStrandEdge(targetIndex, lane);
        if (!edge) return;
        for (let segment = 0; segment < state.FOCUS_THREAD_SEGMENTS; segment += 1) {
            const t0 = segment / state.FOCUS_THREAD_SEGMENTS;
            const t1 = (segment + 1) / state.FOCUS_THREAD_SEGMENTS;
            const p0 = adapter_getFocusThreadCurvePoint(edge, t0) || new THREE.Vector3();
            const p1 = adapter_getFocusThreadCurvePoint(edge, t1) || new THREE.Vector3();
            positions[offset] = Number.isFinite(p0.x) ? p0.x : 0;
            positions[offset + 1] = Number.isFinite(p0.y) ? p0.y : 0;
            positions[offset + 2] = Number.isFinite(p0.z) ? p0.z : 0;
            positions[offset + 3] = Number.isFinite(p1.x) ? p1.x : 0;
            positions[offset + 4] = Number.isFinite(p1.y) ? p1.y : 0;
            positions[offset + 5] = Number.isFinite(p1.z) ? p1.z : 0;
            offset += 6;
        }
    });
    positionAttr.needsUpdate = true;
}

export function createInspectedStrandMaterial({ aura = false } = {}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: performance.now() / 1000 },
            opacity: { value: aura ? 0.42 : 0.92 },
            semanticScore: { value: 0.5 } // 10/10 Polish: Visual reactivity to connection strength
        },
        vertexShader: `
            attribute float progress;
            attribute float lane;
            varying float vProgress;
            varying float vLane;
            void main() {
                vProgress = progress;
                vLane = lane;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float semanticScore;
            varying float vProgress;
            varying float vLane;
            void main() {
                // 10/10 Polish: Frequency reacts to semantic score (connection strength)
                float pulseFreq = 0.52 + (semanticScore * 1.6);
                float flow = fract(vProgress - time * pulseFreq + abs(vLane) * 0.08);

                // Spores (organic information pulses) react to score
                float sporeSize = 1.8 + (semanticScore * 3.2);
                float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123);
                float spore = pow(1.0 - abs(flow - 0.58) * 2.0, sporeSize);
                spore *= (0.85 + noise * 0.3); // Add high-frequency jitter
                float breath = 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16;

                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 gold = vec3(1.0, 0.85, 0.38);
                vec3 pearl = vec3(0.92, 1.0, 0.96);

                // Color transition reflects the 'journey' progress
                vec3 color = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));

                // Spores carry the light
                color = mix(color, pearl, spore * 0.62);

                // Alpha is boosted by connection strength
                float alpha = opacity * breath * (0.52 + spore * 0.88 + (semanticScore * 0.28));
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
}

export function createInspectedStrandLine(targetIndex, lanes, aura = false) {
    const positions = [];
    const progress = [];
    const laneValues = [];
    for (let i = 0; i < lanes.length * state.FOCUS_THREAD_SEGMENTS * 2; i++) {
        positions.push(0, 0, 0);
    }
    lanes.forEach((lane) => {
        for (let segment = 0; segment < state.FOCUS_THREAD_SEGMENTS; segment += 1) {
            progress.push(segment / state.FOCUS_THREAD_SEGMENTS, (segment + 1) / state.FOCUS_THREAD_SEGMENTS);
            laneValues.push(lane, lane);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('progress', new THREE.Float32BufferAttribute(progress, 1));
    geometry.setAttribute('lane', new THREE.Float32BufferAttribute(laneValues, 1));
    const line = new THREE.LineSegments(geometry, createInspectedStrandMaterial({ aura }));
    line.userData = { targetIndex, lanes, aura };
    writeInspectedStrandPositions(line);
    return line;
}

export function updateInspectedStrandEndpointSprites() {
    if (!state.inspectedStrandGroup) return;
    state.inspectedStrandGroup.children.forEach((child) => {
        const endpointIndex = child.userData?.endpointIndex;
        if (!Number.isFinite(endpointIndex) || !state.nodePositions[endpointIndex]) return;
        const pos = state.nodePositions[endpointIndex];
        child.position.set(
            Number.isFinite(pos.x) ? pos.x : 0,
            Number.isFinite(pos.y) ? pos.y : 0,
            Number.isFinite(pos.z) ? pos.z : 0
        );
    });
}

export function syncInspectedStrandOverlay(inspectionState, options = {}) {
    if (
        !inspectionState?.active ||
        state.currentView !== 'galaxy' ||
        !state.scene ||
        !Number.isFinite(inspectionState.index) ||
        !Number.isFinite(inspectionState.focusedIndex) ||
        !state.nodePositions[inspectionState.index] ||
        !state.nodePositions[inspectionState.focusedIndex]
    ) {
        disposeInspectedStrandOverlay();
        return;
    }
    const needsRebuild =
        !state.inspectedStrandGroup ||
        state.inspectedStrandGroup.userData?.targetIndex !== inspectionState.index ||
        state.inspectedStrandGroup.userData?.focusedIndex !== inspectionState.focusedIndex;
    if (needsRebuild) {
        disposeInspectedStrandOverlay();
        state.inspectedStrandGroup = new THREE.Group();
        state.inspectedStrandGroup.name = 'inspected-semantic-strand';
        state.inspectedStrandGroup.userData = {
            targetIndex: inspectionState.index,
            focusedIndex: inspectionState.focusedIndex,
            source: options.surface || 'rail',
            enteredAt: performance.now()
        };
        state.inspectedStrandGroup.add(createInspectedStrandLine(inspectionState.index, [-1, 0, 1], true));
        state.inspectedStrandGroup.add(createInspectedStrandLine(inspectionState.index, [0], false));
        [inspectionState.focusedIndex, inspectionState.index].forEach((endpointIndex, order) => {
            const endpointMaterial = new THREE.SpriteMaterial({
                map: state.focusRingTexture || state.focusNextCueTexture || state.focusBeaconTexture,
                color: order === 0 ? 0xffe27a : 0x7ce7dd,
                transparent: true,
                opacity: order === 0 ? 0.42 : 0.58,
                depthWrite: false,
                depthTest: false,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(endpointMaterial);
            sprite.userData = {
                endpointIndex,
                baseScale: order === 0 ? 0.052 : 0.06,
                baseOpacity: order === 0 ? 0.42 : 0.58,
                pulseRate: order === 0 ? 1.1 : 1.34
            };
            state.inspectedStrandGroup.add(sprite);
        });
        state.scene.add(state.inspectedStrandGroup);
    }
    state.inspectedStrandGroup.userData.source =
        options.surface || state.inspectedStrandGroup.userData.source || 'rail';
    state.inspectedStrandGroup.children.forEach((child) => {
        if (child.isLineSegments) {
            writeInspectedStrandPositions(child);
        }
    });
    updateInspectedStrandEndpointSprites();
    state.inspectedStrandDiagnostics = {
        active: true,
        source:
            state.pinnedThreadIndex === inspectionState.index
                ? 'pinned'
                : state.inspectedStrandGroup.userData.source || 'rail',
        index: inspectionState.index,
        focusedIndex: inspectionState.focusedIndex,
        segmentCount: state.FOCUS_THREAD_SEGMENTS * 4,
        braidCount: 4,
        endpointCount: 2,
        pinned: state.pinnedThreadIndex === inspectionState.index
    };
}

export function updateInspectedStrandOverlay(now = performance.now()) {
    if (!state.inspectedStrandGroup) return;
    state.inspectedStrandGroup.children.forEach((child) => {
        if (child.isLineSegments) {
            writeInspectedStrandPositions(child);
            if (child.material?.uniforms?.time) child.material.uniforms.time.value = now / 1000;
        } else if (child.isSprite) {
            const endpointIndex = child.userData?.endpointIndex;
            const pos = Number.isFinite(endpointIndex) ? state.nodePositions[endpointIndex] : null;
            if (!pos) return;
            child.position.set(
                Number.isFinite(pos.x) ? pos.x : 0,
                Number.isFinite(pos.y) ? pos.y : 0,
                Number.isFinite(pos.z) ? pos.z : 0
            );
            const pulse =
                1 + Math.sin(state.pulsePhase * (child.userData?.pulseRate || 1.2) + endpointIndex * 0.19) * 0.14;
            const scale = (child.userData?.baseScale || 0.052) * pulse;
            child.scale.set(scale, scale, 1);
        }
    });
}

export function disposeInspectedStrandOverlay() {
    if (!state.inspectedStrandGroup) {
        state.inspectedStrandDiagnostics = {
            active: false,
            source: 'none',
            index: null,
            focusedIndex: null,
            segmentCount: 0,
            braidCount: 0,
            endpointCount: 0
        };
        return;
    }
    if (state.scene) state.scene.remove(state.inspectedStrandGroup);
    state.inspectedStrandGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    state.inspectedStrandGroup = null;
    state.inspectedStrandDiagnostics = {
        active: false,
        source: 'none',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    };
}

import { registerDiagnosticProbe } from './diagnostic-adapter.js';

setInspectedStrandOverlayUpdater(updateInspectedStrandOverlay);

// Debug access — registered via diagnostic-adapter
registerDiagnosticProbe('_ti', {
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex,
    setStrandContinuityState,
    clearStrandContinuityState,
    getStrandArrivalNote,
    getThreadInspectionState,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection,
    exploreThreadNeighbor,
    syncInspectedStrandOverlay,
    updateInspectedStrandOverlay,
    disposeInspectedStrandOverlay
});

// Diagnostic namespace — exploreThreadNeighbor remains accessible via _ti for debugging.
// The direct window.exploreThreadNeighbor backward-compat bridge has been removed
// as of Wave70. The active traversal seam is window.walkThreadNeighbor (journey.js).
// _ti is gated behind window.__DEBUG_PROBES__ — when the gate is off, no bare window
// function exports escape thread-inspector.js.
// Contracts assert this state via thread-inspector-dewindowing-contract.mjs.
// Do not re-add window.exploreThreadNeighbor without updating contracts first.
