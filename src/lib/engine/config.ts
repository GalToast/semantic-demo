import { CLUSTER_COLORS } from '@lib/utils/design-tokens';

export interface ConstellationMotif {
  readonly label: string;
  readonly directLift: number;
  readonly supportLift: number;
  readonly directPriority: number;
  readonly supportPriority: number;
  readonly braid: number;
}

type MotifKey = 'rosette' | 'lattice' | 'delta' | 'market' | 'civic';

type ConstellationMotifs = Record<MotifKey, ConstellationMotif>;

export const FOCUS_CONSTELLATION_MOTIFS: ConstellationMotifs = {
  rosette: {
    label: 'semantic rosette',
    directLift: 0.82,
    supportLift: 0.46,
    directPriority: 0.78,
    supportPriority: 0.36,
    braid: 0.72,
  },
  lattice: {
    label: 'trade lattice',
    directLift: 0.58,
    supportLift: 0.3,
    directPriority: 0.72,
    supportPriority: 0.42,
    braid: 0.5,
  },
  delta: {
    label: 'county delta',
    directLift: 0.7,
    supportLift: 0.38,
    directPriority: 0.74,
    supportPriority: 0.34,
    braid: 0.62,
  },
  market: {
    label: 'market ring',
    directLift: 0.64,
    supportLift: 0.36,
    directPriority: 0.7,
    supportPriority: 0.32,
    braid: 0.58,
  },
  civic: {
    label: 'civic orbit',
    directLift: 0.62,
    supportLift: 0.34,
    directPriority: 0.68,
    supportPriority: 0.3,
    braid: 0.54,
  },
};

export const CONFIG = {
  // ==== CONFIGURATION CONSTANTS ====
  MAP_HANDOFF_PRELUDE_MS: 430,
  VIEW_HANDOFF_OUT_MS: 1200,
  TERRAIN_LANDING_SETTLE_MS: 1200,
  TERRAIN_LANDING_SETTLE_LONG_MS: 1800,
  SHOW_VIEW_HANDOFF_DISMISS_MS: 2200,
  MAP_TRAIL_REFRESH_LATE_DELAY_MS: 100,

  AUTO_ROTATE_IDLE_MS: 3600,
  AUTO_ROTATE_MANUAL_IDLE_MS: 5200,
  AUTO_ROTATE_SOFT_RESUME_MS: 1800,
  AUTO_ROTATE_BASE_SPEED: 0.34,

  MOBILE_ROUTE_FIELD_PEEK_MS: 1550,
  SELECTED_CARD_FADE_MS: 180,

  ORBIT_MIN_DISTANCE_DEFAULT: 0.5,
  ORBIT_MIN_DISTANCE_INSIDE: 0.24,
  ORBIT_MAX_DISTANCE_DEFAULT: 5.5,
  ORBIT_MAX_DISTANCE_FREE: 6.8,
  ORBIT_ROTATE_SPEED_DEFAULT: 0.6,
  ORBIT_ROTATE_SPEED_FREE: 0.82,
  ORBIT_PAN_SPEED_DEFAULT: 0.5,
  ORBIT_PAN_SPEED_FREE: 0.68,

  SEARCH_TRAIL_CUE_MIN_DWELL_MS: 920,

  JOURNEY_COMPASS_PHASE_ORDER: ['overview', 'search', 'focus', 'inside', 'map'] as const,

  FOCUS_CONSTELLATION_MOTIFS,

  SCENE_REVEAL_DURATION_MS: 1650,
  LOADING_MIN_VISIBLE_MS: 1320,

  POINTS_MATERIAL_BASE_SIZE: 0.026,
  POINTS_MATERIAL_BASE_OPACITY: 1.0,
  FOCUS_THREAD_SEGMENTS: 16,

  HOVER_LOCK_CONFIRM_MS: 80,
  HOVER_SAMPLE_MS: 24,

  LEAFLET_CSS_URL: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  LEAFLET_JS_URL: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',

  // ==== COLORS / CLUSTER NAMES ====
  COLORS: CLUSTER_COLORS,

  // ==== LOADING PHASE META ====
  // Per-phase metadata shown in the loading-overlay chrome. Migrated from
  // the legacy js/state.LOADING_PHASE_META (now retired by W13-T4). The
  // private COPY in src/lib/ui/loading.ts is kept for backwards-compat
  // reads inside the loading module; new code should import CONFIG.
  LOADING_PHASE_META: {
    records: { progress: 0.2, note: 'Gathering records...', foot: 'County records are arriving first.' },
    scene: { progress: 0.48, note: 'Raising the cloud...', foot: 'Shaping the scene.' },
    restore: { progress: 0.76, note: 'Restoring view...', foot: 'Restoring last known path.' },
    launch: { progress: 1, note: 'Awake.', foot: 'Threads are live.' },
  } as const,

  CLUSTER_NAMES: [
    'General Business',
    'Professional Services',
    'Food & Hospitality',
    'Construction & Trades',
    'Retail & Shops',
    'Beauty & Wellness',
    'Real Estate & Property',
    'Industrial & Logistics',
    'Agriculture & Ranching',
    'Automotive',
    'Healthcare & Medical',
    'Therapy & Counseling',
    'Education & Childcare',
    'Churches',
    'Faith Ministries',
    'Community Nonprofits',
    'Foundations',
    'Arts & Culture',
    'Economic Development',
    'Public Agencies',
    'Enterprise Brands',
  ] as const,
} as const;
