// js/state/selectors/animation.js
// Read-only selectors for scene reveal, auto-rotate, weather, position buffers.
import { state } from '../../state.js';

// ── Auto-Rotate ──
export const getAutoRotate = () => state.autoRotate;
export const getAutoRotateSuspended = () => state.autoRotateSuspended;

// ── Scene Reveal ──
export const getSceneRevealActive = () => state.sceneRevealActive;
export const getSceneRevealStartedAt = () => state.sceneRevealStartedAt;
export const getSceneRevealCameraStart = () => state.sceneRevealCameraStart;
export const getSceneRevealCameraEnd = () => state.sceneRevealCameraEnd;
export const getRouteCameraAnimationToken = () => state.routeCameraAnimationToken;

// ── Node Settling ──
export const getNodesAreSettling = () => state.nodesAreSettling;
export const getPulsePhase = () => state.pulsePhase;

// ── Position Buffers ──
export const getNodePositions = () => state.nodePositions;
export const getTargetPositions = () => state.targetPositions;
export const getOriginalPositions = () => state.originalPositions;

// ── Weather ──
export const getWeather = () => state.weather;
export const getWeatherInitialized = () => state.weatherInitialized;

// ── Ripple / Bloom / Bridge ──
export const getRippleActive = () => state.rippleActive;
export const getRippleStartTime = () => state.rippleStartTime;
export const getRippleCenter = () => state.rippleCenter;
export const getBloomPulseStartTime = () => state.bloomPulseStartTime;
export const getBridgePulseStartTime = () => state.bridgePulseStartTime;

// ── Hover State ──
export const getHoverHighlightIndex = () => state.hoverHighlightIndex;
export const getStableCanvasHover = () => state.stableCanvasHover;
export const getLastCanvasNodeHover = () => state.lastCanvasNodeHover;
export const getLastCanvasNodePick = () => state.lastCanvasNodePick;
export const getLastCanvasNodeFocusPick = () => state.lastCanvasNodeFocusPick;

// ── Camera Vectors ──
export const getFocusTargetVector = () => state.focusTargetVector;
export const getDesiredCameraVector = () => state.desiredCameraVector;
