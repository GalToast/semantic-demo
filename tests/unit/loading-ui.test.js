import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as loadingUi from '../../js/modules/loading-ui.js';
import { state, withStateMutation } from '../../js/state.js';
import { SCENE_READY } from '../../js/modules/scene-events.js';
import * as journey from '../../js/modules/journey.js';
import * as semanticThreads from '../../js/modules/semantic-threads.js';
import * as searchState from '../../js/modules/search-state.js';
import * as threeThreadManager from '../../js/modules/three-thread-manager.js';
import * as stateMutators from '../../js/modules/state-mutators.js';
import * as weather from '../../js/modules/weather.js';

vi.mock('../../js/modules/journey.js', () => ({
    restoreFocusTrailState: vi.fn(),
    updateSelectedBusiness: vi.fn()
}));

vi.mock('../../js/modules/semantic-threads.js', () => ({
    loadSemanticThreads: vi.fn(() => Promise.resolve())
}));

vi.mock('../../js/modules/search-state.js', () => ({
    applyFilters: vi.fn()
}));

vi.mock('../../js/modules/three-thread-manager.js', () => ({
    createMycelium: vi.fn()
}));

vi.mock('../../js/modules/state-mutators.js', () => ({
    updateLoadingPhaseKey: vi.fn()
}));

vi.mock('../../js/modules/weather.js', () => ({
    initWeather: vi.fn()
}));

describe('loading-ui', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        withStateMutation(() => {
            Object.assign(state, {
                LOADING_PHASE_META: {
                    records: { note: 'note1', foot: 'foot1', progress: 0.1 },
                    scene: { note: 'note2', foot: 'foot2', progress: 0.5 }
                },
                loadingOverlayStartedAt: 0,
                LOADING_MIN_VISIBLE_MS: 100,
                deferredHydrationStarted: false,
                weatherInitialized: false,
                pointsMesh: {},
                focusedNode: null,
                navState: { mode: 'default' },
                selectedPoint: null
            });
        });

        document.body.innerHTML = `
            <div id="loading-overlay">
                <div id="loading-note"></div>
                <div id="loading-foot"></div>
                <div id="loading-progress-bar"></div>
            </div>
            <div data-loading-phase="records"></div>
            <div data-loading-phase="scene"></div>
            <div data-loading-phase="launch"></div>
        `;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should setup loading phase in DOM correctly', () => {
        loadingUi.setLoadingPhase('records');

        expect(stateMutators.updateLoadingPhaseKey).toHaveBeenCalledWith('records');
        
        const overlay = document.getElementById('loading-overlay');
        expect(overlay.hidden).toBe(false);
        expect(overlay.dataset.loadingPhase).toBe('records');

        expect(document.body.dataset.loadingPhase).toBe('records');
    });

    it('should hide loading overlay and dispatch event', async () => {
        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
        
        vi.spyOn(performance, 'now').mockReturnValue(200); // Past min visible time
        
        const promise = loadingUi.hideLoadingOverlay();
        
        const overlay = document.getElementById('loading-overlay');
        expect(overlay.dataset.loadingState).toBe('launching');
        
        vi.advanceTimersByTime(180);
        await promise;
        
        expect(overlay.classList.contains('hidden')).toBe(true);
        expect(overlay.hidden).toBe(true);
        expect(document.body.dataset.loadingOverlay).toBe('hidden');
        
        expect(dispatchEventSpy).toHaveBeenCalled();
        expect(dispatchEventSpy.mock.calls[0][0].type).toBe(SCENE_READY);
    });

    it('should schedule deferred hydration exactly once', async () => {
        // mock requestIdleCallback
        window.requestIdleCallback = vi.fn(cb => cb());
        
        loadingUi.startDeferredHydration();
        loadingUi.startDeferredHydration(); // should not run twice
        
        expect(window.requestIdleCallback).toHaveBeenCalledTimes(1);
        
        // Let promises resolve
        await vi.advanceTimersByTimeAsync(1);
        
        expect(semanticThreads.loadSemanticThreads).toHaveBeenCalled();
        expect(searchState.applyFilters).toHaveBeenCalled();
        expect(threeThreadManager.createMycelium).toHaveBeenCalled();
    });

    it('should fallback to setTimeout if requestIdleCallback is unavailable', () => {
        delete window.requestIdleCallback;
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
        
        loadingUi.startDeferredHydration();
        
        expect(setTimeoutSpy).toHaveBeenCalled();
    });

    it('should schedule weather hydration', () => {
        window.requestIdleCallback = vi.fn(cb => cb());
        loadingUi.scheduleWeatherHydration();
        expect(weather.initWeather).toHaveBeenCalled();
    });

    it('should apply error state', () => {
        loadingUi.applyLoadingErrorState(new Error('test error'));
        
        const overlay = document.getElementById('loading-overlay');
        expect(overlay.innerHTML).toContain('test error');
        expect(overlay.dataset.loadingState).toBe('error');
    });
});
