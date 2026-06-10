/**
 * journey-canvas-node-picking.ts
 * Canonical TS module — preserves export/import parity with the prior
 * journey-canvas-node-picking.js twin.
 */
import * as THREE from 'three';
import { state } from '../state.ts';
import { isPointVisible } from './utils/geo-data.ts';
import { getCanvasPointerPosition, getCanvasFieldNodeClickRadius } from './journey-canvas-hit-test.ts';
import type { CanvasPointerPosition } from './journey-canvas-hit-test.ts';

const canvasFieldRaycaster = new THREE.Raycaster();

interface NodePickCandidate {
    index: number;
    distance: number;
    screenX: number;
    screenY: number;
    point: any;
    source: string;
    rayDistance?: number;
    distanceToRay?: number | null;
}

function compareCanvasNodePickCandidates(a: NodePickCandidate, b: NodePickCandidate): number {
    const distA = Number.isFinite(a.distance) ? a.distance : Infinity;
    const distB = Number.isFinite(b.distance) ? b.distance : Infinity;
    if (Math.abs(distA - distB) > 1.0) return distA - distB;

    const rayA = Number.isFinite(a.rayDistance) ? a.rayDistance! : Infinity;
    const rayB = Number.isFinite(b.rayDistance) ? b.rayDistance! : Infinity;
    if (Math.abs(rayA - rayB) > 0.1) return rayA - rayB;

    const rayToRayA = Number.isFinite(a.distanceToRay) ? a.distanceToRay! : Infinity;
    const rayToRayB = Number.isFinite(b.distanceToRay) ? b.distanceToRay! : Infinity;
    return rayToRayA - rayToRayB;
}

function getCanvasNodePickingMode(): string {
    const urlMode = new URLSearchParams(window.location.search).get('picking');
    const datasetMode = document.body?.dataset?.canvasPickingMode;
    return urlMode === 'nearest' || datasetMode === 'nearest' ? 'nearest' : 'raycast';
}

function getCanvasPointWorldThreshold(pixelRadius: number, rect: DOMRect): number {
    const camera = state.camera as THREE.PerspectiveCamera | null;
    if (!camera || !rect?.height) return 0.035;
    const pointsMesh = state.pointsMesh as { position?: THREE.Vector3 } | null;
    const cloudCenter = pointsMesh?.position || new THREE.Vector3(0, 0, 0);
    const distance = Math.max(0.25, camera.position.distanceTo(cloudCenter));
    const fov = Number.isFinite(camera.fov) ? THREE.MathUtils.degToRad(camera.fov) : THREE.MathUtils.degToRad(45);
    const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / rect.height;
    return THREE.MathUtils.clamp(worldPerPixel * pixelRadius * 0.42, 0.012, 0.09);
}

function getCanvasNodeScreenCandidate(index: number, pointer: CanvasPointerPosition): NodePickCandidate | null {
    const position = (state.nodePositions as any[])[index];
    const camera = state.camera as THREE.PerspectiveCamera | null;
    const pointsMesh = state.pointsMesh as { localToWorld?: (v: THREE.Vector3) => void } | null;
    if (!position || !camera || !pointsMesh) return null;
    const vector = new THREE.Vector3(position.x, position.y, position.z);
    if (pointsMesh.localToWorld) pointsMesh.localToWorld(vector);
    const projected = vector.clone().project(camera);
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

function findRaycastCanvasFieldNode(event: MouseEvent | PointerEvent, pointer: CanvasPointerPosition, maxDistance: number): NodePickCandidate | null {
    const camera = state.camera as THREE.PerspectiveCamera | null;
    const pointsMesh = state.pointsMesh as THREE.Points | null;
    if (!camera || !pointsMesh || !state.points?.length) return null;
    const ndc = new THREE.Vector2(
        ((pointer.x - pointer.rect.left) / pointer.rect.width) * 2 - 1,
        -(((pointer.y - pointer.rect.top) / pointer.rect.height) * 2 - 1)
    );
    canvasFieldRaycaster.setFromCamera(ndc, camera);
    const sporePickMesh = (state.nodeSporeHitMesh || state.nodeSporeMesh) as THREE.InstancedMesh | null;
    if (sporePickMesh) {
        const sporeHits = canvasFieldRaycaster.intersectObject(sporePickMesh, false)
            .filter((hit) => Number.isFinite(hit.instanceId) && isPointVisible(hit.instanceId!, state.points, null, state.activeFilters))
            .map((hit) => {
                const candidate = getCanvasNodeScreenCandidate(hit.instanceId!, pointer);
                if (!candidate) return null;
                return {
                    ...candidate,
                    source: 'instanced-raycast',
                    rayDistance: hit.distance,
                    distanceToRay: null
                };
            })
            .filter((candidate): candidate is NodePickCandidate => candidate !== null && candidate.distance <= maxDistance + 12);
        if (sporeHits.length) {
            sporeHits.sort(compareCanvasNodePickCandidates);
            return sporeHits[0]!;
        }
    }
    (canvasFieldRaycaster.params as any).Points ??= {};
    (canvasFieldRaycaster.params as any).Points.threshold = getCanvasPointWorldThreshold(maxDistance, pointer.rect);
    const intersections = canvasFieldRaycaster.intersectObject(pointsMesh, false)
        .filter((hit) => Number.isFinite(hit.index) && isPointVisible(hit.index!, state.points, null, state.activeFilters))
        .map((hit) => {
            const candidate = getCanvasNodeScreenCandidate(hit.index!, pointer);
            if (!candidate) return null;
            return {
                ...candidate,
                source: 'raycast',
                rayDistance: hit.distance,
                distanceToRay: Number.isFinite((hit as any).distanceToRay) ? (hit as any).distanceToRay : null
            };
        })
        .filter((candidate): candidate is NodePickCandidate => candidate !== null && candidate.distance <= maxDistance + 8);
    if (!intersections.length) return null;
    intersections.sort(compareCanvasNodePickCandidates);
    return intersections[0]!;
}

export function findNearestCanvasFieldNode(event: MouseEvent | PointerEvent, maxDistance: number = getCanvasFieldNodeClickRadius(event)): NodePickCandidate | null {
    const pointer = getCanvasPointerPosition(event);
    const camera = state.camera as THREE.PerspectiveCamera | null;
    const pointsMesh = state.pointsMesh as any;
    if (!pointer || !camera || !pointsMesh || !(state.nodePositions as any[])?.length) return null;
    if (getCanvasNodePickingMode() === 'raycast') {
        const raycastCandidate = findRaycastCanvasFieldNode(event, pointer, maxDistance);
        if (raycastCandidate) {
            state.lastCanvasNodePick = raycastCandidate as any;
            return raycastCandidate;
        }
    }
    let nearest: NodePickCandidate | null = null;
    let nearestDistance = Infinity;

    (state.nodePositions as any[]).forEach((position: any, index: number) => {
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
    state.lastCanvasNodePick = resolved as any;
    return resolved;
}
