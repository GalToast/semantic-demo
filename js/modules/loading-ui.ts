/**
 * js/modules/loading-ui.ts
 *
 * Loading overlay lifecycle, phase management, and deferred hydration.
 */

import { state, withStateMutation, type LoadingPhaseKey, type SemanticState } from '../state.ts';
import { subscribe, EVENTS } from './event-bus.ts';
import { restoreFocusTrailState, updateSelectedBusiness } from './journey.ts';
import { SCENE_READY } from './scene-events.ts';
import { loadSemanticThreads } from './semantic-threads.ts';
import { applyFilters } from './search-state.ts';
import { createMycelium } from './three-thread-manager.ts';
import { updateLoadingPhaseKey } from './state-mutators.ts';
import { initWeather } from './weather.ts';
import { escapeHtml } from './utils/dom-formatters.ts';

// Phase 3: Declarative synchronization
subscribe(EVENTS.TRANSITION_PHASE_CHANGED, (payload) => {
    if (payload.phase === 'map-prelude') {
        showTerrainPreludeOverlay();
    } else if (payload.phase === 'idle') {
        hideTerrainPreludeOverlay();
    }
});

function showTerrainPreludeOverlay(): void {
    setLoadingPhase('restore', {
        note: 'Preparing terrain...',
        foot: 'Synchronizing semantic space to geographic map.'
    });
}

function hideTerrainPreludeOverlay(): void {
    hideLoadingOverlay();
}

let _hideToken = 0;
let _loadingHideTimer: ReturnType<typeof setTimeout> | null = null;
let _loadingHideCancelled = false;

export function setLoadingPhase(phaseKey: LoadingPhaseKey, overrides: { note?: string; foot?: string; progress?: number } = {}): void {
    _hideToken++;
    updateLoadingPhaseKey(phaseKey);
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
    const progressBar = document.getElementById('loading-progress-bar') as HTMLElement | null;

    if (noteEl) noteEl.textContent = overrides.note || phase.note;
    if (footEl) footEl.textContent = overrides.foot || phase.foot;
    if (progressBar) {
        progressBar.style.width = `${Math.round((overrides.progress ?? phase.progress) * 100)}%`;
    }

    document.querySelectorAll('.loading-phase-chip[data-loading-phase]').forEach((chip) => {
        const chipPhase = chip.getAttribute('data-loading-phase');
        const order: LoadingPhaseKey[] = ['records', 'scene', 'restore', 'launch'];
        const activeIndex = order.indexOf(phaseKey);
        const chipPhaseIndex = order.indexOf(chipPhase as LoadingPhaseKey);
        chip.classList.toggle('is-active', chipPhase === phaseKey);
        chip.classList.toggle('is-complete', chipPhaseIndex > -1 && activeIndex > chipPhaseIndex);
    });
}

export async function hideLoadingOverlay(): Promise<void> {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    _loadingHideCancelled = false;
    const remaining = Math.max(0, state.LOADING_MIN_VISIBLE_MS - (performance.now() - state.loadingOverlayStartedAt));
    if (remaining > 0) {
        await new Promise<void>((resolve) => {
            _loadingHideTimer = setTimeout(() => {
                _loadingHideTimer = null;
                resolve();
            }, remaining);
        });
    }
    if (_loadingHideCancelled) return;

    overlay.dataset.loadingState = 'launching';
    overlay.classList.add('launching');
    await new Promise<void>((resolve) => {
        _loadingHideTimer = setTimeout(() => {
            _loadingHideTimer = null;
            resolve();
        }, 180);
    });
    if (_loadingHideCancelled) return;
    overlay.classList.add('hidden');
    overlay.dataset.loadingState = 'hidden';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.hidden = true;
    document.body.dataset.loadingOverlay = 'hidden';
    document.body.dataset.sceneReady = 'true';

    window.dispatchEvent(new CustomEvent(SCENE_READY));
}

export function cancelLoadingHide(): void {
    _loadingHideCancelled = true;
    if (_loadingHideTimer !== null) {
        clearTimeout(_loadingHideTimer);
        _loadingHideTimer = null;
    }
}

export function startDeferredHydration(): void {
    if (state.deferredHydrationStarted) return;
    state.deferredHydrationStarted = true;

    const run = async (): Promise<void> => {
        const threadsPromise = typeof loadSemanticThreads === 'function'
            ? loadSemanticThreads()
            : Promise.resolve();

        if (typeof applyFilters === 'function') applyFilters();
        await Promise.allSettled([threadsPromise]);

        if (state.pointsMesh) {
            if (typeof createMycelium === 'function') createMycelium();
            if (typeof applyFilters === 'function') applyFilters();
            const s = state as unknown as SemanticState;
            if (s.focusedNode !== null && s.focusedNode !== undefined) {
                const priorMode = state.navState.mode;
                restoreFocusTrailState(s.focusedNode);
                withStateMutation(() => { state.navState.mode = priorMode; });
            }
            if (state.selectedPoint) {
                updateSelectedBusiness(state.selectedPoint);
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

export function scheduleWeatherHydration(): void {
    if (state.weatherInitialized) return;
    const start = (): void => {
        if (typeof initWeather === 'function') initWeather();
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(start, { timeout: 500 });
    } else {
        setTimeout(start, 300);
    }
}

export function applyLoadingErrorState(error: Error): void {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    overlay.innerHTML = `
        <div class="loading-shell" role="alert">
            <div class="loading-kicker">Graph unavailable</div>
            <div class="loading-title">Failed to load county records</div>
            <div class="loading-note">The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.</div>
            <div class="loading-foot">${escapeHtml(error?.message || 'Initialization failed')}</div>
        </div>
    `;
    overlay.hidden = false;
    overlay.inert = false;
    overlay.removeAttribute('aria-hidden');
    overlay.classList.remove('hidden', 'launching');
    overlay.dataset.loadingState = 'error';
}
