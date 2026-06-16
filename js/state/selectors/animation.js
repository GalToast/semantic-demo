// js/state/selectors/animation.js
// Read-only selectors for scene reveal, auto-rotate, weather, position buffers.
// W13-T3: Consumers in js/modules/ migrated to direct appState reads.
// Exports retained for state-selectors-bridge.ts re-export (Phase 4 territory).
// W13-T3 pass-through: selectors below now read from appState (Svelte 5)
// instead of the legacy state singleton. T5 will retire the barrel.
import { appState } from '@lib/state/app.svelte.ts';

// ── Auto-Rotate ──
export const getAutoRotate = () => appState.autoRotate;
export const getAutoRotateSuspended = () => appState.autoRotateSuspended;

// ── Scene Reveal ──
export const getSceneRevealActive = () => appState.sceneRevealActive;
export const getSceneRevealStartedAt = () => appState.sceneRevealStartedAt;
export const getSceneRevealCameraStart = () => appState.sceneRevealCameraStart;
export const getSceneRevealCameraEnd = () => appState.sceneRevealCameraEnd;
export const getRouteCameraAnimationToken = () => appState.routeCameraAnimationToken;

// ── Node Settling ──
export const getNodesAreSettling = () => appState.nodesAreSettling;
export const getPulsePhase = () => appState.pulsePhase;

// ── Position Buffers ──
export const getNodePositions = () => appState.nodePositions;
export const getTargetPositions = () => appState.targetPositions;
export const getOriginalPositions = () => appState.originalPositions;

// ── Weather ──
export const getWeather = () => appState.weather;
export const getWeatherInitialized = () => appState.weatherInitialized;

// ── Ripple / Bloom / Bridge ──
export const getRippleActive = () => appState.rippleActive;
export const getRippleStartTime = () => appState.rippleStartTime;
export const getRippleCenter = () => appState.rippleCenter;
export const getBloomPulseStartTime = () => appState.bloomPulseStartTime;
export const getBridgePulseStartTime = () => appState.bridgePulseStartTime;

// ── Hover State ──
export const getHoverHighlightIndex = () => appState.hoverHighlightIndex;
export const getStableCanvasHover = () => appState.stableCanvasHover;
export const getLastCanvasNodeHover = () => appState.lastCanvasNodeHover;
export const getLastCanvasNodePick = () => appState.lastCanvasNodePick;
export const getLastCanvasNodeFocusPick = () => appState.lastCanvasNodeFocusPick;

// ── Camera Vectors ──
export const getFocusTargetVector = () => appState.focusTargetVector;
export const getDesiredCameraVector = () => appState.desiredCameraVector;
