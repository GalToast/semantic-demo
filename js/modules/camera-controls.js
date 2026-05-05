// js/modules/camera-controls.js — extracted from monolithic HTML
import { state } from '../state.js';
import {
    easeInOutSine,
    easeInOutCubic,
    quadraticBezierComponent,
    easeOutBack,
    easeOutQuint
} from '../utils.js';

// Constants
const AUTO_ROTATE_IDLE_MS = 3600;
const AUTO_ROTATE_SOFT_RESUME_MS = 1800;
const AUTO_ROTATE_BASE_SPEED = state.AUTO_ROTATE_BASE_SPEED;
const ORBIT_MAX_DISTANCE_DEFAULT = state.ORBIT_MAX_DISTANCE_DEFAULT;
const ORBIT_MAX_DISTANCE_FREE = state.ORBIT_MAX_DISTANCE_FREE;
const ORBIT_ROTATE_SPEED_DEFAULT = state.ORBIT_ROTATE_SPEED_DEFAULT;
const ORBIT_ROTATE_SPEED_FREE = state.ORBIT_ROTATE_SPEED_FREE;
const ORBIT_PAN_SPEED_DEFAULT = state.ORBIT_PAN_SPEED_DEFAULT;
const ORBIT_PAN_SPEED_FREE = state.ORBIT_PAN_SPEED_FREE;

export function syncRuntimeState(snapshot = {}) {
    [
        'camera',
        'controls',
        'currentView',
        'focusedNode',
        'selectedPoint',
        'navState',
        'sceneRevealActive',
        'searchGlowActive',
        'semanticDiveMode',
        'autoRotate',
        'autoRotateSuspended',
        'autoRotateSoftResumeStartedAt',
        'autoRotateResumeTimer',
        'autoRotateResumeDueAt',
        'focusCameraAssistActive',
        'focusCameraAssistUntil',
        'focusCameraAssistReason',
        'focusCameraOffset',
        'focusCameraTargetOffset',
        'targetPositions',
        'nodePositions',
        'originalPositions',
        'currentSearchSummary',
        'focusOrbitSlackState'
    ].forEach((key) => {
        if (key in snapshot) state[key] = snapshot[key];
    });
}

export function getRuntimeStateSnapshot() {
    return {
        autoRotate: state.autoRotate,
        autoRotateSuspended: state.autoRotateSuspended,
        autoRotateSoftResumeStartedAt: state.autoRotateSoftResumeStartedAt,
        autoRotateResumeTimer: state.autoRotateResumeTimer,
        autoRotateResumeDueAt: state.autoRotateResumeDueAt,
        focusCameraAssistActive: state.focusCameraAssistActive,
        focusCameraAssistUntil: state.focusCameraAssistUntil,
        focusCameraAssistReason: state.focusCameraAssistReason,
        focusCameraOffset: state.focusCameraOffset,
        focusCameraTargetOffset: state.focusCameraTargetOffset,
        focusOrbitSlackState: state.focusOrbitSlackState
    };
}

export function setFocusTransitionMode(mode, options = {}) {
    const normalizedMode = String(mode || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    state.focusTransitionMode = normalizedMode;
    state.focusTransitionStartedAt = performance.now();
    if (state.focusTransitionSettleTimer) {
        window.clearTimeout(state.focusTransitionSettleTimer);
        state.focusTransitionSettleTimer = null;
    }
    document.body.dataset.focusTransition = normalizedMode;
    document.body.dataset.focusTransitionPhase = normalizedMode === 'idle' ? 'idle' : 'arriving';
    const duration = Math.max(0, Number.isFinite(options.duration) ? options.duration : 720);
    if (normalizedMode === 'idle') return;
    state.focusTransitionSettleTimer = window.setTimeout(() => {
        if (state.focusTransitionMode !== normalizedMode) return;
        document.body.dataset.focusTransitionPhase = 'settled';
    }, duration + 180);
}

export function getFocusTransitionProgress(duration = 640) {
    if (!state.focusTransitionStartedAt) return 1;
    return Math.min(1, Math.max(0, (performance.now() - state.focusTransitionStartedAt) / duration));
}

export function animateCameraToNode(index, options = {}) {
    if (!state.camera || !state.controls) return;
    const targetPosition = state.targetPositions[index] || state.originalPositions[index];
    if (!targetPosition) return;
    const framing = {
        ...(state.navState.focusFramingMeta || {}),
        ...options
    };
    const transitionStyle = framing.transitionStyle || 'focus';
    const nodePos = new THREE.Vector3(
        targetPosition.x,
        targetPosition.y,
        targetPosition.z
    );
    const startTarget = state.controls.target.clone();
    const startPos = state.camera.position.clone();
    const currentHeading = state.camera.position.clone().sub(state.controls.target).normalize();
    const distance = framing.distance || 0.5;
    const verticalLift = framing.verticalLift || 0.045;
    const framingDrop = framing.framingDrop ?? 0.02;
    const framingOffset = framing.targetOffset?.clone ? framing.targetOffset.clone() : new THREE.Vector3();
    let focusTarget = nodePos.clone().add(framingOffset).add(new THREE.Vector3(0, -framingDrop, 0));
    let heading = currentHeading.clone();
    let stageRightVector = null;
    const isSemanticPocketFocus = state.navState.threadSource === 'semantic' && state.navState.focusPocketMeta?.active;

    if ((transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk') && framing.travelVector) {
        const travel = framing.travelVector.clone();
        if (travel.lengthSq() > 0.000001) {
            const travelDir = travel.normalize();
            const travelPull = transitionStyle === 'dive'
                ? -0.58
                : (transitionStyle === 'dive-walk' ? -0.38 : -0.3);
            const blendedHeading = currentHeading.clone().multiplyScalar(transitionStyle === 'dive' ? 0.62 : 0.7).add(travelDir.clone().multiplyScalar(travelPull));
            if (blendedHeading.lengthSq() > 0.000001) {
                heading = blendedHeading.normalize();
            }
            focusTarget = focusTarget.clone().add(travelDir.multiplyScalar(transitionStyle === 'dive'
                ? 0.06
                : (transitionStyle === 'dive-walk' ? 0.022 : 0.014)));
        }
    }

    if ((transitionStyle === 'search' || transitionStyle === 'focus' || transitionStyle === 'dive' || transitionStyle === 'dive-walk') && isSemanticPocketFocus) {
        const pocketProfile = state.navState.focusPocketMeta.viewportProfile || {};
        const baseOrbitBias = pocketProfile.key === 'roomy' ? 0.11 : (pocketProfile.key === 'compact' || pocketProfile.key === 'condensed' ? 0.04 : 0.075);
        const orbitBias = (transitionStyle === 'dive' || transitionStyle === 'dive-walk') ? baseOrbitBias * 1.55 : baseOrbitBias;
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(worldUp, currentHeading);
        if (right.lengthSq() > 0.000001) {
            right.normalize();
            stageRightVector = right.clone();
            const composedHeading = currentHeading.clone()
                .multiplyScalar(0.92)
                .add(right.clone().multiplyScalar(orbitBias))
                .add(worldUp.multiplyScalar(0.035));
            if (composedHeading.lengthSq() > 0.000001) {
                heading = composedHeading.normalize();
            }
        }
    }

    const desiredCamPos = focusTarget.clone().add(heading.multiplyScalar(distance)).add(new THREE.Vector3(0, verticalLift, 0));

    const personality = state.navState.currentPersonality || { type: 'STANDARD', cameraDuration: 980, cameraArc: 'standard', easing: 'easeInOutCubic' };
    const baseDuration = framing.duration || (transitionStyle === 'dive' ? 1480 : (personality.cameraDuration || 980));
    const prefersReducedCameraMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const duration = prefersReducedCameraMotion ? 1 : baseDuration;

    const animationToken = ++state.focusCameraAnimationToken;
    state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget);
    state.focusCameraTargetOffset.copy(focusTarget.clone().sub(nodePos));
    setFocusTransitionMode(transitionStyle, { duration });
    if (prefersReducedCameraMotion) {
        state.controls.target.copy(focusTarget);
        state.camera.position.copy(desiredCamPos);
        state.controls.update();
        return;
    }

    startFocusCameraAssist(duration + 100, transitionStyle);
    const startTime = performance.now();
    const stageArcActive = isSemanticPocketFocus && (transitionStyle === 'search' || transitionStyle === 'focus' || transitionStyle === 'dive' || transitionStyle === 'dive-walk');
    let cameraControlPoint = null;
    let targetControlPoint = null;
    if (stageArcActive) {
        const pocketProfile = state.navState.focusPocketMeta.viewportProfile || {};
        const worldUp = new THREE.Vector3(0, 1, 0);
        const rightVector = stageRightVector || new THREE.Vector3().crossVectors(worldUp, currentHeading).normalize();
        if (rightVector.lengthSq() < 0.000001) rightVector.set(1, 0, 0);
        const roomyBoost = pocketProfile.key === 'roomy' ? 1.2 : (pocketProfile.key === 'condensed' ? 0.72 : 1);

        const arcMult = personality.cameraArc === 'wide' ? 1.45 : (personality.cameraArc === 'side' ? 1.15 : (personality.cameraArc === 'narrow' ? 0.65 : 1.0));
        const arcSide = Math.min(0.18, Math.max(0.035, distance * 0.16 * roomyBoost * arcMult));
        const arcLift = Math.min(0.16, Math.max(0.034, distance * 0.15 * (personality.cameraArc === 'wide' ? 1.25 : 1.0)));
        const arcPullback = Math.min(0.12, Math.max(0.035, distance * 0.12));

        cameraControlPoint = startPos.clone()
            .lerp(desiredCamPos, transitionStyle === 'search' ? 0.52 : 0.48)
            .add(rightVector.clone().multiplyScalar(arcSide))
            .add(worldUp.clone().multiplyScalar(arcLift))
            .add(currentHeading.clone().multiplyScalar(arcPullback));
        targetControlPoint = startTarget.clone()
            .lerp(focusTarget, 0.58)
            .add(rightVector.clone().multiplyScalar(arcSide * 0.32))
            .add(worldUp.clone().multiplyScalar(arcLift * 0.12));
    }

    function step(now) {
        if (animationToken !== state.focusCameraAnimationToken) return;
        const t = Math.min((now - startTime) / duration, 1);

        const personalityEasing = personality.easing === 'easeOutBack' ? easeOutBack(t) : (personality.easing === 'easeOutQuint' ? easeOutQuint(t) : easeInOutCubic(t));
        const eased = stageArcActive
            ? (personality.type === 'TIGHT_CLUSTER' ? easeInOutCubic(t) : easeInOutSine(t))
            : ((transitionStyle === 'walk' || transitionStyle === 'dive-walk')
                ? easeInOutCubic(t)
                : (transitionStyle === 'search' ? easeInOutCubic(t) : personalityEasing));

        if (cameraControlPoint && targetControlPoint) {
            state.controls.target.set(
                quadraticBezierComponent(startTarget.x, targetControlPoint.x, focusTarget.x, eased),
                quadraticBezierComponent(startTarget.y, targetControlPoint.y, focusTarget.y, eased),
                quadraticBezierComponent(startTarget.z, targetControlPoint.z, focusTarget.z, eased)
            );
            state.camera.position.set(
                quadraticBezierComponent(startPos.x, cameraControlPoint.x, desiredCamPos.x, eased),
                quadraticBezierComponent(startPos.y, cameraControlPoint.y, desiredCamPos.y, eased),
                quadraticBezierComponent(startPos.z, cameraControlPoint.z, desiredCamPos.z, eased)
            );
        } else {
            state.controls.target.lerpVectors(startTarget, focusTarget, eased);
            state.camera.position.lerpVectors(startPos, desiredCamPos, eased);
        }
        state.controls.update();
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            state.focusCameraOffset = null;
        }
    }
    requestAnimationFrame(step);
}

function getRouteEmbodimentIndices() {
    const routeIndices = (state.navState.trailNeighborIndices || []).slice(0, 6);
    const seedIndex = state.navState.trailSeedIndex;
    if (seedIndex !== null && seedIndex !== undefined) routeIndices.unshift(seedIndex);
    return routeIndices;
}

function getRoutePositionBounds(routeIndices = []) {
    const vectors = routeIndices
        .map((index) => {
            const pos = state.targetPositions[index] || state.nodePositions[index] || state.originalPositions[index];
            if (!pos) return null;
            return new THREE.Vector3(pos.x, pos.y, pos.z);
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

export function isCameraIdleOrbitAllowed() {
    return (
        state.autoRotate &&
        state.currentView === 'galaxy' &&
        state.focusedNode === null &&
        state.selectedPoint === null &&
        state.navState.mode === 'overview' &&
        !state.autoRotateSuspended &&
        !state.sceneRevealActive &&
        !state.searchGlowActive
    );
}

export function syncOrbitAutoRotate() {
    if (state.controls) {
        const allowed = isCameraIdleOrbitAllowed();
        state.controls.autoRotate = allowed;
        if (!allowed) {
            state.controls.autoRotateSpeed = 0;
            if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0;
        } else if (!state.autoRotateSoftResumeStartedAt && state.controls.autoRotateSpeed <= 0) {
            state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED;
        }
    }
}

export function setAutoRotateSuspended(suspended) {
    if (state.autoRotateSuspended === suspended) return;
    state.autoRotateSuspended = suspended;
    if (suspended) {
        state.autoRotateSoftResumeStartedAt = 0;
    } else {
        state.autoRotateSoftResumeStartedAt = performance.now();
    }
    syncOrbitAutoRotate();
}

export function clearAutoRotateResumeTimer() {
    if (!state.autoRotateResumeTimer) return;
    clearTimeout(state.autoRotateResumeTimer);
    state.autoRotateResumeTimer = null;
    state.autoRotateResumeDueAt = 0;
}

export function scheduleAutoRotateResume(delay = AUTO_ROTATE_IDLE_MS) {
    clearAutoRotateResumeTimer();
    if (
        !state.autoRotate ||
        state.currentView !== 'galaxy' ||
        state.focusedNode !== null ||
        state.selectedPoint !== null ||
        state.sceneRevealActive
    )
        return;
    state.autoRotateResumeDueAt = performance.now() + delay;
    state.autoRotateResumeTimer = setTimeout(() => {
        state.autoRotateResumeTimer = null;
        state.autoRotateResumeDueAt = 0;
        if (
            state.autoRotate &&
            state.currentView === 'galaxy' &&
            state.focusedNode === null &&
            state.selectedPoint === null &&
            state.navState.mode === 'overview' &&
            !state.sceneRevealActive
        ) {
            setAutoRotateSuspended(false);
        }
    }, delay);
}

export function noteSceneInteraction(delay = AUTO_ROTATE_IDLE_MS) {
    setAutoRotateSuspended(true);
    scheduleAutoRotateResume(delay);
}

export function syncCameraAssistDataset() {
    document.body.dataset.cameraAssist = state.focusCameraAssistActive ? 'arriving' : 'free';
    document.body.dataset.cameraAssistReason = state.focusCameraAssistReason || 'idle';
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

export function setRouteExplorationState(phase = 'idle', reason = '') {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle';
    const normalizedReason = String(reason || '').replace(/[^a-z0-9-]/gi, '') || '';
    state.routeExplorationState = {
        phase: normalizedPhase,
        reason: normalizedReason,
        startedAt: performance.now()
    };
    document.body.dataset.routeExploration = normalizedPhase;
    document.body.dataset.routeExplorationReason = normalizedReason;
}

export function clearRouteExploration(reason = 'clear') {
    setRouteExplorationState('idle', reason);
    clearFocusOrbitSlack(reason);
}

export function markRouteExploration(reason = 'user-control') {
    if (!isSearchRouteFocusActive()) return false;
    if (state.routeExplorationState.phase !== 'free' || state.routeExplorationState.reason !== reason) {
        setRouteExplorationState('free', reason);
        applyFocusOrbitSlack(reason);
    }
    return true;
}

export function shouldMarkRouteExploration(reason = '') {
    return ['user-control', 'user-wheel', 'field-click'].includes(reason);
}

export function getFocusOrbitSlackPivot() {
    if (!state.camera || !state.controls || state.focusedNode === null || state.focusedNode === undefined) return null;
    const focusPosition =
        state.targetPositions[state.focusedNode] ||
        state.nodePositions[state.focusedNode] ||
        state.originalPositions[state.focusedNode];
    if (!focusPosition) return null;

    const focusVector = new THREE.Vector3(focusPosition.x, focusPosition.y, focusPosition.z);
    const routeBounds = getRoutePositionBounds(getRouteEmbodimentIndices());
    const routeCenter = routeBounds?.center?.clone ? routeBounds.center.clone() : focusVector.clone();
    const compact = window.innerWidth <= 768;
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
    const nextTarget = getFocusOrbitSlackPivot();
    if (!nextTarget) return false;

    const currentTarget = state.controls.target.clone();
    const targetDelta = nextTarget.sub(currentTarget);
    const maxShift = window.innerWidth <= 768 ? 0.24 : 0.2;
    if (targetDelta.length() > maxShift) targetDelta.setLength(maxShift);
    if (targetDelta.lengthSq() < 0.000064) return false;

    const distanceBefore = state.camera.position.distanceTo(state.controls.target);
    state.controls.target.add(targetDelta);
    const cameraDelta = targetDelta.clone().multiplyScalar(0.72);
    state.camera.position.add(cameraDelta);
    state.controls.maxDistance = Math.max(
        state.controls.maxDistance || ORBIT_MAX_DISTANCE_DEFAULT,
        ORBIT_MAX_DISTANCE_FREE
    );
    state.controls.rotateSpeed = ORBIT_ROTATE_SPEED_FREE;
    state.controls.panSpeed = ORBIT_PAN_SPEED_FREE;
    state.controls.update();

    state.focusOrbitSlackState = {
        phase: 'free-pivot',
        reason,
        startedAt: performance.now(),
        targetShift: Number(targetDelta.length().toFixed(4)),
        cameraShift: Number(cameraDelta.length().toFixed(4)),
        distanceBefore: Number(distanceBefore.toFixed(4)),
        distanceAfter: Number(state.camera.position.distanceTo(state.controls.target).toFixed(4)),
        maxDistance: Number((state.controls.maxDistance || ORBIT_MAX_DISTANCE_FREE).toFixed(2)),
        rotateSpeed: Number((state.controls.rotateSpeed || ORBIT_ROTATE_SPEED_FREE).toFixed(2)),
        panSpeed: Number((state.controls.panSpeed || ORBIT_PAN_SPEED_FREE).toFixed(2))
    };
    document.body.dataset.cameraSlack = 'free-pivot';
    document.body.dataset.cameraSlackReason = reason;
    return true;
}

export function clearFocusOrbitSlack(reason = 'clear') {
    state.focusOrbitSlackState = {
        phase: 'idle',
        reason,
        startedAt: performance.now(),
        targetShift: 0,
        cameraShift: 0,
        distanceBefore: Number(
            state.camera?.position?.distanceTo?.(state.controls?.target || state.camera.position)?.toFixed?.(4) || 0
        ),
        distanceAfter: Number(
            state.camera?.position?.distanceTo?.(state.controls?.target || state.camera.position)?.toFixed?.(4) || 0
        ),
        maxDistance: ORBIT_MAX_DISTANCE_DEFAULT,
        rotateSpeed: ORBIT_ROTATE_SPEED_DEFAULT,
        panSpeed: ORBIT_PAN_SPEED_DEFAULT
    };
    document.body.dataset.cameraSlack = 'idle';
    document.body.dataset.cameraSlackReason = reason;
    if (state.controls && !state.semanticDiveMode) {
        state.controls.maxDistance = ORBIT_MAX_DISTANCE_DEFAULT;
        state.controls.rotateSpeed = ORBIT_ROTATE_SPEED_DEFAULT;
        state.controls.panSpeed = ORBIT_PAN_SPEED_DEFAULT;
    }
}

export function startFocusCameraAssist(duration = 900, reason = 'focus') {
    state.focusCameraAssistActive = true;
    state.focusCameraAssistUntil = performance.now() + Math.max(180, duration);
    state.focusCameraAssistReason = reason;
    syncCameraAssistDataset();
}

export function releaseFocusCameraAssist(reason = 'manual') {
    if (shouldMarkRouteExploration(reason)) {
        markRouteExploration(reason);
    }
    if (!state.focusCameraAssistActive && !state.focusCameraOffset) {
        state.focusCameraAssistReason = reason;
        syncCameraAssistDataset();
        return;
    }
    state.focusCameraAssistActive = false;
    state.focusCameraAssistUntil = 0;
    state.focusCameraAssistReason = reason;
    state.focusCameraOffset = null;
    syncCameraAssistDataset();
}

export function focusCameraAssistIsActive(now = performance.now()) {
    if (!state.focusCameraAssistActive) return false;
    if (now <= state.focusCameraAssistUntil) return true;
    releaseFocusCameraAssist('arrival-complete');
    return false;
}

export function updateAutoRotateSoftResume(now = performance.now()) {
    if (!state.controls) return;
    syncOrbitAutoRotate();
    if (!state.controls.autoRotate) return;
    if (!state.autoRotateSoftResumeStartedAt) {
        state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED;
        return;
    }

    const progress = Math.min(1, Math.max(0, (now - state.autoRotateSoftResumeStartedAt) / AUTO_ROTATE_SOFT_RESUME_MS));
    const eased = easeInOutCubic(progress);
    state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED * eased;
    if (progress >= 1) {
        state.autoRotateSoftResumeStartedAt = 0;
        state.controls.autoRotateSpeed = AUTO_ROTATE_BASE_SPEED;
    }
}

window._cc = {
    syncRuntimeState,
    getRuntimeStateSnapshot,
    isCameraIdleOrbitAllowed,
    syncOrbitAutoRotate,
    setAutoRotateSuspended,
    clearAutoRotateResumeTimer,
    scheduleAutoRotateResume,
    noteSceneInteraction,
    syncCameraAssistDataset,
    isSearchRouteFocusActive,
    setRouteExplorationState,
    clearRouteExploration,
    markRouteExploration,
    shouldMarkRouteExploration,
    getFocusOrbitSlackPivot,
    applyFocusOrbitSlack,
    clearFocusOrbitSlack,
    startFocusCameraAssist,
    releaseFocusCameraAssist,
    focusCameraAssistIsActive,
    updateAutoRotateSoftResume
};
