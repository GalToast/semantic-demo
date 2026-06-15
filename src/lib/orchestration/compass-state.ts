/**
 * @lib/orchestration/compass-state.ts
 * 
 * Derive compass phase from journey/search/navigation stores.
 * Replaces js/modules/journey-compass-state.js.
 *
 * Reads from stores (via `get`) and produces a typed CompassStatus
 * describing what the journey compass header should display.
 */
import { navStore } from '@lib/stores/navigation.svelte';
import { searchStore } from '@lib/stores/search.svelte';
import { journeyStore } from '@lib/stores/journey.svelte';
import { focusStore } from '@lib/stores/focus.svelte';
import {
  JOURNEY_ACTIONS,
  type CompassStatus,
  type CompassAction,
  type JourneyAction
} from '@lib/stores/compass.svelte.ts';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompassStateContext {
  phase: string;
  kicker: string;
  title: string;
  note: string;
  discovery?: boolean;
  primaryAction: CompassAction;
  secondaryAction: CompassAction | null;
  tertiaryAction: CompassAction | null;
}

export type { CompassStatus, CompassAction, JourneyAction };

// ── Re-exports ────────────────────────────────────────────────────────────

export { JOURNEY_ACTIONS };

// ── Route Embodiment Reader ───────────────────────────────────────────────

let routeEmbodimentReader: () => readonly number[] = () => [];

/** Register a function that returns the current route embodiment indices. */
export function registerRouteEmbodimentReader(fn: () => readonly number[]): void {
  routeEmbodimentReader = fn;
}

// ── Focused Journey Point ─────────────────────────────────────────────────

/** Get the currently focused business point from store state. */
export function getFocusedJourneyPoint(): Record<string, unknown> | null {
  const $nav = navStore();
  const $focus = focusStore();

  // Prefer selected business from the focus store
  if ($focus.selectedBusiness) {
    return $focus.selectedBusiness as unknown as Record<string, unknown>;
  }

  // Fall back to focused index from nav store
  if (Number.isFinite($nav.focusedIndex) && $nav.focusedIndex !== null) {
    // The actual point data lives in the legacy engine; we return a
    // minimal stub. Callers that need the full point should use the
    // engine bridge.
    return { index: $nav.focusedIndex } as unknown as Record<string, unknown>;
  }

  return null;
}

// ── Compass State Derivation ──────────────────────────────────────────────

/**
 * Derive the full compass state from current store values.
 *
 * This is the typed Svelte-store port of getJourneyCompassState() from
 * journey-compass-state.js. It reads all stores via `get()` and produces
 * a CompassStateContext describing what the compass header should show.
 */
export function getJourneyCompassState(): CompassStateContext {
  const $nav = navStore();
  const $search = searchStore();
  const $journey = journeyStore();
  const $focus = focusStore();

  const cueBeat = $search.trailCue || 'idle';
  const focusedPoint = getFocusedJourneyPoint();
  const focusedName = focusedPoint
    ? formatBusinessName((focusedPoint.name as string) || 'this business')
    : '';
  const summary = $search.summary;
  const queryLabel = summary?.query ? `"${summary.query}"` : 'semantic search';
  const isSearchingState = cueBeat === 'searching';
  const isFocusing = cueBeat === 'focusing';
  const hasSearch = !!summary || isSearchingState;
  const hasFocus = !!focusedPoint;
  const insideActive = $focus.semanticDiveMode && $nav.currentView === 'galaxy' && hasFocus;
  const currentTrailDepth = $journey.depth ?? 0;
  const walkHistory = Array.isArray($nav.walkHistoryIndices)
    ? $nav.walkHistoryIndices
    : [];

  // ── Map Phase ────────────────────────────────────────────────────────────

  if ($nav.currentView === 'map') {
    const routeCount = routeEmbodimentReader().length;
    const isCountyMapOverview = !hasFocus && !hasSearch && Number(currentTrailDepth || 0) === 0;

    return {
      phase: 'map',
      kicker: routeCount > 1 ? 'Map | Terrain Bridge' : 'Map | Physical Distance',
      title: hasFocus ? `${focusedName} pinned to map` : 'Montgomery County Map',
      note: routeCount > 1
        ? 'The connection trail is now projected onto physical streets. Return to Mycelium to lift back into the living network.'
        : 'This is the geography layer: physical proximity after semantic similarity.',
      primaryAction: { label: 'Return to Mycelium', action: JOURNEY_ACTIONS.OPEN_MYCELIUM },
      secondaryAction: isCountyMapOverview
        ? null
        : { label: 'County Reset', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW },
      tertiaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH }
    };
  }

  // ── Inside Phase ──────────────────────────────────────────────────────────

  if (insideActive) {
    const clusterName = focusedPoint
      ? describeCluster(focusedPoint.cluster as string)
      : 'Neighborhood';
    const nextPointName: string | null = null; // resolved by engine bridge in legacy

    return {
      phase: 'inside',
      kicker: `Neighborhood | ${clusterName}`,
      title: '',
      note: nextPointName
        ? `Next stop: "${formatBusinessName(nextPointName)}".`
        : 'Pick another match or return to County.',
      primaryAction: nextPointName
        ? { label: 'Follow Connection', action: JOURNEY_ACTIONS.NEXT_STOP }
        : { label: 'End of Trail', action: JOURNEY_ACTIONS.SHOW_TRAIL_PANEL },
      secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
      tertiaryAction: { label: 'County View', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit trail' }
    };
  }

  // ── Focus Phase ───────────────────────────────────────────────────────────

  if (hasFocus || isFocusing) {
    const walkHistoryLength = walkHistory.length;
    const walkDepth = Math.max(0, walkHistory.length - 1);
    const isSearchFocus = !!summary && walkDepth === 0;
    const isSearchAnchor =
      summary &&
      Number.isFinite(summary.anchorIndex) &&
      $nav.focusedIndex === summary.anchorIndex;
    const isTrailStop =
      walkDepth > 0 ||
      ($nav.mode === 'trail' && currentTrailDepth >= 1 && !isSearchAnchor);
    const hasAnchor = !!summary;
    const clusterName = focusedPoint
      ? describeCluster(focusedPoint.cluster as string)
      : 'Focus';

    let primaryAction: CompassAction;
    let secondaryAction: CompassAction | null;
    let tertiaryAction: CompassAction | null = null;

    if (isSearchAnchor) {
      primaryAction = { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE };
      secondaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
      tertiaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
    } else if (isTrailStop) {
      primaryAction = {
        label: 'Step Inside',
        action: JOURNEY_ACTIONS.ENTER_INSIDE
      };
      secondaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
      tertiaryAction = hasAnchor
        ? {
            label: 'Center on anchor',
            action: JOURNEY_ACTIONS.CENTER_ANCHOR,
            hint: 'Return to search starting point'
          }
        : { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
    } else {
      primaryAction = { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE };
      secondaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
      tertiaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
    }

    return {
      phase: 'focus',
      kicker:
        walkHistoryLength > 1
          ? `Trail Step ${walkHistoryLength} | ${clusterName}`
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

  // ── Search Phase ──────────────────────────────────────────────────────────

  if (hasSearch) {
    const resultCount =
      summary?.resultCount ?? summary?.resultIndices?.length ?? 0;
    const hasNoResults = !isSearchingState && summary && resultCount === 0;

    return {
      phase: 'search',
      kicker: isSearchingState ? 'Searching the Field' : `Search | ${queryLabel}`,
      title: isSearchingState
        ? `Finding ${queryLabel}...`
        : hasNoResults
          ? `No results for ${queryLabel}`
          : `Found ${resultCount} ${resultCount === 1 ? 'spot' : 'spots'} for ${queryLabel}`,
      note: isSearchingState
        ? 'Looking for semantic anchors before gathering the trail around your query.'
        : hasNoResults
          ? 'Try a broader term or one of the suggested high-signal categories below.'
          : 'The first strong match is the anchor. Center any record to enter its local neighborhood.',
      primaryAction: Number.isFinite(summary?.anchorIndex)
        ? { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR }
        : { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
      secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
      tertiaryAction: null
    };
  }

  // ── Empty Query ───────────────────────────────────────────────────────────

  const currentQuery = $search.query;
  if (currentQuery === '') {
    // Overview case handled below
  } else {
    // No results case handled above in hasSearch if summary exists
  }

  // ── Overview (Idle) ───────────────────────────────────────────────────────

  let idleNote = 'Start wide, then search by need or clue to open one trail through the network.';
  let isDiscovery = false;

  // In legacy, a random business snippet was shown; we stub the discovery
  // note for now — the engine bridge can populate it via the route reader.
  if (!isDiscovery) {
    // No degraded check needed in pure store land.
  }

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

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format a business name for display (capitalize first letter of each word). */
function formatBusinessName(name: string): string {
  if (!name) return '';
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Describe a cluster name for the compass kicker. */
function describeCluster(cluster: string | undefined): string {
  if (!cluster) return 'Neighborhood';
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}
