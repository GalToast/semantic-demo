// camera-orbit-slack.ts
// TypeScript shadow of camera-orbit-slack.js
// Focus orbit slack: pivot adjustment and distance/speed configuration.

import * as THREE from 'three';
import { state } from '../state.js';
import type { CameraLike, ControlsLike, NodePosition, SemanticState } from '../../types/state';
import {
    getNavState, getNodePositions, getOriginalPositions, getFocusedNode,
    getCurrentView, getSemanticDiveMode, getCurrentSearchSummary,
    getCamera, getControls, getOrbitMaxDistanceDefault, getOrbitMaxDistanceFree,
    getOrbitRotateSpeedFree, getOrbitPanSpeedFree, getOrbitRotateSpeedDefault, getOrbitPanSpeedDefault
} from '../state/selectors/index.js';
import { isMobile, prefersReducedMotion } from './environment.js';

interface OrbitSlackCamera extends CameraLike {
    position: THREE.Vector3;
}

interface OrbitSlackControls extends ControlsLike {
    target: THREE.Vector3;
    update(): void;
}

const _s = state as unknown as SemanticState;

function getTypedCamera(): OrbitSlackCamera | null {
    return getCamera() as unknown as OrbitSlackCamera | null;
}

function getTypedControls(): OrbitSlackControls | null {
    return getControls() as unknown as OrbitSlackControls | null;
}

function getTypedNodePositions(): NodePosition[] {
    return getNodePositions() as unknown as NodePosition[];
}

function getTypedOriginalPositions(): NodePosition[] {
    return getOriginalPositions() as unknown as NodePosition[];
}

function getRouteEmbodimentIndices(): number[] {
    const routeIndices = (getNavState().trailNeighborIndices || []).slice(0, 6);
    const seedIndex = getNavState().trailSeedIndex;
    if (seedIndex !== null && seedIndex !== undefined) routeIndices.unshift(seedIndex);
    return routeIndices;
}

function getRoutePositionBounds(routeIndices: number[] = []): { center: THREE.Vector3; size: THREE.Vector3; radius: number } | null {
    const nodePositions = getTypedNodePositions();
    const originalPositions = getTypedOriginalPositions();
    const vectors = routeIndices
        .map((index) => {
            const pos = nodePositions[index] || originalPositions[index];
            if (!pos) return null;
            const px = pos.x, py = pos.y, pz = pos.z;
            if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return null;
            return new THREE.Vector3(px, py, pz);
        })
        .filter((v): v is THREE.Vector3 => v !== null);
    if (!vectors.length) return null;
    const box = new THREE.Box3().setFromPoints(vectors);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    return { center, size, radius: Math.max(0.08, size.length() * 0.5) };
}

export function isSearchRouteFocusActive(): boolean {
    const hasFocus = getFocusedNode() !== null && getFocusedNode() !== undefined;
    const walkDepth = Math.max(0, (getNavState().walkHistoryIndices || []).length - 1);
    return (
        getCurrentView() === 'galaxy' &&
        !getSemanticDiveMode() &&
        hasFocus &&
        !!getCurrentSearchSummary() &&
        walkDepth === 0
    );
}

export function getFocusOrbitSlackPivot(): THREE.Vector3 | null {
    const camera = getTypedCamera();
    const controls = getTypedControls();
    const focusedNode = getFocusedNode();
    if (!camera || !controls || focusedNode === null || focusedNode === undefined) return null;
    const focusPosition =
        getTypedNodePositions()[focusedNode] ||
        getTypedOriginalPositions()[focusedNode];
    if (!focusPosition) return null;

    const focusVector = new THREE.Vector3(focusPosition.x, focusPosition.y, focusPosition.z);
    const routeBounds = getRoutePositionBounds(getRouteEmbodimentIndices());
    const routeCenter = routeBounds?.center?.clone ? routeBounds.center.clone() : focusVector.clone();
    const compact = isMobile();
    const pivot = focusVector.clone().lerp(routeCenter, compact ? 0.48 : 0.38);
    const cameraOffset = camera.position.clone().sub(controls.target);
    const cameraDistance = cameraOffset.length();
    if (cameraDistance > 0.001) {
        pivot.add(cameraOffset.normalize().multiplyScalar(Math.min(compact ? 0.18 : 0.22, cameraDistance * 0.18)));
    }
    pivot.y += compact ? 0.018 : 0.026;
    return pivot;
}

export function applyFocusOrbitSlack(reason: string = 'user-control'): boolean {
    const camera = getTypedCamera();
    const controls = getTypedControls();
    if (!isSearchRouteFocusActive() || getSemanticDiveMode() || !camera || !controls) return false;
    if (prefersReducedMotion()) {
        return false;
    }
    const nextTarget = getFocusOrbitSlackPivot();
    if (!nextTarget) return false;

    const currentTarget = controls.target.clone();
    const targetDelta = nextTarget.sub(currentTarget);
    const maxShift = isMobile() ? 0.24 : 0.2;
    if (targetDelta.length() > maxShift) targetDelta.setLength(maxShift);
    if (targetDelta.lengthSq() < 0.000064) return false;

    const distanceBefore = camera.position.distanceTo(controls.target);
    controls.target.add(targetDelta);
    const cameraDelta = targetDelta.clone().multiplyScalar(0.72);
    camera.position.add(cameraDelta);
    controls.maxDistance = Math.max(
        controls.maxDistance || getOrbitMaxDistanceDefault(),
        getOrbitMaxDistanceFree()
    );
    controls.rotateSpeed = getOrbitRotateSpeedFree();
    controls.panSpeed = getOrbitPanSpeedFree();
    controls.update();

    _s.focusOrbitSlackState = {
        phase: 'free-pivot',
        reason,
        startedAt: performance.now(),
        targetShift: Number(targetDelta.length().toFixed(4)),
        cameraShift: Number(cameraDelta.length().toFixed(4)),
        distanceBefore: Number(distanceBefore.toFixed(4)),
        distanceAfter: Number(camera.position.distanceTo(controls.target).toFixed(4)),
        maxDistance: Number((controls.maxDistance || getOrbitMaxDistanceFree()).toFixed(2)),
        rotateSpeed: Number((controls.rotateSpeed || getOrbitRotateSpeedFree()).toFixed(2)),
        panSpeed: Number((controls.panSpeed || getOrbitPanSpeedFree()).toFixed(2))
    };
    document.body.dataset.cameraSlack = 'free-pivot';
    document.body.dataset.cameraSlackReason = reason;
    return true;
}

export function clearFocusOrbitSlack(reason: string = 'clear'): void {
    const camera = getTypedCamera();
    const controls = getTypedControls();
    const safeTarget = controls?.target ?? camera?.position ?? null;
    if (safeTarget === null || !camera) {
        _s.focusOrbitSlackState = {
            phase: 'idle',
            reason,
            startedAt: performance.now(),
            targetShift: 0,
            cameraShift: 0,
            distanceBefore: 0,
            distanceAfter: 0,
            maxDistance: getOrbitMaxDistanceDefault(),
            rotateSpeed: getOrbitRotateSpeedDefault(),
            panSpeed: getOrbitPanSpeedDefault()
        };
        if (document.body) {
            document.body.dataset.cameraSlack = 'idle';
            document.body.dataset.cameraSlackReason = reason;
        }
        return;
    }
    const dist = camera.position.distanceTo(safeTarget);
    _s.focusOrbitSlackState = {
        phase: 'idle',
        reason,
        startedAt: performance.now(),
        targetShift: 0,
        cameraShift: 0,
        distanceBefore: Number(dist.toFixed(4)),
        distanceAfter: Number(dist.toFixed(4)),
        maxDistance: getOrbitMaxDistanceDefault(),
        rotateSpeed: getOrbitRotateSpeedDefault(),
        panSpeed: getOrbitPanSpeedDefault()
    };
    document.body.dataset.cameraSlack = 'idle';
    document.body.dataset.cameraSlackReason = reason;
    if (controls && !getSemanticDiveMode()) {
        controls.maxDistance = getOrbitMaxDistanceDefault();
        controls.rotateSpeed = getOrbitRotateSpeedDefault();
        controls.panSpeed = getOrbitPanSpeedDefault();
    }
}
