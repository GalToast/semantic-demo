/**
 * Regression test: WALK_THREAD / WALK_TO must preserve the `focus-search` surface
 * instead of clobbering it back to `focus` (Tier-1 fix #2 / W15 surface regression).
 *
 * When a user walks a semantic neighbor while the `focus-search` surface is active,
 * the transition must keep `focus-search` so the search chrome stays open. The fix
 * changed the hard-coded `surface: 'focus'` to
 * `surface: (current.surface === 'focus-search' ? 'focus-search' : 'focus')`.
 *
 * Two complementary guards:
 *   1. Source-text guard — pins the preserve ternary and bans the bare
 *      `surface: 'focus' as PanelSurface` clobber inside the WALK_THREAD/WALK_TO
 *      case (mirrors the t1-keyboard-help source-text style).
 *   2. Behavioral guard — drives `dispatchNavTransition(WALK_THREAD/WALK_TO)`
 *      through the real mode-transitions + navigation-state modules in jsdom and
 *      asserts the surface is preserved end-to-end (the W15 regression scenario).
 *      A behavioral regression that re-clobbers the surface fails here even if the
 *      source-text remains cosmetic.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS
} from '@lib/stores/navigation/mode-transitions.svelte.ts'
import {
    _readNavSnapshot,
    writeNavStateMirror,
    resetNavState
} from '@lib/stores/navigation/navigation-state.svelte.ts'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('t1 WALK_THREAD/WALK_TO preserves focus-search surface', () => {
    describe('source-text guard (preserve ternary present, no bare clobber)', () => {
        it('the WALK_THREAD/WALK_TO case keeps focus-search instead of hard-coding focus', () => {
            const src = read('../../src/lib/stores/navigation/mode-transitions.svelte.ts')

            const m = src.match(
                /case NAV_TRANSITION_ACTIONS\.WALK_THREAD:[\s\S]*?case NAV_TRANSITION_ACTIONS\.WALK_TO: \{[\s\S]*?break\s*\}/
            )
            expect(m, 'WALK_THREAD/WALK_TO case block should be present').toBeTruthy()
            const block = m![0]

            // Fix present: preserves focus-search when the current surface is focus-search.
            expect(block).toContain("current.surface === 'focus-search' ? 'focus-search' : 'focus'")

            // Old clobber absent: no bare `surface: 'focus' as PanelSurface` that ignores focus-search.
            // (The false branch of the ternary is `: 'focus'`, not `surface: 'focus' as PanelSurface`.)
            expect(block).not.toContain("surface: 'focus' as PanelSurface")
        })
    })

    describe('behavioral (surface preserved end-to-end through dispatch + nav mirror)', () => {
        beforeEach(() => {
            // Each `it` starts from the canonical initial nav state so prior
            // mutations and walk-history don't leak between cases.
            resetNavState()
        })

        it('WALK_THREAD keeps focus-search surface (the W15 regression scenario)', () => {
            // Simulate focus-search active (user searching a neighbor while focused).
            writeNavStateMirror({ mode: 'focus', surface: 'focus-search', focusedIndex: 5 })
            expect(_readNavSnapshot().surface).toBe('focus-search')

            // User walks a different neighbor; WALK_THREAD must NOT close focus-search.
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_THREAD, { index: 7 })

            const after = _readNavSnapshot()
            expect(after.surface).toBe('focus-search')
            expect(after.mode).toBe('trail')
            expect(after.focusedIndex).toBe(7)
        })

        it('WALK_TO keeps focus-search surface', () => {
            writeNavStateMirror({ mode: 'focus', surface: 'focus-search', focusedIndex: 3 })
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 11 })

            const after = _readNavSnapshot()
            expect(after.surface).toBe('focus-search')
            expect(after.mode).toBe('trail')
            expect(after.focusedIndex).toBe(11)
        })

        it('WALK_THREAD falls back to focus when surface was focus (default dive, no regression)', () => {
            writeNavStateMirror({ mode: 'focus', surface: 'focus', focusedIndex: 2 })
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_THREAD, { index: 8 })

            const after = _readNavSnapshot()
            expect(after.surface).toBe('focus')
            expect(after.mode).toBe('trail')
            expect(after.focusedIndex).toBe(8)
        })
    })
})
