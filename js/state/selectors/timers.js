// js/state/selectors/timers.js
// Read-only selectors for timer IDs stored on state.
// Writes to these keys remain direct state.X = ... mutations.
import { state } from '../../state.js';

// ── Auto-Rotate Timers ──
export const getAutoRotateResumeTimer = () => state.autoRotateResumeTimer;
export const getAutoRotateResumeDueAt = () => state.autoRotateResumeDueAt;
export const getAutoRotateSoftResumeStartedAt = () => state.autoRotateSoftResumeStartedAt;

// ── View Handoff Timers ──
export const getViewHandoffTimer = () => state.viewHandoffTimer;
export const getViewSwitchPreludeTimer = () => state.viewSwitchPreludeTimer;
export const getTerrainHandoffTimer = () => state.terrainHandoffTimer;

// ── Semantic Lane Timers ──
export const getSemanticLaneMonitorTimer = () => state.semanticLaneMonitorTimer;
export const getSemanticLaneOpsRefreshTimer = () => state.semanticLaneOpsRefreshTimer;

// ── Semantic Threads Timer ──
export const getSemanticThreadsRetryTimer = () => state.semanticThreadsRetryTimer;

// ── Compact Search Reveal Timers ──
export const getCompactSearchRevealTimers = () => state.compactSearchRevealTimers;

// ── Mobile Route Field Peek Timer ──
export const getMobileRouteFieldPeekTimer = () => state.mobileRouteFieldPeekTimer;

// ── Canvas Timers ──
export const getCanvasThreadInspectionClearTimer = () => state.canvasThreadInspectionClearTimer;
export const getCanvasFieldHoverClearTimer = () => state.canvasFieldHoverClearTimer;

// ── Focus Transition Timer ──
export const getFocusTransitionSettleTimer = () => state.focusTransitionSettleTimer;

// ── Experience Reset Toast Timer ──
export const getExperienceResetToastTimer = () => state.experienceResetToastTimer;

// ── Clock Timer ──
export const getClockTimer = () => state.clockTimer;

// ── Search Timers ──
export const getSearchTimeout = () => state.searchTimeout;
export const getSearchPreviewHoverTimer = () => state.searchPreviewHoverTimer;
export const getSearchVectorScrambleTimer = () => state.searchVectorScrambleTimer;

// ── Focus Pocket Animation Frame ──
export const getFocusPocketAnimationFrameId = () => state.focusPocketAnimationFrameId;
