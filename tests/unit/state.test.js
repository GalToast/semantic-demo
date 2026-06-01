import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state, withStateMutation, _rawState } from '../../js/state.js';

describe('state.js', () => {
    let originalWarn;

    beforeEach(() => {
        // Suppress console.warn during test runs so we can spy on it
        originalWarn = console.warn;
        console.warn = vi.fn();
    });

    afterEach(() => {
        console.warn = originalWarn;
        vi.restoreAllMocks();
    });

    describe('State Initialization', () => {
        it('should initialize with expected default values', () => {
            expect(state.points).toEqual([]);
            expect(state.mapInitialized).toBe(false);
            expect(state.currentView).toBe('galaxy');
            expect(state.semanticDiveMode).toBe(false);
            expect(state.trailDepth).toBe(0);
        });
    });

    describe('State Mutation Proxy', () => {
        it('should throw an error when mutating critical keys without withStateMutation', () => {
            expect(() => {
                state.currentView = 'map';
            }).toThrow('[State Error]');
        });

        it('should NOT throw an error when mutating critical keys WITH withStateMutation', () => {
            expect(() => {
                withStateMutation(() => {
                    state.currentView = 'map';
                });
            }).not.toThrow();
            expect(state.currentView).toBe('map');

            // Reset
            withStateMutation(() => {
                state.currentView = 'galaxy';
            });
        });

        it('should NOT warn when mutating non-critical keys', () => {
            state.dataLoadAttempt = 1;

            expect(console.warn).not.toHaveBeenCalled();
            expect(state.dataLoadAttempt).toBe(1);
            
            // Reset
            state.dataLoadAttempt = 0;
        });

        it('should correctly restore mutation flag even if an error is thrown inside withStateMutation', () => {
            expect(() => {
                withStateMutation(() => {
                    throw new Error('Test error');
                });
            }).toThrow('Test error');

            // The flag should be reset, meaning a subsequent unprotected critical mutation should throw again
            expect(() => {
                state.currentView = 'map';
            }).toThrow('[State Error]');
        });
    });

    describe('Backward Compatibility Getters/Setters', () => {
        it('semanticDiveMode should be derived from trailDepth', () => {
            // Act 1
            state.trailDepth = 2;
            // Assert 1
            expect(state.semanticDiveMode).toBe(true);
            
            // Act 2
            state.trailDepth = 1;
            // Assert 2
            expect(state.semanticDiveMode).toBe(false);
        });

        it('setting semanticDiveMode should update trailDepth', () => {
            // Act 1
            state.semanticDiveMode = true;
            // Assert 1
            expect(state.trailDepth).toBe(2);
            
            // Act 2
            state.semanticDiveMode = false;
            // Assert 2
            expect(state.trailDepth).toBe(0);
        });
    });
});
