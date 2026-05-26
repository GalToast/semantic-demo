import { state } from '../state.js';
import * as journeyModule from './journey.js';
import './demo-controller.js';
import './micro-demo.js'; // Micro-demo: 10-second guided first-time interaction
import * as searchModule from './search-state.js';
import { initUrlSearchAdapter } from './url-search-adapter.js';
import { initClusterFilterAdapter } from './cluster-filter-adapter.js';
import { initSearchUiAdapter } from './search-ui-adapter.js';
import { initSearchLifecycleAdapter } from './search-lifecycle-adapter.js';
import { initUrlNavigationAdapter } from './url-navigation-adapter.js';
import { initJourneyLifecycleAdapter } from './journey-lifecycle-adapter.js';
import * as focusModule from './focus-pocket.js';
import * as threadModule from './thread-inspector.js';
import { initThreadInspectorAdapter } from './thread-inspector-adapter.js';
import { getProjectedNeighborCandidates } from './journey-thread-model.js';
import * as cameraModule from './camera-controls.js';
import { initCameraControlsAdapter } from './camera-controls-adapter.js';
import { setWebGLContextRestoreHandler } from './webgl-restore-adapter.js';
import * as mapModule from './map-state.js';
import * as weatherModule from './weather.js';
import * as audioModule from './audio-scape.js';
import './tooltip.js';
import { hideLoadingOverlay, setLoadingPhase, startDeferredHydration } from './loading-ui.js';
import { demoController } from './demo-controller.js';
import { hideTooltip, positionTooltip, updateTooltipContent } from './tooltip.js';
import './pathfinding.js';
import { applyClusterUiAccent } from './cluster-ui-accent.js';
import * as journeyWebglModule from './journey-webgl.js';
import { initThreeJS, animate, cancelAnimate, triggerSearchHeroMoment, triggerCorridorNodeGlow, triggerSearchCorridorAnimation } from '../three-setup.js';
import * as dataModule from './data-loader.js';
import { escapeHtml } from '../utils.js';
import {
    startSceneReveal,
    getSceneRevealProgress,
    setSemanticLaneUiState,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setMyceliumMode,
    setTrailDepth,
    setSemanticDiveMode,
    applyStoryPrompt,
    resetExperienceState,
    returnToOverview,
    resetExplorationFocus,
    refreshCompositionState,
    clearClusterFilter,
    focusOnPoint,
    updateExplorationUi,
    resetNodePositions,
    dispatchNavTransition,
    onWindowResize,
    showExperienceToast,
    syncSearchStatusForFocus,
    hydrateLeadContext
} from './lifecycle.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { switchView } from './view-controller.js';
import { revealSelectedBusinessCard } from './event-bindings.js';
import { describeThreadLensForPoint } from './journey.js';
import { initKeyboardShortcutsHint } from './keyboard-help.js';
import { applyUrlState, updateUrlState } from './url-state.js';
import { loadSemanticThreads } from './semantic-threads.js';
import { initClusterLabels } from './cluster-labels.js';
import { updateHasQuery } from './event-bindings.js';
import { findClusterByKeyword } from './cluster-filter.js';
import { buildSelectedMatchNarrative, getInterestingBusinessNote, updateSearchTrailCue } from './ui-renderers.js';
import { hideSummaryCard } from './lifecycle.js';
import { setSemanticGuideButtonState } from './semantic-guide.js';
import { updateSearchStatusMessage } from './search-state.js';
import { recordSemanticLaneSnapshot } from './semantic-lane.js';
import { applyPointFilterColors, updateSelectedBusiness, updateTrailIndices } from './journey.js';
import { initEventListeners } from './event-bindings.js';
import { updateTime } from '../utils.js';

// Global Exposure for compatibility during transition
window.__TEST_STATE__ = state;
window.state = state;

// Explicitly attach search functions to window for url-state and lifecycle modules

// Explicitly attach camera helpers used by focus and control contracts

// Explicitly attach map functions

// Explicitly attach weather functions used by lifecycle and map handoff code
// updateWeatherStaleness is set directly on window by weather.js on load — no wrapper needed

// Explicitly attach UI accent helper used by journey cards

// Explicitly attach lifecycle functions
const _getSelectedBusinessRoleLabel = function (point) {
    let index = state.points && Array.isArray(state.points) ? state.points.indexOf(point) : -1;
    if (index < 0 && point?.lead_id !== undefined && point?.lead_id !== null) {
        const leadId = String(point.lead_id);
        index = (state.points && Array.isArray(state.points))
            ? state.points.findIndex((candidate) => String(candidate.lead_id) === leadId)
            : -1;
    }
    if (index >= 0 && state.currentSearchSummary) {
        if (state.currentSearchSummary.anchorIndex === index || state.currentSearchSummary.topIndex === index) {
            return 'Search Anchor';
        }
        if ((state.currentSearchSummary.resultIndices || []).includes(index)) {
            return 'Trail Step';
        }
    }
    if (
        index >= 0
        && state.navState?.mode === 'trail'
        && (state.navState.walkHistoryIndices || []).includes(index)
    ) {
        return 'Trail Step';
    }
    return 'Record';
};

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
    // Declutter Fix: Only show the assist panel if the lane is truly unavailable
    // or if a search is active and the lane degrades. Otherwise keep it hidden.
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
            // Lane is degraded/unavailable — show the assist panel with the warning
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

// init
let _timeIntervalId = null;

export async function init() {
    let safetyValve = null;
    try {
        if (state.clockTimer) {
            clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        // Cancel any previous RAF loop before re-initializing Three.js
        cancelAnimate();
        state.loadingOverlayStartedAt = performance.now();
        
        // polish133: safety valve for 10/10 demo stability
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
                showStartupRecoveryNotice(
                    'Semantic relationship data',
                    new Error('Relationship paths are using approximate fallback links.')
                );
            }
        }).catch((err) => {
            const errId = crypto.randomUUID();
            console.error({
                err_id: errId,
                err: err.name || 'Error',
                msg: err.message,
                ctx: { reason: 'init-load' },
                stack: err.stack
            }, 'loadSemanticThreads failed, falling back to geometric edges');
            showStartupRecoveryNotice('Semantic relationship data', err);
        });
        const graphicsReady = initThreeJS();
        if (graphicsReady !== false) {
            journeyModule.ensureCanvasNodeInteractionBindings();
        } else {
            // WebGL fallback is active — dismiss the loading overlay immediately
            // so the fallback notice is visible instead of a frozen spinner.
            hideLoadingOverlay();
        }
        initEventListeners({ onWindowResize, updateUrlState });
        initKeyboardShortcutsHint();
        if (graphicsReady !== false) initClusterLabels();
        audioModule.initAudio();
        setSemanticLaneUiState('checking');
        const semanticLaneSlowTimer = window.setTimeout(() => {
            if (state.semanticLaneState !== 'healthy') {
                showStartupRecoveryNotice(
                    'Semantic search readiness',
                    new Error('Health check is delayed or blocked.')
                );
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
                const errId = crypto.randomUUID();
                window.clearTimeout(semanticLaneSlowTimer);
                console.error({
                    err_id: errId,
                    err: err.name || 'Error',
                    msg: err.message,
                    ctx: { phase: 'semantic-lane-probe' },
                    stack: err.stack
                }, 'probeSemanticLane failed (init)');
                showStartupRecoveryNotice('Semantic search readiness', err);
            });
        scheduleSemanticLaneMonitor();
        setLoadingPhase('restore');
        updateTime(); // start clock BEFORE url restore in case applyUrlState throws

        // Inject search adapter before applyUrlState runs; breaks the url-state/search-state cycle.
        initUrlSearchAdapter(searchModule);

        initJourneyLifecycleAdapter({
            previewInsideNextThread: (options) => {
                if (typeof journeyModule.previewInsideNextThread === 'function') return journeyModule.previewInsideNextThread(options);
                return null;
            },
            getNextWalkCandidateForIndex: (currentIndex, options) => {
                if (typeof journeyModule.getNextWalkCandidateForIndex === 'function') {
                    return journeyModule.getNextWalkCandidateForIndex(currentIndex, options);
                }
                return null;
            },
            applyLocalNeighborhoodFocus: (seedIndex) => {
                if (typeof focusModule.applyLocalNeighborhoodFocus === 'function') focusModule.applyLocalNeighborhoodFocus(seedIndex);
            },
            setSemanticDiveMode: (enabled) => {
                if (typeof setSemanticDiveMode === 'function') setSemanticDiveMode(enabled);
            },
            getInterestingBusinessNote: (point) => {
                if (typeof getInterestingBusinessNote === 'function') return getInterestingBusinessNote(point);
                return null;
            },
            buildSelectedMatchNarrative: (point) => {
                if (typeof buildSelectedMatchNarrative === 'function') return buildSelectedMatchNarrative(point);
                return '';
            },
            hasColdDegradedSemanticFallback: () => {
                return false;
            },
            getColdDegradedRouteCopy: () => {
                return null;
            },
            getSelectedBusinessRoleLabel: (point) => {
                return _getSelectedBusinessRoleLabel(point);
            },
            isFieldNodeFocusContext: () => {
                return false;
            },
            revealSelectedBusinessCard: () => {
                revealSelectedBusinessCard();
            },
            describeThreadLensForPoint: (point) => {
                return describeThreadLensForPoint(point);
            },
            hydrateLeadContext: (point, options) => {
                if (typeof hydrateLeadContext === 'function') return hydrateLeadContext(point, options);
                return Promise.resolve();
            },
            shouldUseFloatingFocusJourneyOnly: () => {
                return false;
            },
            setLastCanvasNodePick: (val) => { state.lastCanvasNodePick = val || null; },
            setLastCanvasNodeHover: (val) => { state.lastCanvasNodeHover = val || null; },
            setLastCanvasNodeFocusPick: (val) => { state.lastCanvasNodeFocusPick = val || null; }
        });

        // Inject navigation adapter; avoids url-state calling lifecycle/event-bindings through window.
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

        // Inject cluster-filter adapter; breaks the cluster-filter/window/url-state cycle.
        initClusterFilterAdapter({
            applyFilters: searchModule.applyFilters,
            clearSearchGlow: searchModule.clearSearchGlow,
            updateUrlState,
        });

        // Inject search UI adapter; avoids search-state calling tooltip helpers through window.
        initSearchUiAdapter({
            hideTooltip,
            positionTooltip,
            updateTooltipContent,
        });

        // Inject thread inspector adapter; decouples thread-inspector from journey and focus-pocket
        initThreadInspectorAdapter({
            summarizeNeighborReason: journeyModule.summarizeNeighborReason,
            getInsideRelationshipLabel: journeyModule.getInsideRelationshipLabel,
            getCurrentTrailFocusIndex: journeyModule.getCurrentTrailFocusIndex,
            getFocusThreadCurvePoint: focusModule.getFocusThreadCurvePoint
        });

        // Inject camera controls adapter
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

        // Inject search lifecycle adapter; avoids search-state calling lifecycle/url-state through window.
        initSearchLifecycleAdapter({
            updateUrlState,
            setSearchPanelState: searchModule.setSearchPanelState,
            focusOnPoint,
            updateExplorationUi,
            resetNodePositions,
            dispatchNavTransition,
            syncSearchStatusForFocus,
            refreshCompositionState,
            clearMobileRouteFieldPeek: searchModule.clearMobileRouteFieldPeekState,
            clearCompactSearchResultRevealTimers: searchModule.clearCompactSearchResultRevealTimers,
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
            scheduleCompactSearchResultReveal: searchModule.scheduleCompactSearchResultReveal,
        });

        // Bug sweep 19: await applyUrlState with a catch to prevent total hang
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
        if (state.clockTimer) {
            clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        cancelAnimate();
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.innerHTML = `<div class="loading-shell" role="alert"><div class="loading-kicker">Graph unavailable</div><div class="loading-title">Failed to load county records</div><div class="loading-note">The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.</div><div class="loading-foot">${escapeHtml(error.message || 'Initialization failed')}</div></div>`;
        }
    }
}

// Global exposure
if (typeof window !== "undefined") {
    window.applyUrlState = applyUrlState;
}

setWebGLContextRestoreHandler(init);

// Auto-start when module loads (ES modules are deferred, DOM is ready)
init().catch((err) => {
    const errId = crypto.randomUUID();
    console.error({
        err_id: errId,
        err: err.name || 'Error',
        msg: err.message,
        ctx: { phase: 'init', url: window.location.href },
        stack: err.stack
    }, 'Initialization failed');
    // Bug sweep 18: halt execution — app cannot function with failed init state
    throw err;
});
