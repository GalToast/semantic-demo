import * as THREE from 'three';
import { state } from '../state.js';
import { isMobile, prefersReducedMotion } from './environment.js';


function getRouteEmbodimentIndices() {
    const routeIndices = (state.navState.trailNeighborIndices || []).slice(0, 6);
    const seedIndex = state.navState.trailSeedIndex;
    if (seedIndex !== null && seedIndex !== undefined) routeIndices.unshift(seedIndex);
    return routeIndices;
}

function getRoutePositionBounds(routeIndices = []) {
    const vectors = routeIndices
        .map((index) => {
            // Guardrail: nodePositions is source of truth; targetPositions is compression layer only.
            const pos = state.nodePositions[index] || state.originalPositions[index];
            if (!pos) return null;
            const px = pos.x, py = pos.y, pz = pos.z;
            if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return null;
            return new THREE.Vector3(px, py, pz);
        })
        .filter(Boolean);
    if (!vectors.length) return null;
    const box = new THREE.Box3().setFromPoints(vectors);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    return { center, size, radius: Math.max(0.08, size.length() * 0.5) };
}

export function isSearchRouteFocusActive() {
    const hasFocus = state.focusedNode !== null && state.focusedNode !== undefined;
    const walkDepth = Math.max(0, (state.navState.walkHistoryIndices || []).length - 1);
    return (
        state.currentView === 'galaxy' &&
        !state.semanticDiveMode &&
        hasFocus &&
        !!state.currentSearchSummary &&
        walkDepth === 0
    );
}

export function getFocusOrbitSlackPivot() {
    if (!state.camera || !state.controls || state.focusedNode === null || state.focusedNode === undefined) return null;
    const focusPosition =
        // Guardrail: nodePositions is source of truth for camera pivot; targetPositions is compression layer.
        state.nodePositions[state.focusedNode] ||
        state.originalPositions[state.focusedNode];
    if (!focusPosition) return null;

    const focusVector = new THREE.Vector3(focusPosition.x, focusPosition.y, focusPosition.z);
    const routeBounds = getRoutePositionBounds(getRouteEmbodimentIndices());
    const routeCenter = routeBounds?.center?.clone ? routeBounds.center.clone() : focusVector.clone();
    const compact = isMobile();
    const pivot = focusVector.clone().lerp(routeCenter, compact ? 0.48 : 0.38);
    const cameraOffset = state.camera.position.clone().sub(state.controls.target);
    const cameraDistance = cameraOffset.length();
    if (cameraDistance > 0.001) {
        pivot.add(cameraOffset.normalize().multiplyScalar(Math.min(compact ? 0.18 : 0.22, cameraDistance * 0.18)));
    }
    pivot.y += compact ? 0.018 : 0.026;
    return pivot;
}

export function applyFocusOrbitSlack(reason = 'user-control') {
    if (!isSearchRouteFocusActive() || state.semanticDiveMode || !state.camera || !state.controls) return false;
    if (prefersReducedMotion()) {
        return false;
    }
    const nextTarget = getFocusOrbitSlackPivot();
    if (!nextTarget) return false;

    const currentTarget = state.controls.target.clone();
    const targetDelta = nextTarget.sub(currentTarget);
    const maxShift = isMobile() ? 0.24 : 0.2;
    if (targetDelta.length() > maxShift) targetDelta.setLength(maxShift);
    if (targetDelta.lengthSq() < 0.000064) return false;

    const distanceBefore = state.camera.position.distanceTo(state.controls.target);
    state.controls.target.add(targetDelta);
    const cameraDelta = targetDelta.clone().multiplyScalar(0.72);
    state.camera.position.add(cameraDelta);
    state.controls.maxDistance = Math.max(
        state.controls.maxDistance || state.ORBIT_MAX_DISTANCE_DEFAULT,
        state.ORBIT_MAX_DISTANCE_FREE
    );
    state.controls.rotateSpeed = state.ORBIT_ROTATE_SPEED_FREE;
    state.controls.panSpeed = state.ORBIT_PAN_SPEED_FREE;
    state.controls.update();

    state.focusOrbitSlackState = {
        phase: 'free-pivot',
        reason,
        startedAt: performance.now(),
        targetShift: Number(targetDelta.length().toFixed(4)),
        cameraShift: Number(cameraDelta.length().toFixed(4)),
        distanceBefore: Number(distanceBefore.toFixed(4)),
        distanceAfter: Number(state.camera.position.distanceTo(state.controls.target).toFixed(4)),
        maxDistance: Number((state.controls.maxDistance || state.ORBIT_MAX_DISTANCE_FREE).toFixed(2)),
        rotateSpeed: Number((state.controls.rotateSpeed || state.ORBIT_ROTATE_SPEED_FREE).toFixed(2)),
        panSpeed: Number((state.controls.panSpeed || state.ORBIT_PAN_SPEED_FREE).toFixed(2))
    };
    document.body.dataset.cameraSlack = 'free-pivot';
    document.body.dataset.cameraSlackReason = reason;
    return true;
}

export function clearFocusOrbitSlack(reason = 'clear') {
    const safeTarget = state.controls?.target ?? state.camera?.position ?? null;
    if (safeTarget === null || !state.camera) {
        state.focusOrbitSlackState = {
            phase: 'idle',
            reason,
            startedAt: performance.now(),
            targetShift: 0,
            cameraShift: 0,
            distanceBefore: 0,
            distanceAfter: 0,
            maxDistance: state.ORBIT_MAX_DISTANCE_DEFAULT,
            rotateSpeed: state.ORBIT_ROTATE_SPEED_DEFAULT,
            panSpeed: state.ORBIT_PAN_SPEED_DEFAULT
        };
        if (document.body) {
            document.body.dataset.cameraSlack = 'idle';
            document.body.dataset.cameraSlackReason = reason;
        }
        return;
    }
    const dist = state.camera.position.distanceTo(safeTarget);
    state.focusOrbitSlackState = {
        phase: 'idle',
        reason,
        startedAt: performance.now(),
        targetShift: 0,
        cameraShift: 0,
        distanceBefore: Number(dist.toFixed(4)),
        distanceAfter: Number(dist.toFixed(4)),
        maxDistance: state.ORBIT_MAX_DISTANCE_DEFAULT,
        rotateSpeed: state.ORBIT_ROTATE_SPEED_DEFAULT,
        panSpeed: state.ORBIT_PAN_SPEED_DEFAULT
    };
    document.body.dataset.cameraSlack = 'idle';
    document.body.dataset.cameraSlackReason = reason;
    if (state.controls && !state.semanticDiveMode) {
        state.controls.maxDistance = state.ORBIT_MAX_DISTANCE_DEFAULT;
        state.controls.rotateSpeed = state.ORBIT_ROTATE_SPEED_DEFAULT;
        state.controls.panSpeed = state.ORBIT_PAN_SPEED_DEFAULT;
    }
}
