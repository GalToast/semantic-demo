import { describe, it, expect, beforeEach, vi } from 'vitest';
import { summarizeNeighborReason, getInsideRelationshipLabel } from '../../js/modules/journey-thread-settler';
import { state, withStateMutation } from '../../js/state';

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

describe('journey-thread-settler', () => {
    beforeEach(() => {
        withStateMutation(() => {
            state.navState = { threadSource: null };
        });
    });

    describe('summarizeNeighborReason', () => {
        it('cleans up "close semantic neighbor" boilerplate', () => {
            const result = summarizeNeighborReason({ reason: 'close semantic neighbor, shared service language' });
            expect(result).toBe('Deep record relationship grounded in shared record language');
        });

        it('injects same-city context', () => {
            const candidate = { reason: 'semantic neighbor', sameCity: true };
            const result = summarizeNeighborReason(candidate);
            expect(result).toBe('Same-city relationship grounded in semantic link');
        });

        it('returns fallback if no reason provided', () => {
            expect(summarizeNeighborReason({})).toBe('Nearby cloud stop.');

            withStateMutation(() => {
                state.navState.threadSource = 'semantic';
            });
            expect(summarizeNeighborReason({})).toBe('Linked stop');
        });

        it('prioritizes relationship roles when summarizing semantic neighbors', () => {
            const result = summarizeNeighborReason({
                relationshipRole: 'upstream',
                roleReason: 'candidate looks like an input provider',
                reason: 'close semantic neighbor, strong contact signal'
            });
            expect(result).toBe('An input provider');
        });
    });

    describe('getInsideRelationshipLabel', () => {
        it('uses relationship role labels before generic relationship labels', () => {
            expect(getInsideRelationshipLabel({ relationshipRole: 'downstream' })).toBe('served by trail');
        });

        it('identifies same-city connections', () => {
            expect(getInsideRelationshipLabel({ sameCity: true })).toBe('On the same trail');
        });

        it('identifies semantic relationships', () => {
            expect(getInsideRelationshipLabel({ source: 'semantic' })).toBe('related connection');
        });

        it('identifies matching record layers', () => {
            expect(getInsideRelationshipLabel({ sameStatus: true })).toBe('Same trail layer');
        });

        it('defaults to nearby connection', () => {
            expect(getInsideRelationshipLabel({})).toBe('Nearby connection');
        });
    });
});
