/**
 * journey-compass-state.ts
 *
 * TypeScript shadow of journey-compass-state.js
 * Journey compass state machine and action synthesis.
 */

import {
    getSelectedPoint, getFocusedNode, getPoints,
    getNavState, getCurrentView, getSemanticDiveMode,
    getCurrentSearchSummary, getTrailDepth, getSemanticTrailCue,
    getSemanticLaneSnapshot, getCurrentEmptyQuery
} from '../state/selectors/index.js';
import { getInterestingBusinessNote } from './journey-lifecycle-adapter.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';
import { getNextExploreCandidateForIndex } from './journey-thread-model.js';
import { getNextWalkCandidateForIndex } from './journey-lifecycle-adapter.js';
import { seededUnit } from './utils/seeded-random.js';
import type { Point } from '../../types/state';

let routeEmbodimentReader: () => any[] = () => [];

// Idle-note cache: prevents non-deterministic flicker when getJourneyCompassState()
// is called repeatedly in the overview phase.  The index is re-seeded only when
// the points array length changes (data mutation) or the cache is cold.
let _cachedIdleIndex = -1;
let _cachedIdlePointsLength = 0;

export function registerRouteEmbodimentReader(fn: () => any[]): void {
    routeEmbodimentReader = fn;
}

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

export function getFocusedJourneyPoint(): Point | null {
    if (getSelectedPoint()) return getSelectedPoint();
    if (Number.isFinite(getFocusedNode()) && getPoints()) return getPoints()[getFocusedNode()!] || null;
    if (Number.isFinite(getNavState()?.focusedIndex) && getPoints()) return getPoints()[getNavState()!.focusedIndex!] || null;
    return null;
}

interface CompassAction {
    label: string;
    action: string;
    hint?: string;
}

interface CompassState {
    phase: string;
    kicker: string;
    title: string;
    note: string;
    primaryAction: CompassAction | null;
    secondaryAction: CompassAction | null;
    tertiaryAction: CompassAction | null;
    discovery?: boolean;
}

export function getJourneyCompassState(): CompassState {
    const cueBeat: string = getSemanticTrailCue() || 'idle';
    const focusedPoint = getFocusedJourneyPoint();
    const focusedName: string = focusedPoint ? formatBusinessName(focusedPoint.name || 'this business') : '';
    const summary = getCurrentSearchSummary() as Record<string, any> | null;
    const queryLabel: string = summary?.query ? `"${summary.query}"` : 'semantic search';
    const isSearching: boolean = cueBeat === 'searching';
    const isFocusing: boolean = cueBeat === 'focusing';
    const hasSearch: boolean = !!summary || isSearching;
    const hasFocus: boolean = !!focusedPoint;
    const insideActive: boolean = !!(getSemanticDiveMode() && getCurrentView() === 'galaxy' && hasFocus);

    if (getCurrentView() === 'map') {
        const routeCount: number = routeEmbodimentReader().length;
        const isCountyMapOverview: boolean = !hasFocus && !hasSearch && Number(getTrailDepth() || 0) === 0;
        return {
            phase: 'map',
            kicker: routeCount > 1 ? 'Map | Terrain Bridge' : 'Map | Physical Distance',
            title: hasFocus ? `${focusedName} pinned to map` : 'Montgomery County Map',
            note: routeCount > 1
                ? 'The connection trail is now projected onto physical streets. Return to Mycelium to lift back into the living network.'
                : 'This is the geography layer: physical proximity after semantic similarity.',
            primaryAction: { label: 'Return to Mycelium', action: JOURNEY_ACTIONS.OPEN_MYCELIUM },
            secondaryAction: isCountyMapOverview ? null : { label: 'County Reset', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW },
            tertiaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH }
        };
    }

    if (insideActive) {
        const focusIndex: number = Number.isFinite(getNavState()?.focusedIndex)
            ? getNavState()!.focusedIndex!
            : getFocusedNode()!;
        const nextCandidate = getNextExploreCandidateForIndex(focusIndex, getNextWalkCandidateForIndex as any);
        const pts = getPoints()!;
        const nextPointCandidate = nextCandidate ? (pts[nextCandidate.index] ?? null) : null;
        const nextPoint = nextPointCandidate as Point | null;
        const clusterName: string = focusedPoint ? describeCluster(focusedPoint.cluster!) : 'Neighborhood';

        return {
            phase: 'inside',
            kicker: `Neighborhood | ${clusterName}`,
            title: '',
            note: nextPoint
                ? `Next stop: "${formatBusinessName(nextPoint.name || 'the next linked stop')}".`
                : 'Pick another match or return to County.',
            primaryAction: nextPoint
                ? { label: 'Follow Connection', action: JOURNEY_ACTIONS.NEXT_STOP }
                : { label: 'End of Trail', action: JOURNEY_ACTIONS.SHOW_TRAIL_PANEL },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: { label: 'County View', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit trail' }
        };
    }

    if (hasFocus || isFocusing) {
        const walkHistory: number[] = Array.isArray(getNavState()?.walkHistoryIndices)
            ? getNavState()!.walkHistoryIndices
            : ((getNavState() as any)?.explorationHistoryIndices || []);
        const walkHistoryLength: number = walkHistory.length;
        const walkDepth: number = Math.max(0, walkHistory.length - 1);
        const isSearchFocus: boolean = !!summary && walkDepth === 0;
        const isSearchAnchor: boolean = !!(summary && Number.isFinite(summary.anchorIndex) && getFocusedNode() === summary.anchorIndex);
        const isTrailStop: boolean = walkDepth > 0 || (getNavState()?.mode === 'trail' && (getTrailDepth() ?? 0) >= 1 && !isSearchAnchor);
        const hasAnchor: boolean = !!summary;
        const clusterName: string = focusedPoint ? describeCluster(focusedPoint.cluster!) : 'Focus';

        let primaryAction: CompassAction | null = null;
        let secondaryAction: CompassAction | null = null;
        let tertiaryAction: CompassAction | null = null;

        if (isSearchAnchor) {
            primaryAction = { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE };
            secondaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
            tertiaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
        } else if (isTrailStop && hasAnchor) {
            primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
            secondaryAction = { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR, hint: 'Return to search starting point' };
            tertiaryAction = { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE };
        } else {
            primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
            secondaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
        }

        return {
            phase: 'focus',
            kicker: walkHistoryLength > 1
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

    if (hasSearch) {
        const resultCount: number = summary?.dedupedResultCount ?? summary?.resultIndices?.length ?? 0;
        const hasNoResults: boolean = !isSearching && !!summary && resultCount === 0;
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
            primaryAction: Number.isFinite(summary?.anchorIndex)
                ? { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR }
                : { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: null
        };
    }

    if (getCurrentEmptyQuery()) {
        const label: string = `"${getCurrentEmptyQuery()}"`;
        return {
            phase: 'search',
            kicker: `Search | ${label}`,
            title: `No results for ${label}`,
            note: 'Try a broader term or one of the suggested high-signal categories below.',
            primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: null
        };
    }

    let idleNote = 'Start wide, then search by need or clue to open one trail through the network.';
    let isDiscovery = false;
    const isSemanticDegraded: boolean = (getSemanticLaneSnapshot() as any)?.state === 'degraded';
    if (!isSemanticDegraded && (getPoints()?.length ?? 0) > 0) {
        // Deterministic idle pick: re-seed only when the points array length
        // changes (data mutation) or the cache is cold.  This prevents the
        // note from flickering on every recomputation while still giving a
        // fresh discovery on data reload.
        const pointsLength = getPoints()!.length;
        if (_cachedIdleIndex < 0 || _cachedIdlePointsLength !== pointsLength) {
            _cachedIdleIndex = Math.floor(seededUnit(pointsLength, 42) * pointsLength);
            _cachedIdlePointsLength = pointsLength;
        }
        const randomPoint = getPoints()![_cachedIdleIndex];
        const snippet: string | null = randomPoint ? getInterestingBusinessNote(randomPoint) : null;
        if (snippet) {
            idleNote = `Discover: ${snippet}`;
            isDiscovery = true;
        }
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
