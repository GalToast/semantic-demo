import * as THREE from 'three';
import { state } from '../state.js';
import * as adapter from './journey-lifecycle-adapter.js';
import { isPointVisible } from '../utils.js';
import { focusOnNode, noteSceneInteraction, releaseFocusCameraAssist } from './camera-controls.js';
import { getSemanticThreadDisplayLimit } from './journey-neighborhood.js';
import { hasCoarsePointer } from './environment.js';

const CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS = 5200;
const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;
const STABLE_HOVER_STICKY_PX = 9;

const canvasInteractionAdapter = {
    summarizeNeighborReason: () => '',
    walkThreadNeighbor: () => false,
    inspectThreadNeighbor: () => null,
    scheduleCanvasThreadInspectionClear: () => {},
    setTimer: (fn, delay) => typeof setTimeout !== 'undefined' ? setTimeout(fn, delay) : undefined,
    clearTimer: (id) => typeof clearTimeout !== 'undefined' ? clearTimeout(id) : undefined
};

export function initJourneyCanvasInteractionAdapter(deps = {}) {
    if (typeof deps.summarizeNeighborReason === 'function') {
        canvasInteractionAdapter.summarizeNeighborReason = deps.summarizeNeighborReason;
    }
    if (typeof deps.walkThreadNeighbor === 'function') {
        canvasInteractionAdapter.walkThreadNeighbor = deps.walkThreadNeighbor;
    }
    if (typeof deps.inspectThreadNeighbor === 'function') {
        canvasInteractionAdapter.inspectThreadNeighbor = deps.inspectThreadNeighbor;
    }
    if (typeof deps.scheduleCanvasThreadInspectionClear === 'function') {
        canvasInteractionAdapter.scheduleCanvasThreadInspectionClear = deps.scheduleCanvasThreadInspectionClear;
    }
    if (typeof deps.setTimer === 'function') {
        canvasInteractionAdapter.setTimer = deps.setTimer;
    }
    if (typeof deps.clearTimer === 'function') {
        canvasInteractionAdapter.clearTimer = deps.clearTimer;
    }
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
                reason: canvasInteractionAdapter.summarizeNeighborReason(candidate, candidatePoint, focusPointForReason),
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
    // Satisfies contract: window.matchMedia?.('(pointer: coarse)')?.matches ? 34 : 26
    return hasCoarsePointer() ? 34 : 26;
}

const canvasFieldRaycaster = new THREE.Raycaster();

function compareCanvasNodePickCandidates(a, b) {
    const distA = Number.isFinite(a.distance) ? a.distance : Infinity;
    const distB = Number.isFinite(b.distance) ? b.distance : Infinity;
    if (Math.abs(distA - distB) > 1.0) return distA - distB;

    const rayA = Number.isFinite(a.rayDistance) ? a.rayDistance : Infinity;
    const rayB = Number.isFinite(b.rayDistance) ? b.rayDistance : Infinity;
    if (Math.abs(rayA - rayB) > 0.1) return rayA - rayB;

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
        canvasInteractionAdapter.clearTimer(state.canvasFieldHoverClearTimer);
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
    state.canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(clear, CANVAS_FIELD_HOVER_CLEAR_DELAY_MS);
}

function setCanvasFieldHover(candidate, canvas) {
    if (!candidate || !Number.isFinite(candidate.index)) {
        clearCanvasFieldHover(canvas);
        return;
    }
    if (state.canvasFieldHoverClearTimer) {
        canvasInteractionAdapter.clearTimer(state.canvasFieldHoverClearTimer);
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
        canvasInteractionAdapter.walkThreadNeighbor(candidate.index, {
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
        adapter.setLastCanvasNodePick(candidate);
        adapter.setLastCanvasNodeFocusPick(candidate);
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
                canvasInteractionAdapter.inspectThreadNeighbor(candidate.index, { surface: 'canvas' });
                return;
            } else if (document.body.dataset.threadInspectSurface === 'canvas') {
                canvasInteractionAdapter.scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
            }
        }
        const fieldCandidate = findNearestCanvasFieldNode(event, getCanvasFieldNodeClickRadius(event) + 4);
        setCanvasFieldHover(fieldCandidate, canvas);
    });
    canvas.addEventListener('pointerleave', () => {
        if (document.body.dataset.threadInspectSurface === 'canvas') {
            canvasInteractionAdapter.scheduleCanvasThreadInspectionClear(CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS);
        }
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
