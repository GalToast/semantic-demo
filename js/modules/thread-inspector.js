// js/modules/thread-inspector.js — thread/strand inspection for semantic demo
import { state } from '../state.js';
import { formatBusinessName, stripTerminalPunctuation, cleanOptionalValue, normalizeCityForFilter } from '../utils.js';

// === Internal helpers (deferred to main script via window) ===

function summarizeNeighborReason(candidate, point, focusPoint) {
    if (window.summarizeNeighborReason) return window.summarizeNeighborReason(candidate, point, focusPoint);
    return candidate?.reason || 'Semantic relationship';
}

function getInsideRelationshipLabel(candidate, point, focusPoint) {
    if (window.getInsideRelationshipLabel) return window.getInsideRelationshipLabel(candidate, point, focusPoint);
    return 'Related connection';
}

function truncateMicrocopy(text, limit) {
    if (!text || text.length <= limit) return text || '';
    return text.substring(0, limit - 3) + '...';
}

function syncSemanticDiveUi() {
    if (window.syncSemanticDiveUi) window.syncSemanticDiveUi();
}

function syncFocusStage(point) {
    if (window.syncFocusStage) window.syncFocusStage(point);
}

function updateJourneyCompass() {
    if (window.updateJourneyCompass) window.updateJourneyCompass();
}

function showExperienceToast(title, body) {
    if (window.showExperienceToast) window.showExperienceToast(title, body);
}

function focusOnPoint(point, options) {
    if (window.focusOnPoint) window.focusOnPoint(point, options);
}

function focusOnNode(index, options) {
    if (window.focusOnNode) window.focusOnNode(index, options);
}

function syncArrivalHandoffOverlay() {
    if (window.syncArrivalHandoffOverlay) window.syncArrivalHandoffOverlay();
}

function disposeArrivalHandoffOverlay() {
    if (window.disposeArrivalHandoffOverlay) window.disposeArrivalHandoffOverlay();
}

function normalizeLeadId(id) {
    if (!id) return null;
    const s = String(id).trim();
    return s.length >= 4 ? s : null;
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
    if (window.getProjectedNeighborCandidates) {
        return window.getProjectedNeighborCandidates(index).map((candidateIndex) => ({
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

// === Strand continuity state ===

export function setStrandContinuityState(phase = 'idle', options = {}) {
    const normalizedPhase = ['idle', 'preview', 'pinned', 'walking', 'arrived', 'returning'].includes(phase)
        ? phase
        : 'idle';
    state.strandContinuityState = {
        phase: normalizedPhase,
        targetIndex: Number.isFinite(options.targetIndex) ? options.targetIndex : null,
        fromIndex: Number.isFinite(options.fromIndex) ? options.fromIndex : null,
        reason: cleanOptionalValue(options.reason) || '',
        startedAt: performance.now()
    };
    document.body.dataset.strandJourney = normalizedPhase;
    document.body.dataset.strandJourneyTarget = Number.isFinite(state.strandContinuityState.targetIndex)
        ? String(state.strandContinuityState.targetIndex)
        : '';
    document.body.dataset.strandJourneyFrom = Number.isFinite(state.strandContinuityState.fromIndex)
        ? String(state.strandContinuityState.fromIndex)
        : '';
    document.body.dataset.strandJourneyReason = state.strandContinuityState.reason;
    if (['walking', 'arrived'].includes(normalizedPhase)) {
        syncArrivalHandoffOverlay();
    } else if (normalizedPhase === 'idle') {
        disposeArrivalHandoffOverlay();
    }
    return state.strandContinuityState;
}

export function clearStrandContinuityState(reason = 'clear') {
    setStrandContinuityState('idle', { reason });
}

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
        `Arrived by connection from ${fromName}. ${targetName} is now the anchor; inspect another connection, follow it, or backtrack without losing the trail.`,
        154
    );
}

// === Thread inspection ===

export function getThreadInspectionState(index = state.inspectedThreadIndex, options = {}) {
    const focusedIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    const focusPoint = focusedIndex !== null ? state.points[focusedIndex] : null;
    const candidate = Number.isFinite(index)
        ? (state.navState.threadCandidates || []).find((item) => item && item.index === index)
        : null;
    const point = candidate ? state.points[candidate.index] : null;
    const active = !!(candidate && point && focusPoint);
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const targetName = point ? formatBusinessName(point.name || 'nearby stop') : '';
    const reason = active ? summarizeNeighborReason(candidate, point, focusPoint) : '';
    const role = active ? state.navState.focusPocketRoleByIndex?.get(candidate.index) || candidate.role || 'trail' : '';
    const source = active
        ? candidate.source === 'semantic' || state.navState.threadSource === 'semantic'
            ? 'semantic relationship'
            : 'current cloud fallback'
        : '';
    const title = active ? `${focusName} -> ${targetName}` : 'Hover a nearby stop';
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
        ? journeyPhase === 'walking'
            ? `${displayReason}. Following this connection into the next neighborhood.`
            : journeyPhase === 'arrived'
              ? `${displayReason}. You arrived through this connection; inspect another connection or backtrack to compare.`
              : pinned
                ? `${displayReason}. This connection is pinned for comparison; follow it, keep it pinned, or clear it.`
                : `${displayReason}. Preview, pin, or follow this connection without changing the semantic truth.`
        : 'Pause on a neighbor to preview the connection, then pin it or follow it when ready.';
    const meta = active
        ? `Source: ${source} | Role: ${role} | State: ${journeyPhase} | Layout: staged for readability`
        : 'Relationship source appears here.';
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
    if (!inspector.dataset.pointerGuardBound) {
        inspector.dataset.pointerGuardBound = 'true';
        inspector.addEventListener('pointerenter', () => {
            state.threadInspectorPointerInside = true;
            if (state.canvasThreadInspectionClearTimer) {
                window.clearTimeout(state.canvasThreadInspectionClearTimer);
                state.canvasThreadInspectionClearTimer = null;
            }
        });
        inspector.addEventListener('pointerleave', () => {
            state.threadInspectorPointerInside = false;
            if (document.body.dataset.threadInspectSurface === 'canvas' && state.pinnedThreadIndex === null) {
                scheduleCanvasThreadInspectionClear(420);
            }
        });
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
        followBtn.disabled = !inspectionState.active || inspectionState.journeyPhase === 'walking';
        followBtn.textContent = inspectionState.journeyPhase === 'walking' ? 'Following' : 'Follow Connection';
        followBtn.onclick = () => {
            if (!inspectionState.active || inspectionState.journeyPhase === 'walking') return;
            walkThreadNeighbor(inspectionState.index, {
                surface: inspectionState.surface || options.surface || 'inspector'
            });
        };
    }
    if (clearBtn) {
        clearBtn.disabled = !inspectionState.active && state.pinnedThreadIndex === null;
        clearBtn.onclick = () => unpinThreadInspection();
    }
    document
        .querySelectorAll('.focus-stage-neighbor-pill.is-inspected')
        .forEach((item) => item.classList.remove('is-inspected'));
    document
        .querySelectorAll('.focus-stage-neighbor-pill.is-pinned')
        .forEach((item) => item.classList.remove('is-pinned'));
    document
        .querySelectorAll('.focus-stage-neighbor-pill.is-walking')
        .forEach((item) => item.classList.remove('is-walking'));
    if (inspectionState.active) {
        const railItem = document.querySelector(`.focus-stage-neighbor-pill[data-index="${inspectionState.index}"]`);
        railItem?.classList.add('is-inspected');
        railItem?.classList.toggle('is-pinned', inspectionState.pinned);
        railItem?.classList.toggle('is-walking', inspectionState.journeyPhase === 'walking');
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

export function scheduleCanvasThreadInspectionClear(delay = 560) {
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
    return renderThreadInspection(null, { surface: 'idle' });
}

export function walkThreadNeighbor(index, options = {}) {
    if (!Number.isFinite(index)) return null;
    const fromIndex = Number.isFinite(options.fromIndex)
        ? options.fromIndex
        : window.getCurrentTrailFocusIndex
          ? window.getCurrentTrailFocusIndex()
          : null;
    const candidate = (state.navState.threadCandidates || []).find((item) => item && item.index === index);
    const targetPoint = state.points[index];
    const reason =
        summarizeNeighborReason(
            candidate || {},
            targetPoint,
            Number.isFinite(fromIndex) ? state.points[fromIndex] : null
        ) ||
        candidate?.reason ||
        options.reason ||
        'nearby business relationship';
    state.pinnedThreadIndex = null;
    state.inspectedThreadIndex = index;
    setStrandContinuityState('walking', { targetIndex: index, fromIndex, reason });
    renderThreadInspection(index, { force: true, surface: options.surface || 'walk' });
    state.navState.lastTraversalReason = reason;
    state.navState.mode = 'trail';
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
        'Following strand',
        `Walking the semantic thread to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
    );
    const arrivalDelay = options.arrivalDelay || 820;
    window.setTimeout(() => {
        if (state.strandContinuityState.phase === 'walking' && state.strandContinuityState.targetIndex === index) {
            setStrandContinuityState('arrived', { targetIndex: index, fromIndex, reason });
            syncFocusStage(state.points[index] || state.selectedPoint || null);
            updateJourneyCompass();
        }
    }, arrivalDelay);
    return { targetIndex: index, fromIndex, reason };
}

// === Strand overlay (Three.js) ===

export function getInspectedStrandEdge(index, lane = 0) {
    const focusIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    if (focusIndex === null || !Number.isFinite(index) || index === focusIndex) return null;
    const motifKey = state.navState.focusPocketMeta?.motif || 'market';
    const motifConfig = state.FOCUS_CONSTELLATION_MOTIFS[motifKey] || state.FOCUS_CONSTELLATION_MOTIFS.market;
    const side = (focusIndex * 31 + index * 17) % 2 === 0 ? 1 : -1;
    const rise = (((focusIndex + index) % 5) - 2) / 2 || 0.45;
    return {
        a: focusIndex,
        b: index,
        curveLift: Math.max(0.48, motifConfig.directLift * (1.08 + Math.abs(lane) * 0.1)),
        side: side + lane * 0.16,
        rise: rise + lane * 0.18,
        depth: 1.02 + Math.abs(lane) * 0.12,
        cue: 1,
        motifBraid: Math.min(0.92, motifConfig.braid + 0.16),
        anchorPull: Math.min(0.34, 0.16 + motifConfig.braid * 0.18),
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
            const p0 = window.getFocusThreadCurvePoint
                ? window.getFocusThreadCurvePoint(edge, t0)
                : new THREE.Vector3();
            const p1 = window.getFocusThreadCurvePoint
                ? window.getFocusThreadCurvePoint(edge, t1)
                : new THREE.Vector3();
            positions[offset] = p0.x;
            positions[offset + 1] = p0.y;
            positions[offset + 2] = p0.z;
            positions[offset + 3] = p1.x;
            positions[offset + 4] = p1.y;
            positions[offset + 5] = p1.z;
            offset += 6;
        }
    });
    positionAttr.needsUpdate = true;
}

export function createInspectedStrandMaterial({ aura = false } = {}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: performance.now() / 1000 },
            opacity: { value: aura ? 0.42 : 0.92 }
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
            varying float vProgress;
            varying float vLane;
            void main() {
                float flow = fract(vProgress - time * 0.62 + abs(vLane) * 0.08);
                float bead = pow(1.0 - abs(flow - 0.58) * 2.0, 3.0);
                float breath = 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16;
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 gold = vec3(1.0, 0.85, 0.38);
                vec3 pearl = vec3(0.92, 1.0, 0.96);
                vec3 color = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));
                color = mix(color, pearl, bead * 0.42);
                float alpha = opacity * breath * (0.68 + bead * 0.72);
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
        child.position.set(pos.x, pos.y, pos.z);
    });
}

export function syncInspectedStrandOverlay(inspectionState, options = {}) {
    if (
        !inspectionState?.active ||
        state.currentView !== 'galaxy' ||
        !state.scene ||
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
            child.position.set(pos.x, pos.y, pos.z);
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
    state.scene.remove(state.inspectedStrandGroup);
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

// Debug access
window._ti = {
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
    walkThreadNeighbor,
    syncInspectedStrandOverlay,
    updateInspectedStrandOverlay,
    disposeInspectedStrandOverlay
};
