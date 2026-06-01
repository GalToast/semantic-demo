import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as eventBindings from '../../js/modules/event-bindings.js';
import { state, withStateMutation } from '../../js/state.js';
import * as viewController from '../../js/modules/view-controller.js';
import * as cameraControls from '../../js/modules/camera-controls.js';
import * as searchState from '../../js/modules/search-state.js';
import * as journey from '../../js/modules/journey.js';

vi.mock('../../js/modules/view-controller.js', () => ({
    switchView: vi.fn()
}));

vi.mock('../../js/modules/camera-controls.js', () => ({
    toggleAutoRotate: vi.fn(),
    focusOnNode: vi.fn(),
    animateCameraToNode: vi.fn()
}));

vi.mock('../../js/modules/search-state.js', () => ({
    search: vi.fn(),
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

    it('should handle search input keydown', () => {
        eventBindings.initEventListeners({});
        const input = document.getElementById('search-input');
        
        // Mock clearSearch
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
        input.dispatchEvent(escapeEvent);
        
        expect(searchState.clearSearch).toHaveBeenCalled();
    });
});
