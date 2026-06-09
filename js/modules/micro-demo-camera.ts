/**
 * micro-demo-camera.ts — TypeScript shadow of micro-demo-camera.js
 * Camera snapshot and animation helpers for the micro-demo.
 */

import { state } from '../state.ts';
import * as THREE from 'three';
import { easeInOutSine } from './utils/math-easing.ts';
import { prefersReducedMotion } from './environment.ts';

interface CameraSnapshot {
    camera: THREE.Vector3;
    target: THREE.Vector3;
}

let _overviewCameraSnapshot: CameraSnapshot | null = null;
let _overviewCameraRafId: number | null = null;

export function captureOverviewCameraSnapshot(): void {
    const camera = state.camera as { position?: { clone: () => THREE.Vector3 } } | null;
    const controls = state.controls as { target?: { clone: () => THREE.Vector3 } } | null;
    if (!camera?.position?.clone || !controls?.target?.clone) return;
    _overviewCameraSnapshot = {
        camera: camera.position.clone(),
        target: controls.target.clone()
    };
}

export function getOverviewCameraSnapshot(): CameraSnapshot {
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

export function animateCameraToOverview(duration: number = 1000): void {
    const camera = state.camera as { position: { clone: () => THREE.Vector3; copy: (v: THREE.Vector3) => void; lerpVectors: (a: THREE.Vector3, b: THREE.Vector3, t: number) => void }; fov?: number } | null;
    const controls = state.controls as { target: { clone: () => THREE.Vector3; copy: (v: THREE.Vector3) => void; lerpVectors: (a: THREE.Vector3, b: THREE.Vector3, t: number) => void }; update: () => void } | null;
    if (!camera || !controls) return;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const { camera: overviewPos, target: overviewTarget } = getOverviewCameraSnapshot();

    if (prefersReducedMotion()) {
        camera.position.copy(overviewPos);
        controls.target.copy(overviewTarget);
        controls.update();
        return;
    }

    // Cancel any existing overview camera animation
    if (_overviewCameraRafId !== null) {
        window.cancelAnimationFrame(_overviewCameraRafId);
        _overviewCameraRafId = null;
    }

    const startTime = performance.now();
    let _rafCancelled = false;

    function step(now: number): void {
        if (_rafCancelled) return;
        if (!camera || !controls) return;
        const raw = (now - startTime) / duration;
        const t = Math.min(Math.max(raw, 0), 1);
        const eased = easeInOutSine(t);
        camera.position.lerpVectors(startPos, overviewPos, eased);
        controls.target.lerpVectors(startTarget, overviewTarget, eased);
        controls.update();
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
export function cancelOverviewCameraAnimation(): void {
    if (_overviewCameraRafId !== null) {
        window.cancelAnimationFrame(_overviewCameraRafId);
        _overviewCameraRafId = null;
    }
}
