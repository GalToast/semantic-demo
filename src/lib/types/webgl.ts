/**
 * @lib/types/webgl.ts — WebGL/Three.js specific type definitions
 *
 * Typed wrappers for Three.js scene configuration, node instances,
 * thread geometry, and shader uniforms.
 */

import type * as THREE from 'three';

// ── Scene Configuration ───────────────────────────────────────────────────────

export interface SceneConfig {
  fog: {
    color: number;
    near: number;
    far: number;
  };
  ambient: {
    color: number;
    intensity: number;
  };
  directional: {
    color: number;
    intensity: number;
    position: [number, number, number];
  };
  renderer: {
    antialias: boolean;
    pixelRatio: number;
    toneMapping: THREE.ToneMapping;
    toneMappingExposure: number;
  };
  camera: {
    fov: number;
    near: number;
    far: number;
    initialPosition: [number, number, number];
  };
}

// ── Node Instances ────────────────────────────────────────────────────────────

/** Instanced mesh configuration for point nodes */
export interface NodeInstanceConfig {
  /** Base size of each point */
  baseSize: number;
  /** Base opacity */
  baseOpacity: number;
  /** Number of instances */
  count: number;
  /** Custom shader material if applicable */
  material: THREE.Material | null;
  /** Geometry for instanced mesh */
  geometry: THREE.BufferGeometry;
}

/** Per-node rendering state */
export interface NodeInstanceState {
  /** Scale multiplier per node (0-1) */
  scales: Float32Array;
  /** Color per node (RGB packed) */
  colors: Float32Array;
  /** Whether the node is highlighted */
  highlighted: boolean;
  /** Hover index */
  hoverIndex: number;
}

// ── Thread / Mycelium Lines ───────────────────────────────────────────────────

/** Mycelium thread line configuration */
export interface ThreadLineConfig {
  /** Line color */
  color: number;
  /** Line opacity */
  opacity: number;
  /** Line width (for Line2/LineMaterial) */
  linewidth: number;
  /** Dashed pattern */
  dashed: boolean;
  /** Dash scale */
  dashScale: number;
  /** Dash size */
  dashSize: number;
  /** Gap size */
  gapSize: number;
}

/** Thread line instance for rendering */
export interface ThreadLine {
  /** Unique ID */
  id: string;
  /** Source node index */
  sourceIndex: number;
  /** Target node index */
  targetIndex: number;
  /** Line geometry */
  geometry: THREE.BufferGeometry;
  /** Line material */
	material: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  /** Line mesh/group */
  object: THREE.Object3D;
  /** Pulse opacity for animation */
  pulseOpacity: number;
  /** Weight for visibility */
  weight: number;
}

// ── Shader Uniforms ───────────────────────────────────────────────────────────

/** Map of uniform names to their Three.js uniform values */
export type UniformSet = Record<string, THREE.IUniform>;

/** Common uniform names used across shaders */
export const UNIFORM_NAMES = {
  TIME: 'uTime',
  RESOLUTION: 'uResolution',
  OPACITY: 'uOpacity',
  COLOR: 'uColor',
  PULSE: 'uPulse',
  FOCUS_INDEX: 'uFocusIndex',
  HOVER_INDEX: 'uHoverIndex',
  POINT_SIZE: 'uPointSize',
  CAMERA_DISTANCE: 'uCameraDistance',
  SEMANTIC_LENS: 'uSemanticLens',
  TRAIL_PROGRESS: 'uTrailProgress',
  ARRIVAL_MIX: 'uArrivalMix'
} as const;

// ── Focus Thread Geometry ─────────────────────────────────────────────────────

/** Focus thread overlay configuration */
export interface FocusThreadConfig {
  segmentCount: number;
  curvePoints: [number, number, number][];
  controlPoints: [number, number, number][];
  opacity: number;
  color: number;
}

// ── Route Trace Overlay ───────────────────────────────────────────────────────

/** Route trace line overlay */
export interface RouteTraceConfig {
  connectionPairs: [number, number][];
  color: number;
  opacity: number;
  width: number;
}

// ── Point Types ─────────────────────────────────────────────────────────────────

/** 3D point in unit cube space [0,1]³ */
export type Point3D = { x: number; y: number; z: number };

// ── Scene Diagnostics ─────────────────────────────────────────────────────────

export interface ScenePerformanceDiagnostics {
  active: boolean;
  reason: string;
  lastFrameAt: number;
  sampleCount: number;
  avgFrameMs: number;
  maxFrameMs: number;
  avgUpdateMs: number;
  maxUpdateMs: number;
  avgRenderMs: number;
  maxRenderMs: number;
  avgControlsMs: number;
  avgNodeMotionMs: number;
  avgThreadUpdateMs: number;
  avgGlowMs: number;
  avgLensMs: number;
}
