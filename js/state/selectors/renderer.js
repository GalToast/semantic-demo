// js/state/selectors/renderer.js
// Read-only selectors for Three.js scene refs, WebGL objects, textures, lights.
// Writes to these keys remain direct state.X = ... mutations.
//
// W13-T4 wave 4b (2026-06-15): Ported all 47 renderer selectors from the
// legacy state singleton to appState (Svelte 5 rune-class). The selector
// functions now read from appState directly — same contract, same return types.
// Three.js object refs return null for uninitialized objects (legacy behavior);
// null checks are the consumer's responsibility, not the selector's.
import { appState } from '@lib/state/app.svelte.ts';

// ── Core Scene ──
export const getScene = () => appState.scene;
export const getCamera = () => appState.camera;
export const getControls = () => appState.controls;
export const getRenderer = () => appState.renderer;
export const getHemiLight = () => appState.hemiLight;
export const getDirLight = () => appState.dirLight;

// ── Points / Instanced Mesh ──
export const getPoints = () => appState.points;
export const getPointsMesh = () => appState.pointsMesh;
export const getPointsMaterial = () => appState.pointsMaterial;

// ── Node Spore ──
export const getNodeSporeMesh = () => appState.nodeSporeMesh;
export const getNodeSporeHitMesh = () => appState.nodeSporeHitMesh;
export const getNodeSporeMaterial = () => appState.nodeSporeMaterial;

// ── Position Buffers ──
export const getRawPositionsBuffer = () => appState.rawPositionsBuffer;
export const getRawClustersBuffer = () => appState.rawClustersBuffer;

// ── Mycelium Lines ──
export const getMyceliumLines = () => appState.myceliumLines;
export const getMyceliumGroup = () => appState.myceliumGroup;
export const getMyceliumCoreLines = () => appState.myceliumCoreLines;
export const getMyceliumWispyLines = () => appState.myceliumWispyLines;
export const getMyceliumBridgeLines = () => appState.myceliumBridgeLines;
export const getMyceliumConnectionPairs = () => appState.myceliumConnectionPairs;
export const getMyceliumDirty = () => appState.myceliumDirty;

// ── Focus Semantic Lines ──
export const getFocusSemanticLines = () => appState.focusSemanticLines;
export const getFocusSemanticConnectionPairs = () => appState.focusSemanticConnectionPairs;

// ── Semantic Lens ──
export const getSemanticLensGroup = () => appState.semanticLensGroup;
export const getSemanticLensGlow = () => appState.semanticLensGlow;
export const getSemanticLensSpokes = () => appState.semanticLensSpokes;

// ── Semantic Manifold / Route Trace ──
export const getSemanticManifold = () => appState.semanticManifold;
export const getRouteTraceLines = () => appState.routeTraceLines;
export const getArrivalHandoffGroup = () => appState.arrivalHandoffGroup;

// ── Focus Anchor ──
export const getFocusAnchorGroup = () => appState.focusAnchorGroup;
export const getFocusAnchorRingMesh = () => appState.focusAnchorRingMesh;
export const getFocusAnchorHaloSprite = () => appState.focusAnchorHaloSprite;

// ── Focus Halo / Textures ──
export const getHoverHalo = () => appState.hoverHalo;
export const getFocusBeaconTexture = () => appState.focusBeaconTexture;
export const getFocusRingTexture = () => appState.focusRingTexture;
export const getFocusNextCueTexture = () => appState.focusNextCueTexture;

// ── Focus Lens / Halo / Core / Motes / Petals ──
export const getFocusLens = () => appState.focusLens;
export const getFocusHalo = () => appState.focusHalo;
export const getFocusCore = () => appState.focusCore;
export const getFocusMoteGroup = () => appState.focusMoteGroup;
export const getFocusMotes = () => appState.focusMotes;
export const getFocusPetalGroup = () => appState.focusPetalGroup;
export const getFocusPetals = () => appState.focusPetals;
export const getFocusFilaments = () => appState.focusFilaments;

// ── Inspected Strand ──
export const getInspectedStrandGroup = () => appState.inspectedStrandGroup;

// ── Projected Neighbor ──
export const getProjectedNeighborGrid = () => appState.projectedNeighborGrid;
export const getProjectedNeighborCache = () => appState.projectedNeighborCache;
