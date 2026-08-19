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
 * `setJourneyPhase(modeId === 'map' ? 'overview' : modeId)` in the
 * Ctrl/Cmd+1-6 block — mirroring mode-nav.ts's selectMode funnel verbatim.
 * W12-L4 ordering: the call runs BEFORE the per-mode dispatch switch (and
 * before Ctrl+5's executeJourneyCompassAction(ENTER_INSIDE)), so the
 * withJourneyNotify write inside ENTER_INSIDE mirrors the NEW phase — no
 * stale-mode + trailDepth=2 intermediate if an await is ever inserted.
 *
 * Contract style mirrors `w7-global-shortcuts-isformfield-split.test.ts` and
 * `w46-b3-global-shortcuts-helper.test.ts`: substring-on-source assertions
 * (indexOf + slice + regex) rather than runtime keydown simulation, because
 * importing the navigation/journey stores transitively requires a Svelte init
 * environment (the prior tests explicitly avoid that fragility).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
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

    it('W12-L4: the setJourneyPhase call precedes the per-mode switch and Ctrl+5 ENTER_INSIDE', () => {
        // W12-L4 ordering fix: setJourneyPhase now runs BEFORE the switch (and
        // before executeJourneyCompassAction(ENTER_INSIDE) inside case '5').
        // Ctrl+5's ENTER_INSIDE → journeySetTrailDepth(2) goes through
        // withJourneyNotify, which mirrors navState.mode from the journey
        // phase; running the phase write first means that mirror ships the NEW
        // phase — no stale-mode + trailDepth=2 intermediate even if an await
        // is ever inserted between the calls. Final same-tick state for every
        // shortcut is unchanged (SET_SURFACE writes the same mode explicitly,
        // and for 'map' it now reads the already-normalized 'overview').
        const ctrlOpenIdx = src.indexOf('((e.ctrlKey || e.metaKey) && /^[1-6]$/')
        expect(ctrlOpenIdx).toBeGreaterThan(-1)
        const block = src.slice(ctrlOpenIdx, ctrlOpenIdx + 4800)

        const setJourneyPhaseIdx = block.indexOf('setJourneyPhase(')
        expect(setJourneyPhaseIdx).toBeGreaterThan(-1)

        // Must come before the per-mode switch…
        const switchIdx = block.indexOf('switch (e.key)')
        expect(switchIdx).toBeGreaterThan(-1)
        expect(setJourneyPhaseIdx).toBeLessThan(switchIdx)
        // …and before Ctrl+5's compass action, whose withJourneyNotify write
        // mirrors mode from the journey phase (the L4 hazard).
        const enterInsideIdx = block.indexOf('executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE)')
        expect(enterInsideIdx).toBeGreaterThan(-1)
        expect(setJourneyPhaseIdx).toBeLessThan(enterInsideIdx)
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
