const webglContext = {
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
  routeTraceRenderStateKey: "",
  inspectedStrandGroup: null
};
function getLiveResourceCounts() {
  if (!webglContext.renderer) return { geometries: 0, textures: 0, programs: 0 };
  const memory = webglContext.renderer.info.memory;
  const programs = webglContext.renderer.info.programs;
  return {
    geometries: memory.geometries || 0,
    textures: memory.textures || 0,
    programs: programs?.length || 0
  };
}
export {
  getLiveResourceCounts,
  webglContext
};
