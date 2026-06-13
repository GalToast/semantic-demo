import * as THREE from 'three';

export function getCanvasUnobstructedRegion() {
  return {
    x: 0,
    y: 0,
    width: window.innerWidth || 1,
    height: window.innerHeight || 1,
  };
}

export function computeFocusPocketScreenBounds(_focusIndex, _pocketIndices, _state) {
  return null;
}

export function computeSafeAreaCameraTargetOffset(_pocketBounds, _canvasRegion, _focusDistance, _camera, _controls) {
  return new THREE.Vector3();
}
