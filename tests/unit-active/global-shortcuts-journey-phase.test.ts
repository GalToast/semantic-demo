/**
 * Reggression test for the Ctrl/Cmd+1-6 → setJourneyPhase parity fix in
 * `src/lib/keyboard/global-shortcuts.ts`.
 *
 * Background: the keyboard mode-switch path dispatched the nav transition + URL
 * sync directly (mirroring selectMode's body) but did NOT mirror mode-nav.ts:166
 * (`ctx.setJourneyPhase?.(modeId === 'map' ? 'overview' : modeId)`). The chip
 * path set `journeyStore().phase`; the keyboard path did not, so a keyboard
 * switch left `journeyStore().phase` stale relative to `navState.mode`. That
 * divergence leaked into `parity-resolvers.ts` (`ctx.journey.phase`, read by the
 * GlobalParityProvider) and the JourneyChrome idle/overview gate, so the chip
 * and keyboard paths rendered chrome/parity differently for the same mode.
 *
 * Fix shape: import `setJourneyPhase` from the journey store and call
 * `setJourneyPhase(modeId === 'map' ? 'overview' : modeId)` at the end of the
 * Ctrl/Cmd+1-6 block — mirroring mode-nav.ts:166 verbatim.
 *
 * Contract style mirrors `w7-global-shortcuts-isformfield-split.test.ts` and
 * `w46-b3-global-shortcuts-helper.test.ts`: substring-on-source assertions
 * (indexOf + slice + regex) rather than runtime keydown simulation, because
 * importing the navigation/journey stores transitively requires a Svelte init
 * environment (the prior tests explicitly avoid that fragility).
 */
import { describe, it, expect, beforeAll } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const SRC_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/global-shortcuts.ts')
let src: string
beforeAll(() => {
    src = readFileSync(SRC_PATH, 'utf-8')
})

describe('Keyboard Ctrl/Cmd+1-6 closes the setJourneyPhase drift with selectMode', () => {
    it('imports setJourneyPhase from the journey store', () => {
        expect(src).toMatch(
            /import\s+\{\s*setJourneyPhase\s*\}\s+from\s+['"]@lib\/stores\/journey\.svelte(?:\.ts)?['"]/
        )
    })

    it('the Ctrl/Cmd+1-6 block calls setJourneyPhase with selectMode parity (map→overview)', () => {
        // Anchor on the Ctrl+1-6 block opener (same anchor the W7 test uses).
        const ctrlOpenIdx = src.indexOf('((e.ctrlKey || e.metaKey) && /^[1-6]$/')
        expect(ctrlOpenIdx).toBeGreaterThan(-1)

        // Slice a generous window — the block includes the isTextInputField guard,
        // the switch with 6 cases (Ctrl+5 carries the KH-INSIDE-SHORTCUT-FIX comment
        // block), and now the trailing setJourneyPhase parity call + its 8-line
        // comment. 4800 chars comfortably covers the whole Ctrl/Cmd+1-6 block.
        const block = src.slice(ctrlOpenIdx, ctrlOpenIdx + 4800)

        // Must call setJourneyPhase exactly as mode-nav.ts:166 does, so both
        // paths produce identical journeyStore().phase for the same mode.
        // (Allow either quote style.)
        expect(block).toMatch(
            /setJourneyPhase\(\s*modeId\s*===\s*['"]map['"]\s*\?\s*['"]overview['"]\s*:\s*modeId\s*\)/
        )
    })

    it('the setJourneyPhase call is placed AFTER the per-mode switch (mirrors selectMode order)', () => {
        // mode-nav.ts:166 performs the dispatch first (if/else-if SET_SURFACE), then
        // calls setJourneyPhase. We assert the keyboard path mirrors that ordering:
        // the call must appear after the case '6' block's trailing `break` + the
        // switch's closing brace, and before the block's terminal `return`.
        const ctrlOpenIdx = src.indexOf('((e.ctrlKey || e.metaKey) && /^[1-6]$/')
        expect(ctrlOpenIdx).toBeGreaterThan(-1)
        const block = src.slice(ctrlOpenIdx, ctrlOpenIdx + 4800)

        const case6BreakIdx = block.indexOf("updateUrlState({ view: 'map', surface: 'map' }")
        expect(case6BreakIdx).toBeGreaterThan(-1)

        const afterCase6 = block.slice(case6BreakIdx)
        const setJourneyPhaseIdx = afterCase6.indexOf('setJourneyPhase(')
        expect(setJourneyPhaseIdx).toBeGreaterThan(-1)

        // It must sit between the switch close (`}`) and the block's `return`.
        // Concretely: there should be a `return` AFTER the setJourneyPhase call
        // still inside this block.
        const afterCall = afterCase6.slice(setJourneyPhaseIdx)
        expect(afterCall).toMatch(/return\b/)
    })

    it('does not regress the per-case nav transitions or the Ctrl+5 inside-activation', () => {
        // Parity-spot fix only — the existing per-mode dispatch branches must
        // remain intact (these are pairs to the W46-B3 contract; re-asserted so
        // the new setJourneyPhase call doesn't accidentally displace them).
        const ctrlOpenIdx = src.indexOf('((e.ctrlKey || e.metaKey) && /^[1-6]$/')
        const block = src.slice(ctrlOpenIdx, ctrlOpenIdx + 4800)

        expect(block).toContain('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW')
        expect(block).toContain("NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' }")
        expect(block).toContain("NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' }")
        expect(block).toContain("NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' }")
        expect(block).toContain("NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' }")
        expect(block).toContain("NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' }")
        // KH-INSIDE-SHORTCUT-FIX: Ctrl+5 still activates the semantic-dive surface.
        expect(block).toContain('executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE)')
    })
})
