import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../../js/state.js';

// 1. Mock all the dependencies BEFORE importing the module that uses them
vi.mock('../../js/modules/data-loader.js', () => ({
    loadData: vi.fn().mockResolvedValue()
}));
vi.mock('../../js/modules/semantic-threads.js', () => ({
    loadSemanticThreads: vi.fn().mockResolvedValue(true)
}));
vi.mock('../../js/modules/three-engine.js', () => ({
    initThreeJS: vi.fn().mockReturnValue(true),
    animate: vi.fn(),
    cancelAnimate: vi.fn()
}));
vi.mock('../../js/modules/loading-ui.js', () => ({
    hideLoadingOverlay: vi.fn().mockResolvedValue(),
    setLoadingPhase: vi.fn(),
    startDeferredHydration: vi.fn(),
    applyLoadingErrorState: vi.fn()
}));
vi.mock('../../js/modules/url-state.js', () => ({
    applyUrlState: vi.fn().mockResolvedValue(),
    updateUrlState: vi.fn()
}));
vi.mock('../../js/modules/lifecycle.js', () => ({
    startSceneReveal: vi.fn(),
    setSemanticLaneUiState: vi.fn(),
    initSemanticLaneAdapter: vi.fn(),
    probeSemanticLane: vi.fn().mockResolvedValue(true),
    scheduleSemanticLaneMonitor: vi.fn(),
    onWindowResize: vi.fn(),
    returnToOverview: vi.fn(),
    resetExplorationFocus: vi.fn(),
    hideSummaryCard: vi.fn(),
    setSemanticDiveMode: vi.fn(),
    setTrailDepth: vi.fn(),
    applyStoryPrompt: vi.fn(),
    showExperienceToast: vi.fn(),
    syncSearchStatusForFocus: vi.fn(),
    refreshCompositionState: vi.fn(),
    focusOnPoint: vi.fn(),
    updateExplorationUi: vi.fn(),
    resetNodePositions: vi.fn(),
    dispatchNavTransition: vi.fn(),
    hydrateLeadContext: vi.fn(),
    resetExperienceState: vi.fn()
}));
// Stub the rest of the adapters that init() calls to prevent undefined errors
vi.mock('../../js/modules/url-search-adapter.js', () => ({ initUrlSearchAdapter: vi.fn() }));
vi.mock('../../js/modules/cluster-filter-adapter.js', () => ({ initClusterFilterAdapter: vi.fn() }));
vi.mock('../../js/modules/search-ui-adapter.js', () => ({ initSearchUiAdapter: vi.fn() }));
vi.mock('../../js/modules/ui-renderers.js', () => ({ 
    initUiRenderersAdapter: vi.fn(),
    buildSelectedMatchNarrative: vi.fn(),
    clearCompactSearchResultRevealTimers: vi.fn(),
    getInterestingBusinessNote: vi.fn(),
    scheduleCompactSearchResultReveal: vi.fn()
}));
vi.mock('../../js/modules/search-lifecycle-adapter.js', () => ({ initSearchLifecycleAdapter: vi.fn() }));
vi.mock('../../js/modules/composition-adapter.js', () => ({ initCompositionAdapter: vi.fn() }));
vi.mock('../../js/modules/url-navigation-adapter.js', () => ({ initUrlNavigationAdapter: vi.fn() }));
vi.mock('../../js/modules/journey-lifecycle-adapter.js', () => ({ initJourneyLifecycleAdapter: vi.fn(), applyLocalNeighborhoodFocus: vi.fn() }));
vi.mock('../../js/modules/thread-inspector-adapter.js', () => ({ initThreadInspectorAdapter: vi.fn() }));
vi.mock('../../js/modules/camera-controls-adapter.js', () => ({ initCameraControlsAdapter: vi.fn() }));
vi.mock('../../js/modules/journey-compass-controller.js', () => ({ initJourneyCompassAdapter: vi.fn(), updateJourneyCompass: vi.fn() }));
vi.mock('../../js/modules/semantic-search-api-cache.js', () => ({ initSearchCache: vi.fn().mockResolvedValue() }));
vi.mock('../../js/modules/bridge-registry.js', () => ({ initBridgeRegistry: vi.fn() }));
vi.mock('../../js/modules/event-bindings.js', () => ({ initEventListeners: vi.fn(), revealSelectedBusinessCard: vi.fn(), updateHasQuery: vi.fn() }));
vi.mock('../../js/modules/keyboard-help.js', () => ({ initKeyboardShortcutsHint: vi.fn(), initKeyboardResetOwnership: vi.fn() }));
vi.mock('../../js/modules/audio-scape.js', () => ({ initAudio: vi.fn() }));

import * as appModule from '../../js/modules/app.js';

describe('app.js Orchestrator', () => {
    beforeEach(() => {

        // Reset timers and mocks
        vi.useFakeTimers();
        vi.clearAllMocks();

        // Stub document element used by init (loading-overlay)
        vi.spyOn(document, 'getElementById').mockReturnValue(document.createElement('div'));
        
        // Silence expected initialization errors during test
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('should coordinate the startup sequence successfully', async () => {
        // We re-run init() explicitly for the test assertion, as the top-level 
        // init().catch() runs amorphously during the import phase.
        const initPromise = appModule.init();

        // Flush all microtasks and promises without risking an infinite loop
        await vi.advanceTimersByTimeAsync(100);
        await initPromise;

        const dataLoader = await import('../../js/modules/data-loader.js');
        const loadingUi = await import('../../js/modules/loading-ui.js');
        const threeEngine = await import('../../js/modules/three-engine.js');
        const urlState = await import('../../js/modules/url-state.js');

        expect(loadingUi.setLoadingPhase).toHaveBeenCalledWith('records');
        expect(dataLoader.loadData).toHaveBeenCalled();
        expect(loadingUi.setLoadingPhase).toHaveBeenCalledWith('scene');
        expect(threeEngine.initThreeJS).toHaveBeenCalled();
        expect(loadingUi.setLoadingPhase).toHaveBeenCalledWith('restore');
        expect(urlState.applyUrlState).toHaveBeenCalled();
        expect(threeEngine.animate).toHaveBeenCalled();
        
        // requestAnimationFrame is used for the final launch phase
        expect(loadingUi.setLoadingPhase).toHaveBeenCalledWith('launch');
    });

    it('should catch errors and trigger applyLoadingErrorState', async () => {
        const dataLoader = await import('../../js/modules/data-loader.js');
        const loadingUi = await import('../../js/modules/loading-ui.js');
        const testError = new Error('Data load failed');
        
        dataLoader.loadData.mockRejectedValueOnce(testError);

        const initPromise = appModule.init();
        await vi.advanceTimersByTimeAsync(100);
        await initPromise;

        expect(loadingUi.applyLoadingErrorState).toHaveBeenCalledWith(testError);
    });
});
