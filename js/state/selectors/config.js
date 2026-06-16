// js/state/selectors/config.js
// Read-only selectors for URL constants, timing constants, color/cluster config.
//
// W13-T4 (2026-06-15): Ported static config selectors from the legacy state
// singleton to the typed CONFIG module in @lib/engine/config (which also
// holds FOCUS_CONSTELLATION_MOTIFS, COLORS, CLUSTER_NAMES, etc.). The legacy
// `state.X` for these constants was already being read from a frozen static
// shape that the parallel session migrated to CONFIG; this commit moves the
// selectors off `state` to that canonical module.
//
// The dynamic state (subject to runtime mutation) continues to live in the
// renderer.js module — Three.js object refs (state.scene, state.camera, etc.)
// and runtime-mutated flags (autoRotateSuspended, etc.). T4 phase 4b will
// address those with lifecycle-aware bridge exports.
//
// Module-level constants like MODE_DESCRIPTIONS and STORY_DESCRIPTIONS live in
// @lib/stores/lifecycle (module-private there, re-exported as needed).
import { CONFIG } from '@lib/engine/config';
import { MODE_DESCRIPTIONS, STORY_DESCRIPTIONS } from '@lib/stores/lifecycle';

// ── Timing Constants ──
export const getMapHandoffPreludeMs = () => CONFIG.MAP_HANDOFF_PRELUDE_MS;
export const getViewHandoffOutMs = () => CONFIG.VIEW_HANDOFF_OUT_MS;
export const getTerrainLandingSettleMs = () => CONFIG.TERRAIN_LANDING_SETTLE_MS;
export const getTerrainLandingSettleLongMs = () => CONFIG.TERRAIN_LANDING_SETTLE_LONG_MS;
export const getShowViewHandoffDismissMs = () => CONFIG.SHOW_VIEW_HANDOFF_DISMISS_MS;
export const getMapTrailRefreshLateDelayMs = () => CONFIG.MAP_TRAIL_REFRESH_LATE_DELAY_MS;
export const getAutoRotateIdleMs = () => CONFIG.AUTO_ROTATE_IDLE_MS;
export const getAutoRotateManualIdleMs = () => CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS;
export const getAutoRotateSoftResumeMs = () => CONFIG.AUTO_ROTATE_SOFT_RESUME_MS;
export const getAutoRotateBaseSpeed = () => CONFIG.AUTO_ROTATE_BASE_SPEED;
export const getMobileRouteFieldPeekMs = () => CONFIG.MOBILE_ROUTE_FIELD_PEEK_MS;
export const getSelectedCardFadeMs = () => CONFIG.SELECTED_CARD_FADE_MS;
export const getSearchTrailCueMinDwellMs = () => CONFIG.SEARCH_TRAIL_CUE_MIN_DWELL_MS;
export const getSceneRevealDurationMs = () => CONFIG.SCENE_REVEAL_DURATION_MS;
export const getLoadingMinVisibleMs = () => CONFIG.LOADING_MIN_VISIBLE_MS;
export const getHoverLockConfirmMs = () => CONFIG.HOVER_LOCK_CONFIRM_MS;
export const getHoverSampleMs = () => CONFIG.HOVER_SAMPLE_MS;

// ── Orbit Constants ──
export const getOrbitMinDistanceDefault = () => CONFIG.ORBIT_MIN_DISTANCE_DEFAULT;
export const getOrbitMinDistanceInside = () => CONFIG.ORBIT_MIN_DISTANCE_INSIDE;
export const getOrbitMaxDistanceDefault = () => CONFIG.ORBIT_MAX_DISTANCE_DEFAULT;
export const getOrbitMaxDistanceFree = () => CONFIG.ORBIT_MAX_DISTANCE_FREE;
export const getOrbitRotateSpeedDefault = () => CONFIG.ORBIT_ROTATE_SPEED_DEFAULT;
export const getOrbitRotateSpeedFree = () => CONFIG.ORBIT_ROTATE_SPEED_FREE;
export const getOrbitPanSpeedDefault = () => CONFIG.ORBIT_PAN_SPEED_DEFAULT;
export const getOrbitPanSpeedFree = () => CONFIG.ORBIT_PAN_SPEED_FREE;

// ── Material Constants ──
export const getPointsMaterialBaseSize = () => CONFIG.POINTS_MATERIAL_BASE_SIZE;
export const getPointsMaterialBaseOpacity = () => CONFIG.POINTS_MATERIAL_BASE_OPACITY;
export const getFocusThreadSegments = () => CONFIG.FOCUS_THREAD_SEGMENTS;

// ── URLs ──
export const getLeafletCssUrl = () => CONFIG.LEAFLET_CSS_URL;
export const getLeafletJsUrl = () => CONFIG.LEAFLET_JS_URL;

// ── Colors / Clusters ──
export const getColors = () => CONFIG.COLORS;
export const getClusterNames = () => CONFIG.CLUSTER_NAMES;

// ── Loading Phase Meta ──
export const getLoadingPhaseMeta = () => CONFIG.LOADING_PHASE_META;

// ── Compass / Constellation ──
export const getJourneyCompassPhaseOrder = () => CONFIG.JOURNEY_COMPASS_PHASE_ORDER;
export const getFocusConstellationMotifs = () => CONFIG.FOCUS_CONSTELLATION_MOTIFS;

// ── Mode / Story Descriptions ──
export const getModeDescriptions = () => MODE_DESCRIPTIONS;
export const getStoryDescriptions = () => STORY_DESCRIPTIONS;
