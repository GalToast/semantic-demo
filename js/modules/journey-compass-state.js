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

let routeEmbodimentReader = () => [];

export function registerRouteEmbodimentReader(fn) {
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
});

export function getFocusedJourneyPoint() {
    if (getSelectedPoint()) return getSelectedPoint();
    if (Number.isFinite(getFocusedNode()) && getPoints()) return getPoints()[getFocusedNode()] || null;
    if (Number.isFinite(getNavState()?.focusedIndex) && getPoints()) return getPoints()[getNavState().focusedIndex] || null;
    return null;
}

export function getJourneyCompassState() {
    const cueBeat = getSemanticTrailCue() || 'idle';
    const focusedPoint = getFocusedJourneyPoint();
    const focusedName = focusedPoint ? formatBusinessName(focusedPoint.name || 'this business') : '';
    const summary = getCurrentSearchSummary();
    const queryLabel = summary?.query ? `"${summary.query}"` : 'semantic search';
    const isSearching = cueBeat === 'searching';
    const isFocusing = cueBeat === 'focusing';
    const hasSearch = !!summary || isSearching;
    const hasFocus = !!focusedPoint;
    const insideActive = getSemanticDiveMode() && getCurrentView() === 'galaxy' && hasFocus;

    if (getCurrentView() === 'map') {
        const routeCount = routeEmbodimentReader().length;
        const isCountyMapOverview = !hasFocus && !hasSearch && Number(getTrailDepth() || 0) === 0;
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
        const focusIndex = Number.isFinite(getNavState()?.focusedIndex)
            ? getNavState().focusedIndex
            : getFocusedNode();
        const nextCandidate = getNextExploreCandidateForIndex(focusIndex, getNextWalkCandidateForIndex);
        const nextPoint = nextCandidate ? getPoints()[nextCandidate.index] : null;
        const clusterName = focusedPoint ? describeCluster(focusedPoint.cluster) : 'Neighborhood';

        return {
            phase: 'inside',
            kicker: `Neighborhood | ${clusterName}`,
            // The right focus panel already shows the business name prominently;
            // leave the top header title empty so the journey status isn't a
            // duplicate of the panel content.
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
        const walkHistory = Array.isArray(getNavState()?.walkHistoryIndices)
            ? getNavState().walkHistoryIndices
            : (getNavState()?.explorationHistoryIndices || []);
        const walkHistoryLength = walkHistory.length;
        const walkDepth = Math.max(0, walkHistory.length - 1);
        const isSearchFocus = !!summary && walkDepth === 0;
        const isSearchAnchor = summary && Number.isFinite(summary.anchorIndex) && getFocusedNode() === summary.anchorIndex;
        const isTrailStop = walkDepth > 0 || (getNavState()?.mode === 'trail' && getTrailDepth() >= 1 && !isSearchAnchor);
        const hasAnchor = !!summary;
        const clusterName = focusedPoint ? describeCluster(focusedPoint.cluster) : 'Focus';

        let primaryAction, secondaryAction, tertiaryAction = null;

        if (isSearchAnchor) {
            primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
            secondaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
        } else if (isTrailStop && hasAnchor) {
            primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
            secondaryAction = { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR, hint: 'Return to search starting point' };
            tertiaryAction = { label: 'County View', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit path' };
        } else {
            // General focus (not from search or no anchor)
            primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP };
            secondaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW };
        }

        return {
            phase: 'focus',
            kicker: walkHistoryLength > 1
                ? `Trail Step ${walkHistoryLength} | ${clusterName}`
                : `Focus | ${clusterName}`,
            // The right focus panel shows the business name prominently;
            // leave the top header title empty so the journey status isn't a duplicate.
            title: '',
            note: isSearchFocus
                ? 'The strongest semantic match for this search.'
                : 'A local constellation of related businesses. Hover any glowing connection to see why it exists.',
            primaryAction: primaryAction,
            secondaryAction: secondaryAction,
            tertiaryAction: tertiaryAction
        };
    }

    if (hasSearch) {
        // Prefer the post-dedup count (what the user actually sees in the
        // result list) over the pre-dedup resultIndices array (used for
        // search-glow effects on the mycelium).
        const resultCount = summary?.dedupedResultCount ?? summary?.resultIndices?.length ?? 0;
        const hasNoResults = !isSearching && summary && resultCount === 0;
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

    // Empty search (no results, no active summary) — surface the empty state in the header too
    if (getCurrentEmptyQuery()) {
        const label = `"${getCurrentEmptyQuery()}"`;
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
    const isSemanticDegraded = getSemanticLaneSnapshot()?.state === 'degraded';
    if (!isSemanticDegraded && getPoints()?.length > 0) {
        const randomIdx = Math.floor(Math.random() * getPoints().length);
        const randomPoint = getPoints()[randomIdx];
        const snippet = getInterestingBusinessNote(randomPoint);
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
