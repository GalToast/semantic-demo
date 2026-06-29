/**
 * @vitest-environment jsdom
 *
 * Phase 6a — Runtime safety net for the appState partition refactor.
 * Tests the wiring of state-validation.ts helpers into critical write paths.
 *
 * The helpers being tested:
 *   - assertValidEnum(name, value, validSet): throws on invalid value
 *   - validateAppStateEnumFields(): aggregates per-field validation across
 *     appState's enum-typed fields, returns { checked, errors }
 *
 * Phase 6b (partition) will rely on these as the safety net — if a field
 * gets moved into the wrong sub-aggregate, validateAppStateEnumFields will
 * surface it at startup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    assertValidEnum,
    validateAppStateEnumFields,
    VALID_VIEWS,
    VALID_NAV_MODES,
    VALID_PANEL_SURFACES,
    VALID_SEARCH_STATUS,
    VALID_LOADING_PHASES,
    VALID_SEMANTIC_LANE_STATES,
    VALID_MYCELIUM_MODES
} from '@lib/state/state-validation'

// Mock appState as a plain object — we're not testing the Svelte 5 proxy,
// we're testing that the validators reject/accept the right values.
vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        currentView: 'galaxy',
        navState: {
            mode: 'overview',
            surface: 'idle',
            currentView: 'galaxy',
            myceliumMode: 'default'
        },
        searchStatus: 'idle',
        loadingPhaseKey: 'records',
        semanticLaneState: 'checking'
    }
}))

describe('Phase 6a — assertValidEnum helper', () => {
    it('passes silently when value is in validSet', () => {
        expect(() => assertValidEnum('test.view', 'galaxy', VALID_VIEWS)).not.toThrow()
        expect(() => assertValidEnum('test.mode', 'overview', VALID_NAV_MODES)).not.toThrow()
    })

    it('throws when value is not in validSet', () => {
        expect(() => assertValidEnum('test.view', 'invalid-view', VALID_VIEWS)).toThrow(
            /Invalid test\.view.*invalid-view/
        )
    })

    it('throws when value is empty string', () => {
        expect(() => assertValidEnum('test.view', '', VALID_VIEWS)).toThrow(/Invalid test\.view/)
    })

    it('throws when value is non-string (number)', () => {
        expect(() => assertValidEnum('test.view', 42 as unknown as string, VALID_VIEWS)).toThrow(
            /Invalid test\.view/
        )
    })

    it('throws when value is non-string (null)', () => {
        expect(() => assertValidEnum('test.view', null as unknown as string, VALID_VIEWS)).toThrow(
            /Invalid test\.view/
        )
    })

    it('throws when value is non-string (undefined)', () => {
        expect(() => assertValidEnum('test.view', undefined as unknown as string, VALID_VIEWS)).toThrow(
            /Invalid test\.view/
        )
    })

    it('error message includes the field name and valid options', () => {
        try {
            assertValidEnum('foo.bar', 'baz', VALID_NAV_MODES)
            expect.fail('should have thrown')
        } catch (err) {
            const msg = (err as Error).message
            expect(msg).toContain('foo.bar')
            expect(msg).toContain('baz')
            expect(msg).toContain('overview')
            expect(msg).toContain('search')
        }
    })
})

describe('Phase 6a — validateAppStateEnumFields aggregator', () => {
    beforeEach(() => {
        // Reset mock to valid defaults before each test
        vi.resetModules()
    })

    it('returns { checked: N, errors: [] } when all enum fields are valid', () => {
        const state = {
            currentView: 'galaxy',
            navState: {
                mode: 'overview',
                surface: 'idle',
                currentView: 'galaxy',
                myceliumMode: 'default'
            },
            searchStatus: 'idle',
            loadingPhaseKey: 'records',
            semanticLaneState: 'checking'
        }
        const result = validateAppStateEnumFields(state)
        expect(result.checked).toBeGreaterThanOrEqual(6)
        expect(result.errors).toEqual([])
    })

    it('surfaces errors when an enum field has an invalid value', () => {
        const state = {
            currentView: 'invalid-view',
            navState: {
                mode: 'overview',
                surface: 'idle',
                currentView: 'galaxy',
                myceliumMode: 'default'
            },
            searchStatus: 'idle',
            loadingPhaseKey: 'records',
            semanticLaneState: 'checking'
        }
        const result = validateAppStateEnumFields(state)
        expect(result.errors.length).toBeGreaterThanOrEqual(1)
        expect(result.errors[0]).toContain('appState.currentView')
        expect(result.errors[0]).toContain('invalid-view')
    })

    it('reports each invalid field independently (does not mask others)', () => {
        const state = {
            currentView: 'invalid-view',
            navState: {
                mode: 'invalid-mode',
                surface: 'invalid-surface',
                currentView: 'invalid-view',
                myceliumMode: 'invalid-mode'
            },
            searchStatus: 'invalid-status',
            loadingPhaseKey: 'invalid-phase',
            semanticLaneState: 'invalid-lane'
        }
        const result = validateAppStateEnumFields(state)
        expect(result.errors.length).toBeGreaterThanOrEqual(6)
        // Each error should be self-describing
        for (const err of result.errors) {
            expect(err).toMatch(/Invalid appState\./)
        }
    })
})

describe('Phase 6a — VALID_* sets shape (sanity)', () => {
    it('VALID_VIEWS contains expected views', () => {
        expect(VALID_VIEWS.has('galaxy')).toBe(true)
        expect(VALID_VIEWS.has('map')).toBe(true)
        expect(VALID_VIEWS.has('focus')).toBe(true)
        expect(VALID_VIEWS.has('trail')).toBe(true)
        expect(VALID_VIEWS.has('semantic')).toBe(true)
        expect(VALID_VIEWS.size).toBe(5)
    })

    it('VALID_NAV_MODES contains expected modes', () => {
        expect(VALID_NAV_MODES.has('overview')).toBe(true)
        expect(VALID_NAV_MODES.has('search')).toBe(true)
        expect(VALID_NAV_MODES.has('focus')).toBe(true)
        expect(VALID_NAV_MODES.has('inside')).toBe(true)
        expect(VALID_NAV_MODES.has('map')).toBe(true)
    })

    it('VALID_PANEL_SURFACES is non-empty', () => {
        expect(VALID_PANEL_SURFACES.size).toBeGreaterThan(0)
    })

    it('VALID_SEARCH_STATUS contains all 6 search states', () => {
        expect(VALID_SEARCH_STATUS.size).toBe(6)
        expect(VALID_SEARCH_STATUS.has('idle')).toBe(true)
        expect(VALID_SEARCH_STATUS.has('searching')).toBe(true)
        expect(VALID_SEARCH_STATUS.has('error')).toBe(true)
    })

    it('VALID_LOADING_PHASES contains 4 phases', () => {
        expect(VALID_LOADING_PHASES.size).toBe(4)
        expect(VALID_LOADING_PHASES.has('records')).toBe(true)
        expect(VALID_LOADING_PHASES.has('launch')).toBe(true)
    })

    it('VALID_SEMANTIC_LANE_STATES contains 4 states', () => {
        expect(VALID_SEMANTIC_LANE_STATES.size).toBe(4)
        expect(VALID_SEMANTIC_LANE_STATES.has('checking')).toBe(true)
    })

    it('VALID_MYCELIUM_MODES is non-empty', () => {
        expect(VALID_MYCELIUM_MODES.size).toBeGreaterThan(0)
    })
})