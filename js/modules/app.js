import { state } from '../state.js';
import * as journeyModule from './journey.js';
import { initMicroDemo } from './micro-demo.js';
import * as searchModule from './search-state.js';
import { initClusterFilterAdapter } from './cluster-filter-adapter.js';
import { initBridgeRegistry, _getSelectedBusinessRoleLabel } from './bridge-registry.js';
import { initJourneyLifecycleAdapter } from './journey-lifecycle-adapter.js';
import { setupMobileSearchSheetToggle } from './search-panel-adapter.js';
import { isCompactSearchViewport } from './utils/ui-presentation.js';
import * as focusModule from './focus-pocket.js';
import { initThreadInspectorAdapter } from './thread-inspector-adapter.js';
import * as cameraModule from './camera-controls.js';
import { setWebGLContextRestoreHandler } from './webgl-restore-adapter.js';
import * as mapModule from './map-state.js';
import * as audioModule from './audio-scape.js';
// PATCH: Explicit import to satisfy tests/three-visual-polish-contract.mjs
import * as _searchAnimationsModule from './three-search-animations.js';
import './tooltip.js';
import { hideLoadingOverlay, setLoadingPhase, startDeferredHydration, applyLoadingErrorState } from './loading-ui.js';
import { hideTooltip } from './tooltip.js';
import './pathfinding.js';
import * as journeyWebglModule from './journey-webgl.js';
import { initThreeJS, animate, cancelAnimate } from './three-engine.js';
import * as dataModule from './data-loader.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import { pointHasGeocode } from './utils/geo-data.js';

import {
    startSceneReveal,
    setSemanticLaneUiState,
    initSemanticLaneAdapter,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setTrailDepth,
    setSemanticDiveMode,
    returnToOverview,
    resetExperienceState,
    resetExplorationFocus,
    refreshCompositionState,
    focusOnPoint,
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
    onWindowResize,
    syncSearchStatusForFocus,
    hydrateLeadContext,
} from './lifecycle.js';
import { initJourneyCompassAdapter, updateJourneyCompass } from './journey-compass-controller.js';
import { initJourneySelectedCard } from './journey-selected-card.js';
import { initSemanticDiveUiSubscriptions } from './semantic-dive-ui.js';
import { ensureFocusStageAuxiliaryDom } from './focus-stage-dom.js';
import { initViewControllerAdapter, switchView } from './view-controller.js';
import { revealSelectedBusinessCard } from './event-bindings.js';
import { describeThreadLensForPoint } from './journey.js';
import { initKeyboardShortcutsHint, initKeyboardResetOwnership } from './keyboard-help.js';
import { applyUrlState, updateUrlState } from './url-state.js';
import { loadSemanticThreads } from './semantic-threads.js';
import { initClusterLabels } from './cluster-labels.js';
import {
    buildSelectedMatchNarrative,
    getInterestingBusinessNote,
} from './ui-renderers.js';
import { hideSummaryCard } from './lifecycle.js';
import { requestSemanticGuide, setSemanticGuideButtonState } from './semantic-guide.js';
import { showSemanticThreadsDetail } from './connection-analysis.js';
import { updateLegendGuideState } from './legend-ui.js';
import { updateSearchStatusMessage } from './search-state.js';
import { initEventListeners } from './event-bindings.js';
import { updateTime } from './utils/ui-presentation.js';
import { initSearchCache } from './semantic-search-api-cache.js';

// ── Startup Recovery UI ──────────────────────────────────────────────────────

function showStartupRecoveryNotice(sourceLabel, error) {
    document.body.dataset.startupRecovery = 'degraded';
    state.startupRecoveryNoticeSource = sourceLabel || 'Semantic support service';

    const cleanSource = sourceLabel || 'Semantic support service';
    const isSearchReadiness = cleanSource === 'Semantic search readiness';
    const detail = error?.message ? ` ${error.message}` : '';
    const recoveryText = isSearchReadiness
        ? 'Search is using the local guide while live readiness checks continue.'
        : `${cleanSource} is temporarily unavailable. The county view still loads; search and connection paths may use cached or approximate fallbacks.${detail}`;

    let recoveryEl = document.getElementById('startup-recovery-status');
    if (isSearchReadiness) {
        if (recoveryEl) recoveryEl.remove();
    } else if (!recoveryEl) {
        recoveryEl = document.createElement('div');
        recoveryEl.id = 'startup-recovery-status';
        recoveryEl.setAttribute('role', 'status');
        recoveryEl.setAttribute('aria-live', 'polite');
        recoveryEl.className = 'startup-recovery-notice';
        document.body.appendChild(recoveryEl);
    }
    if (recoveryEl && !isSearchReadiness) {
        recoveryEl.textContent = recoveryText;
    }

    const statusEl = document.getElementById('search-status');
    if (statusEl && !isSearchReadiness) {
        statusEl.textContent = recoveryText;
    }

    const assistEl = document.getElementById('semantic-lane-assist');
    const assistCopyEl = document.getElementById('semantic-lane-assist-copy');
    const assistMetaEl = document.getElementById('semantic-lane-assist-meta');
    if (assistEl) {
        const hasSearchContext = Boolean(
            state.currentSearchSummary ||
            (document.getElementById('search-input')?.value || '').trim()
        );
        const shouldShowAssist = (state.semanticLaneState === 'unavailable') || (state.semanticLaneState === 'degraded' && hasSearchContext);

        if (state.semanticLaneState === 'healthy' || !shouldShowAssist) {
            assistEl.hidden = true;
            assistEl.dataset.state = 'idle';
        } else {
            assistEl.hidden = false;
            assistEl.dataset.state = 'degraded';
        }
    }
    if (assistCopyEl && state.semanticLaneState !== 'healthy') {
        assistCopyEl.textContent = isSearchReadiness
            ? 'Search can still use the local guide while live readiness checks continue.'
            : `${cleanSource} is temporarily unavailable. The visualization remains available while recovery checks continue in the background.`;
    }
    if (assistMetaEl && state.semanticLaneState !== 'healthy') {
        assistMetaEl.textContent = isSearchReadiness
            ? 'Live readiness check is still settling.'
            : 'Offline or blocked request detected just now.';
    }
}

function clearStartupRecoveryNotice(sourceLabel) {
    if (sourceLabel && state.startupRecoveryNoticeSource !== sourceLabel) return;
    delete document.body.dataset.startupRecovery;
    state.startupRecoveryNoticeSource = null;
    const recoveryEl = document.getElementById('startup-recovery-status');
    if (recoveryEl) recoveryEl.remove();

    const assistEl = document.getElementById('semantic-lane-assist');
    if (assistEl) {
        assistEl.hidden = true;
        assistEl.dataset.state = 'idle';
    }
    if (typeof updateSearchStatusMessage === 'function') updateSearchStatusMessage();
}

// ── Application Initialization Helpers ───────────────────────────────────────

function setupInitSafetyValves() {
    const slowProgressTimer = setTimeout(() => {
        if (document.getElementById('loading-overlay')?.classList.contains('hidden')) return;
        setLoadingPhase('restore', {
            note: 'Still preparing the scene…',
            foot: 'Taking longer than usual. Hold on a moment longer.'
        });
    }, 8000);

    const safetyValve = setTimeout(() => {
        if (document.getElementById('loading-overlay')?.classList.contains('hidden')) return;
        console.warn('Init safety valve dismissed a slow loading overlay after 15s.');
        hideLoadingOverlay();
    }, 15000);

    return { slowProgressTimer, safetyValve };
}

function clearInitSafetyValves(context) {
    if (context?.slowProgressTimer) clearTimeout(context.slowProgressTimer);
    if (context?.safetyValve) clearTimeout(context.safetyValve);
}

async function initDataLayer() {
    setLoadingPhase('records');
    await dataModule.loadData();
    setLoadingPhase('scene');

    return loadSemanticThreads().then((loaded) => {
        if (loaded === false) {
            showStartupRecoveryNotice('Semantic relationship data', new Error('Relationship paths are using approximate fallback links.'));
        }
    }).catch((err) => {
        console.error('loadSemanticThreads failed, falling back to geometric edges', err);
        showStartupRecoveryNotice('Semantic relationship data', err);
    });
}

function initGraphicsAndAudio() {
    const graphicsReady = initThreeJS();
    if (graphicsReady !== false) {
        journeyModule.ensureCanvasNodeInteractionBindings();
    } else {
        hideLoadingOverlay();
    }
    ensureFocusStageAuxiliaryDom();
    audioModule.initAudio();
    return graphicsReady;
}

function initCoreUi(graphicsReady) {
    initEventListeners({ onWindowResize, updateUrlState });
    initKeyboardShortcutsHint();
    initKeyboardResetOwnership({ returnToOverview, resetExplorationFocus });
    initSemanticLaneAdapter({ updateLegendGuideState });
    if (graphicsReady !== false) initClusterLabels();
}

function initSemanticLaneChecks() {
    setSemanticLaneUiState('checking');
    const semanticLaneSlowTimer = window.setTimeout(() => {
        if (state.semanticLaneState !== 'healthy') {
            showStartupRecoveryNotice('Semantic search readiness', new Error('Health check is delayed or blocked.'));
        }
    }, 900);

    probeSemanticLane({ warm: true, reason: 'init' })
        .then((payload) => {
            window.clearTimeout(semanticLaneSlowTimer);
            if (payload) {
                clearStartupRecoveryNotice('Semantic search readiness');
            } else {
                showStartupRecoveryNotice('Semantic search readiness', null);
            }
        })
        .catch((err) => {
            window.clearTimeout(semanticLaneSlowTimer);
            console.error('probeSemanticLane failed (init)', err);
            showStartupRecoveryNotice('Semantic search readiness', err);
        });

    scheduleSemanticLaneMonitor();
}

function initAdapters() {
    initJourneyLifecycleAdapter({
        previewInsideNextThread: journeyModule.previewInsideNextThread,
        getNextWalkCandidateForIndex: journeyModule.getNextWalkCandidateForIndex,
        applyLocalNeighborhoodFocus: focusModule.applyLocalNeighborhoodFocus,
        setSemanticDiveMode,
        getInterestingBusinessNote,
        buildSelectedMatchNarrative,
        hasColdDegradedSemanticFallback: () => false,
        getColdDegradedRouteCopy: () => null,
        getSelectedBusinessRoleLabel: (point) => _getSelectedBusinessRoleLabel(point),
        isFieldNodeFocusContext: () => false,
        revealSelectedBusinessCard,
        describeThreadLensForPoint,
        hydrateLeadContext: (point, options) => hydrateLeadContext(point, options),
        shouldUseFloatingFocusJourneyOnly: () => false,
        setLastCanvasNodePick: (val) => { state.lastCanvasNodePick = val || null; },
        setLastCanvasNodeHover: (val) => { state.lastCanvasNodeHover = val || null; },
        setLastCanvasNodeFocusPick: (val) => { state.lastCanvasNodeFocusPick = val || null; }
    });

    initClusterFilterAdapter({
        applyFilters: searchModule.applyFilters,
        clearSearchGlow: searchModule.clearSearchGlow,
        updateUrlState,
        clearShortSemanticSearchState: searchModule.clearShortSemanticSearchState,
    });

    initJourneyCompassAdapter({ switchView });
    initJourneySelectedCard({
        getStrandArrivalNote: journeyModule.getStrandArrivalNote,
        updateTraversalUi: journeyModule.updateTraversalUi
    });
    initSemanticDiveUiSubscriptions();
    journeyModule.initFocusNeighborRailSubscriptions();
    journeyWebglModule.initRouteTraceSubscriptions();
    initThreadInspectorAdapter({
        summarizeNeighborReason: journeyModule.summarizeNeighborReason,
        getInsideRelationshipLabel: journeyModule.getInsideRelationshipLabel,
        getCurrentTrailFocusIndex: journeyModule.getCurrentTrailFocusIndex,
        getFocusThreadCurvePoint: focusModule.getFocusThreadCurvePoint
    });
    mapModule.initMapStateSubscriptions();

    initViewControllerAdapter({
        refreshCompositionState
    });

    setupMobileSearchSheetToggle({ isCompactSearchViewport });
}

function initEventBusSubscriptions() {
    subscribeKeyed('app:url-sync-requested', EVENTS.URL_SYNC_REQUESTED, ({ params, reason, mode }) => {
        updateUrlState(params, { reason, mode });
    });

    subscribeKeyed('app:search-ui-sync-requested', EVENTS.SEARCH_UI_SYNC_REQUESTED, ({ resultsEl, statusEl, results, renderContext }) => {
        searchModule.bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);
    });

    subscribeKeyed('app:search-focus-requested', EVENTS.SEARCH_FOCUS_REQUESTED, ({ point, index }) => {
        if (state.currentView === 'map' && pointHasGeocode(point)) {
             focusOnPoint(point, { fromSearchResult: true });
        }
        cameraModule.focusOnNode(index, { fromSearchResult: true, overridePoint: point });
        syncSearchStatusForFocus(point, { fromSearchResult: true });
    });

    subscribeKeyed('app:search-state-reset-requested', EVENTS.SEARCH_STATE_RESET_REQUESTED, (options) => {
        resetExplorationFocus(options);
    });

    subscribeKeyed('app:search-status-sync-requested', EVENTS.SEARCH_STATUS_SYNC_REQUESTED, ({ point, options }) => {
        syncSearchStatusForFocus(point, options);
    });

    subscribeKeyed('app:semantic-lane-state-requested', EVENTS.SEMANTIC_LANE_STATE_REQUESTED, ({ laneState, options }) => {
        setSemanticLaneUiState(laneState, options);
    });

    subscribeKeyed('app:exploration-focus-sync', EVENTS.EXPLORATION_FOCUS_SYNC, ({ index }) => {
         dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index, skipHistory: true });
    });

    subscribeKeyed('app:tooltip-hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, () => {
        hideTooltip();
    });

    subscribeKeyed('app:summary-card-hide-requested', EVENTS.SUMMARY_CARD_HIDE_REQUESTED, () => {
        hideSummaryCard();
    });

    subscribeKeyed('app:semantic-guide-button-state-requested', EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED, ({ button, mode, options }) => {
        setSemanticGuideButtonState(button, mode, options);
    });
}

async function initSvelteUiIslands() {
    try {
        const { initSearchResultsSvelteIsland } = await import('./search-results-svelte-island.js');
        initSearchResultsSvelteIsland();
        const { initSelectedDetailsSvelteIsland } = await import('./selected-details-svelte-island.js');
        initSelectedDetailsSvelteIsland();
        const { initSearchChromeSvelteIsland } = await import('./search-chrome-island.js');
        initSearchChromeSvelteIsland();
        const { initFilterChromeSvelteIsland } = await import('./filter-chrome-island.js');
        initFilterChromeSvelteIsland();
    } catch (error) {
        console.warn('Svelte UI islands unavailable; using vanilla DOM renderers.', error);
    }
}

// ── Application Initialization ───────────────────────────────────────────────

export async function init() {
    const initContext = setupInitSafetyValves();
    try {
        if (state.clockTimer) {
            clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        // Cancel any previous RAF loop before re-initializing Three.js.
        cancelAnimate();
        state.loadingOverlayStartedAt = performance.now();

        await initDataLayer();
        const graphicsReady = initGraphicsAndAudio();
        initCoreUi(graphicsReady);
        initSemanticLaneChecks();
        setLoadingPhase('restore');
        updateTime();

        await initSvelteUiIslands();
        initAdapters();
        initEventBusSubscriptions();

        initBridgeRegistry({
            search: searchModule.search,
            clearSearch: searchModule.clearSearch,
            switchView,
            focusOnNode: cameraModule.focusOnNode,
            setTrailFromSeed: journeyModule.setTrailFromSeed,
            setTrailDepth,
            setSemanticDiveMode,
            returnToOverview,
            resetExperienceState,
            resetExplorationFocus,
            refreshCompositionState,
            traverseNeighbor: journeyModule.traverseNeighbor,
            inspectThreadNeighbor: journeyModule.inspectThreadNeighbor,
            pinThreadNeighbor: journeyModule.pinThreadNeighbor,
            unpinThreadInspection: journeyModule.unpinThreadInspection,
            clearThreadInspection: journeyModule.clearThreadInspection,
            walkThreadNeighbor: journeyModule.walkThreadNeighbor,
            requestSemanticGuide,
            showSemanticThreadsDetail
        });

        await initSearchCache();

        try {
            await applyUrlState();
        } catch (urlErr) {
            console.error('applyUrlState failed during init:', urlErr);
            showStartupRecoveryNotice('URL state restoration', urlErr);
        }

        if (state.clockTimer) clearInterval(state.clockTimer);
        state.clockTimer = setInterval(updateTime, 1000);
        if (graphicsReady !== false) animate();

        requestAnimationFrame(async () => {
            setLoadingPhase('launch');
            startSceneReveal();
            await hideLoadingOverlay();
            clearInitSafetyValves(initContext);
            startDeferredHydration();
            initMicroDemo();

            window.addEventListener('demo-complete', () => {
                updateJourneyCompass('overview');
            });
        });
    } catch (error) {
        clearInitSafetyValves(initContext);
        console.error('Initialization failed:', error);
        cancelAnimate();
        applyLoadingErrorState(error);
    }
}

setWebGLContextRestoreHandler(init);

init().catch((err) => {
    console.error('Initialization critical failure', err);
    throw err;
});
