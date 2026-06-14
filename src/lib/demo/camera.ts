/**
 * @lib/demo/camera.ts — Camera snapshot and animation helpers for the micro-demo
 *
 * Port of js/modules/micro-demo-camera.js
 *
 * Captures overview camera position, provides fallback defaults,
 * animates camera back to overview with easing, and cancels in-progress animations.
 */
import * as THREE from 'three';
import { state } from '../../../js/state.js';
import { easeInOutSine } from '@lib/utils/math-easing';
import { prefersReducedMotion } from '@lib/utils/environment';

let _overviewCameraSnapshot: { camera: THREE.Vector3; target: THREE.Vector3 } | null = null;
let _overviewCameraRafId: number | null = null;

export function captureOverviewCameraSnapshot(): void {
  const lState = state as Record<string, unknown>;
  const camera = (lState as { camera?: THREE.PerspectiveCamera }).camera;
  const controls = (lState as { controls?: { target: THREE.Vector3; update: () => void } }).controls;
  if (!camera?.position?.clone || !controls?.target?.clone) return;
  _overviewCameraSnapshot = {
    camera: camera.position.clone(),
    target: controls.target.clone()
  };
}

export function getOverviewCameraSnapshot(): { camera: THREE.Vector3; target: THREE.Vector3 } {
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

export function animateCameraToOverview(duration = 1000): void {
  const lState = state as Record<string, unknown>;
  const camera = (lState as { camera?: THREE.PerspectiveCamera }).camera;
  const controls = (lState as { controls?: { target: THREE.Vector3; update: () => void } }).controls;
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
    cancelAnimationFrame(_overviewCameraRafId);
    _overviewCameraRafId = null;
  }

  const startTime = performance.now();
  let _rafCancelled = false;

  function step(now: number): void {
    if (_rafCancelled) return;
    const raw = (now - startTime) / duration;
    const t = Math.min(Math.max(raw, 0), 1);
    const eased = easeInOutSine(t);
    camera!.position.lerpVectors(startPos, overviewPos, eased);
    controls!.target.lerpVectors(startTarget, overviewTarget, eased);
    controls!.update();
    if (t < 0.999) {
      _overviewCameraRafId = requestAnimationFrame(step);
    } else {
      _overviewCameraRafId = null;
    }
  }
  _overviewCameraRafId = requestAnimationFrame(step);
}

export function cancelOverviewCameraAnimation(): void {
  if (_overviewCameraRafId !== null) {
    cancelAnimationFrame(_overviewCameraRafId);
    _overviewCameraRafId = null;
  }
}
