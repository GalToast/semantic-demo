import * as THREE from 'three';
import { state } from '../state.js';
import { isPointVisible } from './utils/geo-data.js';
import { getCanvasPointerPosition, getCanvasFieldNodeClickRadius } from './journey-canvas-hit-test.js';

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

export function findNearestCanvasFieldNode(event, maxDistance = getCanvasFieldNodeClickRadius(event)) {
    const pointer = getCanvasPointerPosition(event);
    if (!pointer || !state.camera || !state.pointsMesh || !state.nodePositions?.length) return null;
    if (getCanvasNodePickingMode() === 'raycast') {
        const raycastCandidate = findRaycastCanvasFieldNode(event, pointer, maxDistance);
        if (raycastCandidate) {
            state.lastCanvasNodePick = raycastCandidate;
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
    state.lastCanvasNodePick = resolved;
    return resolved;
}
