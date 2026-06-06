// js/modules/micro-demo-camera.js
// Camera snapshot and animation helpers for the micro-demo

import { state } from '../state.js';
import * as THREE from 'three';
import { easeInOutSine } from './utils/math-easing.js';
import { prefersReducedMotion } from './environment.js';

let _overviewCameraSnapshot = null;
let _overviewCameraRafId = null;

export function captureOverviewCameraSnapshot() {
    if (!state.camera?.position?.clone || !state.controls?.target?.clone) return;
    _overviewCameraSnapshot = {
        camera: state.camera.position.clone(),
        target: state.controls.target.clone()
    };
}

export function getOverviewCameraSnapshot() {
    if (_overviewCameraSnapshot?.camera?.clone && _overviewCameraSnapshot?.target?.clone) {
        return {
            camera: _overviewCameraSnapshot.camera.clone(),
            target: _overviewCameraSnapshot.target.clone()
        };
    }
    return {
        camera: new THREE.Vector3(0, 3.5, 5),
        target: new THREE.Vector3(0, 0, 0)
    };
}

export function animateCameraToOverview(duration = 1000) {
    if (!state.camera || !state.controls) return;
    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const { camera: overviewPos, target: overviewTarget } = getOverviewCameraSnapshot();

    if (prefersReducedMotion()) {
        state.camera.position.copy(overviewPos);
        state.controls.target.copy(overviewTarget);
        state.controls.update();
        return;
    }

    // Cancel any existing overview camera animation
    if (_overviewCameraRafId !== null) {
        window.cancelAnimationFrame(_overviewCameraRafId);
        _overviewCameraRafId = null;
    }

    const startTime = performance.now();
    let _rafCancelled = false;

    function step(now) {
        if (_rafCancelled) return;
        const raw = (now - startTime) / duration;
        const t = Math.min(Math.max(raw, 0), 1);
        const eased = easeInOutSine(t);
        state.camera.position.lerpVectors(startPos, overviewPos, eased);
        state.controls.target.lerpVectors(startTarget, overviewTarget, eased);
        state.controls.update();
        if (t < 0.999) {
            _overviewCameraRafId = requestAnimationFrame(step);
        } else {
            _overviewCameraRafId = null;
        }
    }
    _overviewCameraRafId = requestAnimationFrame(step);
}

/**
 * Cancel any in-progress overview camera animation.
 * Called during micro-demo cleanup to prevent RAF leaks.
 */
export function cancelOverviewCameraAnimation() {
    if (_overviewCameraRafId !== null) {
        window.cancelAnimationFrame(_overviewCameraRafId);
        _overviewCameraRafId = null;
    }
}
