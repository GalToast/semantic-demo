// js/state/selectors/renderer.js
// Read-only selectors for Three.js scene refs, WebGL objects, textures, lights.
// Writes to these keys remain direct state.X = ... mutations.
import { state } from '../../state.js';

// ── Core Scene ──
export const getScene = () => state.scene;
export const getCamera = () => state.camera;
export const getControls = () => state.controls;
export const getRenderer = () => state.renderer;
export const getHemiLight = () => state.hemiLight;
export const getDirLight = () => state.dirLight;

// ── Points / Instanced Mesh ──
export const getPoints = () => state.points;
export const getPointsMesh = () => state.pointsMesh;
export const getPointsMaterial = () => state.pointsMaterial;

// ── Node Spore ──
export const getNodeSporeMesh = () => state.nodeSporeMesh;
export const getNodeSporeHitMesh = () => state.nodeSporeHitMesh;
export const getNodeSporeMaterial = () => state.nodeSporeMaterial;

// ── Position Buffers ──
export const getRawPositionsBuffer = () => state.rawPositionsBuffer;
export const getRawClustersBuffer = () => state.rawClustersBuffer;

// ── Mycelium Lines ──
export const getMyceliumLines = () => state.myceliumLines;
export const getMyceliumGroup = () => state.myceliumGroup;
export const getMyceliumCoreLines = () => state.myceliumCoreLines;
export const getMyceliumWispyLines = () => state.myceliumWispyLines;
export const getMyceliumBridgeLines = () => state.myceliumBridgeLines;
export const getMyceliumConnectionPairs = () => state.myceliumConnectionPairs;
export const getMyceliumDirty = () => state.myceliumDirty;

// ── Focus Semantic Lines ──
export const getFocusSemanticLines = () => state.focusSemanticLines;
export const getFocusSemanticConnectionPairs = () => state.focusSemanticConnectionPairs;

// ── Semantic Lens ──
export const getSemanticLensGroup = () => state.semanticLensGroup;
export const getSemanticLensGlow = () => state.semanticLensGlow;
export const getSemanticLensSpokes = () => state.semanticLensSpokes;

// ── Semantic Manifold / Route Trace ──
export const getSemanticManifold = () => state.semanticManifold;
export const getRouteTraceLines = () => state.routeTraceLines;
export const getArrivalHandoffGroup = () => state.arrivalHandoffGroup;

// ── Focus Anchor ──
export const getFocusAnchorGroup = () => state.focusAnchorGroup;
export const getFocusAnchorRingMesh = () => state.focusAnchorRingMesh;
export const getFocusAnchorHaloSprite = () => state.focusAnchorHaloSprite;

// ── Focus Halo / Textures ──
export const getHoverHalo = () => state.hoverHalo;
export const getFocusBeaconTexture = () => state.focusBeaconTexture;
export const getFocusRingTexture = () => state.focusRingTexture;
export const getFocusNextCueTexture = () => state.focusNextCueTexture;

// ── Focus Lens / Halo / Core / Motes / Petals ──
export const getFocusLens = () => state.focusLens;
export const getFocusHalo = () => state.focusHalo;
export const getFocusCore = () => state.focusCore;
export const getFocusMoteGroup = () => state.focusMoteGroup;
export const getFocusMotes = () => state.focusMotes;
export const getFocusPetalGroup = () => state.focusPetalGroup;
export const getFocusPetals = () => state.focusPetals;
export const getFocusFilaments = () => state.focusFilaments;

// ── Inspected Strand ──
export const getInspectedStrandGroup = () => state.inspectedStrandGroup;

// ── Projected Neighbor ──
export const getProjectedNeighborGrid = () => state.projectedNeighborGrid;
export const getProjectedNeighborCache = () => state.projectedNeighborCache;
