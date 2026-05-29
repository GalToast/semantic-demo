import { state } from '../state.js';
import * as journeyModule from './journey.js';
import './demo-controller.js';
import './micro-demo.js';
import * as searchModule from './search-state.js';
import { initUrlSearchAdapter } from './url-search-adapter.js';
import { initClusterFilterAdapter } from './cluster-filter-adapter.js';
import { initSearchUiAdapter } from './search-ui-adapter.js';
import { initUiRenderersAdapter } from './ui-renderers.js';
import { initSearchLifecycleAdapter } from './search-lifecycle-adapter.js';
import { initCompositionAdapter } from './composition-adapter.js';
import { initUrlNavigationAdapter } from './url-navigation-adapter.js';
import { initJourneyLifecycleAdapter } from './journey-lifecycle-adapter.js';
import * as focusModule from './focus-pocket.js';
import * as threadModule from './thread-inspector.js';
import { initThreadInspectorAdapter } from './thread-inspector-adapter.js';
import * as cameraModule from './camera-controls.js';
import { initCameraControlsAdapter } from './camera-controls-adapter.js';
import { setWebGLContextRestoreHandler } from './webgl-restore-adapter.js';
import * as mapModule from './map-state.js';
import * as audioModule from './audio-scape.js';
import './tooltip.js';
import { hideLoadingOverlay, setLoadingPhase, startDeferredHydration } from './loading-ui.js';
import { demoController } from './demo-controller.js';
import { hideTooltip, positionTooltip, updateTooltipContent } from './tooltip.js';
import './pathfinding.js';
import * as journeyWebglModule from './journey-webgl.js';
import { initThreeJS, animate, cancelAnimate, triggerSearchHeroMoment, triggerCorridorNodeGlow, triggerSearchCorridorAnimation } from '../three-setup.js';
import * as dataModule from './data-loader.js';
import { escapeHtml } from '../utils.js';
import {
    startSceneReveal,
    setSemanticLaneUiState,
    initSemanticLaneAdapter,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setTrailDepth,
    setSemanticDiveMode,
    applyStoryPrompt,
    returnToOverview,
    resetExplorationFocus,
    refreshCompositionState,
    focusOnPoint,
    updateExplorationUi,
    resetNodePositions,
    dispatchNavTransition,
    onWindowResize,
    showExperienceToast,
    syncSearchStatusForFocus,
    hydrateLeadContext
} from './lifecycle.js';
import { initJourneyCompassAdapter, updateJourneyCompass } from './journey-compass-controller.js';
import { switchView } from './view-controller.js';
import { revealSelectedBusinessCard } from './event-bindings.js';
import { describeThreadLensForPoint } from './journey.js';
import { initKeyboardShortcutsHint, initKeyboardResetOwnership } from './keyboard-help.js';
import { applyUrlState, updateUrlState } from './url-state.js';
import { loadSemanticThreads } from './semantic-threads.js';
import { initClusterLabels } from './cluster-labels.js';
import { updateHasQuery } from './event-bindings.js';
import {
    buildSelectedMatchNarrative,
    clearCompactSearchResultRevealTimers,
    getInterestingBusinessNote,
    scheduleCompactSearchResultReveal
} from './ui-renderers.js';
import { hideSummaryCard } from './lifecycle.js';
import { setSemanticGuideButtonState } from './semantic-guide.js';
import { updateLegendGuideState } from './legend-ui.js';
import { updateSearchStatusMessage } from './search-state.js';
import { recordSemanticLaneSnapshot } from './semantic-lane.js';
import { applyPointFilterColors, updateSelectedBusiness, updateTrailIndices } from './journey.js';
import { initEventListeners } from './event-bindings.js';
import { updateTime } from '../utils.js';
import { initBridgeRegistry } from './bridge-registry.js';

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
            assistEl.style.display = 'none';
            assistEl.dataset.state = 'idle';
        } else {
            assistEl.hidden = false;
            assistEl.style.display = '';
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
        assistEl.style.display = 'none';
        assistEl.dataset.state = 'idle';
    }
    if (typeof updateSearchStatusMessage === 'function') updateSearchStatusMessage();
}

// ── Application Initialization ───────────────────────────────────────────────

export async function init() {
    let safetyValve = null;
    try {
        if (state.clockTimer) {
            clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        // Cancel any previous RAF loop before re-initializing Three.js.
        cancelAnimate();
        state.loadingOverlayStartedAt = performance.now();

        safetyValve = setTimeout(() => {
            if (document.getElementById('loading-overlay')?.classList.contains('hidden')) return;
            console.warn('Init safety valve dismissed a slow loading overlay.');
            hideLoadingOverlay();
        }, 10000);

        setLoadingPhase('records');
        await dataModule.loadData();
        setLoadingPhase('scene');

        loadSemanticThreads().then((loaded) => {
            if (loaded === false) {
                showStartupRecoveryNotice('Semantic relationship data', new Error('Relationship paths are using approximate fallback links.'));
            }
        }).catch((err) => {
            console.error('loadSemanticThreads failed, falling back to geometric edges', err);
            showStartupRecoveryNotice('Semantic relationship data', err);
        });

        const graphicsReady = initThreeJS();
        if (graphicsReady !== false) {
            journeyModule.ensureCanvasNodeInteractionBindings();
        } else {
            hideLoadingOverlay();
        }

        initEventListeners({ onWindowResize, updateUrlState });
        initKeyboardShortcutsHint();
        initKeyboardResetOwnership({ returnToOverview, resetExplorationFocus });
        initSemanticLaneAdapter({ updateLegendGuideState });
        if (graphicsReady !== false) initClusterLabels();
        audioModule.initAudio();

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
        setLoadingPhase('restore');
        updateTime();

        // ── Dependency Injection & Compatibility ──────────────────────────────

        initUrlSearchAdapter(searchModule);

        initJourneyLifecycleAdapter({
            previewInsideNextThread: journeyModule.previewInsideNextThread,
            getNextWalkCandidateForIndex: journeyModule.getNextWalkCandidateForIndex,
            applyLocalNeighborhoodFocus: focusModule.applyLocalNeighborhoodFocus,
            setSemanticDiveMode: setSemanticDiveMode,
            getInterestingBusinessNote: getInterestingBusinessNote,
            buildSelectedMatchNarrative: buildSelectedMatchNarrative,
            hasColdDegradedSemanticFallback: () => false,
            getColdDegradedRouteCopy: () => null,
            getSelectedBusinessRoleLabel: (point) => {
                // Compatibility for new bridge registry
                return window._getSelectedBusinessRoleLabel ? window._getSelectedBusinessRoleLabel(point) : 'Record';
            },
            isFieldNodeFocusContext: () => false,
            revealSelectedBusinessCard: revealSelectedBusinessCard,
            describeThreadLensForPoint: describeThreadLensForPoint,
            hydrateLeadContext: (point, options) => hydrateLeadContext(point, options),
            shouldUseFloatingFocusJourneyOnly: () => false,
            setLastCanvasNodePick: (val) => { state.lastCanvasNodePick = val || null; },
            setLastCanvasNodeHover: (val) => { state.lastCanvasNodeHover = val || null; },
            setLastCanvasNodeFocusPick: (val) => { state.lastCanvasNodeFocusPick = val || null; }
        });

        initUrlNavigationAdapter({
            focusOnPoint,
            updateExplorationUi,
            recordSemanticLaneSnapshot,
            applyStoryPrompt,
            showExperienceToast,
            setSemanticDiveMode,
            setTrailDepth,
        }, {
            updateHasQuery,
        });

        initClusterFilterAdapter({
            applyFilters: searchModule.applyFilters,
            clearSearchGlow: searchModule.clearSearchGlow,
            updateUrlState,
            clearShortSemanticSearchState: searchModule.clearShortSemanticSearchState,
        });

        initSearchUiAdapter({ hideTooltip, positionTooltip, updateTooltipContent });
        initUiRenderersAdapter({ switchView });
        initJourneyCompassAdapter({ switchView });
        initThreadInspectorAdapter({
            summarizeNeighborReason: journeyModule.summarizeNeighborReason,
            getInsideRelationshipLabel: journeyModule.getInsideRelationshipLabel,
            getCurrentTrailFocusIndex: journeyModule.getCurrentTrailFocusIndex,
            getFocusThreadCurvePoint: focusModule.getFocusThreadCurvePoint
        });

        initCameraControlsAdapter({
            showTerrainPreludeOverlay: () => { if (typeof showTerrainPreludeOverlay === 'function') window.showTerrainPreludeOverlay(); },
            hideTerrainPreludeOverlay: () => { if (typeof hideTerrainPreludeOverlay === 'function') window.hideTerrainPreludeOverlay(); },
            setRouteChoreographyPhase: journeyWebglModule.setRouteChoreographyPhase,
            hideTooltip: hideTooltip,
            clearThreadInspection: threadModule.clearThreadInspection,
            setTrailFromSeed: journeyModule.setTrailFromSeed,
            updateTrailIndices: journeyModule.updateTrailIndices,
            refreshFocusSemanticOverlay: journeyWebglModule.refreshFocusSemanticOverlay,
            applyLocalNeighborhoodFocus: focusModule.applyLocalNeighborhoodFocus,
            updateSelectedBusiness: journeyModule.updateSelectedBusiness,
            updateTraversalUi: journeyModule.updateTraversalUi,
            updateFocusNeighborRail: journeyModule.updateFocusNeighborRail
        });

        initCompositionAdapter({
            syncRouteDirectorState: mapModule.syncRouteDirectorState,
            updateFocusNeighborRail: journeyModule.updateFocusNeighborRail,
            refreshMapMarkers: mapModule.refreshMapMarkers,
            refreshMapRouteEmbodiment: mapModule.refreshMapRouteEmbodiment,
            refreshRouteTraceOverlay: journeyWebglModule.refreshRouteTraceOverlay,
            clearMobileRouteFieldPeek: searchModule.clearMobileRouteFieldPeek
        });

        initSearchLifecycleAdapter({
            updateUrlState,
            setSearchPanelState: searchModule.setSearchPanelState,
            focusOnPoint,
            updateExplorationUi,
            resetNodePositions,
            dispatchNavTransition,
            syncSearchStatusForFocus,
            refreshCompositionState,
            clearMobileRouteFieldPeek: searchModule.clearMobileRouteFieldPeek,
            clearCompactSearchResultRevealTimers,
            clearSearchPreviewHoverTimer: searchModule.clearSearchPreviewHoverTimer,
            switchView,
            updateSelectedBusiness: (point) => { if (typeof updateSelectedBusiness === 'function') updateSelectedBusiness(point); },
            updateTrailIndices: () => { if (typeof updateTrailIndices === 'function') updateTrailIndices(); },
            applyPointFilterColors: () => { if (typeof applyPointFilterColors === 'function') applyPointFilterColors(); },
            resetExplorationFocus,
            setSemanticLaneUiState,
            clearSearch: searchModule.clearSearch,
            triggerSearchHeroMoment: (anchorIndex) => { if (typeof triggerSearchHeroMoment === 'function') triggerSearchHeroMoment(anchorIndex); },
            triggerCorridorNodeGlow: (anchorIndex, resultIndices) => { if (typeof triggerCorridorNodeGlow === 'function') triggerCorridorNodeGlow(anchorIndex, resultIndices); },
            triggerSearchCorridorAnimation: (anchorIndex, resultIndices) => { if (typeof triggerSearchCorridorAnimation === 'function') triggerSearchCorridorAnimation(anchorIndex, resultIndices); },
            hideSummaryCard: () => { if (typeof hideSummaryCard === 'function') hideSummaryCard(); },
            setSemanticGuideButtonState: (btn, s, opts) => { if (typeof setSemanticGuideButtonState === 'function') setSemanticGuideButtonState(btn, s, opts); },
            scheduleCompactSearchResultReveal,
        });

        // Register legacy bridges and actions
        initBridgeRegistry({
            search: searchModule.search,
            clearSearch: searchModule.clearSearch,
            focusOnNode: cameraModule.focusOnNode,
            setTrailFromSeed: journeyModule.setTrailFromSeed,
            setTrailDepth,
            setSemanticDiveMode,
            returnToOverview,
            resetExplorationFocus,
            refreshCompositionState
        });

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
            if (safetyValve) clearTimeout(safetyValve);
            startDeferredHydration();
            demoController.init();

            window.addEventListener('demo-complete', () => {
                updateJourneyCompass('overview');
            });
        });
    } catch (error) {
        if (safetyValve) clearTimeout(safetyValve);
        console.error('Initialization failed:', error);
        cancelAnimate();
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.innerHTML = `<div class="loading-shell" role="alert"><div class="loading-kicker">Graph unavailable</div><div class="loading-title">Failed to load county records</div><div class="loading-note">The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.</div><div class="loading-foot">${escapeHtml(error.message || 'Initialization failed')}</div></div>`;
        }
    }
}

setWebGLContextRestoreHandler(init);

init().catch((err) => {
    console.error('Initialization critical failure', err);
    throw err;
});
