import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as journeyFocusUi from '../../js/modules/journey-focus-ui';
import { state, withStateMutation } from '../../js/state';
import * as environment from '../../src/lib/utils/environment';

vi.mock('../../js/modules/utils/geo-data.js', () => ({
    isPointVisible: vi.fn(() => true),
    normalizeCityForFilter: vi.fn((v) => (v || '').toLowerCase().trim())
}));

vi.mock('../../src/lib/utils/environment', () => ({
  isCompactLandscape: vi.fn(() => false),
  isUltraCompactPortrait: vi.fn(() => false),
  matchMedia: vi.fn(() => null),
  getLocation: vi.fn(() => ({ hostname: 'localhost', search: '', href: 'http://localhost/' })),
  requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
  cancelAnimationFrame: vi.fn((id) => clearTimeout(id)),
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

describe('journey-focus-ui', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup DOM for updateFocusNeighborRail and updateTraversalUi
        document.body.innerHTML = `
            <div id="focus-stage-neighbors"></div>
            <div id="focus-stage-neighbor-list"></div>
            <div id="focus-stage-neighbor-count"></div>
            <div id="trail-controls"></div>
            <div id="trail-context"></div>
            <button id="btn-prev-node"></button>
            <button id="btn-next-node"></button>
            <div id="focus-stage-journey"></div>
            <button id="btn-focus-prev"></button>
            <button id="btn-focus-next"></button>
            <div id="focus-stage-progress"></div>
            <div id="focus-stage-next"></div>
            <div id="focus-stage-route"></div>
            <button id="btn-focus-center"></button>
            <div id="walk-breadcrumb"></div>
        `;

        withStateMutation(() => {
            Object.assign(state, {
                currentView: 'galaxy',
                navState: {
                    focusedIndex: null,
                    threadCandidates: [],
                    trailNeighborIndices: [],
                    walkHistoryIndices: [],
                    threadSource: 'semantic',
                    mode: 'trail',
                    trailCursor: -1
                },
                points: [{ name: 'A', city: 'CityA' }, { name: 'B', city: 'CityB' }],
                strandContinuityState: { phase: 'idle' },
                activeFilters: {}
            });
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('isCondensedFocusStageViewport returns false by default', () => {
        expect(journeyFocusUi.isCondensedFocusStageViewport()).toBe(false);
    });

    it('isCondensedFocusStageViewport returns true when compact landscape', () => {
        environment.isCompactLandscape.mockReturnValue(true);
        expect(journeyFocusUi.isCondensedFocusStageViewport()).toBe(true);
    });

    describe('updateFocusNeighborRail', () => {
        it('clears rail when no focused index', () => {
            journeyFocusUi.updateFocusNeighborRail();
            const list = document.getElementById('focus-stage-neighbor-list');
            expect(list.innerHTML).toBe('');
            const count = document.getElementById('focus-stage-neighbor-count');
            expect(count.textContent).toBe('0 visible neighbors');
        });

        it('renders neighbors when candidates exist', () => {
            withStateMutation(() => {
                state.navState.focusedIndex = 0;
                state.navState.threadCandidates = [
                    { index: 1, reason: 'Test reason', relationshipRole: 'peer' }
                ];
            });

            journeyFocusUi.updateFocusNeighborRail();
            
            const list = document.getElementById('focus-stage-neighbor-list');
            const pills = list.querySelectorAll('.focus-stage-neighbor-pill');
            expect(pills.length).toBe(1);
            expect(pills[0].dataset.index).toBe('1');
        });
    });

    describe('updateTraversalUi', () => {
        it('updates UI elements when focus is lost', () => {
            withStateMutation(() => {
                state.navState.focusedIndex = null;
            });

            journeyFocusUi.updateTraversalUi();
            
            const progress = document.getElementById('focus-stage-progress');
            expect(progress.textContent).toBe('Pick a business, then explore its nearby neighbors.');
        });

        it('updates UI elements when focus is active', () => {
            withStateMutation(() => {
                state.navState.focusedIndex = 0;
                state.navState.trailNeighborIndices = [1];
            });

            journeyFocusUi.updateTraversalUi();
            
            const context = document.getElementById('trail-context');
            expect(context.textContent).toContain('1 candidate steps around A');
            
            const nextBtn = document.getElementById('btn-next-node');
            expect(nextBtn.disabled).toBe(false);
        });
    });
});
