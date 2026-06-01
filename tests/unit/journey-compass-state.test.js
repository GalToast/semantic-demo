import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as journeyCompassState from '../../js/modules/journey-compass-state.js';
import { state, withStateMutation } from '../../js/state.js';
import * as domFormatters from '../../js/modules/utils/dom-formatters.js';
import * as uiPresentation from '../../js/modules/utils/ui-presentation.js';
import * as mapState from '../../js/modules/map-state.js';
import * as journeyThreadModel from '../../js/modules/journey-thread-model.js';
import * as journeyLifecycleAdapter from '../../js/modules/journey-lifecycle-adapter.js';

vi.mock('../../js/modules/utils/dom-formatters.js', () => ({
    formatBusinessName: vi.fn(n => n)
}));

vi.mock('../../js/modules/utils/ui-presentation.js', () => ({
    describeCluster: vi.fn(() => 'Test Cluster')
}));

vi.mock('../../js/modules/map-state.js', () => ({
    getRouteEmbodimentIndices: vi.fn(() => [])
}));

vi.mock('../../js/modules/journey-thread-model.js', () => ({
    getNextExploreCandidateForIndex: vi.fn(),
    getSemanticThreadCandidates: vi.fn(),
    getGeometricThreadCandidates: vi.fn(),
    getThreadCandidatesForIndex: vi.fn()
}));

vi.mock('../../js/modules/journey-lifecycle-adapter.js', () => ({
    getNextWalkCandidateForIndex: vi.fn(),
    applyLocalNeighborhoodFocus: vi.fn()
}));

describe('journey-compass-state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        withStateMutation(() => {
            Object.assign(state, {
                selectedPoint: null,
                focusedNode: null,
                navState: { focusedIndex: null, explorationHistoryIndices: [] },
                points: [
                    { name: 'Point A', cluster: 0 },
                    { name: 'Point B', cluster: 1 }
                ],
                currentSearchSummary: null,
                semanticDiveMode: false,
                currentView: 'galaxy',
                semanticLaneSnapshot: { state: 'ready' }
            });
        });

        document.body.innerHTML = '<div class="search-container"></div>';
    });

    describe('getFocusedJourneyPoint', () => {
        it('should return selectedPoint if present', () => {
            withStateMutation(() => state.selectedPoint = { name: 'Selected' });
            expect(journeyCompassState.getFocusedJourneyPoint()).toEqual({ name: 'Selected' });
        });

        it('should return node from focusedNode', () => {
            withStateMutation(() => state.focusedNode = 1);
            expect(journeyCompassState.getFocusedJourneyPoint()).toEqual(state.points[1]);
        });

        it('should return node from navState.focusedIndex', () => {
            withStateMutation(() => state.navState.focusedIndex = 0);
            expect(journeyCompassState.getFocusedJourneyPoint()).toEqual(state.points[0]);
        });

        it('should return null if no point is focused', () => {
            expect(journeyCompassState.getFocusedJourneyPoint()).toBeNull();
        });
    });

    describe('getJourneyCompassState', () => {
        it('should return overview state when idle', () => {
            const compassState = journeyCompassState.getJourneyCompassState();
            expect(compassState.phase).toBe('overview');
            expect(compassState.title).toBe('The MoCo Mycelium');
            expect(compassState.primaryAction.action).toBe('focus-search');
        });

        it('should return map state when currentView is map', () => {
            withStateMutation(() => state.currentView = 'map');
            const compassState = journeyCompassState.getJourneyCompassState();
            expect(compassState.phase).toBe('map');
            expect(compassState.title).toBe('Montgomery County Map');
        });

        it('should return search state when hasSearch', () => {
            withStateMutation(() => state.currentSearchSummary = { query: 'test', anchorIndex: null });
            const compassState = journeyCompassState.getJourneyCompassState();
            expect(compassState.phase).toBe('search');
            expect(compassState.title).toContain('test');
        });

        it('should return focus state when hasFocus', () => {
            state.focusedNode = 0;
            const compassState = journeyCompassState.getJourneyCompassState();
            expect(compassState.phase).toBe('focus');
            expect(compassState.title).toContain('Point A');
        });

        it('should return inside state when insideActive', () => {
            withStateMutation(() => {
                state.focusedNode = 0;
                state.semanticDiveMode = true;
            });
            
            const compassState = journeyCompassState.getJourneyCompassState();
            expect(compassState.phase).toBe('inside');
            expect(compassState.title).toContain('Inside Point A');
        });
    });
});
