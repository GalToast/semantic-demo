import { state } from '../state.js';

export function setLoadingPhase(phaseKey, overrides = {}) {
    state.loadingPhaseKey = phaseKey;
    const phase = state.LOADING_PHASE_META[phaseKey] || state.LOADING_PHASE_META.records;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.hidden = false;
        overlay.inert = false;
        overlay.removeAttribute('aria-hidden');
        overlay.classList.remove('hidden', 'launching');
        overlay.dataset.loadingPhase = phaseKey;
        overlay.dataset.loadingState = 'active';
    }
    document.body.dataset.loadingPhase = phaseKey;
    document.body.dataset.loadingOverlay = 'active';
    delete document.body.dataset.sceneReady;

    const noteEl = document.getElementById('loading-note');
    const footEl = document.getElementById('loading-foot');
    const progressBar = document.getElementById('loading-progress-bar');

    if (noteEl) noteEl.textContent = overrides.note || phase.note;
    if (footEl) footEl.textContent = overrides.foot || phase.foot;
    if (progressBar) {
        progressBar.style.width = `${Math.round((overrides.progress ?? phase.progress) * 100)}%`;
    }

    document.querySelectorAll('[data-loading-phase]').forEach((chip) => {
        const chipPhase = chip.getAttribute('data-loading-phase');
        const order = ['records', 'scene', 'restore', 'launch'];
        const activeIndex = order.indexOf(phaseKey);
        const chipPhaseIndex = order.indexOf(chipPhase);
        chip.classList.toggle('is-active', chipPhase === phaseKey);
        chip.classList.toggle('is-complete', chipPhaseIndex > -1 && activeIndex > chipPhaseIndex);
    });
}

export async function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    const remaining = Math.max(0, state.LOADING_MIN_VISIBLE_MS - (performance.now() - state.loadingOverlayStartedAt));
    if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    overlay.dataset.loadingState = 'launching';
    overlay.classList.add('launching');
    await new Promise((resolve) => setTimeout(resolve, 180));
    overlay.classList.add('hidden');
    overlay.dataset.loadingState = 'hidden';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.hidden = true;
    document.body.dataset.loadingOverlay = 'hidden';
    document.body.dataset.sceneReady = 'true';

    window.dispatchEvent(new CustomEvent('scene-ready'));
}

export function startDeferredHydration() {
    if (state.deferredHydrationStarted) return;
    state.deferredHydrationStarted = true;

    const run = async () => {
        const threadsPromise = typeof window.loadSemanticThreads === 'function'
            ? window.loadSemanticThreads()
            : Promise.resolve();

        if (typeof window.computeNetworkInsights === 'function') window.computeNetworkInsights();
        if (typeof window.applyFilters === 'function') window.applyFilters();
        await Promise.allSettled([threadsPromise]);

        if (state.pointsMesh) {
            if (typeof window.createMycelium === 'function') window.createMycelium();
            if (typeof window.applyFilters === 'function') window.applyFilters();
            if (state.focusedNode !== null && state.focusedNode !== undefined) {
                const priorFocused = state.focusedNode;
                const priorMode = state.navState.mode;
                const priorHistory = [...(state.navState.explorationHistoryIndices || [priorFocused])];

                if (typeof window.setTrailFromSeed === 'function') window.setTrailFromSeed(priorFocused);
                state.navState.explorationHistoryIndices = priorHistory;
                state.navState.lastTraversalReason = state.navState.lastTraversalReason || null;
                state.navState.mode = priorMode;

                if (typeof window.updateTrailIndices === 'function') window.updateTrailIndices(priorFocused);
                if (typeof window.refreshFocusSemanticOverlay === 'function') window.refreshFocusSemanticOverlay();
                if (typeof window.refreshFocusBeaconOverlay === 'function') window.refreshFocusBeaconOverlay();
                if (typeof window.refreshFocusNextCueOverlay === 'function') window.refreshFocusNextCueOverlay();
                if (typeof window._fp?.applyLocalNeighborhoodFocus === 'function') window._fp.applyLocalNeighborhoodFocus(priorFocused);
                if (typeof window.applyPointFilterColors === 'function') window.applyPointFilterColors();
                if (typeof window.syncFocusStage === 'function') {
                    const priorPoint = (Number.isFinite(priorFocused) && priorFocused >= 0 && priorFocused < state.points.length)
                        ? state.points[priorFocused]
                        : null;
                    window.syncFocusStage(priorPoint || state.selectedPoint || null);
                }
                if (typeof window.updateTraversalUi === 'function') window.updateTraversalUi();
            }
            if (state.selectedPoint && typeof window.updateSelectedBusiness === 'function') {
                window.updateSelectedBusiness(state.selectedPoint);
            }
        }

        scheduleWeatherHydration();
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 250 });
    } else {
        setTimeout(run, 80);
    }
}

export function scheduleWeatherHydration() {
    if (state.weatherInitialized) return;
    const start = () => {
        if (typeof window.initWeather === 'function') window.initWeather();
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(start, { timeout: 500 });
    } else {
        setTimeout(start, 300);
    }
}
