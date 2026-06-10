import type {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Points,
  PointsMaterial,
  InstancedMesh,
  Material,
  Group,
  LineSegments,
  Object3D,
  Sprite,
  Texture,
  Mesh,
  HemisphereLight,
  DirectionalLight,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface WebGLContextState {
  // ==== SCENE / THREE.JS ====
  scene: Scene | null;
  camera: PerspectiveCamera | null;
  renderer: WebGLRenderer | null;
  controls: OrbitControls | null;
  pointsMesh: Points | null;
  pointsMaterial: PointsMaterial | null;
  nodeSporeMesh: InstancedMesh | null;
  nodeSporeHitMesh: InstancedMesh | null;
  nodeSporeMaterial: Material | null;
  rawPositionsBuffer: Float32Array | null;
  rawClustersBuffer: Float32Array | null;
  myceliumLines: LineSegments | null;
  myceliumGroup: Group | null;
  myceliumCoreLines: LineSegments | null;
  myceliumWispyLines: LineSegments | null;
  myceliumBridgeLines: LineSegments | null;
  focusSemanticLines: LineSegments | null;
  focusSemanticConnectionPairs: Array<{ a: number; b: number }>;
  semanticLensGroup: Group | null;
  semanticLensGlow: Mesh | null;
  semanticLensSpokes: Group | null;
  myceliumConnectionPairs: Array<{ a: number; b: number; layer: number }>;
  hemiLight: HemisphereLight | null;
  dirLight: DirectionalLight | null;

  // ==== FOCUS / THREAD / ROUTE VISUAL STATE ====
  focusLens: Mesh | null;
  focusHalo: Sprite | null;
  focusCore: Mesh | null;
  focusMoteGroup: Group | null;
  focusMotes: Sprite[];
  focusPetalGroup: Group | null;
  focusPetals: Mesh[];
  focusFilaments: LineSegments | null;
  focusAnchorGroup: Group | null;
  focusAnchorRingMesh: Mesh | null;
  focusAnchorHaloSprite: Sprite | null;
  hoverHalo: Mesh | null;
  focusBeaconTexture: Texture | null;
  focusRingTexture: Texture | null;
  focusNextCueTexture: Texture | null;
  semanticManifold: Object3D | null;
  routeTraceLines: LineSegments | null;
  arrivalHandoffGroup: Group | null;
  routeTraceConnectionPairs: Array<{ a: number; b: number }>;
  routeTraceRenderStateKey: string;
  inspectedStrandGroup: Group | null;
}

export const webglContext: WebGLContextState = {
  // ==== SCENE / THREE.JS ====
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  pointsMesh: null,
  pointsMaterial: null,
  nodeSporeMesh: null,
  nodeSporeHitMesh: null,
  nodeSporeMaterial: null,
  rawPositionsBuffer: null,
  rawClustersBuffer: null,
  myceliumLines: null,
  myceliumGroup: null,
  myceliumCoreLines: null,
  myceliumWispyLines: null,
  myceliumBridgeLines: null,
  focusSemanticLines: null,
  focusSemanticConnectionPairs: [],
  semanticLensGroup: null,
  semanticLensGlow: null,
  semanticLensSpokes: null,
  myceliumConnectionPairs: [],
  hemiLight: null,
  dirLight: null,

  // ==== FOCUS / THREAD / ROUTE VISUAL STATE ====
  focusLens: null,
  focusHalo: null,
  focusCore: null,
  focusMoteGroup: null,
  focusMotes: [],
  focusPetalGroup: null,
  focusPetals: [],
  focusFilaments: null,
  focusAnchorGroup: null,
  focusAnchorRingMesh: null,
  focusAnchorHaloSprite: null,
  hoverHalo: null,
  focusBeaconTexture: null,
  focusRingTexture: null,
  focusNextCueTexture: null,
  semanticManifold: null,
  routeTraceLines: null,
  arrivalHandoffGroup: null,
  routeTraceConnectionPairs: [],
  routeTraceRenderStateKey: '',
  inspectedStrandGroup: null,
};

export interface LiveResourceCounts extends Record<string, number> {
  geometries: number;
  textures: number;
  programs: number;
}

export function getLiveResourceCounts(): LiveResourceCounts {
  if (!webglContext.renderer) return { geometries: 0, textures: 0, programs: 0 };
  const memory = webglContext.renderer.info.memory;
  const programs = webglContext.renderer.info.programs;
  return {
    geometries: memory.geometries || 0,
    textures: memory.textures || 0,
    programs: programs?.length || 0,
  };
}
