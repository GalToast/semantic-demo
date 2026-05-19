import { state } from '../state.js';
import { formatBusinessName, describeCluster } from '../utils.js';

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
        const routeCount = typeof window.getRouteEmbodimentIndices === 'function' ? window.getRouteEmbodimentIndices().length : 0;
        return {
            phase: 'map',
            kicker: routeCount > 1 ? 'Map | Terrain Bridge' : 'Map | Physical Distance',
            title: hasFocus ? `${focusedName} pinned to map` : 'Montgomery County Map',
            note: routeCount > 1
                ? 'The connection trail is now projected onto physical streets. Return to Mycelium to lift back into the living network.'
                : 'This is the geography layer: physical proximity after semantic similarity.',
            primaryAction: { label: 'Return to Mycelium', action: 'open-mycelium' },
            secondaryAction: { label: 'County Reset', action: 'county-overview' },
            tertiaryAction: { label: 'Search Field', action: 'focus-search' }
        };
    }

    if (insideActive) {
        const focusIndex = window.getCurrentTrailFocusIndex ? window.getCurrentTrailFocusIndex() : state.navState?.focusedIndex;
        const nextCandidate = window.getNextExploreCandidateForIndex ? window.getNextExploreCandidateForIndex(focusIndex) : null;
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
            secondaryAction: { label: 'Map Layer', action: 'open-map' },
            tertiaryAction: { label: 'County View', action: 'county-overview', hint: 'Exit trail' }
        };
    }

    if (hasFocus || isFocusing) {
        const walkHistoryLength = (state.navState?.explorationHistoryIndices || []).length;
        const walkDepth = Math.max(0, (state.navState?.explorationHistoryIndices || []).length - 1);
        const isSearchFocus = !!state.currentSearchSummary && walkDepth === 0;
        const isSearchAnchor = state.currentSearchSummary && Number.isFinite(state.currentSearchSummary.anchorIndex) && state.focusedNode === state.currentSearchSummary.anchorIndex;
        const clusterName = focusedPoint ? describeCluster(focusedPoint.cluster) : 'Focus';

        const primaryAction = isSearchAnchor
            ? { label: 'Step Inside', action: 'enter-inside' }
            : { label: 'Center Anchor', action: 'center-anchor', hint: 'Return to search starting point' };

        const secondaryAction = isSearchAnchor
            ? { label: 'Map Layer', action: 'open-map' }
            : { label: 'Step Inside', action: 'enter-inside' };

        return {
            phase: 'focus',
            kicker: walkHistoryLength > 1
                ? `Trail Step ${walkHistoryLength} | ${clusterName}`
                : (isSearchFocus ? `Search Anchor | ${clusterName}` : `Focus | ${clusterName}`),
            title: isSearchFocus && focusedName
                ? `${focusedName} anchors ${queryLabel}`
                : (focusedName ? `${focusedName} is centered` : 'Centering the focus anchor'),
            note: isSearchFocus
                ? 'This is the search corridor, gathered around its strongest semantic anchor.'
                : 'A local constellation of related businesses. Hover any glowing connection to see why it exists.',
            primaryAction: primaryAction,
            secondaryAction: secondaryAction,
            tertiaryAction: { label: 'County View', action: 'county-overview', hint: 'Exit path' }
        };
    }

    if (hasSearch) {
        return {
            phase: 'search',
            kicker: isSearching ? 'Searching the Field' : `Search | ${queryLabel}`,
            title: isSearching ? `Finding ${queryLabel}...` : `${queryLabel} opened a trail`,
            note: state.currentSearchSummary
                ? 'The first strong match is the anchor. Center any record to enter its local neighborhood.'
                : 'Looking for semantic anchors before gathering the trail around your query.',
            primaryAction: Number.isFinite(state.currentSearchSummary?.anchorIndex)
                ? { label: 'Center Anchor', action: 'center-anchor' }
                : { label: 'Search Field', action: 'focus-search' },
            secondaryAction: { label: 'Map Layer', action: 'open-map' },
            tertiaryAction: null
        };
    }

    let idleNote = 'Start wide, then search by need or clue to open one trail through the network.';
    let isDiscovery = false;
    const isSemanticDegraded = state.semanticLaneSnapshot?.state === 'degraded';
    if (!isSemanticDegraded && state.points?.length > 0) {
        const randomIdx = Math.floor(Math.random() * state.points.length);
        const randomPoint = state.points[randomIdx];
        const snippet = typeof window.getInterestingBusinessNote === 'function' ? window.getInterestingBusinessNote(randomPoint) : null;
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
        primaryAction: { label: 'Search Field', action: 'focus-search' },
        secondaryAction: { label: 'Map Layer', action: 'open-map' },
        tertiaryAction: null
    };
}
