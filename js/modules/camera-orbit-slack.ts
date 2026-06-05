// camera-orbit-slack.ts
// TypeScript shadow of camera-orbit-slack.js
// Focus orbit slack: pivot adjustment and distance/speed configuration.

import * as THREE from 'three';
import { state } from '../state.js';
import {
    getNavState, getNodePositions, getOriginalPositions, getFocusedNode,
    getCurrentView, getSemanticDiveMode, getCurrentSearchSummary,
    getCamera, getControls, getOrbitMaxDistanceDefault, getOrbitMaxDistanceFree,
    getOrbitRotateSpeedFree, getOrbitPanSpeedFree, getOrbitRotateSpeedDefault, getOrbitPanSpeedDefault
} from '../state/selectors/index.js';
import { isMobile, prefersReducedMotion } from './environment.js';

function getRouteEmbodimentIndices(): number[] {
    const routeIndices = (getNavState().trailNeighborIndices || []).slice(0, 6);
    const seedIndex = getNavState().trailSeedIndex;
    if (seedIndex !== null && seedIndex !== undefined) routeIndices.unshift(seedIndex);
    return routeIndices;
}

function getRoutePositionBounds(routeIndices: number[] = []): { center: THREE.Vector3; size: THREE.Vector3; radius: number } | null {
    const vectors = routeIndices
        .map((index) => {
            const pos = getNodePositions()[index] || getOriginalPositions()[index];
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
    if (!getCamera() || !getControls() || getFocusedNode() === null || getFocusedNode() === undefined) return null;
    const focusPosition =
        getNodePositions()[getFocusedNode()!] ||
        getOriginalPositions()[getFocusedNode()!];
    if (!focusPosition) return null;

    const focusVector = new THREE.Vector3(focusPosition.x, focusPosition.y, focusPosition.z);
    const routeBounds = getRoutePositionBounds(getRouteEmbodimentIndices());
    const routeCenter = routeBounds?.center?.clone ? routeBounds.center.clone() : focusVector.clone();
    const compact = isMobile();
    const pivot = focusVector.clone().lerp(routeCenter, compact ? 0.48 : 0.38);
    const cameraOffset = getCamera()!.position.clone().sub(getControls()!.target);
    const cameraDistance = cameraOffset.length();
    if (cameraDistance > 0.001) {
        pivot.add(cameraOffset.normalize().multiplyScalar(Math.min(compact ? 0.18 : 0.22, cameraDistance * 0.18)));
    }
    pivot.y += compact ? 0.018 : 0.026;
    return pivot;
}

export function applyFocusOrbitSlack(reason: string = 'user-control'): boolean {
    if (!isSearchRouteFocusActive() || getSemanticDiveMode() || !getCamera() || !getControls()) return false;
    if (prefersReducedMotion()) {
        return false;
    }
    const nextTarget = getFocusOrbitSlackPivot();
    if (!nextTarget) return false;

    const currentTarget = getControls()!.target.clone();
    const targetDelta = nextTarget.sub(currentTarget);
    const maxShift = isMobile() ? 0.24 : 0.2;
    if (targetDelta.length() > maxShift) targetDelta.setLength(maxShift);
    if (targetDelta.lengthSq() < 0.000064) return false;

    const distanceBefore = getCamera()!.position.distanceTo(getControls()!.target);
    state.controls!.target.add(targetDelta);
    const cameraDelta = targetDelta.clone().multiplyScalar(0.72);
    state.camera!.position.add(cameraDelta);
    (state.controls as any).maxDistance = Math.max(
        (state.controls as any).maxDistance || getOrbitMaxDistanceDefault(),
        getOrbitMaxDistanceFree()
    );
    (state.controls as any).rotateSpeed = getOrbitRotateSpeedFree();
    (state.controls as any).panSpeed = getOrbitPanSpeedFree();
    (state.controls as any).update();

    state.focusOrbitSlackState = {
        phase: 'free-pivot',
        reason,
        startedAt: performance.now(),
        targetShift: Number(targetDelta.length().toFixed(4)),
        cameraShift: Number(cameraDelta.length().toFixed(4)),
        distanceBefore: Number(distanceBefore.toFixed(4)),
        distanceAfter: Number(state.camera!.position.distanceTo((state.controls as any).target).toFixed(4)),
        maxDistance: Number(((state.controls as any).maxDistance || getOrbitMaxDistanceFree()).toFixed(2)),
        rotateSpeed: Number(((state.controls as any).rotateSpeed || getOrbitRotateSpeedFree()).toFixed(2)),
        panSpeed: Number(((state.controls as any).panSpeed || getOrbitPanSpeedFree()).toFixed(2))
    };
    document.body.dataset.cameraSlack = 'free-pivot';
    document.body.dataset.cameraSlackReason = reason;
    return true;
}

export function clearFocusOrbitSlack(reason: string = 'clear'): void {
    const safeTarget = (state.controls as any)?.target ?? (state.camera as any)?.position ?? null;
    if (safeTarget === null || !getCamera()) {
        state.focusOrbitSlackState = {
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
    const dist = getCamera()!.position.distanceTo(safeTarget);
    state.focusOrbitSlackState = {
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
    if (getControls() && !getSemanticDiveMode()) {
        (state.controls as any).maxDistance = getOrbitMaxDistanceDefault();
        (state.controls as any).rotateSpeed = getOrbitRotateSpeedDefault();
        (state.controls as any).panSpeed = getOrbitPanSpeedDefault();
    }
}
