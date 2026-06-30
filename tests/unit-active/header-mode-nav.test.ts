/**
 * @vitest-environment jsdom
 *
 * Unit coverage for the pure-logic helpers extracted from Header.svelte in
 * PR-D2 into src/lib/components/header/mode-nav.ts and
 * src/lib/components/header/mode-constants.ts.
 *
 * These tests cover the chip-rail logic in isolation: selection lock,
 * active-state detection, keyboard navigation (roving tabindex), mode
 * dispatch. The Svelte component keeps the DOM-event glue only.
 *
 * Replaces 4 source-grep test files retired in PR-D1.
 */
import { describe, it, expect } from 'vitest'
import {
    MODE_DESCRIPTIONS,
    modes,
    SELECTION_DEPENDENT_MODES
} from '@lib/components/header/mode-constants'
import {
    isModeLocked,
    isActive,
    getActiveIndexForMode,
    getActiveDescription,
    nextEnabledIndex,
    computeModeKeydown,
    indexForModeId,
    selectMode
} from '@lib/components/header/mode-nav'
import type { NavMode } from '@lib/types/state'

describe('header-mode-constants — module shape', () => {
    it('exports exactly 6 mode options in chip order (Overview → Map)', () => {
        expect(modes.map((m) => m.id)).toEqual(['overview', 'search', 'trail', 'focus', 'inside', 'map'])
    })

    it('every mode has a non-empty label, description, and icon sprite id', () => {
        for (const m of modes) {
            expect(m.label.length).toBeGreaterThan(0)
            expect(m.description.length).toBeGreaterThan(0)
            expect(m.iconId.startsWith('icon-')).toBe(true)
        }
    })

    it('MODE_DESCRIPTIONS is keyed by every NavMode', () => {
        const expectedKeys: NavMode[] = [
            'overview',
            'search',
            'trail',
            'focus',
            'inside',
            'map',
            'bridge'
        ]
        for (const k of expectedKeys) {
            expect(MODE_DESCRIPTIONS[k]).toBeDefined()
            expect(MODE_DESCRIPTIONS[k].length).toBeGreaterThan(0)
        }
    })

    it('SELECTION_DEPENDENT_MODES contains exactly trail/focus/inside', () => {
        expect([...SELECTION_DEPENDENT_MODES].sort()).toEqual(['focus', 'inside', 'trail'])
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
})

describe('isActive — maps navState to chip "active" state', () => {
    it('non-map modes match by NavMode id', () => {
        expect(isActive('overview', 'overview', 'galaxy')).toBe(true)
        expect(isActive('focus', 'focus', 'galaxy')).toBe(true)
        expect(isActive('focus', 'overview', 'galaxy')).toBe(false)
    })

    it('the "map" mode is active only when currentView is "map"', () => {
        expect(isActive('map', 'overview', 'map')).toBe(true)
        expect(isActive('map', 'focus', 'map')).toBe(true)
        expect(isActive('map', 'overview', 'galaxy')).toBe(false)
    })
})

describe('getActiveIndexForMode — chip-rail index lookup', () => {
    it('returns the matching index for plain modes', () => {
        expect(getActiveIndexForMode('overview', 'galaxy')).toBe(0)
        expect(getActiveIndexForMode('search', 'galaxy')).toBe(1)
        expect(getActiveIndexForMode('focus', 'galaxy')).toBe(3)
        expect(getActiveIndexForMode('inside', 'galaxy')).toBe(4)
    })

    it('returns the map-chip index when activeMode is not on the chip rail and currentView is "map"', () => {
        // 'overview' in the example slot returns index 0 even when currentView is "map"
        // (the original logic uses findIndex, returning the first match — mode-match wins
        // over view-match when both could apply). For a clean "map only" lookup the activeMode
        // must be off-rail (e.g. "bridge").
        expect(getActiveIndexForMode('overview', 'map')).toBe(0)
        expect(getActiveIndexForMode('bridge', 'map')).toBe(5)
    })

    it('returns 0 (Overview) as a safe default when nothing matches', () => {
        // bridge mode is not in the visible chip rail
        expect(getActiveIndexForMode('bridge', 'galaxy')).toBe(0)
    })
})

describe('getActiveDescription — header-description tooltip text', () => {
    it('returns the matching mode description', () => {
        expect(getActiveDescription('overview', 'galaxy')).toBe(MODE_DESCRIPTIONS.overview)
        expect(getActiveDescription('focus', 'galaxy')).toBe(MODE_DESCRIPTIONS.focus)
    })

    it('returns the map description when activeMode is off-rail and currentView is "map"', () => {
        // See note on getActiveIndexForMode: when activeMode also matches a chip
        // (e.g. 'overview' is on the rail), isActive('overview', 'overview', 'map') is
        // true, so the overview description wins. Only off-rail modes fall through
        // to the map branch.
        expect(getActiveDescription('bridge', 'map')).toBe('Geographic map view of the county.')
    })

    it('returns empty string when no mode matches', () => {
        expect(getActiveDescription('bridge', 'galaxy')).toBe('')
    })
})

describe('nextEnabledIndex — wrapping roving-tabindex navigation', () => {
    // Use a helper to build a lock-predicate from a Set of locked ids.
    const lockSet = (lockedIds: ReadonlyArray<string>): ((id: string) => boolean) => {
        const set = new Set(lockedIds)
        return (id) => set.has(id)
    }

    it('moves forward by 1 to the next non-locked chip (no wrap)', () => {
        const isLocked = lockSet([])
        expect(nextEnabledIndex(0, 1, isLocked)).toBe(1)
        expect(nextEnabledIndex(2, 1, isLocked)).toBe(3)
    })

    it('moves backward by 1 to the previous non-locked chip (no wrap)', () => {
        const isLocked = lockSet([])
        expect(nextEnabledIndex(3, -1, isLocked)).toBe(2)
        expect(nextEnabledIndex(0, -1, isLocked)).toBe(5) // wraps to end
    })

    it('skips locked chips in the direction of motion', () => {
        // Lock trail (index 2): from overview (0) rightward → search (1) → focus (3)
        const isLocked = lockSet(['trail'])
        expect(nextEnabledIndex(0, 1, isLocked)).toBe(1)
        expect(nextEnabledIndex(1, 1, isLocked)).toBe(3) // skips trail → focus
        expect(nextEnabledIndex(3, 1, isLocked)).toBe(4) // → inside
    })

    it('wraps around the ends (last → first, first → last)', () => {
        const isLocked = lockSet([])
        expect(nextEnabledIndex(5, 1, isLocked)).toBe(0) // map → overview
        expect(nextEnabledIndex(0, -1, isLocked)).toBe(5) // overview → map
    })

    it('returns the same index if every other chip is locked', () => {
        // Lock everything except overview
        const isLocked = lockSet(['search', 'trail', 'focus', 'inside', 'map'])
        expect(nextEnabledIndex(0, 1, isLocked)).toBe(0)
        expect(nextEnabledIndex(0, -1, isLocked)).toBe(0)
    })
})

describe('computeModeKeydown — pure keyboard handler logic', () => {
    const lockSet = (lockedIds: ReadonlyArray<string>): ((id: string) => boolean) => {
        const set = new Set(lockedIds)
        return (id) => set.has(id)
    }

    it('ArrowRight / ArrowDown advances 1 (forward, skipping locked)', () => {
        const isLocked = lockSet([])
        expect(computeModeKeydown('ArrowRight', 0, isLocked)).toEqual({ kind: 'focus', index: 1 })
        expect(computeModeKeydown('ArrowDown', 2, isLocked)).toEqual({ kind: 'focus', index: 3 })
    })

    it('ArrowLeft / ArrowUp retreats 1 (backward, skipping locked)', () => {
        const isLocked = lockSet([])
        expect(computeModeKeydown('ArrowLeft', 3, isLocked)).toEqual({ kind: 'focus', index: 2 })
        expect(computeModeKeydown('ArrowUp', 1, isLocked)).toEqual({ kind: 'focus', index: 0 })
    })

    it('Home jumps to first enabled chip', () => {
        const isLocked = lockSet([])
        expect(computeModeKeydown('Home', 4, isLocked)).toEqual({ kind: 'focus', index: 0 })
    })

    it('End jumps to last enabled chip', () => {
        const isLocked = lockSet([])
        expect(computeModeKeydown('End', 1, isLocked)).toEqual({ kind: 'focus', index: 5 })
    })

    it('Home with trail/focus/inside locked skips to first non-locked (overview)', () => {
        const isLocked = lockSet(['trail', 'focus', 'inside'])
        expect(computeModeKeydown('Home', 3, isLocked)).toEqual({ kind: 'focus', index: 0 })
    })

    it('non-arrow keys (Enter / Space / letters) return noop', () => {
        const isLocked = lockSet([])
        expect(computeModeKeydown('Enter', 0, isLocked)).toEqual({ kind: 'noop' })
        expect(computeModeKeydown(' ', 0, isLocked)).toEqual({ kind: 'noop' })
        expect(computeModeKeydown('a', 0, isLocked)).toEqual({ kind: 'noop' })
    })

    it('returns noop when every chip is locked (defensive)', () => {
        const isLocked = lockSet(['overview', 'search', 'trail', 'focus', 'inside', 'map'])
        expect(computeModeKeydown('ArrowRight', 0, isLocked)).toEqual({ kind: 'noop' })
    })
})

describe('indexForModeId — find mode index by id', () => {
    it('returns the index for known ids', () => {
        expect(indexForModeId('overview')).toBe(0)
        expect(indexForModeId('trail')).toBe(2)
        expect(indexForModeId('map')).toBe(5)
    })

    it('returns -1 for unknown / null / undefined ids', () => {
        expect(indexForModeId('bridge')).toBe(-1) // bridge not on chip rail
        expect(indexForModeId('bogus')).toBe(-1)
        expect(indexForModeId(null)).toBe(-1)
        expect(indexForModeId(undefined)).toBe(-1)
        expect(indexForModeId('')).toBe(-1)
    })
})

describe('selectMode — action dispatch + URL sync', () => {
    function makeCtx(): {
        navActions: { RETURN_OVERVIEW: 'RET'; SET_VIEW: 'SETV'; SET_SURFACE: 'SETS' }
        calls: string[]
        ctx: Parameters<typeof selectMode>[2]
    } {
        const calls: string[] = []
        const navActions = { RETURN_OVERVIEW: 'RET', SET_VIEW: 'SETV', SET_SURFACE: 'SETS' }
        return {
            navActions,
            calls,
            ctx: {
                navActions,
                dispatchNavTransition: (action, payload) => {
                    calls.push(`${String(action)}${payload ? ':' + JSON.stringify(payload) : ''}`)
                    return null
                },
                updateUrlState: () => {
                    calls.push('URL')
                },
                debugWarn: (...args) => {
                    calls.push(`warn:${args.map((a) => String(a)).join('|')}`)
                }
            }
        }
    }

    it('overview dispatches RETURN_OVERVIEW and syncs the URL', () => {
        const t = makeCtx()
        const idx = selectMode('overview', true, t.ctx)
        expect(idx).toBe(0)
        expect(t.calls).toEqual(['RET', 'URL'])
    })

    it('search dispatches SET_SURFACE with surface=search', () => {
        const t = makeCtx()
        const idx = selectMode('search', false, t.ctx)
        expect(idx).toBe(1)
        expect(t.calls).toEqual(['SETS:{"surface":"search"}', 'URL'])
    })

    it('map dispatches SET_VIEW then SET_SURFACE (view-level switch)', () => {
        const t = makeCtx()
        const idx = selectMode('map', false, t.ctx)
        expect(idx).toBe(5)
        expect(t.calls).toEqual([
            'SETV:{"view":"map"}',
            'SETS:{"surface":"map"}',
            'URL'
        ])
    })

    it('locked modes short-circuit (no dispatch, no URL sync)', () => {
        const t = makeCtx()
        const idx = selectMode('focus', false /* no selection */, t.ctx)
        expect(idx).toBe(-1)
        expect(t.calls).toEqual([])
    })

    it('focus / inside / trail with a selection proceed normally', () => {
        for (const id of ['focus', 'inside', 'trail'] as const) {
            const t = makeCtx()
            const idx = selectMode(id, true /* selected */, t.ctx)
            expect(idx).toBeGreaterThanOrEqual(0)
            expect(t.calls.length).toBe(2) // one nav + URL
            expect(t.calls[1]).toBe('URL')
        }
    })

    it('catches and debug-warns updateUrlState failures but still returns the index', () => {
        const t = makeCtx()
        t.ctx.updateUrlState = () => {
            throw new Error('boom')
        }
        const idx = selectMode('overview', true, t.ctx)
        expect(idx).toBe(0)
        expect(t.calls[0]).toBe('RET')
        expect(t.calls[1]).toMatch(/^warn:.*boom/)
    })
})
