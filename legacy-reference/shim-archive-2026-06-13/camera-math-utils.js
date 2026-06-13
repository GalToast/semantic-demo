import * as THREE from 'three';

export function computeTravelVectorHeading(focusTarget, currentHeading) {
  return { focusTarget, heading: currentHeading.clone ? currentHeading.clone() : new THREE.Vector3(0.28, 0.2, 1).normalize() };
}

export function computeOrbitBiasHeading(currentHeading) {
  return { heading: currentHeading.clone ? currentHeading.clone() : new THREE.Vector3(0.28, 0.2, 1).normalize(), stageRightVector: null };
}

export function computeCameraArcControlPoints() {
  return { cameraControlPoint: null, targetControlPoint: null };
}
