import { state } from '../state.js';
import * as journeyModule from './journey.js';
import './demo-controller.js';
import './micro-demo.js'; // Micro-demo: 10-second guided first-time interaction
import * as searchModule from './search-state.js';
import * as focusModule from './focus-pocket.js';
import * as threadModule from './thread-inspector.js';
import { getProjectedNeighborCandidates } from './journey-thread-model.js';
import * as cameraModule from './camera-controls.js';
import * as mapModule from './map-state.js';
import * as weatherModule from './weather.js';
import * as audioModule from './audio-scape.js';
import './tooltip.js';
import './pathfinding.js';
import { applyClusterUiAccent } from './cluster-ui-accent.js';
import { initThreeJS, animate } from '../three-setup.js';
import * as dataModule from './data-loader.js';
import { escapeHtml } from '../utils.js';
import {
    setLoadingPhase,
    hideLoadingOverlay,
    startSceneReveal,
    getSceneRevealProgress,
    startDeferredHydration,
    initEventListeners,
    initKeyboardShortcutsHint,
    setSemanticLaneUiState,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    updateTime,
    setMyceliumMode,
    setTrailDepth,
    applyStoryPrompt,
    switchView,
    updateUrlState,
    resetExperienceState,
    returnToOverview,
    resetExplorationFocus,
    refreshCompositionState,
    clearClusterFilter
} from './lifecycle.js';
import { applyUrlState } from './url-state.js';
import { loadSemanticThreads } from './semantic-threads.js';
import { initClusterLabels, updateClusterLabels } from './cluster-labels.js';
import { updateHasQuery } from './event-bindings.js';

// Global Exposure for compatibility during transition
window.state = state;
window.loadData = dataModule.loadData;
window.loadSemanticThreads = loadSemanticThreads;
window.applyUrlState = applyUrlState;
window._ss = searchModule;
window._fp = focusModule;
window._cc = cameraModule;
window._ti = threadModule;
window._ms = mapModule;
window._weather = weatherModule;
window.getFocusThreadCurvePoint = focusModule.getFocusThreadCurvePoint;
window.getProjectedNeighborCandidates = getProjectedNeighborCandidates;
window.syncInspectedStrandOverlay = threadModule.syncInspectedStrandOverlay;
window.updateInspectedStrandOverlay = threadModule.updateInspectedStrandOverlay;
window.disposeInspectedStrandOverlay = threadModule.disposeInspectedStrandOverlay;
window.initAudio = audioModule.initAudio;

// Explicitly attach search functions to window for url-state and lifecycle modules
window.search = searchModule.search;
window.applyFilters = searchModule.applyFilters;
window.getFilteredIndices = searchModule.getFilteredIndices;
window.normalizeCityForFilter = searchModule.normalizeCityForFilter;
window.activateSearchGlow = searchModule.activateSearchGlow;
window.clearSearchGlow = searchModule.clearSearchGlow;
window.updateSearchStatusMessage = searchModule.updateSearchStatusMessage;
window.updateSearchTrailCue = searchModule.updateSearchTrailCue;
window.clearShortSemanticSearchState = searchModule.clearShortSemanticSearchState;
window.resetSemanticGuideUi = searchModule.resetSemanticGuideUi;
window.beginSearchFocusTransition = searchModule.beginSearchFocusTransition;
window.__semanticSearchCacheProbe = searchModule.getSemanticSearchCacheDiagnostics;
window.clearSearch = searchModule.clearSearch;
window.clearSearchPreviewHoverTimer = searchModule.clearSearchPreviewHoverTimer;
window.clearMobileRouteFieldPeek = searchModule.clearMobileRouteFieldPeek;
window.isMobileRouteFieldPeekActive = searchModule.isMobileRouteFieldPeekActive;

// Explicitly attach camera helpers used by focus and control contracts
window.animateCameraToNode = cameraModule.animateCameraToNode;
window.focusOnNode = cameraModule.focusOnNode;
window.toggleAutoRotate = cameraModule.toggleAutoRotate;
window.setFocusTransitionMode = cameraModule.setFocusTransitionMode;
window.clearRouteExploration = cameraModule.clearRouteExploration;
window.setRouteExplorationState = cameraModule.setRouteExplorationState;
window.noteSceneInteraction = cameraModule.noteSceneInteraction;
window.syncOrbitAutoRotate = cameraModule.syncOrbitAutoRotate;

// Explicitly attach map functions
window.initMap = mapModule.initMap;
window.refreshMapMarkers = mapModule.refreshMapMarkers;
window.refreshMapRouteEmbodiment = mapModule.refreshMapRouteEmbodiment;
window.centerMapOnRouteAnchor = mapModule.centerMapOnRouteAnchor;
window.getRouteEmbodimentIndices = mapModule.getRouteEmbodimentIndices;
window.getRouteAnchorIndex = mapModule.getRouteAnchorIndex;
window.getRouteDirectorState = mapModule.getRouteDirectorState;
window.syncRouteDirectorState = mapModule.syncRouteDirectorState;
window.setTerrainHandoffState = mapModule.setTerrainHandoffState;

// Explicitly attach weather functions used by lifecycle and map handoff code
window.initWeather = weatherModule.initWeather;
window.fetchWeather = weatherModule.fetchWeather;
window.applyWeatherEffects = weatherModule.applyWeatherEffects;
window.clearWeatherEffects = weatherModule.clearWeatherEffects;
// updateWeatherStaleness is set directly on window by weather.js on load — no wrapper needed

// Explicitly attach UI accent helper used by journey cards
window.applyClusterUiAccent = applyClusterUiAccent;

// Explicitly attach lifecycle functions
window.setMyceliumMode = setMyceliumMode;
window.setTrailDepth = setTrailDepth;
window.applyStoryPrompt = applyStoryPrompt;
window.switchView = switchView;
window.updateUrlState = updateUrlState;
window.resetExperienceState = resetExperienceState;
window.returnToOverview = returnToOverview;
window.resetExplorationFocus = resetExplorationFocus;
window.getSceneRevealProgress = getSceneRevealProgress;
window.refreshCompositionState = refreshCompositionState;
window.clearClusterFilter = clearClusterFilter;
window.updateHasQuery = updateHasQuery;
window.findClusterByKeyword = function (keyword) {
    const lower = keyword.toLowerCase();
    const idx = state.CLUSTER_NAMES.findIndex((name) => String(name).toLowerCase().includes(lower));
    return idx >= 0 ? idx : null;
};
window.getSelectedBusinessRoleLabel = function (point) {
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
    if (typeof window.updateSearchStatusMessage === 'function') window.updateSearchStatusMessage();
}

// init
let _timeIntervalId = null;

export async function init() {
    let safetyValve = null;
    try {
        if (state.clockTimer) {
            window.clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        // Cancel any previous RAF loop before re-initializing Three.js
        if (typeof window.cancelAnimate === 'function') window.cancelAnimate();
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
            showStartupRecoveryNotice(
                'Graphics acceleration',
                new Error('3D graphics are unavailable, so the map view is available as the fallback path.')
            );
            // WebGL fallback is active — dismiss the loading overlay immediately
            // so the fallback notice is visible instead of a frozen spinner.
            hideLoadingOverlay();
        }
        initEventListeners();
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
        
        // Bug sweep 19: await applyUrlState with a catch to prevent total hang
        try {
            await applyUrlState();
        } catch (urlErr) {
            console.error('applyUrlState failed during init:', urlErr);
            showStartupRecoveryNotice('URL state restoration', urlErr);
        }
        if (state.clockTimer) window.clearInterval(state.clockTimer);
        state.clockTimer = setInterval(updateTime, 1000);
        if (graphicsReady !== false) animate();

        requestAnimationFrame(async () => {
            setLoadingPhase('launch');
            startSceneReveal();
            await hideLoadingOverlay();
            if (safetyValve) clearTimeout(safetyValve);
            startDeferredHydration();
            if (typeof window.demoController?.init === 'function') {
                window.demoController.init();
            }

            window.addEventListener('demo-complete', () => {
                if (typeof window.updateJourneyCompass === 'function') {
                    window.updateJourneyCompass('overview');
                }
            });

        });
    } catch (error) {
        if (safetyValve) clearTimeout(safetyValve);
        console.error('Initialization failed:', error);
        if (state.clockTimer) {
            window.clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        if (typeof window.cancelAnimate === 'function') window.cancelAnimate();
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.innerHTML = `<div class="loading-shell" role="alert"><div class="loading-kicker">Graph unavailable</div><div class="loading-title">Failed to load county records</div><div class="loading-note">The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.</div><div class="loading-foot">${escapeHtml(error.message || 'Initialization failed')}</div></div>`;
        }
    }
}

// Global exposure
if (typeof window !== "undefined") {
    window.init = init;
    window.initEventListeners = initEventListeners;
    window.applyUrlState = applyUrlState;
    window.setSemanticLaneUiState = setSemanticLaneUiState;
    window.probeSemanticLane = probeSemanticLane;
    window.scheduleSemanticLaneMonitor = scheduleSemanticLaneMonitor;
    window.updateClusterLabels = updateClusterLabels;
}

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
