/**
 * @vitest-environment jsdom
 *
 * Regression tests for auditNestedStateMutations() and the 6 entries in
 * NESTED_STATE_PATHS. Covers both reject-on-invalid and allow-on-valid
 * branch behavior for nested state paths that the outer Proxy `set` trap
 * cannot reach.
 */
import { describe, it, expect } from 'vitest'

import { auditNestedStateMutations, NESTED_STATE_PATHS } from '@lib/state/state-validation'

// ── Helper: build a minimal valid state snapshot ────────────────────────────

/** Returns a state object where all 6 NESTED_STATE_PATHS have valid values. */
function validStateSnapshot(): Record<string, unknown> {
    return {
        navState: {
            mode: 'overview',
            surface: 'idle',
            currentView: 'galaxy',
            myceliumMode: 'dormant'
        },
        searchState: {
            searchStatus: 'idle'
        },
        focusState: {
            focusTransitionMode: 'idle'
        }
    }
}

// ── auditNestedStateMutations — overall contract ──────────────────────────

describe('auditNestedStateMutations — overall contract', () => {
    it('returns empty array when all 6 nested paths have valid values', () => {
        const state = validStateSnapshot()
        const errors = auditNestedStateMutations(state)
        expect(errors).toEqual([])
    })

    it('returns error for a single invalid nested path (navState.mode)', () => {
        const state = validStateSnapshot()
        state.navState = { ...state.navState, mode: 'bogus' }
        const errors = auditNestedStateMutations(state)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('navState.mode')
        expect(errors[0]).toContain('bogus')
    })

    it('returns errors for multiple invalid nested paths simultaneously', () => {
        const state = validStateSnapshot()
        state.navState = { ...state.navState, mode: 'bogus', surface: 'lolnope' }
        state.searchState = { ...state.searchState, searchStatus: 'invalid' }
        const errors = auditNestedStateMutations(state)
        // 3 distinct errors: navState.mode + navState.surface + searchState.searchStatus
        expect(errors.length).toBeGreaterThanOrEqual(3)
        expect(errors.some((e) => e.includes('navState.mode'))).toBe(true)
        expect(errors.some((e) => e.includes('navState.surface'))).toBe(true)
        expect(errors.some((e) => e.includes('searchState.searchStatus'))).toBe(true)
    })

    it('skips gracefully when entire sub-aggregate is missing', () => {
        const state: Record<string, unknown> = {
            // navState present but searchState and focusState absent
            navState: {
                mode: 'overview',
                surface: 'idle',
                currentView: 'galaxy',
                myceliumMode: 'dormant'
            }
        }
        const errors = auditNestedStateMutations(state)
        // Only the 4 navState paths are present; searchState + focusState skipped
        expect(errors).toEqual([])
    })

    it('skips gracefully when sub-aggregate is null', () => {
        const state: Record<string, unknown> = {
            navState: null,
            searchState: null,
            focusState: null
        }
        const errors = auditNestedStateMutations(state)
        expect(errors).toEqual([])
    })

    it('skips gracefully when sub-aggregate is a primitive (not object)', () => {
        const state: Record<string, unknown> = {
            navState: 'string-not-object',
            searchState: 42
        }
        const errors = auditNestedStateMutations(state)
        expect(errors).toEqual([])
    })

    it('returns empty array when state itself is empty', () => {
        const errors = auditNestedStateMutations({})
        expect(errors).toEqual([])
    })
})

// ── Path-level: reject-on-invalid + allow-on-valid (3 of 6 paths) ──────────

describe('auditNestedStateMutations — path-level navState.mode', () => {
    it('accepts valid navState.mode (overview, search, focus, etc.)', () => {
        for (const mode of ['overview', 'search', 'focus', 'inside', 'map', 'trail', 'bridge']) {
            const state = validStateSnapshot()
            state.navState = { ...state.navState, mode }
            expect(auditNestedStateMutations(state)).toEqual([])
        }
    })

    it('rejects invalid navState.mode', () => {
        const state = validStateSnapshot()
        state.navState = { ...state.navState, mode: 'not-a-real-mode' }
        const errors = auditNestedStateMutations(state)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('navState.mode')
    })
})

describe('auditNestedStateMutations — path-level searchState.searchStatus', () => {
    it('accepts valid searchState.searchStatus (idle, searching, focusing, results, empty, error)', () => {
        for (const status of ['idle', 'searching', 'focusing', 'results', 'empty', 'error']) {
            const state = validStateSnapshot()
            state.searchState = { ...state.searchState, searchStatus: status }
            expect(auditNestedStateMutations(state)).toEqual([])
        }
    })

    it('rejects invalid searchState.searchStatus', () => {
        const state = validStateSnapshot()
        state.searchState = { ...state.searchState, searchStatus: 'bogus-status' }
        const errors = auditNestedStateMutations(state)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('searchState.searchStatus')
    })

    it('rejects non-string searchState.searchStatus', () => {
        const state = validStateSnapshot()
        state.searchState = { ...state.searchState, searchStatus: 42 as unknown as string }
        const errors = auditNestedStateMutations(state)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('searchState.searchStatus')
    })
})

describe('auditNestedStateMutations — path-level focusState.focusTransitionMode', () => {
    it('accepts valid focusState.focusTransitionMode (idle, entering, settling, inside, exiting)', () => {
        for (const mode of ['idle', 'entering', 'settling', 'inside', 'exiting']) {
            const state = validStateSnapshot()
            state.focusState = { ...state.focusState, focusTransitionMode: mode }
            expect(auditNestedStateMutations(state)).toEqual([])
        }
    })

    it('rejects invalid focusState.focusTransitionMode', () => {
        const state = validStateSnapshot()
        state.focusState = { ...state.focusState, focusTransitionMode: 'bogus-transition' }
        const errors = auditNestedStateMutations(state)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('focusState.focusTransitionMode')
    })
})

// ── NESTED_STATE_PATHS structure ─────────────────────────────────────────

describe('NESTED_STATE_PATHS — shape and keys', () => {
    it('contains exactly the 12 documented nested paths', () => {
        const keys = Object.keys(NESTED_STATE_PATHS)
        expect(keys).toEqual([
            'navState.mode',
            'navState.surface',
            'navState.currentView',
            'navState.myceliumMode',
            'searchState.searchStatus',
            'focusState.focusTransitionMode',
            // W66: the 6 phase state machines wired into the dev nested audit
            // (state-validation.ts NESTED_STATE_PATHS).
            'terrainHandoffState.phase',
            'routeExplorationState.phase',
            'routeChoreographyState.phase',
            'strandContinuityState.phase',
            'focusOrbitSlackState.phase',
            'arrivalHandoffDiagnostics.phase'
        ])
    })

    it('each entry has a callable validator that returns null for valid values', () => {
        const validPairs: Array<[string, unknown]> = [
            ['navState.mode', 'overview'],
            ['navState.surface', 'idle'],
            ['navState.currentView', 'galaxy'],
            ['navState.myceliumMode', 'dormant'],
            ['searchState.searchStatus', 'idle'],
            ['focusState.focusTransitionMode', 'idle'],
            ['terrainHandoffState.phase', 'idle'],
            ['routeExplorationState.phase', 'idle'],
            ['routeChoreographyState.phase', 'overview'],
            ['strandContinuityState.phase', 'idle'],
            ['focusOrbitSlackState.phase', 'idle'],
            ['arrivalHandoffDiagnostics.phase', 'idle']
        ]
        for (const [path, value] of validPairs) {
            const validator = NESTED_STATE_PATHS[path]
            expect(typeof validator).toBe('function')
            expect(validator(value)).toBeNull()
        }
    })

    it('each entry rejects an obviously invalid value', () => {
        const invalidPairs: Array<[string, unknown]> = [
            ['navState.mode', 'bogus-mode'],
            ['navState.surface', 'bogus-surface'],
            ['navState.currentView', 'bogus-view'],
            ['navState.myceliumMode', 'bogus-mycelium'],
            ['searchState.searchStatus', 'bogus-status'],
            ['focusState.focusTransitionMode', 'bogus-transition'],
            ['terrainHandoffState.phase', 'bogus-phase'],
            ['routeExplorationState.phase', 'bogus-phase'],
            ['routeChoreographyState.phase', 'bogus-phase'],
            ['strandContinuityState.phase', 'bogus-phase'],
            ['focusOrbitSlackState.phase', 'bogus-phase'],
            ['arrivalHandoffDiagnostics.phase', 'bogus-phase']
        ]
        for (const [path, value] of invalidPairs) {
            const validator = NESTED_STATE_PATHS[path]
            const err = validator(value)
            expect(err).not.toBeNull()
            expect(err).toContain(path)
        }
    })

    it('each entry rejects a non-string value', () => {
        for (const path of Object.keys(NESTED_STATE_PATHS)) {
            const validator = NESTED_STATE_PATHS[path]
            const err = validator(42)
            expect(err).not.toBeNull()
            expect(err).toContain('must be a string')
        }
    })
})
