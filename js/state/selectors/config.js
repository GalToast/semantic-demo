// js/state/selectors/config.js
// Read-only selectors for URL constants, timing constants, color/cluster config.
import { state } from '../../state.js';

// ── Timing Constants ──
export const getMapHandoffPreludeMs = () => state.MAP_HANDOFF_PRELUDE_MS;
export const getViewHandoffOutMs = () => state.VIEW_HANDOFF_OUT_MS;
export const getTerrainLandingSettleMs = () => state.TERRAIN_LANDING_SETTLE_MS;
export const getTerrainLandingSettleLongMs = () => state.TERRAIN_LANDING_SETTLE_LONG_MS;
export const getShowViewHandoffDismissMs = () => state.SHOW_VIEW_HANDOFF_DISMISS_MS;
export const getMapTrailRefreshLateDelayMs = () => state.MAP_TRAIL_REFRESH_LATE_DELAY_MS;
export const getAutoRotateIdleMs = () => state.AUTO_ROTATE_IDLE_MS;
export const getAutoRotateManualIdleMs = () => state.AUTO_ROTATE_MANUAL_IDLE_MS;
export const getAutoRotateSoftResumeMs = () => state.AUTO_ROTATE_SOFT_RESUME_MS;
export const getAutoRotateBaseSpeed = () => state.AUTO_ROTATE_BASE_SPEED;
export const getMobileRouteFieldPeekMs = () => state.MOBILE_ROUTE_FIELD_PEEK_MS;
export const getSelectedCardFadeMs = () => state.SELECTED_CARD_FADE_MS;
export const getSearchTrailCueMinDwellMs = () => state.SEARCH_TRAIL_CUE_MIN_DWELL_MS;
export const getSceneRevealDurationMs = () => state.SCENE_REVEAL_DURATION_MS;
export const getLoadingMinVisibleMs = () => state.LOADING_MIN_VISIBLE_MS;
export const getHoverLockConfirmMs = () => state.HOVER_LOCK_CONFIRM_MS;
export const getHoverSampleMs = () => state.HOVER_SAMPLE_MS;

// ── Orbit Constants ──
export const getOrbitMinDistanceDefault = () => state.ORBIT_MIN_DISTANCE_DEFAULT;
export const getOrbitMinDistanceInside = () => state.ORBIT_MIN_DISTANCE_INSIDE;
export const getOrbitMaxDistanceDefault = () => state.ORBIT_MAX_DISTANCE_DEFAULT;
export const getOrbitMaxDistanceFree = () => state.ORBIT_MAX_DISTANCE_FREE;
export const getOrbitRotateSpeedDefault = () => state.ORBIT_ROTATE_SPEED_DEFAULT;
export const getOrbitRotateSpeedFree = () => state.ORBIT_ROTATE_SPEED_FREE;
export const getOrbitPanSpeedDefault = () => state.ORBIT_PAN_SPEED_DEFAULT;
export const getOrbitPanSpeedFree = () => state.ORBIT_PAN_SPEED_FREE;

// ── Material Constants ──
export const getPointsMaterialBaseSize = () => state.POINTS_MATERIAL_BASE_SIZE;
export const getPointsMaterialBaseOpacity = () => state.POINTS_MATERIAL_BASE_OPACITY;
export const getFocusThreadSegments = () => state.FOCUS_THREAD_SEGMENTS;

// ── URLs ──
export const getLeafletCssUrl = () => state.LEAFLET_CSS_URL;
export const getLeafletJsUrl = () => state.LEAFLET_JS_URL;

// ── Colors / Clusters ──
export const getColors = () => state.COLORS;
export const getClusterNames = () => state.CLUSTER_NAMES;

// ── Loading Phase Meta ──
export const getLoadingPhaseMeta = () => state.LOADING_PHASE_META;

// ── Compass / Constellation ──
export const getJourneyCompassPhaseOrder = () => state.JOURNEY_COMPASS_PHASE_ORDER;
export const getFocusConstellationMotifs = () => state.FOCUS_CONSTELLATION_MOTIFS;

// ── Mode / Story Descriptions ──
export const getModeDescriptions = () => state.MODE_DESCRIPTIONS;
export const getStoryDescriptions = () => state.STORY_DESCRIPTIONS;
