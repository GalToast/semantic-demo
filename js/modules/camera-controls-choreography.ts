// camera-controls-choreography.ts
// TypeScript shadow of camera-controls-choreography.js
// Camera choreography: animateCameraToNode, focusOnNode, search corridor, terrain prelude, etc.

import * as THREE from 'three';
import { state } from '../state.js';
import type { SemanticState, Point } from '../../types/state.js';
import {
    getCamera, getControls, getNodePositions, getOriginalPositions, getTargetPositions,
    getNavState, getCurrentView, getSemanticDiveMode, getPoints,
    getTrailDepth, getMyceliumMode,
    getActiveClusterFilter, getActiveFilters,
    getRouteCameraAnimationToken,
    getMapHandoffPreludeMs, getOrbitMinDistanceDefault, getOrbitMaxDistanceDefault
} from '../state/selectors/index.js';
import { isMobile, prefersReducedMotion } from './environment.js';
import {
    getCanvasUnobstructedRegion,
    computeFocusPocketScreenBounds,
    computeSafeAreaCameraTargetOffset
} from './camera-framing-utils.js';
import {
    computeTravelVectorHeading,
    computeOrbitBiasHeading,
    computeCameraArcControlPoints
} from './camera-math-utils.js';
import {
    easeInOutSine,
    easeInOutCubic,
    quadraticBezierComponent,
    easeOutBack,
    easeOutQuint
} from './utils/math-easing.js';
import { refreshMapRouteEmbodiment } from './map-state.js';
import {
    refreshCompositionState,
    dispatchNavTransition,
    setTrailDepth,
    setMyceliumMode,
    updateExplorationUi,
    syncSearchStatusForFocus
} from './lifecycle.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { applyPointFilterColors, syncFocusStage } from './journey.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { publish, EVENTS } from './event-bus.js';

import { setFocusTransitionMode, startFocusCameraAssist, clearRouteExploration } from './camera-controls-core.js';
import { noteSceneInteraction } from './camera-controls-restore.js';
import { setFocusPanelMode, FOCUS_PANEL_MODE } from './focus-panel-mode.js';

let _insideCentroidTarget: THREE.Vector3 | null = null;
let _insideCentroidLerpToken = 0;

interface CameraAnimationOptions {
    transitionStyle?: string;
    duration?: number;
    distance?: number;
    verticalLift?: number;
    framingDrop?: number;
    targetOffset?: THREE.Vector3;
    travelVector?: THREE.Vector3;
    [key: string]: unknown;
}

interface FocusOnNodeOptions {
    preserveMode?: boolean;
    fromTraversal?: boolean;
    fromCanvasNode?: boolean;
    fromSearchResult?: boolean;
    appendHistory?: boolean;
    restoreHistory?: boolean;
    skipUrlSync?: boolean;
    historyMode?: string;
    [key: string]: unknown;
}

/**
 * Animate camera to a specific node index.
 */
export function animateCameraToNode(index: number, options: CameraAnimationOptions = {}): void {
    if (!state.camera || !state.controls) return;
    const targetPosition = (state.nodePositions as any)[index] || (state.originalPositions as any)[index];
    if (!targetPosition) return;
    const framing = {
        ...((getNavState().focusFramingMeta as any) || {}),
        ...options
    };
    const transitionStyle = framing.transitionStyle || 'focus';
    const tx = targetPosition.x,
        ty = targetPosition.y,
        tz = targetPosition.z;
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return;
    const nodePos = new THREE.Vector3(tx, ty, tz);
    if (!(state.controls as any)?.target || !(state.camera as any)?.position) return;
    const startTarget = (state.controls as any).target.clone();
    const startPos = (state.camera as any).position.clone();
    const currentHeading = (state.camera as any).position.clone().sub((state.controls as any).target).normalize();

    let defaultDistance = 0.86;
    if (transitionStyle === 'search') defaultDistance = 1.08;
    if (transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk')
        defaultDistance = 1.0;
    const distance = framing.distance || defaultDistance;

    const verticalLift = framing.verticalLift || 0.045;
    const framingDrop = framing.framingDrop ?? 0.02;
    const framingOffset = framing.targetOffset?.clone ? framing.targetOffset.clone() : new THREE.Vector3();
    let focusTarget = nodePos
        .clone()
        .add(framingOffset)
        .add(new THREE.Vector3(0, -framingDrop, 0));
    if (!(state.focusCameraTargetOffset as any)?.copy) state.focusCameraTargetOffset = new THREE.Vector3();
    let heading = currentHeading.clone();
    let stageRightVector: THREE.Vector3 | null = null;
    let safeTargetOffset: THREE.Vector3 | null = null;
    const isSemanticPocketFocus = getNavState().threadSource === 'semantic' && (getNavState().focusPocketMeta as any)?.active;

    if (isSemanticPocketFocus && getNavState().focusPocketIndices?.length) {
        const pocketBounds = computeFocusPocketScreenBounds(
            getNavState().focusedIndex,
            getNavState().focusPocketIndices,
            state as any
        );
        if (pocketBounds) {
            const region = getCanvasUnobstructedRegion();
            const camDist = (state.camera as any).position.distanceTo((state.controls as any).target);
            const safeOffset = computeSafeAreaCameraTargetOffset(
                pocketBounds,
                region,
                camDist,
                state.camera,
                state.controls
            );
            if (safeOffset) {
                const pocketProfile = (getNavState().focusPocketMeta as any)?.viewportProfile || {};
                const offsetLimit = Number.isFinite(pocketProfile.targetOffsetLimit)
                    ? pocketProfile.targetOffsetLimit
                    : 0.12;
                if (safeOffset.length() > offsetLimit) safeOffset.setLength(offsetLimit);
                const nudgeTarget = focusTarget.clone().add(safeOffset);
                if (
                    Number.isFinite(nudgeTarget.x) &&
                    Number.isFinite(nudgeTarget.y) &&
                    Number.isFinite(nudgeTarget.z)
                ) {
                    safeTargetOffset = safeOffset;
                }
            }
        }
    }
    if (safeTargetOffset) {
        focusTarget = focusTarget.clone().add(safeTargetOffset);
    }

    if (
        (transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk') &&
        framing.travelVector
    ) {
        const res = computeTravelVectorHeading(focusTarget, currentHeading, transitionStyle, framing);
        focusTarget = res.focusTarget;
        heading = res.heading;
    }

    if (
        (transitionStyle === 'search' ||
            transitionStyle === 'focus' ||
            transitionStyle === 'walk' ||
            transitionStyle === 'dive' ||
            transitionStyle === 'dive-walk') &&
        isSemanticPocketFocus
    ) {
        const pocketProfile = (getNavState().focusPocketMeta as any)?.viewportProfile || {};
        const res = computeOrbitBiasHeading(currentHeading, transitionStyle, pocketProfile);
        heading = res.heading;
        stageRightVector = res.stageRightVector;
    }

    const desiredCamPos = focusTarget
        .clone()
        .add(heading.multiplyScalar(distance))
        .add(new THREE.Vector3(0, verticalLift, 0));

    const personality = (getNavState().currentPersonality as any) || {
        type: 'STANDARD',
        cameraDuration: 980,
        cameraArc: 'standard',
        easing: 'easeInOutCubic'
    };
    const baseDuration = framing.duration || (transitionStyle === 'dive' ? 1480 : personality.cameraDuration || 980);
    const prefersReducedCameraMotion = prefersReducedMotion();
    const duration = prefersReducedCameraMotion ? 1 : baseDuration;

    const animationToken = ++state.focusCameraAnimationToken;
    state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget);
    if (!(state.focusCameraTargetOffset as any) || typeof (state.focusCameraTargetOffset as any).copy !== 'function') {
        state.focusCameraTargetOffset = new THREE.Vector3();
    }
    if (state.focusCameraTargetOffset) {
        (state.focusCameraTargetOffset as any).copy(focusTarget.clone().sub(nodePos));
    }
    setFocusTransitionMode(transitionStyle, { duration });
    if (prefersReducedCameraMotion) {
        (state.controls as any).target.copy(focusTarget);
        (state.camera as any).position.copy(desiredCamPos);
        (state.controls as any).update();
        return;
    }

    startFocusCameraAssist(duration + 100, transitionStyle);
    const startTime = performance.now();
    if (
        !Number.isFinite(
            startTarget.x +
                startTarget.y +
                startTarget.z +
                startPos.x +
                startPos.y +
                startPos.z +
                focusTarget.x +
                focusTarget.y +
                focusTarget.z +
                desiredCamPos.x +
                desiredCamPos.y +
                desiredCamPos.z
        )
    )
        return;

    const stageArcActive =
        isSemanticPocketFocus &&
        (transitionStyle === 'search' ||
            transitionStyle === 'focus' ||
            transitionStyle === 'walk' ||
            transitionStyle === 'dive' ||
            transitionStyle === 'dive-walk');
    let cameraControlPoint: THREE.Vector3 | null = null;
    let targetControlPoint: THREE.Vector3 | null = null;

    if (stageArcActive) {
        const pocketProfile = (state.navState as any).focusPocketMeta?.viewportProfile || {};
        const res = computeCameraArcControlPoints(
            startPos,
            startTarget,
            desiredCamPos,
            focusTarget,
            currentHeading,
            distance,
            transitionStyle,
            personality,
            pocketProfile,
            stageRightVector
        );
        cameraControlPoint = res.cameraControlPoint;
        targetControlPoint = res.targetControlPoint;
    }

    function step(now: number): void {
        if (animationToken !== state.focusCameraAnimationToken) return;
        const t = Math.min((now - startTime) / duration, 1);

        const personalityEasing =
            personality.easing === 'easeOutBack'
                ? easeOutBack(t)
                : personality.easing === 'easeOutQuint'
                  ? easeOutQuint(t)
                  : easeInOutCubic(t);
        const eased = stageArcActive
            ? personality.type === 'TIGHT_CLUSTER'
                ? easeInOutCubic(t)
                : easeInOutSine(t)
            : transitionStyle === 'walk' || transitionStyle === 'dive-walk'
              ? easeInOutCubic(t)
              : transitionStyle === 'search'
                ? easeInOutCubic(t)
                : personalityEasing;

        if (cameraControlPoint && targetControlPoint) {
            (state.controls as any).target.set(
                quadraticBezierComponent(startTarget.x, targetControlPoint.x, focusTarget.x, eased),
                quadraticBezierComponent(startTarget.y, targetControlPoint.y, focusTarget.y, eased),
                quadraticBezierComponent(startTarget.z, targetControlPoint.z, focusTarget.z, eased)
            );
            (state.camera as any).position.set(
                quadraticBezierComponent(startPos.x, cameraControlPoint.x, desiredCamPos.x, eased),
                quadraticBezierComponent(startPos.y, cameraControlPoint.y, desiredCamPos.y, eased),
                quadraticBezierComponent(startPos.z, cameraControlPoint.z, desiredCamPos.z, eased)
            );
        } else {
            (state.controls as any).target.lerpVectors(startTarget, focusTarget, eased);
            (state.camera as any).position.lerpVectors(startPos, desiredCamPos, eased);
        }

        if (t > 0.85 && stageArcActive && !prefersReducedCameraMotion) {
            const driftIntensity = (t - 0.85) * 0.15;
            const worldUp = new THREE.Vector3(0, 1, 0);
            const driftDir = new THREE.Vector3().crossVectors(worldUp, currentHeading).normalize();
            (state.camera as any).position.add(driftDir.multiplyScalar(driftIntensity * 0.02));
        }

        (state.controls as any).update();
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            state.focusCameraOffset = null;
        }
    }
    requestAnimationFrame(step);
}

/**
 * Focus on a specific node by index.
 */
export function focusOnNode(index: number, options: FocusOnNodeOptions = {}): boolean {
    if (!Number.isFinite(index) || index < 0 || !getPoints() || index >= getPoints()!.length) return false;
    const point = getPoints()![index];
    if (!point) return false;

    state.selectedPoint = point;
    state.hoverHighlightIndex = -1;
    state.pinnedThreadIndex = null;

    dispatchNavTransition('FOCUS_NODE', {
        index,
        preserveMode: !!options.preserveMode,
        fromTraversal: !!options.fromTraversal,
        fromCanvasNode: !!options.fromCanvasNode,
        appendHistory: !!options.appendHistory,
        restoreHistory: !!options.restoreHistory
    });

    if (getTrailDepth() === 0) {
        setTrailDepth(1, { skipUrlSync: true });
    }

    if (getNavState().mode === 'trail' && getMyceliumMode() !== 'trail') {
        setMyceliumMode('trail', { skipUrlSync: true });
    }

    document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'));

    document.getElementById('onboarding-hint')?.classList.remove('visible');
    const hint = document.getElementById('onboarding-hint') as any;
    if (hint) {
        hint._dismissedThisSession = true;
        if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer);
    }
    document.body.dataset.focusOrigin = options.fromCanvasNode
        ? 'field-node'
        : options.fromSearchResult
          ? 'search-result'
          : options.fromTraversal
            ? 'trail-walk'
            : 'programmatic';
    if (options.fromCanvasNode) {
        setFocusPanelMode(FOCUS_PANEL_MODE.FIELD_NODE);
    }

    if (isMobile()) {
        const storySection = document.getElementById('story-section') as HTMLDetailsElement | null;
        const clusterSection = document.getElementById('cluster-section') as HTMLDetailsElement | null;
        if (storySection) storySection.open = false;
        if (clusterSection) clusterSection.open = false;
    }

    publish(EVENTS.CAMERA_MOVED, { reason: 'focus-node', index });
    publish(EVENTS.CAMERA_NODE_FOCUSED, { index, point, options });

    applyPointFilterColors();
    updateExplorationUi();

    syncFocusStage(point);
    refreshMapRouteEmbodiment();

    clearRouteExploration(options.fromTraversal ? 'trail-walk' : options.fromCanvasNode ? 'field-node-focus' : 'focus');

    syncSearchStatusForFocus(point, {
        fromTraversal: !!options.fromTraversal,
        fromSearchResult: !!options.fromSearchResult
    });

    animateCameraToNode(index, {
        transitionStyle: options.fromTraversal ? 'walk' : options.fromSearchResult ? 'search' : 'focus'
    });

    syncSemanticDiveUi();
    refreshCompositionState();
    if (!options.skipUrlSync) {
        publish(EVENTS.URL_SYNC_REQUESTED, {
            params: { record: (point as any).lead_id || null },
            mode: options.historyMode || 'push',
            reason: 'focus'
        });
    }
    updateJourneyCompass();
    return true;
}

/**
 * Animate camera to a search corridor defined by anchor and result indices.
 */
export function animateCameraToSearchCorridor(
    anchorIndex: number,
    resultIndices: number[] = [],
    options: { duration?: number; reason?: string } = {}
): boolean {
    if (!getCamera() || !getControls() || getCurrentView() !== 'galaxy') return false;
    if (!Number.isFinite(anchorIndex) || getNavState().focusedIndex !== null || getSemanticDiveMode()) return false;

    const isPointVisible = (index: number, points: any[], clusterFilter: number | null): boolean => {
        if (!Number.isFinite(index) || index < 0 || index >= points.length) return false;
        const point = points[index];
        if (!point) return false;
        if (clusterFilter !== null) {
            const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
            if (pointCluster !== clusterFilter) return false;
        }
        return true;
    };

    const routeIndices = [...new Set([anchorIndex, ...(resultIndices || [])])]
        .filter(
            (index) =>
                Number.isFinite(index) &&
                index >= 0 &&
                index < getPoints()!.length &&
                isPointVisible(index, getPoints()!, getActiveClusterFilter())
        )
        .slice(0, isMobile() ? 8 : 12);

    const vectors = routeIndices
        .map((index) => (getTargetPositions() as any)[index] || (getNodePositions() as any)[index] || (getOriginalPositions() as any)[index])
        .filter(Boolean)
        .map((pos: any) => new THREE.Vector3(pos.x, pos.y, pos.z));
    if (!vectors.length) return false;
    const box = new THREE.Box3().setFromPoints(vectors);
    const boundsCenter = new THREE.Vector3();
    const boundsSize = new THREE.Vector3();
    box.getCenter(boundsCenter);
    box.getSize(boundsSize);
    const radius = Math.max(0.08, boundsSize.length() * 0.5);

    const anchorPosition =
        (getTargetPositions() as any)[anchorIndex] || (getNodePositions() as any)[anchorIndex] || (getOriginalPositions() as any)[anchorIndex];
    if (
        !anchorPosition ||
        !Number.isFinite(anchorPosition.x) ||
        !Number.isFinite(anchorPosition.y) ||
        !Number.isFinite(anchorPosition.z)
    )
        return false;

    const anchorVector = new THREE.Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z);
    const startTarget = (state.controls as any).target.clone();
    const startPos = (state.camera as any).position.clone();
    const currentHeading = startPos.clone().sub(startTarget);
    if (currentHeading.lengthSq() < 0.0001) currentHeading.set(1.4, 1.1, 2);
    currentHeading.normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const rightVector = new THREE.Vector3().crossVectors(worldUp, currentHeading);
    if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0);
    rightVector.normalize();

    const compact = isMobile();
    const routeSpan = Math.max(radius, 0.14);
    const targetBias = compact ? 0.42 : 0.34;
    const endTarget = boundsCenter
        .clone()
        .lerp(anchorVector, targetBias)
        .add(worldUp.clone().multiplyScalar(compact ? 0.018 : 0.028));
    const distance = Math.min(
        compact ? 2.35 : 1.95,
        Math.max(compact ? 1.1 : 0.92, routeSpan * (compact ? 4.1 : 3.2) + 0.52)
    );
    const endPos = endTarget
        .clone()
        .add(currentHeading.clone().multiplyScalar(distance))
        .add(worldUp.clone().multiplyScalar(compact ? 0.16 : 0.2))
        .add(rightVector.clone().multiplyScalar(compact ? 0.035 : 0.065));
    const duration = options.duration || (compact ? 1180 : 1320);
    const startTime = performance.now();
    const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnimationToken || 0) + 1);

    publish(EVENTS.TRANSITION_PHASE_CHANGED, {
        phase: 'search-corridor',
        details: {
            reason: options.reason || 'search-success',
            anchorIndex,
            indexCount: routeIndices.length,
            lastCameraMove: 'search-corridor'
        }
    });
    noteSceneInteraction(duration + 1200);

    const controlTarget = startTarget.clone().lerp(endTarget, 0.56).add(worldUp.clone().multiplyScalar(0.025));

    function step(now: number): void {
        if (
            animationToken !== getRouteCameraAnimationToken() ||
            getNavState().focusedIndex !== null ||
            getCurrentView() !== 'galaxy'
        )
            return;
        if (!(state.controls as any)?.target || !(state.camera as any)?.position) return;
        const t = Math.min((now - startTime) / duration, 1);
        const eased = easeInOutCubic(t);
        (state.controls as any).target.set(
            quadraticBezierComponent(startTarget.x, controlTarget.x, endTarget.x, eased),
            quadraticBezierComponent(startTarget.y, controlTarget.y, endTarget.y, eased),
            quadraticBezierComponent(startTarget.z, controlTarget.z, endTarget.z, eased)
        );
        (state.camera as any).position.lerpVectors(startPos, endPos, eased);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return true;
}

/**
 * Animate camera to terrain prelude position.
 */
export function animateCameraToTerrainPrelude(options: { duration?: number } = {}): void {
    const reducedMotion = prefersReducedMotion();
    const duration = reducedMotion ? 1 : options.duration || getMapHandoffPreludeMs() || 1200;

    publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'map-prelude', options: { duration } });

    try {
        if (!state.camera || !state.controls) return;
        const startPos = (state.camera as any).position.clone();
        const startTarget = (state.controls as any).target.clone();

        const heading = startPos.clone().sub(startTarget).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        const desiredPos = startTarget.clone().add(heading.multiplyScalar(0.8)).add(worldUp.multiplyScalar(0.4));

        if (reducedMotion) {
            (state.camera as any).position.copy(desiredPos);
            (state.controls as any).update();
            return;
        }

        const animToken = ++state.focusCameraAnimationToken;
        const startTime = performance.now();

        setFocusTransitionMode('map-prelude', { duration });

        const priorControlsEnabled = (state.controls as any).enabled;
        (state.controls as any).enabled = false;

        function step(now: number): void {
            if (animToken !== state.focusCameraAnimationToken) {
                (state.controls as any).enabled = priorControlsEnabled;
                return;
            }
            const t = Math.min((now - startTime) / duration, 1);
            const eased = easeInOutCubic(t);

            (state.camera as any).position.lerpVectors(startPos, desiredPos, eased);

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                (state.controls as any).enabled = priorControlsEnabled;
            }
        }
        requestAnimationFrame(step);
    } catch (_err) {
        console.error('animateCameraToTerrainPrelude failed:', _err);
    } finally {
        publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' });
    }
}

/**
 * Apply semantic centroid camera lerp for inside-view.
 */
export function applySemanticCentroidCamera(now: number = performance.now()): void {
    if (!state.camera || !state.controls) return;
    if (getTrailDepth() !== 2) {
        _insideCentroidTarget = null;
        return;
    }
    const indices = getNavState().focusPocketIndices;
    if (!indices || !indices.length) return;

    const anchorIdx = getNavState().focusedIndex;
    const pocketIndices = anchorIdx !== null && anchorIdx !== undefined ? [anchorIdx, ...indices] : indices;

    let cx = 0, cy = 0, cz = 0, count = 0;
    for (const idx of pocketIndices) {
        const pos = (getNodePositions() as any)[idx] || (getOriginalPositions() as any)[idx];
        if (!pos) continue;
        cx += Number.isFinite(pos.x) ? pos.x : 0;
        cy += Number.isFinite(pos.y) ? pos.y : 0;
        cz += Number.isFinite(pos.z) ? pos.z : 0;
        count++;
    }
    if (!count) return;

    const pocketCentroid = new THREE.Vector3(cx / count, cy / count, cz / count);

    const anchorPos =
        anchorIdx !== null && anchorIdx !== undefined
            ? (getNodePositions() as any)[anchorIdx] || (getOriginalPositions() as any)[anchorIdx]
            : null;
    if (!anchorPos) return;

    const anchorVec = new THREE.Vector3(
        Number.isFinite(anchorPos.x) ? anchorPos.x : 0,
        Number.isFinite(anchorPos.y) ? anchorPos.y : 0,
        Number.isFinite(anchorPos.z) ? anchorPos.z : 0
    );

    const personality = (state.navState as any).currentPersonality || {};
    let centroidWeight: number;
    if (personality.type === 'TIGHT_CLUSTER') {
        centroidWeight = 0.12;
    } else if (personality.cameraArc === 'tight') {
        centroidWeight = 0.18;
    } else {
        centroidWeight = 0.28;
    }
    const lookAtTarget = anchorVec.clone().lerp(pocketCentroid, centroidWeight);

    const token = ++_insideCentroidLerpToken;
    const startTargetVec = (state.controls as any).target.clone();
    const startTime = now;
    const reducedMotion = prefersReducedMotion();
    const duration = reducedMotion ? 1 : 1600;

    function stepCentroid(now: number): void {
        if (token !== _insideCentroidLerpToken) return;
        const t = Math.min(1, (now - startTime) / duration);
        const eased = easeInOutCubic(t);
        (state.controls as any).target.lerpVectors(startTargetVec, lookAtTarget, eased);
        (state.controls as any).update();
        if (t < 1) requestAnimationFrame(stepCentroid);
    }
    if (prefersReducedMotion) {
        (state.controls as any).target.copy(lookAtTarget);
        (state.controls as any).update();
    } else {
        requestAnimationFrame(stepCentroid);
    }
}

/**
 * Zoom camera by a multiplier.
 */
export function zoomCamera(multiplier: number): void {
    if (!getCamera() || !getControls()) return;
    const target = (getControls() as any).target;
    if (!target) return;
    const camPos = (getCamera() as any).position;
    if (!Number.isFinite(camPos.x + camPos.y + camPos.z + target.x + target.y + target.z)) return;
    const direction = camPos.clone().sub(target).normalize();
    const currentDistance = camPos.distanceTo(target);
    const newDistance = currentDistance * multiplier;
    const minDist = (state.controls as any).minDistance || getOrbitMinDistanceDefault() || 0.5;
    const maxDist = (state.controls as any).maxDistance || getOrbitMaxDistanceDefault() || 8.0;
    const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));
    (state.camera as any).position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)));
}

/**
 * Clear inside centroid target state.
 */
export function clearInsideCentroid(): void {
    _insideCentroidTarget = null;
    _insideCentroidLerpToken++;
}
