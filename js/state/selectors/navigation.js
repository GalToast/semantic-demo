// js/state/selectors/navigation.js
// Read-only selectors for current view, navState, focus state, strand continuity.
import { state } from '../../state.js';

// ── View ──
export const getCurrentView = () => state.currentView;

// ── NavState (object reference — subkeys accessed directly) ──
export const getNavState = () => state.navState;

// ── Focused Node (computed getter from navState.focusedIndex) ──
export const getFocusedNode = () => state.focusedNode;

// ── Selected Point ──
export const getSelectedPoint = () => state.selectedPoint;

// ── Strand Continuity ──
export const getStrandContinuityState = () => state.strandContinuityState;

// ── Focus Transition ──
export const getFocusTransitionMode = () => state.focusTransitionMode;
export const getFocusTransitionStartedAt = () => state.focusTransitionStartedAt;

// ── Focus Camera ──
export const getFocusCameraAnimationToken = () => state.focusCameraAnimationToken;
export const getFocusCameraAssistActive = () => state.focusCameraAssistActive;
export const getFocusCameraAssistUntil = () => state.focusCameraAssistUntil;
export const getFocusCameraAssistReason = () => state.focusCameraAssistReason;
export const getFocusCameraOffset = () => state.focusCameraOffset;
export const getFocusCameraTargetOffset = () => state.focusCameraTargetOffset;

// ── Focus Orbit Slack ──
export const getFocusOrbitSlackState = () => state.focusOrbitSlackState;

// ── Thread Inspection ──
export const getPinnedThreadIndex = () => state.pinnedThreadIndex;
export const getInspectedThreadIndex = () => state.inspectedThreadIndex;

// ── Route Trace ──
export const getRouteTraceConnectionPairs = () => state.routeTraceConnectionPairs;
export const getRouteTraceRenderStateKey = () => state.routeTraceRenderStateKey;

// ── Terrain / Route Exploration ──
export const getTerrainHandoffState = () => state.terrainHandoffState;
export const getRouteExplorationState = () => state.routeExplorationState;
export const getRouteChoreographyState = () => state.routeChoreographyState;

// ── Trail Depth & Dive Mode ──
export const getTrailDepth = () => state.trailDepth;
export const getSemanticDiveMode = () => state.semanticDiveMode;

// ── Focus Pocket ──
export const getFocusPocketMotionByIndex = () => state.focusPocketMotionByIndex;
export const getFocusPocketTransitionStartedAt = () => state.focusPocketTransitionStartedAt;

// ── Thread Inspector Pointer ──
export const getThreadInspectorPointerInside = () => state.threadInspectorPointerInside;
