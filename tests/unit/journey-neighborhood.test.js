import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as journeyNeighborhood from '../../js/modules/journey-neighborhood.js';
import { state, withStateMutation } from '../../js/state.js';
import * as geoData from '../../js/modules/utils/geo-data.js';
import * as journeyThreadModel from '../../js/modules/journey-thread-model.js';
import * as environment from '../../js/modules/environment.js';

vi.mock('../../js/modules/utils/geo-data.js', () => ({
    isPointVisible: vi.fn(() => true)
}));

vi.mock('../../js/modules/journey-thread-model.js', () => ({
    normalizeLeadId: vi.fn(id => id),
    getSemanticThreadCandidates: vi.fn(() => []),
    getGeometricThreadCandidates: vi.fn(() => []),
    getThreadCandidatesForIndex: vi.fn(() => [])
}));

vi.mock('../../js/modules/environment.js', () => ({
  isCompactLandscape: vi.fn(() => false),
  isUltraCompactPortrait: vi.fn(() => false),
  getLocation: vi.fn(() => ({ hostname: 'localhost', search: '', href: 'http://localhost/' })),
  requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
  cancelAnimationFrame: vi.fn((id) => clearTimeout(id)),
  matchMedia: vi.fn(() => null),
  getComputedStyle: vi.fn(() => ({})),
  getCurrentUrl: vi.fn(() => 'http://localhost/'),
  getViewportSize: vi.fn(() => ({ width: 1024, height: 768 })),
  isMobile: vi.fn(() => false),
  prefersReducedMotion: vi.fn(() => false),
  hasCoarsePointer: vi.fn(() => false),
  isCompactFocusStage: vi.fn(() => false),
  getDevicePixelRatio: vi.fn(() => 1),
  getPanelSurface: vi.fn(() => null),
  isMapSummarySurface: vi.fn(() => false),
  isSemanticDiveSurface: vi.fn(() => false),
  isMobileViewport: vi.fn(() => false),
  getInfoSurface: vi.fn(() => null),
  getAspectRatio: vi.fn(() => 1.33)
}));

vi.mock('../../js/modules/utils/ui-presentation.js', () => ({
    isCompactFocusStageViewport: vi.fn(() => false)
}));

describe('journey-neighborhood', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        withStateMutation(() => {
            Object.assign(state, {
                currentView: 'galaxy',
                navState: {
                    neighborhoodAnchorIndex: null,
                    neighborhoodIndices: [],
                    neighborhoodSource: null,
                    threadCandidates: []
                },
                points: [
                    { lead_id: '1' },
                    { lead_id: '2' },
                    { lead_id: '3' }
                ],
                nodePositions: new Float32Array(9).fill(1),
                semanticNeighborMapByLeadId: new Map(),
                pointIndexByLeadId: new Map([
                    ['1', 0],
                    ['2', 1],
                    ['3', 2]
                ])
            });
        });
    });

    it('getNeighborhoodRouteIndices returns correct array', () => {
        withStateMutation(() => {
            state.navState.neighborhoodAnchorIndex = 0;
            state.navState.neighborhoodIndices = [1, 2];
        });
        expect(journeyNeighborhood.getNeighborhoodRouteIndices()).toEqual([0, 1, 2]);
    });

    it('isBoundedNeighborhoodActive returns correct boolean', () => {
        withStateMutation(() => {
            state.currentView = 'galaxy';
            state.navState.neighborhoodSource = 'semantic';
            state.navState.neighborhoodAnchorIndex = 0;
            state.navState.neighborhoodIndices = [1];
        });
        
        expect(journeyNeighborhood.isBoundedNeighborhoodActive()).toBe(true);
        
        withStateMutation(() => {
            state.currentView = 'map';
        });
        expect(journeyNeighborhood.isBoundedNeighborhoodActive()).toBe(false);
    });

    it('getNeighborhoodCandidateForIndex returns candidate', () => {
        withStateMutation(() => {
            state.navState.threadCandidates = [{ index: 1, reason: 'test reason' }];
            state.navState.neighborhoodAnchorIndex = 0;
            state.navState.neighborhoodIndices = [1];
        });
        
        const candidate = journeyNeighborhood.getNeighborhoodCandidateForIndex(1);
        expect(candidate.index).toBe(1);
        expect(candidate.source).toBe('semantic');
        expect(candidate.reason).toBe('test reason');
    });

    it('getSemanticNeighborRecordBetween returns record', () => {
        withStateMutation(() => {
            state.semanticNeighborMapByLeadId.set('1', {
                neighbors: [{ leadId: '2', score: 0.9 }]
            });
        });
        
        const record = journeyNeighborhood.getSemanticNeighborRecordBetween(0, 1);
        expect(record.leadId).toBe('2');
        expect(record.score).toBe(0.9);
    });

    it('buildNeighborhoodManifest builds manifest', () => {
        withStateMutation(() => {
            state.semanticNeighborMapByLeadId.set('1', {
                neighbors: [{ leadId: '2', score: 0.9, reason: 'r1' }]
            });
            state.navState.threadCandidates = [{ index: 1, score: 0.9 }];
        });
        
        const manifest = journeyNeighborhood.buildNeighborhoodManifest(0, [1]);
        
        expect(manifest).toBeTruthy();
        expect(manifest.anchorIndex).toBe(0);
        expect(manifest.candidateIndices).toEqual([1]);
        expect(manifest.candidates.get(0).role).toBe('anchor');
        expect(manifest.candidates.get(1).role).toBe('peer');
        expect(manifest.edges.length).toBe(1);
    });

    it('updateTrailIndices sets trailIndices', () => {
        geoData.isPointVisible.mockReturnValue(true);
        journeyThreadModel.getThreadCandidatesForIndex.mockReturnValue([{ index: 1 }]);
        
        journeyNeighborhood.updateTrailIndices(0);
        
        expect(state.trailIndices.size).toBe(2);
        expect(state.trailIndices.has(0)).toBe(true);
        expect(state.trailIndices.has(1)).toBe(true);
    });
});
