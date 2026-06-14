/**
 * @lib/engine/camera-choreography/types.ts — Shared type vocabulary
 *
 * Port of js/modules/camera-controls-choreography-types.ts
 *
 * Bridges the gap between SemanticState's Vector3Like interfaces
 * and the concrete THREE.Vector3 used in animation loops.
 */

import type * as THREE from 'three'

/** Camera narrowed for choreography — concrete THREE.Vector3 position. */
export interface ChoreographyCamera {
  position: THREE.Vector3
}

/** Orbit controls narrowed for choreography — concrete THREE.Vector3 target. */
export interface ChoreographyControls {
  target: THREE.Vector3
  enabled: boolean
  update(): void
  minDistance?: number
  maxDistance?: number
}

/** Base personality traits shared across focus and route choreography. */
export interface ChoreographyPersonality {
  type?: string
  cameraArc?: string
}
