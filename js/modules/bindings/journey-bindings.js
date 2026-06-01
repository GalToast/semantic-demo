import { state } from '../../state.js';
import { bindClick } from './view-bindings.js';
import { executeJourneyCompassAction } from '../journey-compass-controller.js';
import { traverseNeighbor, setSemanticDiveMode, pinThreadNeighbor, unpinThreadInspection, walkThreadNeighbor } from '../journey.js';
import { applyLocalNeighborhoodFocus } from '../focus-pocket.js';
import { animateCameraToNode } from '../camera-controls.js';
import { resetExplorationFocus, exploreInsideToNextStop, clearClusterFilter } from '../lifecycle.js';
import { showExperienceToast } from '../ui-feedback.js';

export function expandNeighborhoodFromCurrentNode() {
    const index = state.focusedNode;
    if (!Number.isFinite(index)) return;
    applyLocalNeighborhoodFocus(index);
}

export function recenterFocusedNode() {
    const index = state.focusedNode;
    if (!Number.isFinite(index)) return;
    animateCameraToNode(index, { transitionStyle: 'focus' });
}

export function returnToCountyView() {
    resetExplorationFocus();
}

export function bindFocusControls() {
    const runJourneyCompassAction = (action) => {
        if (action) {
            executeJourneyCompassAction(action);
        }
    };

    bindClick('btn-focus-prev', () => { traverseNeighbor(-1); });
    bindClick('btn-focus-next', () => { traverseNeighbor(1); });
    bindClick('btn-focus-overview', () => { resetExplorationFocus(); });
    bindClick('btn-focus-center', () => { recenterFocusedNode(); });
    bindClick('btn-focus-expand', () => { expandNeighborhoodFromCurrentNode(); });
    bindClick('btn-focus-dive', () => { setSemanticDiveMode(!state.semanticDiveMode); });
    bindClick('btn-inside-next', () => { if (typeof exploreInsideToNextStop === 'function') exploreInsideToNextStop(); }, { optional: true });
    bindClick('btn-inside-map', () => { runJourneyCompassAction('open-map'); }, { optional: true });
    bindClick('btn-inside-county', () => { if (typeof returnToCountyView === 'function') returnToCountyView(); }, { optional: true });
    bindClick('btn-journey-primary', (event) =>
        runJourneyCompassAction(event.currentTarget.dataset.journeyAction));
    bindClick('btn-journey-secondary', (event) =>
        runJourneyCompassAction(event.currentTarget.dataset.journeyAction));
    bindClick('btn-journey-tertiary', (event) =>
        runJourneyCompassAction(event.currentTarget.dataset.journeyAction));

    // 10/10 Polish: Thread Inspector stable bindings
    bindClick('btn-thread-pin', () => {
        const index = state.inspectedThreadIndex;
        if (!Number.isFinite(index)) return;
        if (state.pinnedThreadIndex === index) {
            unpinThreadInspection();
        } else {
            pinThreadNeighbor(index, { surface: 'pinned' });
        }
    });

    bindClick('btn-thread-follow', () => {
        const index = state.inspectedThreadIndex;
        if (!Number.isFinite(index)) return;
        const phase = state.strandContinuityState?.phase;
        if (index === state.navState.focusedIndex || phase === 'exploring') return;
        const activeSurface = document.body.dataset.threadInspectSurface;
        walkThreadNeighbor(index, { surface: activeSurface && activeSurface !== 'idle' ? activeSurface : 'rail' });
    });

    bindClick('btn-thread-clear', () => {
        unpinThreadInspection();
    });

    const actionMap = {
        overview: 'county-overview',
        search: 'focus-search',
        focus: 'center-anchor',
        inside: 'enter-inside',
        map: 'open-map'
    };

    if (!document.body?.dataset.journeyCompassStepDelegated) {
        document.addEventListener('click', (event) => {
            const step = event.target.closest?.('.journey-compass-step');
            if (!step) return;
            const action = actionMap[step.dataset.journeyStep];
            if (action) {
                executeJourneyCompassAction(action);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const step = event.target.closest?.('.journey-compass-step');
            if (!step) return;
            event.preventDefault();
            const action = actionMap[step.dataset.journeyStep];
            if (action) {
                executeJourneyCompassAction(action);
            }
        });
        if (document.body) document.body.dataset.journeyCompassStepDelegated = 'true';
    }

    bindClick('btn-explore-network', () => {
        // Network explorer: navigate to first cluster neighborhood if none active,
        // or clear the cluster filter to return to county overview.
        // Fallback: trigger the cluster list toggle. Quarantine: avoid routing to
        // random-business unless the shell proves that is the intended control.
        if (state.activeClusterFilter !== null) {
            if (typeof clearClusterFilter === 'function') clearClusterFilter();
        } else {
            const clusterList = document.getElementById('cluster-list');
            const firstClusterBtn = clusterList?.querySelector('[data-cluster]');
            if (firstClusterBtn) {
                firstClusterBtn.click();
            } else {
                showExperienceToast('Network explorer', 'No semantic neighborhoods available in the current filter.');
            }
        }
    }, { optional: true });
}
