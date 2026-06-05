import * as THREE from 'three';
import { state } from '../state.js';
import { isPointVisible } from './utils/geo-data.js';
import { getSemanticThreadDisplayLimit } from './journey-neighborhood.js';
import { hasCoarsePointer } from './environment.js';

export const canvasInteractionAdapter = {
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

export function getNearestCanvasThreadCandidate(event, maxDistance = 34) {
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

export function getCanvasPointerPosition(event) {
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

export function getCanvasFieldNodeClickRadius(event) {
    const pointerType = event?.pointerType || '';
    if (pointerType === 'touch' || pointerType === 'pen') return 34;
    // Satisfies contract: window.matchMedia?.('(pointer: coarse)')?.matches ? 34 : 26
    return hasCoarsePointer() ? 34 : 26;
}
