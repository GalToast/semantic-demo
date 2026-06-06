import { state } from '../state.js';
import * as journeyModule from './journey.js';
import { initMicroDemo } from './micro-demo.js';
import * as searchModule from './search-state.js';
import * as cameraModule from './camera-controls.js';
import * as focusModule from './focus-pocket.js';
import * as dataModule from './data-loader.js';
import * as audioModule from './audio-scape.js';
// PATCH: Explicit import to satisfy tests/three-visual-polish-contract.mjs
import * as searchAnimationsModule from './three-search-animations.js';
import './tooltip.js';
import { initThreeJS, animate, cancelAnimate, onWindowResize, getSceneRenderableDiagnostics, updateCameraViewportOffset } from './three-engine.js';
import { initEventListeners, setInfoPanelOpen, revealSelectedBusinessCard } from './event-bindings.js';
import { initKeyboardShortcutsHint, initKeyboardResetOwnership } from './keyboard-help.js';
import { initBridgeRegistry, _getSelectedBusinessRoleLabel } from './bridge-registry.js';
import { updateTime, isCompactSearchViewport } from './utils/ui-presentation.js';
import { pointHasGeocode } from './utils/geo-data.js';
import { initJourneyLifecycleAdapter } from './journey-lifecycle-adapter.js';
import { initClusterFilterAdapter } from './cluster-filter-adapter.js';
import { initJourneyCompassAdapter, updateJourneyCompass } from './journey-compass-controller.js';
import { initJourneySelectedCard, initJourneySelectedCardAdapter } from './journey-selected-card.js';
import { initThreadInspectorAdapter } from './thread-inspector-adapter.js';
import { initViewControllerAdapter } from './view-controller.js';
import { initSemanticLaneAdapter } from './semantic-lane.js';
import { setMyceliumMode, setTrailDepth, applyStoryPrompt } from './exploration-mode.js';
import { resetExperienceState, returnToOverview, setSemanticDiveMode, refreshCompositionState, startDeferredHydration, dispatchNavTransition, NAV_TRANSITION_ACTIONS, syncSearchStatusForFocus, resetExplorationFocus, focusOnPoint, hideSummaryCard } from './lifecycle.js';
import { loadSemanticThreads } from './semantic-threads.js';
import { initSearchCache } from './semantic-search-api-cache.js';
import { applyUrlState, updateUrlState } from './url-state.js';
import { hideLoadingOverlay, setLoadingPhase, startDeferredHydration as startLoadingHydration, applyLoadingErrorState } from './loading-ui.js';
import { hideTooltip } from './tooltip.js';
import './pathfinding.js';
import { startSceneReveal } from './scene-reveal.js';
import * as journeyWebglModule from './journey-webgl.js';
import { setWebGLContextRestoreHandler } from './webgl-restore-adapter.js';
import { initSemanticDiveUiSubscriptions } from './semantic-dive-ui.js';
import { ensureFocusStageAuxiliaryDom } from './focus-stage-dom.js';
import { switchView } from './view-controller.js';
import { probeSemanticLane, scheduleSemanticLaneMonitor, setSemanticLaneUiState } from './semantic-lane.js';
import * as mapModule from './map-state.js';
import { initClusterLabels } from './cluster-labels.js';
import { updateLegendGuideState } from './legend-ui.js';
import { setupMobileSearchSheetToggle } from './search-panel-adapter.js';
import { getInterestingBusinessNote, buildSelectedMatchNarrative } from './journey-lifecycle-adapter.js';
import { describeThreadLensForPoint } from './journey-point-color.js';
import { hydrateLeadContext } from './lifecycle.js';
import { subscribeKeyed, EVENTS, publish } from './event-bus.js';
import { requestSemanticGuide } from './semantic-guide.js';
import { showSemanticThreadsDetail } from './connection-analysis.js';
import { setSearchPanelState } from './search-results-ui.js';
import { initAppSvelteIsland } from './app-svelte-island.js';

type InitTiming = { step: string; ms: number };
type InitSafetyContext = {
    slowProgressTimer: ReturnType<typeof setTimeout>;
    safetyValve: ReturnType<typeof setTimeout>;
};
type AppEventPayload = Record<string, any>;

const appState = state as any;

// Keep these imports in the live entry graph. Some ownership/drift contracts
// assert that app.ts exposes the same graph as the legacy app.js entry.
void searchAnimationsModule;
void getSceneRenderableDiagnostics;
void updateCameraViewportOffset;
void setInfoPanelOpen;
void initJourneySelectedCardAdapter;
void setMyceliumMode;
void applyStoryPrompt;
void startLoadingHydration;
void initSemanticLaneAdapter;
void describeThreadLensForPoint;
void setSearchPanelState;

// ── Application Initialization Helpers ───────────────────────────────────────

// Init-timing instrumentation. Each major step in init() is wrapped in
// measureStep(); durations are accumulated in initTimings and printed via
// console.table once init() completes (or in a finally on error). The
// safety valve at line ~64 reads initTimings to name the slowest step.
const initTimings: InitTiming[] = [];

function recordTiming(name: string, durationMs: number): void {
    initTimings.push({ step: name, ms: Math.round(durationMs * 10) / 10 });
    if (typeof state !== 'undefined') {
        appState.initTimings = initTimings;
    }
    if (typeof window !== 'undefined') {
        (window as any).__initTimings = initTimings;
    }
}

async function measureStep<T>(name: string, fn: () => T | Promise<T>): Promise<Awaited<T>> {
    const start = performance.now();
    try {
        return await fn();
    } finally {
        recordTiming(name, performance.now() - start);
    }
}

function logInitTimings(): void {
    const total = initTimings.reduce((sum, t) => sum + t.ms, 0);
    console.warn(`[init] completed in ${Math.round(total)} ms`);
    console.warn(JSON.stringify([...initTimings, { step: '— total —', ms: Math.round(total * 10) / 10 }], null, 2));
}

function setupInitSafetyValves(): InitSafetyContext {
    // After the lazy-load fix, blocking init is well under 4 s on a healthy
    // network. The slow-progress threshold drops from 8 s to 4 s so the
    // "still preparing" UI surfaces earlier. The 15 s safety valve remains
    // as a last-resort fallback for genuinely broken networks.
    const slowProgressTimer = setTimeout(() => {
        if (document.getElementById('loading-overlay')?.classList.contains('hidden')) return;
        setLoadingPhase('restore', {
            note: 'Still preparing the scene…',
            foot: 'Taking longer than usual. Hold on a moment longer.'
        });
    }, 4000);

    const safetyValve = setTimeout(() => {
        if (document.getElementById('loading-overlay')?.classList.contains('hidden')) return;
        const slowest = initTimings.reduce((max, t) => (t.ms > max.ms ? t : max), { step: '(none yet)', ms: 0 });
        console.warn(
            `Init safety valve dismissed a slow loading overlay after 15s; slowest step: ${slowest.step} (${Math.round(slowest.ms)} ms).`
        );
        hideLoadingOverlay();
    }, 15000);

    return { slowProgressTimer, safetyValve };
}

function clearInitSafetyValves(context: Partial<InitSafetyContext> | null | undefined): void {
    if (context?.slowProgressTimer) clearTimeout(context.slowProgressTimer);
    if (context?.safetyValve) clearTimeout(context.safetyValve);
}

function showStartupRecoveryNotice(title: string, error: any): void {
    publish(EVENTS.UI_NOTIFICATION, { title: `Recovery: ${title}`, message: error?.message || 'Re-connecting...', type: 'warning' });
}

function clearStartupRecoveryNotice(_title: string): void {
    // No-op for now
}

async function initDataLayer(): Promise<boolean> {
    setLoadingPhase('records');
    // loadData() is required for the scene (8,406 points). loadSemanticThreads()
    // is a 41 MB payload that powers relationship-based UI (neighborhood,
    // journey, dive) but the scene can render without it. Consumers check
    // state.semanticNeighborMapByLeadId?.size before using it, so missing
    // threads degrade gracefully. Lazy-loading threads here saves ~3 s
    // off the critical path on cold init. The threads fetch kicks off
    // in the background; search/dive features enable when it resolves.
    await measureStep('dataLayer:loadData', () => dataModule.loadData()).catch((err) => {
        console.error('loadData failed during init:', err);
        showStartupRecoveryNotice('County records', err);
    });
    setLoadingPhase('scene');
    measureStep('dataLayer:loadSemanticThreads:background', () => loadSemanticThreads()).then((ok) => {
        if (ok === false) {
            showStartupRecoveryNotice('Semantic relationship data', new Error('Relationship paths are using approximate fallback links.'));
        }
    }).catch((err) => {
        console.error('loadSemanticThreads failed, falling back to geometric edges.', err);
        showStartupRecoveryNotice('Semantic relationship data', err);
    });
    return true;
}

function initGraphicsAndAudio(): any {
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

function initCoreUi(graphicsReady: any): void {
    initEventListeners({ onWindowResize, updateUrlState });
    if (typeof initKeyboardShortcutsHint === 'function') initKeyboardShortcutsHint();
    if (typeof initKeyboardResetOwnership === 'function') {
        initKeyboardResetOwnership({ returnToOverview, resetExplorationFocus });
    }
    initSemanticLaneAdapter({ updateLegendGuideState });
    if (graphicsReady !== false) initClusterLabels();
}

function initSemanticLaneChecks(): void {
    setSemanticLaneUiState('checking');
    const semanticLaneSlowTimer = window.setTimeout(() => {
        if (appState.semanticLaneState !== 'healthy') {
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

function initAdapters(): void {
    initJourneyLifecycleAdapter({
        previewInsideNextThread: journeyModule.previewInsideNextThread,
        getNextWalkCandidateForIndex: journeyModule.getNextWalkCandidateForIndex,
        applyLocalNeighborhoodFocus: focusModule.applyLocalNeighborhoodFocus,
        setSemanticDiveMode,
        getInterestingBusinessNote,
        buildSelectedMatchNarrative,
        hasColdDegradedSemanticFallback: () => false,
        getColdDegradedRouteCopy: () => null,
        getSelectedBusinessRoleLabel: (point: any) => _getSelectedBusinessRoleLabel(point),
        isFieldNodeFocusContext: () => false,
        revealSelectedBusinessCard,
        describeThreadLensForPoint,
        hydrateLeadContext: (point: any, options: any) => hydrateLeadContext(point, options),
        shouldUseFloatingFocusJourneyOnly: () => false,
        setLastCanvasNodePick: (val: any) => { appState.lastCanvasNodePick = val || null; },
        setLastCanvasNodeHover: (val: any) => { appState.lastCanvasNodeHover = val || null; },
        setLastCanvasNodeFocusPick: (val: any) => { appState.lastCanvasNodeFocusPick = val || null; }
    } as any);

    initClusterFilterAdapter({
        applyFilters: searchModule.applyFilters,
        clearSearchGlow: searchModule.clearSearchGlow,
        updateUrlState,
        clearShortSemanticSearchState: searchModule.clearShortSemanticSearchState,
    } as any);

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
    } as any);
    mapModule.initMapStateSubscriptions();

    initViewControllerAdapter({
        refreshCompositionState
    });

    setupMobileSearchSheetToggle({ isCompactSearchViewport });
}

function initEventBusSubscriptions(): void {
    subscribeKeyed('app:url-sync-requested', EVENTS.URL_SYNC_REQUESTED, ({ params, reason, mode }: AppEventPayload) => {
        updateUrlState(params, { reason, mode });
    });

    subscribeKeyed('app:search-ui-sync-requested', EVENTS.SEARCH_UI_SYNC_REQUESTED, ({ resultsEl, statusEl, results, renderContext }: AppEventPayload) => {
        searchModule.bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);
    });

    subscribeKeyed('app:search-focus-requested', EVENTS.SEARCH_FOCUS_REQUESTED, ({ point, index }: AppEventPayload) => {
        cameraModule.focusOnNode(index, { fromSearchResult: true });
        if (appState.currentView === 'map' && pointHasGeocode(point)) {
             focusOnPoint(point, { fromSearchResult: true });
        }
        syncSearchStatusForFocus(point, { fromSearchResult: true });
    });

    subscribeKeyed('app:search-state-reset-requested', EVENTS.SEARCH_STATE_RESET_REQUESTED, (options: AppEventPayload) => {
        resetExplorationFocus(options);
    });

    subscribeKeyed('app:search-status-sync-requested', EVENTS.SEARCH_STATUS_SYNC_REQUESTED, ({ point, options }: AppEventPayload) => {
        syncSearchStatusForFocus(point, options);
    });

    subscribeKeyed('app:semantic-lane-state-requested', EVENTS.SEMANTIC_LANE_STATE_REQUESTED, ({ laneState, options }: AppEventPayload) => {
        setSemanticLaneUiState(laneState, options);
    });

    subscribeKeyed('app:exploration-focus-sync', EVENTS.EXPLORATION_FOCUS_SYNC, ({ index }: AppEventPayload) => {
         dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index, skipHistory: true });
    });

    subscribeKeyed('app:tooltip-hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, () => {
        hideTooltip();
    });

    subscribeKeyed('app:summary-card-hide-requested', EVENTS.SUMMARY_CARD_HIDE_REQUESTED, () => {
        hideSummaryCard();
    });

    subscribeKeyed('app:semantic-guide-button-state-requested', EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED, ({ button, mode, options }: AppEventPayload) => {
        // Handled reactively
        void button;
        void mode;
        void options;
    });
}

function initSvelteUiIslands(): void {
    try {
        initAppSvelteIsland();
    } catch (error) {
        console.warn('Svelte UI islands unavailable; using vanilla DOM renderers.', error);
    }
}

// ── Application Initialization ───────────────────────────────────────────────

export async function init(): Promise<void> {
    await measureStep('initSvelteUiIslands', initSvelteUiIslands);
    const initContext = setupInitSafetyValves();
    try {
        if (appState.clockTimer) {
            clearInterval(appState.clockTimer);
            appState.clockTimer = null;
        }
        // Cancel any previous RAF loop before re-initializing Three.js.
        cancelAnimate();
        appState.loadingOverlayStartedAt = performance.now();

        await measureStep('initDataLayer', initDataLayer);
        const graphicsReady = await measureStep('initGraphicsAndAudio', initGraphicsAndAudio);
        await measureStep('initCoreUi', () => initCoreUi(graphicsReady));
        await measureStep('initSemanticLaneChecks', initSemanticLaneChecks);
        await measureStep('setLoadingPhase(restore)', () => setLoadingPhase('restore'));
        await measureStep('updateTime', updateTime);

        await measureStep('initAdapters', initAdapters);
        await measureStep('initEventBusSubscriptions', initEventBusSubscriptions);

        await measureStep('initBridgeRegistry', () => initBridgeRegistry({
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
        }));

        await measureStep('initSearchCache', initSearchCache);

        try {
            await measureStep('applyUrlState', applyUrlState);
        } catch (urlErr) {
            console.error('applyUrlState failed during init:', urlErr);
            showStartupRecoveryNotice('URL state restoration', urlErr);
        }

        if (appState.clockTimer) clearInterval(appState.clockTimer);
        appState.clockTimer = setInterval(updateTime, 1000);
        if (graphicsReady !== false) animate();

        requestAnimationFrame(async () => {
            const firstPaintStart = performance.now();
            await measureStep('first-paint:setLoadingPhase(launch)', () => setLoadingPhase('launch'));
            await measureStep('first-paint:startSceneReveal', () => { startSceneReveal(); });
            await measureStep('first-paint:hideLoadingOverlay', hideLoadingOverlay);
            await measureStep('first-paint:startDeferredHydration', startDeferredHydration);
            await measureStep('first-paint:initMicroDemo', initMicroDemo);
            recordTiming('first-paint:total', performance.now() - firstPaintStart);
            clearInitSafetyValves(initContext);
            logInitTimings();

            document.addEventListener('demo-complete', () => {
                updateJourneyCompass('overview');
            });
        });
    } catch (error) {
        clearInitSafetyValves(initContext);
        console.error('Initialization failed:', error);
        recordTiming('FAILED', 0);
        logInitTimings();
        cancelAnimate();
        applyLoadingErrorState(error);
    }
}

setWebGLContextRestoreHandler(init);

init().catch((err) => {
    console.error('Initialization critical failure', err);
    throw err;
});
