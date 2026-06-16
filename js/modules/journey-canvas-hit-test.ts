/**
 * journey-canvas-hit-test.ts — TypeScript shadow of journey-canvas-hit-test.js
 */
import * as THREE from 'three';
import { state } from '@lib/engine/state-bridge';
import { isPointVisible } from './utils/geo-data.ts';
import { getSemanticThreadDisplayLimit } from './journey-neighborhood.ts';
import { hasCoarsePointer } from './environment.ts';
import type { ThreadCandidate } from './journey-thread-model.ts';

export interface CanvasInteractionAdapter {
    summarizeNeighborReason: (candidate: any, point: any, focusPoint: any) => string;
    walkThreadNeighbor: (index: number, options?: Record<string, unknown>) => boolean | null;
    inspectThreadNeighbor: (index: number, options?: Record<string, unknown>) => any;
    scheduleCanvasThreadInspectionClear: (delay?: number) => void;
    setTimer: (fn: () => void, delay: number) => ReturnType<typeof setTimeout> | undefined;
    clearTimer: (id: ReturnType<typeof setTimeout> | undefined) => void;
}

export const canvasInteractionAdapter: CanvasInteractionAdapter = {
    summarizeNeighborReason: () => '',
    walkThreadNeighbor: () => false,
    inspectThreadNeighbor: () => null,
    scheduleCanvasThreadInspectionClear: () => {},
    setTimer: (fn: () => void, delay: number) => typeof setTimeout !== 'undefined' ? setTimeout(fn, delay) : undefined,
    clearTimer: (id: ReturnType<typeof setTimeout> | undefined) => typeof clearTimeout !== 'undefined' ? clearTimeout(id) : undefined
};

export function initJourneyCanvasInteractionAdapter(deps: Partial<CanvasInteractionAdapter> = {}): void {
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

export function isThreadCandidateVisibleOnCanvas(index: number, margin: number = 18): boolean {
    if (state.currentView !== 'galaxy') return true;
    if (!Number.isFinite(index)) return false;
    const position = (state.nodePositions as any[])[index] || (state.targetPositions as any[])[index] || (state.originalPositions as any[])[index];
    const canvas = (state.renderer as any)?.domElement as HTMLCanvasElement | undefined;
    const camera = state.camera as THREE.PerspectiveCamera | null;
    if (!position || !camera || !canvas?.getBoundingClientRect) return true;

    const rect = canvas.getBoundingClientRect();
    const worldPosition = new THREE.Vector3(position.x, position.y, position.z);
    const pointsMesh = state.pointsMesh as { localToWorld?: (v: THREE.Vector3) => void } | null;
    if (pointsMesh?.localToWorld) pointsMesh.localToWorld(worldPosition);
    const projection = worldPosition.project(camera);
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

interface FocusThreadScreenCandidate extends ThreadCandidate {
    screenX: number;
    screenY: number;
    inViewport: boolean;
    canvasReachable: boolean;
    distanceFromFocus: number | null;
}

function getFocusThreadScreenCandidates(): FocusThreadScreenCandidate[] {
    const canvas = (state.renderer as any)?.domElement as HTMLCanvasElement | undefined;
    const camera = state.camera as THREE.PerspectiveCamera | null;
    if (!canvas || !camera) return [];
    const rect = canvas.getBoundingClientRect();
    const focusIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;
    return ((state.navState.threadCandidates || []) as any[])
        .filter((candidate: any) => candidate?.source === 'semantic' && candidate.index !== focusIndex)
        .filter((candidate: any) => isPointVisible(candidate.index, state.points, null, state.activeFilters))
        .slice(0, getSemanticThreadDisplayLimit())
        .map((candidate: any) => {
            const pos = (state.nodePositions as any[])[candidate.index] || (state.targetPositions as any[])[candidate.index] || (state.originalPositions as any[])[candidate.index];
            if (!pos) return null;
            const px = Number.isFinite(pos.x) ? pos.x : 0;
            const py = Number.isFinite(pos.y) ? pos.y : 0;
            const pz = Number.isFinite(pos.z) ? pos.z : 0;
            const vector = new THREE.Vector3(px, py, pz);
            const pointsMesh = state.pointsMesh as { localToWorld?: (v: THREE.Vector3) => void } | null;
            if (pointsMesh?.localToWorld) pointsMesh.localToWorld(vector);
            const projected = vector.clone().project(camera);
            const screenX = ((projected.x + 1) / 2) * rect.width + rect.left;
            const screenY = ((-projected.y + 1) / 2) * rect.height + rect.top;
            const inViewport = projected.z >= -1 && projected.z <= 1
                && screenX >= rect.left && screenX <= rect.right
                && screenY >= rect.top && screenY <= rect.bottom;
            const element = inViewport ? document.elementFromPoint(screenX, screenY) : null;
            const candidatePoint = (candidate && Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < state.points.length) ? state.points[candidate.index] : null;
            const focusPointForReason = (Number.isFinite(focusIndex) && focusIndex! >= 0 && focusIndex! < state.points.length) ? state.points[focusIndex!] : null;
            const focusPos = (state.nodePositions as any[])[focusIndex!];
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
                canvasReachable: !element || element === canvas || canvas.contains(element),
                distanceFromFocus: distFocus,
                score: 0,
                semanticScore: 0,
                sameCity: false,
                sameStatus: false,
                bridgeScore: 0,
                signalScore: 0,
                threadType: '',
                relationshipRole: '',
                relationshipAxis: '',
                roleReason: ''
            };
        })
        .filter((c): c is FocusThreadScreenCandidate => c !== null);
}

export function getNearestCanvasThreadCandidate(event: MouseEvent | PointerEvent, maxDistance: number = 34): FocusThreadScreenCandidate | null {
    const candidates = getFocusThreadScreenCandidates().filter((candidate) => candidate.inViewport && candidate.canvasReachable);
    let nearest: FocusThreadScreenCandidate | null = null;
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

export interface CanvasPointerPosition {
    x: number;
    y: number;
    rect: DOMRect;
}

export function getCanvasPointerPosition(event: MouseEvent | PointerEvent): CanvasPointerPosition | null {
    const canvas = (state.renderer as any)?.domElement as HTMLCanvasElement | undefined;
    if (!canvas || !event) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = Number(event.clientX);
    const clientY = Number(event.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    return { x: clientX, y: clientY, rect };
}

export function getCanvasFieldNodeClickRadius(event: MouseEvent | PointerEvent): number {
    const pointerType = (event as any)?.pointerType || '';
    if (pointerType === 'touch' || pointerType === 'pen') return 34;
    return hasCoarsePointer() ? 34 : 26;
}
