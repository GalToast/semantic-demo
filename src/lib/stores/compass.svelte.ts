/**
 * @lib/stores/compass.svelte.ts — Journey compass state machine store (Svelte 5 runes)
 *
 * Compass phase state machine (from AGENTS.md):
 *   idle → checking → synthesizing → active
 *                    ↘ interrupted → idle
 *
 * Compass steps are the 5 journey milestones in the rail:
 *   overview → search → focus → inside → map
 *
 * Separated from journey.ts so the compass SM can evolve independently
 * during the Svelte migration.
 */
import { journeyPhase } from './journey.svelte';
import { currentSurface } from './navigation.svelte';
import type { CompassPhase as CompassPhaseType } from '@lib/types/state';

// ── Re-export type ───────────────────────────────────────────────────────────

export type CompassPhase = CompassPhaseType;

// ── Step Types ───────────────────────────────────────────────────────────────

export interface CompassStep {
  /** Phase name: overview | search | focus | inside | map */
  phase: string;
  /** Progress state relative to the current journey phase */
  state: 'done' | 'current' | 'upcoming';
}

// ── Journey Compass Action Types (from journey-compass-state.js) ─────────────

export const JOURNEY_ACTIONS = Object.freeze({
  FOCUS_SEARCH: 'focus-search',
  CENTER_ANCHOR: 'center-anchor',
  ENTER_INSIDE: 'enter-inside',
  SHOW_TRAIL_PANEL: 'show-trail-panel',
  NEXT_STOP: 'next-stop',
  OPEN_MAP: 'open-map',
  OPEN_MYCELIUM: 'open-mycelium',
  COUNTY_OVERVIEW: 'county-overview'
} as const);

export type JourneyAction = (typeof JOURNEY_ACTIONS)[keyof typeof JOURNEY_ACTIONS];

/** A compass action button descriptor. */
export interface CompassAction {
  readonly label: string;
  readonly action: JourneyAction;
  readonly hint?: string;
}

/** The full compass status output for a given state. */
export interface CompassStatus {
  readonly phase: string;
  readonly kicker: string;
  readonly title: string;
  readonly note: string;
  readonly discovery?: boolean;
  readonly primaryAction: CompassAction;
  readonly secondaryAction: CompassAction | null;
  readonly tertiaryAction: CompassAction | null;
}

// ── Compass Step Order (5 milestones) ────────────────────────────────────────

const STEP_ORDER: readonly string[] = ['overview', 'search', 'focus', 'inside', 'map'];

/**
 * Derived rune computing the 5 compass step states from journeyPhase
 * and currentSurface. Each step gets a done/current/upcoming state based
 * on the current journey phase position in the step order.
 */
export function compassSteps(): CompassStep[] {
  const activeIndex = STEP_ORDER.indexOf(journeyPhase());

  return STEP_ORDER.map((phase) => {
    const idx = STEP_ORDER.indexOf(phase);
    let state: 'done' | 'current' | 'upcoming';

    if (phase === journeyPhase()) {
      state = 'current';
    } else if (activeIndex >= 0 && idx >= 0 && idx < activeIndex) {
      state = 'done';
    } else {
      state = 'upcoming';
    }

    return { phase, state };
  });
}

// ── Compass Status Builder (from journey-compass-state.js) ───────────────────

/**
 * Build the full compass status description from current app state.
 *
 * This is a pure function that reads from the stores and produces a
 * CompassStatus object. It replaces getJourneyCompassState() from the
 * legacy journey-compass-state.js.
 *
 * Parameters provide the necessary context — the caller reads from
 * stores and passes values in, keeping this function free of direct
 * store subscriptions.
 */
export function buildCompassStatus(params: {
  currentView: string;
  focusedName: string;
  queryLabel: string;
  isSearching: boolean;
  isFocusing: boolean;
  hasSearch: boolean;
  hasFocus: boolean;
  insideActive: boolean;
  resultCount: number;
  walkDepth: number;
  isSearchFocus: boolean;
  isSearchAnchor: boolean;
  isTrailStop: boolean;
  hasAnchor: boolean;
  clusterName: string;
  routeCount: number;
  nextPointName: string | null;
  idleNote: string;
  isDiscovery: boolean;
  isSemanticDegraded: boolean;
}): CompassStatus {
  const {
    currentView,
    focusedName,
    queryLabel,
    isSearching,
    hasSearch,
    hasFocus,
    insideActive,
    resultCount,
    walkDepth,
    isSearchFocus,
    isSearchAnchor,
    isTrailStop,
    hasAnchor,
    clusterName,
    routeCount,
    nextPointName,
    idleNote,
    isDiscovery
  } = params;

  if (currentView === 'map') {
    return {
      phase: 'map',
      kicker: routeCount > 1 ? 'Map | Terrain Bridge' : 'Map | Physical Distance',
      title: hasFocus ? `${focusedName} pinned to map` : 'Montgomery County Map',
      note: routeCount > 1
        ? 'The connection trail is now projected onto physical streets. Return to Mycelium to lift back into the living network.'
        : 'This is the geography layer: physical proximity after semantic similarity.',
      primaryAction: { label: 'Return to Mycelium', action: JOURNEY_ACTIONS.OPEN_MYCELIUM },
      secondaryAction: !hasFocus && !hasSearch && walkDepth === 0
        ? null
        : { label: 'County Reset', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW },
      tertiaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH }
    };
  }

  if (insideActive) {
    return {
      phase: 'inside',
      kicker: `Neighborhood | ${clusterName}`,
      title: '',
      note: nextPointName
        ? `Next stop: "${nextPointName}".`
        : 'Pick another match or return to County.',
      primaryAction: nextPointName
        ? { label: 'Follow Connection', action: JOURNEY_ACTIONS.NEXT_STOP }
        : { label: 'End of Trail', action: JOURNEY_ACTIONS.SHOW_TRAIL_PANEL },
      secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
      tertiaryAction: { label: 'County View', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit trail' }
    };
  }

  if (hasFocus) {
    let primaryAction: CompassAction;
    let secondaryAction: CompassAction | null;
    let tertiaryAction: CompassAction | null = null;

    if (isSearchAnchor) {
      primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
      secondaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
    } else if (isTrailStop && hasAnchor) {
      primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
      secondaryAction = { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR, hint: 'Return to search starting point' };
      tertiaryAction = { label: 'County View', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit path' };
    } else {
      primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
      secondaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
    }

    return {
      phase: 'focus',
      kicker: walkDepth > 1
        ? `Trail Step ${walkDepth} | ${clusterName}`
        : `Focus | ${clusterName}`,
      title: '',
      note: isSearchFocus
        ? 'The strongest semantic match for this search.'
        : 'A local constellation of related businesses. Hover any glowing connection to see why it exists.',
      primaryAction,
      secondaryAction,
      tertiaryAction
    };
  }

  if (hasSearch) {
    const hasNoResults = !isSearching && resultCount === 0;
    return {
      phase: 'search',
      kicker: isSearching ? 'Searching the Field' : `Search | ${queryLabel}`,
      title: isSearching
        ? `Finding ${queryLabel}...`
        : hasNoResults
          ? `No results for ${queryLabel}`
          : `Found ${resultCount} ${resultCount === 1 ? 'spot' : 'spots'} for ${queryLabel}`,
      note: isSearching
        ? 'Looking for semantic anchors before gathering the trail around your query.'
        : hasNoResults
          ? 'Try a broader term or one of the suggested high-signal categories below.'
          : 'The first strong match is the anchor. Center any record to enter its local neighborhood.',
      primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
      secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
      tertiaryAction: null
    };
  }

  // Idle / overview
  return {
    phase: 'overview',
    kicker: 'Overview | Montgomery County',
    title: 'The MoCo Mycelium',
    note: idleNote,
    discovery: isDiscovery,
    primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
    secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
    tertiaryAction: null
  };
}
