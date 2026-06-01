import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as strandContinuity from '../../js/modules/strand-continuity.js';
import { state } from '../../js/state.js';
import * as journeyWebgl from '../../js/modules/journey-webgl.js';

vi.mock('../../js/modules/journey-webgl.js', () => ({
    syncArrivalHandoffOverlay: vi.fn(),
    disposeArrivalHandoffOverlay: vi.fn()
}));

vi.mock('../../js/modules/utils/dom-formatters.js', () => ({
    cleanOptionalValue: vi.fn(val => val),
    formatBusinessName: vi.fn(val => val)
}));

vi.mock('../../js/modules/journey-text-helpers.js', () => ({
    truncateMicrocopy: vi.fn(val => val)
}));

describe('strand-continuity state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup DOM
        document.body.innerHTML = '';
        delete document.body.dataset.strandJourney;
        delete document.body.dataset.strandJourneyTarget;
        delete document.body.dataset.strandJourneyFrom;
        delete document.body.dataset.strandJourneyReason;
    });

    it('should set phase to idle by default', () => {
        strandContinuity.setStrandContinuityState();
        expect(state.strandContinuityState.phase).toBe('idle');
        expect(document.body.dataset.strandJourney).toBe('idle');
        expect(journeyWebgl.disposeArrivalHandoffOverlay).toHaveBeenCalled();
    });

    it('should normalize invalid phases to idle', () => {
        strandContinuity.setStrandContinuityState('non-existent-phase');
        expect(state.strandContinuityState.phase).toBe('idle');
    });

    it('should set target and from indices and sync DOM', () => {
        strandContinuity.setStrandContinuityState('preview', { targetIndex: 42, fromIndex: 10, reason: 'test' });
        expect(state.strandContinuityState.phase).toBe('preview');
        expect(state.strandContinuityState.targetIndex).toBe(42);
        expect(state.strandContinuityState.fromIndex).toBe(10);
        expect(state.strandContinuityState.reason).toBe('test');

        expect(document.body.dataset.strandJourney).toBe('preview');
        expect(document.body.dataset.strandJourneyTarget).toBe('42');
        expect(document.body.dataset.strandJourneyFrom).toBe('10');
        expect(document.body.dataset.strandJourneyReason).toBe('test');
    });

    it('should call syncArrivalHandoffOverlay for exploring and arrived phases', () => {
        strandContinuity.setStrandContinuityState('exploring');
        expect(journeyWebgl.syncArrivalHandoffOverlay).toHaveBeenCalled();
        
        vi.clearAllMocks();
        strandContinuity.setStrandContinuityState('arrived');
        expect(journeyWebgl.syncArrivalHandoffOverlay).toHaveBeenCalled();
    });

    it('should clearStrandContinuityState correctly', () => {
        strandContinuity.setStrandContinuityState('preview', { targetIndex: 1 });
        strandContinuity.clearStrandContinuityState('user-abort');
        
        expect(state.strandContinuityState.phase).toBe('idle');
        expect(state.strandContinuityState.reason).toBe('user-abort');
        expect(journeyWebgl.disposeArrivalHandoffOverlay).toHaveBeenCalled();
    });

    describe('getStrandArrivalNote', () => {
        it('returns empty string when phase is not arrived', () => {
            expect(strandContinuity.getStrandArrivalNote()).toBe('');
        });

        it('returns note when phase is arrived and point matches', () => {
            state.points = [
                { id: '1', name: 'Other Shop' },
                { id: '2', name: 'Coffee Shop' }
            ];
            state.strandContinuityState = {
                phase: 'arrived',
                targetIndex: 1,
                fromIndex: 0
            };
            const note = strandContinuity.getStrandArrivalNote(state.points[1]);
            expect(note).toContain('Arrived by connection from');
            expect(note).toContain('Coffee Shop');
        });
    });
});
