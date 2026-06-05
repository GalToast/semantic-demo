// js/state/selectors/data.js
// Read-only selectors for data loading, semantic threads, enrichment.
import { state } from '../../state.js';

// ── Lead Enrichment ──
export const getLeadEnrichment = () => state.leadEnrichment;

// ── Index Lookups ──
export const getPointIndexByLeadId = () => state.pointIndexByLeadId;
export const getSemanticNeighborMapByLeadId = () => state.semanticNeighborMapByLeadId;

// ── Semantic Thread Bundle ──
export const getSemanticThreadBundle = () => state.semanticThreadBundle;
export const getSemanticThreadArtifactName = () => state.semanticThreadArtifactName;

// ── Semantic Space Layout ──
export const getSemanticSpaceLayoutManifest = () => state.semanticSpaceLayoutManifest;
export const getSemanticSpaceLayoutStatus = () => state.semanticSpaceLayoutStatus;
export const getSemanticSpaceLayoutError = () => state.semanticSpaceLayoutError;

// ── Semantic Threads Loading ──
export const getSemanticThreadsLoadPromise = () => state.semanticThreadsLoadPromise;
export const getSemanticThreadsStatus = () => state.semanticThreadsStatus;
export const getSemanticThreadsRetryAttempt = () => state.semanticThreadsRetryAttempt;

// ── Data Load ──
export const getDataLoadAttempt = () => state.dataLoadAttempt;

// ── Point Markers ──
export const getPointMarkers = () => state.pointMarkers;

// ── Map ──
export const getMapInitialized = () => state.mapInitialized;
export const getMarkersLayer = () => state.markersLayer;
export const getMapRouteLayer = () => state.mapRouteLayer;
export const getMap = () => state.map;

// ── Leaflet ──
export const getLeafletAssetsPromise = () => state.leafletAssetsPromise;
