// js/state/selectors/navigation.js
// Read-only selectors for current view, navState, focus state, strand continuity.
// Now reads from appState (Svelte 5) instead of legacy state singleton.
import { appState } from '@lib/state/app.svelte.ts';

// ── View ──
export const getCurrentView = () => appState.currentView;

// ── NavState (object reference — subkeys accessed directly) ──
export const getNavState = () => appState.navState;

// ── Focused Node (computed getter from navState.focusedIndex) ──
export const getFocusedNode = () => appState.focusedNode;

// ── Selected Point ──
export const getSelectedPoint = () => appState.selectedPoint;

// ── Strand Continuity ──
export const getStrandContinuityState = () => appState.strandContinuityState;

// ── Focus Transition ──
export const getFocusTransitionMode = () => appState.focusTransitionMode;
export const getFocusTransitionStartedAt = () => appState.focusTransitionStartedAt;

// ── Focus Camera ──
export const getFocusCameraAnimationToken = () => appState.focusCameraAnimationToken;
export const getFocusCameraAssistActive = () => appState.focusCameraAssistActive;
export const getFocusCameraAssistUntil = () => appState.focusCameraAssistUntil;
export const getFocusCameraAssistReason = () => appState.focusCameraAssistReason;
export const getFocusCameraOffset = () => appState.focusCameraOffset;
export const getFocusCameraTargetOffset = () => appState.focusCameraTargetOffset;

// ── Focus Orbit Slack ──
export const getFocusOrbitSlackState = () => appState.focusOrbitSlackState;

// ── Thread Inspection ──
export const getPinnedThreadIndex = () => appState.pinnedThreadIndex;
export const getInspectedThreadIndex = () => appState.inspectedThreadIndex;

// ── Route Trace ──
export const getRouteTraceConnectionPairs = () => appState.routeTraceConnectionPairs;
export const getRouteTraceRenderStateKey = () => appState.routeTraceRenderStateKey;

// ── Terrain / Route Exploration ──
export const getTerrainHandoffState = () => appState.terrainHandoffState;
export const getRouteExplorationState = () => appState.routeExplorationState;
export const getRouteChoreographyState = () => appState.routeChoreographyState;

// ── Trail Depth & Dive Mode ──
export const getTrailDepth = () => appState.trailDepth;
export const getSemanticDiveMode = () => appState.semanticDiveMode;

// ── Focus Pocket ──
export const getFocusPocketMotionByIndex = () => appState.focusPocketMotionByIndex;
export const getFocusPocketTransitionStartedAt = () => appState.focusPocketTransitionStartedAt;

// ── Thread Inspector Pointer ──
export const getThreadInspectorPointerInside = () => appState.threadInspectorPointerInside;
