import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as journeySelectedCard from '../../js/modules/journey-selected-card.js';
import { state, withStateMutation } from '../../js/state.js';

vi.mock('../../js/modules/utils/ui-presentation.js', () => ({
    describeCluster: vi.fn((c) => `Cluster ${c}`),
    updateDocumentMeta: vi.fn(),
    isCompactFocusStageViewport: vi.fn(() => false)
}));

vi.mock('../../js/modules/utils/dom-formatters.js', () => ({
    sanitizePublicFacingNote: vi.fn((v) => v || ''),
    getBusinessNamePresentation: vi.fn((name) => ({
        display: name || 'Unknown',
        raw: name,
        showRaw: false
    })),
    escapeHtml: vi.fn((v) => v || ''),
    cleanOptionalValue: vi.fn((v) => v || ''),
    getPublicRecordStatusLabel: vi.fn((s) => s || 'Unknown'),
    formatBusinessName: vi.fn((v) => v || 'Unknown')
}));

vi.mock('../../js/modules/ui-renderers.js', () => ({
    renderSignalBadges: vi.fn(() => ''),
    updateSelectedCardHeading: vi.fn(),
    renderSelectedMetaStrip: vi.fn(),
    renderSelectedMatchPanel: vi.fn(),
    renderSelectedActionRow: vi.fn(),
    syncSelectedCardContentVariant: vi.fn()
}));

vi.mock('../../js/modules/lifecycle.js', () => ({
    refreshCompositionState: vi.fn()
}));

vi.mock('../../js/modules/cluster-ui-accent.js', () => ({
    applyClusterUiAccent: vi.fn()
}));

describe('journey-selected-card', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        document.body.innerHTML = `
            <div id="focus-stage">
                <div class="focus-stage-card"></div>
            </div>
            <div id="focus-stage-name"></div>
            <div id="focus-stage-what"></div>
            <div id="focus-stage-filed"></div>
            <div id="focus-stage-meta"></div>
            <div id="focus-stage-note"></div>
            <div id="focus-stage-badges"></div>
            <div id="focus-stage-trivia" hidden></div>
            <div id="focus-stage-sensitivity"></div>
            <div id="onboarding-hint" class="visible"></div>
            <div id="selected-empty"></div>
            <div id="selected-details"></div>
            <div id="selected-card"></div>
            <div id="selected-name"></div>
            <div id="selected-what"></div>
            <div id="selected-role-badge"></div>
            <div id="selected-filed-as"></div>
            <div id="selected-badges"></div>
            <div id="selected-trivia"></div>
            <div id="selected-facts"></div>
            <div id="selected-sensitivity"></div>
            <div id="selected-theme"></div>
            <div id="selected-status"></div>
            <div id="selected-map"></div>
            <div id="selected-thread"></div>
            <div id="selected-map-summary"></div>
            <div id="trail-context"></div>
            <div id="vector-cascade-bg"></div>
        `;

        withStateMutation(() => {
            Object.assign(state, {
                currentView: 'galaxy',
                focusedNode: 0,
                selectedPoint: null,
                points: [
                    { name: 'Coffee Shop', city: 'Conroe', cluster: 1, what: 'Serves coffee', status: 'active', lat: 30.3, lng: -95.4 },
                    { name: 'Bakery', city: 'The Woodlands', cluster: 2, what: 'Fresh bread', status: 'active' }
                ],
                navState: {
                    threadSource: 'semantic',
                    focusedIndex: 0
                },
                currentSearchSummary: '',
                semanticThreadsStatus: 'ready',
                strandContinuityState: { phase: 'idle' }
            });
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('initJourneySelectedCardAdapter', () => {
        it('sets adapter functions', () => {
            const mockGetNote = vi.fn(() => 'test note');
            journeySelectedCard.initJourneySelectedCardAdapter({
                getStrandArrivalNote: mockGetNote,
                updateTraversalUi: vi.fn()
            });
            // Should not throw
            expect(true).toBe(true);
        });
    });

    describe('syncFocusStage', () => {
        it('hides stage when point is null', () => {
            journeySelectedCard.syncFocusStage(null);
            const stage = document.getElementById('focus-stage');
            expect(stage.hidden).toBe(true);
            expect(stage.getAttribute('aria-hidden')).toBe('true');
        });

        it('shows stage and populates name when point provided', () => {
            const point = state.points[0];
            journeySelectedCard.syncFocusStage(point);
            const stage = document.getElementById('focus-stage');
            expect(stage.hidden).toBe(false);
            expect(stage.getAttribute('aria-hidden')).toBe('false');
        });

        it('sets the note text for semantic thread source', () => {
            // Reset adapter so default path is taken
            journeySelectedCard.initJourneySelectedCardAdapter({
                getStrandArrivalNote: () => '',
                updateTraversalUi: () => {}
            });
            withStateMutation(() => {
                state.navState.threadSource = 'semantic';
                state.currentSearchSummary = '';
            });
            journeySelectedCard.syncFocusStage(state.points[0]);
            const noteEl = document.getElementById('focus-stage-note');
            expect(noteEl.textContent).toContain('Connections are live here');
        });
    });

    describe('updateSelectedBusiness', () => {
        it('clears card when point is null', () => {
            journeySelectedCard.updateSelectedBusiness(null);
            const emptyEl = document.getElementById('selected-empty');
            expect(emptyEl.style.display).toBe('');
            const detailsEl = document.getElementById('selected-details');
            expect(detailsEl.style.display).toBe('none');
        });

        it('populates card when point is provided', () => {
            const point = state.points[0];
            journeySelectedCard.updateSelectedBusiness(point);
            const emptyEl = document.getElementById('selected-empty');
            expect(emptyEl.style.display).toBe('none');
            const detailsEl = document.getElementById('selected-details');
            expect(detailsEl.style.display).toBe('block');
        });

        it('renders lat/lng in map field', () => {
            const point = state.points[0];
            journeySelectedCard.updateSelectedBusiness(point);
            const mapEl = document.getElementById('selected-map');
            expect(mapEl.textContent).toContain('30.3000');
            expect(mapEl.textContent).toContain('-95.4000');
        });

        it('shows "No geocoded point" when no coords', () => {
            const point = state.points[1]; // no lat/lng
            journeySelectedCard.updateSelectedBusiness(point);
            const mapEl = document.getElementById('selected-map');
            expect(mapEl.textContent).toBe('No geocoded point');
        });

        it('dismisses onboarding hint via syncFocusStage', () => {
            journeySelectedCard.updateSelectedBusiness(state.points[0]);
            const hint = document.getElementById('onboarding-hint');
            expect(hint.classList.contains('visible')).toBe(false);
        });
    });
});
