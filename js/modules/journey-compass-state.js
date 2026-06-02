import { state } from '../state.js';
import { getInterestingBusinessNote } from './ui-renderers.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import { describeCluster } from './utils/ui-presentation.js';
import { getRouteEmbodimentIndices } from './map-state.js';
import { getNextExploreCandidateForIndex } from './journey-thread-model.js';
import { getNextWalkCandidateForIndex } from './journey-lifecycle-adapter.js';

export function getFocusedJourneyPoint() {
    if (state.selectedPoint) return state.selectedPoint;
    if (Number.isFinite(state.focusedNode) && state.points) return state.points[state.focusedNode] || null;
    if (Number.isFinite(state.navState?.focusedIndex) && state.points) return state.points[state.navState.focusedIndex] || null;
    return null;
}

export function getJourneyCompassState() {
    const searchContainer = document.querySelector('.search-container');
    const cueBeat = searchContainer?.dataset?.trailBeat || 'idle';
    const focusedPoint = getFocusedJourneyPoint();
    const focusedName = focusedPoint ? formatBusinessName(focusedPoint.name || 'this business') : '';
    const queryLabel = state.currentSearchSummary?.query ? `"${state.currentSearchSummary.query}"` : 'semantic search';
    const isSearching = searchContainer?.classList.contains('searching');
    const isFocusing = searchContainer?.classList.contains('focusing') || cueBeat === 'focusing';
    const hasSearch = !!state.currentSearchSummary || isSearching;
    const hasFocus = !!focusedPoint;
    const insideActive = state.semanticDiveMode && state.currentView === 'galaxy' && hasFocus;

    if (state.currentView === 'map') {
        const routeCount = getRouteEmbodimentIndices().length;
        const isCountyMapOverview = !hasFocus && !hasSearch && Number(state.trailDepth || 0) === 0;
        return {
            phase: 'map',
            kicker: routeCount > 1 ? 'Map | Terrain Bridge' : 'Map | Physical Distance',
            title: hasFocus ? `${focusedName} pinned to map` : 'Montgomery County Map',
            note: routeCount > 1
                ? 'The connection trail is now projected onto physical streets. Return to Mycelium to lift back into the living network.'
                : 'This is the geography layer: physical proximity after semantic similarity.',
            primaryAction: { label: 'Return to Mycelium', action: 'open-mycelium' },
            secondaryAction: isCountyMapOverview ? null : { label: 'County Reset', action: 'county-overview' },
            tertiaryAction: { label: 'Search', action: 'focus-search' }
        };
    }

    if (insideActive) {
        const focusIndex = Number.isFinite(state.navState?.focusedIndex)
            ? state.navState.focusedIndex
            : state.focusedNode;
        const nextCandidate = getNextExploreCandidateForIndex(focusIndex, getNextWalkCandidateForIndex, {
            requireSemantic: state.currentView === 'galaxy',
            requireOnCanvas: state.currentView === 'galaxy'
        });
        const nextPoint = nextCandidate ? state.points[nextCandidate.index] : null;
        const clusterName = focusedPoint ? describeCluster(focusedPoint.cluster) : 'Neighborhood';

        return {
            phase: 'inside',
            kicker: `Neighborhood | ${clusterName}`,
            title: focusedName ? `Inside ${focusedName}'s cluster` : 'Inside the local neighborhood',
            note: nextPoint
                ? `Next stop: "${formatBusinessName(nextPoint.name || 'the next linked stop')}".`
                : 'You have explored all immediate connections. Explore the neighbors or return to County View.',
            primaryAction: nextPoint
                ? { label: 'Follow Connection', action: 'next-stop' }
                : { label: 'End of Trail', action: 'show-trail-panel' },
            secondaryAction: { label: 'Map', action: 'open-map' },
            tertiaryAction: { label: 'County View', action: 'county-overview', hint: 'Exit trail' }
        };
    }

    if (hasFocus || isFocusing) {
        const walkHistory = Array.isArray(state.navState?.walkHistoryIndices)
            ? state.navState.walkHistoryIndices
            : (state.navState?.explorationHistoryIndices || []);
        const walkHistoryLength = walkHistory.length;
        const walkDepth = Math.max(0, walkHistory.length - 1);
        const isSearchFocus = !!state.currentSearchSummary && walkDepth === 0;
        const isSearchAnchor = state.currentSearchSummary && Number.isFinite(state.currentSearchSummary.anchorIndex) && state.focusedNode === state.currentSearchSummary.anchorIndex;
        const isTrailStop = walkDepth > 0 || (state.navState?.mode === 'trail' && state.trailDepth >= 1 && !isSearchAnchor);
        const clusterName = focusedPoint ? describeCluster(focusedPoint.cluster) : 'Focus';

        const primaryAction = isSearchAnchor || isTrailStop
            ? { label: 'Map', action: 'open-map' }
            : { label: 'Center on anchor', action: 'center-anchor', hint: 'Return to search starting point' };

        const secondaryAction = isSearchAnchor
            ? { label: 'County', action: 'county-overview' }
            : isTrailStop
                ? { label: 'Center on anchor', action: 'center-anchor', hint: 'Return to search starting point' }
                : { label: 'Map', action: 'open-map' };

        return {
            phase: 'focus',
            kicker: walkHistoryLength > 1
                ? `Trail Step ${walkHistoryLength} | ${clusterName}`
                : (isSearchFocus ? `Search Anchor | ${clusterName}` : `Focus | ${clusterName}`),
            title: focusedName || 'Focus Anchor',
            note: isSearchFocus
                ? 'This is the search corridor, gathered around its strongest semantic anchor.'
                : 'A local constellation of related businesses. Hover any glowing connection to see why it exists.',
            primaryAction: primaryAction,
            secondaryAction: secondaryAction,
            tertiaryAction: { label: 'County View', action: 'county-overview', hint: 'Exit path' }
        };
    }

    if (hasSearch) {
        const summary = state.currentSearchSummary;
        const resultCount = summary?.resultIndices?.length ?? 0;
        const hasNoResults = !isSearching && summary && resultCount === 0;
        return {
            phase: 'search',
            kicker: isSearching ? 'Searching the Field' : `Search | ${queryLabel}`,
            title: isSearching
                ? `Finding ${queryLabel}...`
                : hasNoResults
                    ? `No results for ${queryLabel}`
                    : `${queryLabel} opened a trail`,
            note: isSearching
                ? 'Looking for semantic anchors before gathering the trail around your query.'
                : hasNoResults
                    ? 'Try a broader term or one of the suggested high-signal categories below.'
                    : 'The first strong match is the anchor. Center any record to enter its local neighborhood.',
            primaryAction: Number.isFinite(summary?.anchorIndex)
                ? { label: 'Center on anchor', action: 'center-anchor' }
                : { label: 'Search', action: 'focus-search' },
            secondaryAction: { label: 'Map', action: 'open-map' },
            tertiaryAction: null
        };
    }

    let idleNote = 'Start wide, then search by need or clue to open one trail through the network.';
    let isDiscovery = false;
    const isSemanticDegraded = state.semanticLaneSnapshot?.state === 'degraded';
    if (!isSemanticDegraded && state.points?.length > 0) {
        const randomIdx = Math.floor(Math.random() * state.points.length);
        const randomPoint = state.points[randomIdx];
        const snippet = getInterestingBusinessNote ? getInterestingBusinessNote(randomPoint) : null;
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
        primaryAction: { label: 'Search', action: 'focus-search' },
        secondaryAction: { label: 'Map', action: 'open-map' },
        tertiaryAction: null
    };
}
