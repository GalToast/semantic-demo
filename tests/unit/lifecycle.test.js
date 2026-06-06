import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state } from '../../js/state.js';
import { MODE_DESCRIPTIONS, STORY_DESCRIPTIONS, setMyceliumMode, setSemanticDiveMode, setTrailDepth } from '../../js/modules/lifecycle.js';

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

vi.mock('../../js/state.js', () => ({
  state: {
    myceliumMode: 'default',
    trailDepth: 0,
    navState: { trailDepth: 0, mode: 'overview' }
  },
  withStateMutation: (fn) => fn()
}));

// Mock the internal methods that setMyceliumMode calls
vi.mock('../../js/modules/journey-point-color.js', () => ({
    applyPointFilterColors: vi.fn()
}));
vi.mock('../../js/modules/journey.js', () => ({
  updateSelectedBusiness: vi.fn(),
  syncFocusStage: vi.fn(),
  traverseNeighbor: vi.fn(),
  walkThreadNeighbor: vi.fn(),
  applyPointFilterColors: vi.fn()
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
        COMPOSITION_UPDATED: 'COMPOSITION_UPDATED',
        URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED',
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
    expect(journey.applyPointFilterColors).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(eventBus.EVENTS.VIEW_CHANGED, { myceliumMode: 'trail' });
  });

        it('should not sync URL if skipUrlSync option is true', async () => {
            const eventBus = await import('../../js/modules/event-bus.js');

            setMyceliumMode('trail', { skipUrlSync: true });

            expect(eventBus.publish).not.toHaveBeenCalledWith(
                eventBus.EVENTS.URL_SYNC_REQUESTED,
                expect.anything()
            );
        });

        it('should return early if the mode is already active', async () => {
            const eventBus = await import('../../js/modules/event-bus.js');
            
            state.myceliumMode = 'bloom';
            setMyceliumMode('bloom');

            expect(eventBus.publish).not.toHaveBeenCalled();
        });
    });
});
