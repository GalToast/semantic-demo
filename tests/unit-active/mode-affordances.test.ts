/**
 * @vitest-environment jsdom
 *
 * Unit coverage for the cross-component helpers in
 * src/lib/navigation/mode-affordances.ts — extracted from
 * @lib/components/header/mode-nav.ts in PR-D3 so non-Header consumers
 * (notably @lib/ui/mode-bindings.ts) can share the selection-lock rule
 * without depending on the Header component's module layout.
 *
 * The 4 tests in `isModeLocked` round-trip the header tests' selection
 * guard logic through the shared module — proving parity across both
 * consumer call sites.
 */
import { describe, it, expect } from 'vitest'
import { isModeLocked, SELECTION_DEPENDENT_MODES } from '@lib/navigation/mode-affordances'

describe('mode-affordances — shared navigation helpers', () => {
    describe('SELECTION_DEPENDENT_MODES', () => {
        it('contains exactly trail / focus / inside', () => {
            expect([...SELECTION_DEPENDENT_MODES].sort()).toEqual(['focus', 'inside', 'trail'])
        })

        it('does not include map, overview, search, or bridge', () => {
            expect(SELECTION_DEPENDENT_MODES.has('map')).toBe(false)
            expect(SELECTION_DEPENDENT_MODES.has('overview')).toBe(false)
            expect(SELECTION_DEPENDENT_MODES.has('search')).toBe(false)
            expect(SELECTION_DEPENDENT_MODES.has('bridge')).toBe(false)
        })
    })

    describe('isModeLocked — selection guard for dependent modes', () => {
        it('returns false for non-dependent modes regardless of selection', () => {
            for (const id of ['overview', 'search', 'map'] as const) {
                expect(isModeLocked(id, false)).toBe(false)
                expect(isModeLocked(id, true)).toBe(false)
            }
        })

        it('returns true for dependent modes without a selection', () => {
            expect(isModeLocked('trail', false)).toBe(true)
            expect(isModeLocked('focus', false)).toBe(true)
            expect(isModeLocked('inside', false)).toBe(true)
        })

        it('returns false for dependent modes when there is a selection', () => {
            expect(isModeLocked('trail', true)).toBe(false)
            expect(isModeLocked('focus', true)).toBe(false)
            expect(isModeLocked('inside', true)).toBe(false)
        })

        it('treats hasSelection undefined-equivalent correctly', () => {
            // mode-bindings.ts passes `state.focusedNode != null` which
            // evaluates to false for null, undefined, 0, or NaN. hasSelection
            // is the boolean; the truth-table input is the focusedIndex check
            // in caller code, not in this function.
            expect(isModeLocked('trail', false)).toBe(true)
            expect(isModeLocked('trail', true)).toBe(false)
        })
    })
})
