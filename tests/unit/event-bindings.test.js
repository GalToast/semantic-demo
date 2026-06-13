import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as svelte from 'svelte';
import * as eventBindings from '../../js/modules/event-bindings.js';
import { state, withStateMutation } from '../../js/state.js';
import * as viewController from '../../js/modules/view-controller.js';
import * as cameraControls from '../../js/modules/camera-controls.js';
import * as searchState from '../../js/modules/search-state.ts';
import * as journey from '../../js/modules/journey.js';

vi.mock('../../js/modules/environment.js', () => ({
    getLocation: vi.fn(() => ({ hostname: 'localhost', search: '', href: 'http://localhost/' })),
    requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
    cancelAnimationFrame: vi.fn((id) => clearTimeout(id)),
    matchMedia: vi.fn(() => null),
    getViewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
    isMobile: vi.fn(() => false),
    prefersReducedMotion: vi.fn(() => false),
    hasCoarsePointer: vi.fn(() => false),
    isCompactLandscape: vi.fn(() => false),
    isUltraCompactPortrait: vi.fn(() => false),
    isCompactFocusStage: vi.fn(() => false),
    getDevicePixelRatio: vi.fn(() => 1),
    getComputedStyle: vi.fn(() => ({})),
    getCurrentUrl: vi.fn(() => 'http://localhost/'),
    getPanelSurface: vi.fn(() => null),
    isMapSummarySurface: vi.fn(() => false),
    isSemanticDiveSurface: vi.fn(() => false),
    isMobileViewport: vi.fn(() => false),
    getInfoSurface: vi.fn(() => null),
    getAspectRatio: vi.fn(() => 1.33)
}));

vi.mock('../../js/modules/view-controller.js', () => ({
    switchView: vi.fn()
}));

vi.mock('../../js/modules/camera-controls.js', () => ({
    toggleAutoRotate: vi.fn(),
    focusOnNode: vi.fn(),
    animateCameraToNode: vi.fn(),
    settleCameraToOverviewPose: vi.fn()
}));

vi.mock('../../js/modules/search-state.ts', () => ({
    clearSearch: vi.fn(),
    clearShortSemanticSearchState: vi.fn(),
    clearSearchGlow: vi.fn(),
    applyFilters: vi.fn(),
    focusSearchInputForReplacement: vi.fn(),
    setSearchPanelState: vi.fn(),
    updateSearchStatusMessage: vi.fn()
}));

vi.mock('../../js/modules/journey.js', () => ({
    traverseNeighbor: vi.fn(),
    setSemanticDiveMode: vi.fn(),
    pinThreadNeighbor: vi.fn(),
    unpinThreadInspection: vi.fn(),
    walkThreadNeighbor: vi.fn(),
    syncFocusStage: vi.fn()
}));

describe('event-bindings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Unit test of bind logic only; full DOM coverage is the e2e test's job.
        // Opt the unit test into prod-like bind behavior so missing required
        // buttons warn rather than throw, keeping fixture scope tractable.
        window.__semanticDemoProd = true;

        eventBindings.disposeEventListeners();
        
        withStateMutation(() => {
            Object.assign(state, {
                registeredEvents: new Set(),
                eventListenersInitialized: false,
                currentView: 'galaxy',
                semanticDiveMode: false,
                inspectedThreadIndex: null,
                pinnedThreadIndex: null,
                navState: { focusedIndex: null }
            });
        });

        document.body.innerHTML = `
            <button id="btn-galaxy"></button>
            <button id="btn-map"></button>
            <button id="btn-rotate"></button>
            <button id="btn-focus-prev"></button>
            <button id="btn-focus-next"></button>
            <button id="btn-thread-pin"></button>
            <input id="search-input" />
            <button id="search-clear-btn"></button>
        `;
    });

    afterEach(() => {
        eventBindings.disposeEventListeners();
        delete window.__semanticDemoProd;
        vi.restoreAllMocks();
    });

    it('should initialize successfully', () => {
        const mocks = {
            onWindowResize: vi.fn(),
            recordSemanticLaneSnapshot: vi.fn(),
            setMyceliumMode: vi.fn(),
            setSemanticLaneUiState: vi.fn(),
            updateUrlState: vi.fn()
        };

        eventBindings.initEventListeners(mocks);
        expect(state.eventListenersInitialized).toBe(true);
        expect(state.registeredEvents.has('global-interaction')).toBe(true);
    });

    it('should bind basic view controls', () => {
        eventBindings.initEventListeners({});
        
        document.getElementById('btn-galaxy').click();
        expect(viewController.switchView).toHaveBeenCalledWith('galaxy');

        document.getElementById('btn-map').click();
        expect(viewController.switchView).toHaveBeenCalledWith('map');

        document.getElementById('btn-rotate').click();
        expect(cameraControls.toggleAutoRotate).toHaveBeenCalled();
    });

    it('should bind focus controls', () => {
        eventBindings.initEventListeners({});
        
        document.getElementById('btn-focus-prev').click();
        expect(journey.traverseNeighbor).toHaveBeenCalledWith(-1);

        document.getElementById('btn-focus-next').click();
        expect(journey.traverseNeighbor).toHaveBeenCalledWith(1);
    });

    it('should handle thread pin logic', () => {
        eventBindings.initEventListeners({});
        
        withStateMutation(() => {
            state.inspectedThreadIndex = 5;
            state.pinnedThreadIndex = null;
        });
        
        document.getElementById('btn-thread-pin').click();
        expect(journey.pinThreadNeighbor).toHaveBeenCalledWith(5, { surface: 'pinned' });
        
        vi.clearAllMocks();
        withStateMutation(() => {
            state.pinnedThreadIndex = 5;
        });
        
        document.getElementById('btn-thread-pin').click();
        expect(journey.unpinThreadInspection).toHaveBeenCalled();
    });

    it('should delegate search chrome controls to the Svelte island', { timeout: 30000 }, async () => {
        const mountSpy = vi.spyOn(svelte, 'mount');
        const original = document.getElementById('search-chrome-slot');
        const slot = document.createElement('div');
        slot.id = 'search-chrome-slot';
        document.body.appendChild(slot);

        try {
            const promise = eventBindings.initEventListeners({});
            await vi.waitFor(() => {
                expect(mountSpy).toHaveBeenCalled();
            }, { timeout: 25000 });
            await promise;
        } finally {
            if (original) {
                slot.replaceWith(original);
            } else {
                slot.remove();
            }
            mountSpy.mockRestore();
        }
        expect(searchState.clearSearch).not.toHaveBeenCalled();
    });
});
