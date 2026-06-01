import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../../js/state.js';
import { MODE_DESCRIPTIONS, STORY_DESCRIPTIONS, setMyceliumMode, setSemanticDiveMode, setTrailDepth } from '../../js/modules/lifecycle.js';

vi.mock('../../js/state.js', () => ({
    state: {
        myceliumMode: 'default',
        trailDepth: 0,
        navState: { trailDepth: 0, mode: 'overview' }
    }
}));

// Mock the internal methods that setMyceliumMode calls
vi.mock('../../js/modules/journey.js', () => ({
    applyPointFilterColors: vi.fn(),
    updateSelectedBusiness: vi.fn(),
    syncFocusStage: vi.fn(),
    traverseNeighbor: vi.fn(),
    walkThreadNeighbor: vi.fn()
}));

vi.mock('../../js/modules/url-state.js', () => ({
    updateUrlState: vi.fn(),
    copyCurrentViewLink: vi.fn(),
    resetStateBeforeUrlRestore: vi.fn(),
    clearExplorationFocusSelection: vi.fn()
}));

vi.mock('../../js/modules/event-bus.js', () => ({
    publish: vi.fn(),
    subscribe: vi.fn(),
    EVENTS: {
        VIEW_CHANGED: 'VIEW_CHANGED',
        EXPLORATION_DEPTH_CHANGED: 'EXPLORATION_DEPTH_CHANGED',
        STATE_RESET: 'STATE_RESET',
        CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED'
    }
}));

describe('lifecycle.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.myceliumMode = 'default';
        state.trailDepth = 0;
        
        // Let's mock window to prevent errors if UI relies on it
        vi.stubGlobal('window', {
            setTimeout: vi.fn()
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('Constants', () => {
        it('should export MODE_DESCRIPTIONS correctly', () => {
            expect(MODE_DESCRIPTIONS).toHaveProperty('default');
            expect(MODE_DESCRIPTIONS).toHaveProperty('bloom');
            expect(MODE_DESCRIPTIONS).toHaveProperty('trail');
            expect(MODE_DESCRIPTIONS).toHaveProperty('inside');
        });

        it('should export STORY_DESCRIPTIONS correctly', () => {
            expect(STORY_DESCRIPTIONS).toHaveProperty('standard');
            expect(STORY_DESCRIPTIONS).toHaveProperty('market');
            expect(STORY_DESCRIPTIONS).toHaveProperty('civic');
        });
    });

    describe('setMyceliumMode', () => {
        it('should correctly set trail mode', async () => {
            const eventBus = await import('../../js/modules/event-bus.js');
            const journey = await import('../../js/modules/journey.js');

            setMyceliumMode('trail');

            expect(state.myceliumMode).toBe('trail');
            // Assuming setTrailDepth works correctly and mutates state
            // and the UI updates fire:
            expect(journey.applyPointFilterColors).toHaveBeenCalled();
            expect(eventBus.publish).toHaveBeenCalledWith(eventBus.EVENTS.VIEW_CHANGED, { myceliumMode: 'trail' });
        });

        it('should not sync URL if skipUrlSync option is true', async () => {
            const eventBus = await import('../../js/modules/event-bus.js');

            setMyceliumMode('trail', { skipUrlSync: true });

            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('should return early if the mode is already active', async () => {
            const eventBus = await import('../../js/modules/event-bus.js');
            
            state.myceliumMode = 'bloom';
            setMyceliumMode('bloom');

            expect(eventBus.publish).not.toHaveBeenCalled();
        });
    });
});
