import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from '../../js/state.js';
import { initJourneyState } from '../../js/modules/journey.js';

// Mock sub-modules so we don't accidentally run their side-effects
vi.mock('../../js/modules/journey-lifecycle-adapter.js', () => ({ applyLocalNeighborhoodFocus: vi.fn() }));
vi.mock('../../js/modules/journey-focus-ui.js', () => ({ updateTraversalUi: vi.fn(), getCurrentTrailFocusIndex: vi.fn() }));
vi.mock('../../js/modules/journey-point-color.js', () => ({ applyPointFilterColors: vi.fn() }));
vi.mock('../../js/modules/journey-thread-model.js', () => ({ 
    getSemanticThreadCandidates: vi.fn(),
    getGeometricThreadCandidates: vi.fn(),
    getThreadCandidatesForIndex: vi.fn()
}));
vi.mock('../../js/modules/journey-text-helpers.js', () => ({}));
vi.mock('../../js/modules/strand-continuity.js', () => ({ setStrandContinuityState: vi.fn(), clearStrandContinuityState: vi.fn(), getStrandArrivalNote: vi.fn() }));
vi.mock('../../js/modules/journey-thread-settler.js', () => ({ 
    summarizeNeighborReason: vi.fn(), 
    walkThreadNeighbor: vi.fn(), 
    inspectThreadNeighbor: vi.fn(), 
    scheduleCanvasThreadInspectionClear: vi.fn(),
    traverseNeighbor: vi.fn(),
    pinThreadNeighbor: vi.fn(),
    unpinThreadInspection: vi.fn(),
    clearThreadInspection: vi.fn(),
    renderThreadInspection: vi.fn(),
    getStrandArrivalNote: vi.fn()
}));
vi.mock('../../js/modules/journey-neighborhood.js', () => ({ 
    initJourneyNeighborhoodAdapter: vi.fn(), 
    setTrailFromSeed: vi.fn(), 
    updateTrailIndices: vi.fn(),
    getCurrentTrailFocusIndex: vi.fn()
}));
vi.mock('../../js/modules/journey-selected-card.js', () => ({ initJourneySelectedCardAdapter: vi.fn(), updateSelectedBusiness: vi.fn(), syncFocusStage: vi.fn() }));
vi.mock('../../js/modules/journey-canvas-interaction.js', () => ({ initJourneyCanvasInteractionAdapter: vi.fn(), isThreadCandidateVisibleOnCanvas: vi.fn() }));
vi.mock('../../js/modules/lifecycle.js', () => ({}));
vi.mock('../../js/modules/focus-pocket.js', () => ({ applyLocalNeighborhoodFocus: vi.fn() }));
vi.mock('../../js/modules/journey-webgl.js', () => ({}));

describe('journey.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Clear state before testing initJourneyState
        state.trailIndices = undefined;
        state.inspectedThreadIndex = undefined;
        state.pinnedThreadIndex = undefined;
        state.canvasThreadInspectionClearTimer = undefined;
        state.threadInspectorPointerInside = undefined;
        state.inspectedStrandDiagnostics = undefined;
        state.arrivalHandoffDiagnostics = undefined;
        state.strandContinuityState = undefined;
        state.myceliumMode = undefined;
        state.bloomIndices = undefined;
        state.bridgeIndices = undefined;
        state.projectedNeighborGrid = undefined;
        state.projectedNeighborCache = undefined;
        state.canvasFieldHoverClearTimer = undefined;
        state.stableCanvasHover = undefined;
        state.pointIndexByLeadId = undefined;
        state.signalScores = undefined;
        state.bridgeScores = undefined;
        state.semanticDiveMode = undefined;
        state.focusPocketTransitionStartedAt = undefined;
        state.focusPocketMotionByIndex = undefined;
    });

    describe('initJourneyState', () => {
        it('should initialize undefined state variables with correct default values', () => {
            initJourneyState();

            expect(state.trailIndices).toBeInstanceOf(Set);
            expect(state.inspectedThreadIndex).toBeNull();
            expect(state.pinnedThreadIndex).toBeNull();
            expect(state.canvasThreadInspectionClearTimer).toBeNull();
            expect(state.threadInspectorPointerInside).toBe(false);
            
            expect(state.inspectedStrandDiagnostics).toEqual({ active: false });
            expect(state.arrivalHandoffDiagnostics).toEqual({ 
                active: false, fromIndex: null, targetIndex: null, 
                phase: 'idle', segmentCount: 0, endpointCount: 0, opacity: 0 
            });
            expect(state.strandContinuityState).toEqual({ 
                phase: 'idle', targetIndex: null, fromIndex: null, 
                reason: '', startedAt: 0 
            });

            expect(state.myceliumMode).toBe('default');
            expect(state.bloomIndices).toBeInstanceOf(Set);
            expect(state.bridgeIndices).toBeInstanceOf(Set);
            expect(state.projectedNeighborGrid).toBeNull();
            expect(state.projectedNeighborCache).toBeInstanceOf(Map);
            expect(state.canvasFieldHoverClearTimer).toBeNull();
            expect(state.stableCanvasHover).toBeNull();
            expect(state.pointIndexByLeadId).toBeInstanceOf(Map);
            expect(state.signalScores).toEqual([]);
            expect(state.bridgeScores).toEqual([]);
            expect(state.semanticDiveMode).toBe(false);
            expect(state.focusPocketTransitionStartedAt).toBe(0);
            expect(state.focusPocketMotionByIndex).toBeInstanceOf(Map);
        });

        it('should NOT overwrite existing state variables if they are already defined', () => {
            const existingSet = new Set([1, 2, 3]);
            state.trailIndices = existingSet;
            state.myceliumMode = 'trail';
            state.semanticDiveMode = true;

            initJourneyState();

            expect(state.trailIndices).toBe(existingSet);
            expect(state.trailIndices.size).toBe(3);
            expect(state.myceliumMode).toBe('trail');
            expect(state.semanticDiveMode).toBe(true);
        });
    });
});
