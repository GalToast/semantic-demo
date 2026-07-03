/**
 * component-CompassRail.test.ts — Source-inspection test for CompassRail.svelte
 *
 * The CompassRail renders only when `focusActive && !$viewport.isCompact`
 * which requires a multi-stage setup that's hard to replicate in vitest
 * (focus-mode injection, viewport state, and the surrounding App.svelte
 * context). Instead we verify the a11y/structure contract via source
 * inspection — the same pattern as component-FocusCard.test.ts.
 *
 * Verifies:
 *   1. Roving tabindex pattern: each button gets tabindex={0|-1}
 *   2. ARIA key shortcuts advertised on the <nav>
 *   3. Keydown handler covers ArrowUp/ArrowDown/Home/End/Enter/Space
 *   4. Initial focus index starts at 0
 *   5. Each step button retains aria-label and aria-current
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const COMPASS_RAIL_PATH = resolve(__dirname, '../../src/components/CompassRail.svelte')

function readCompassRailSource(): string {
    return readFileSync(COMPASS_RAIL_PATH, 'utf8')
}

describe('CompassRail component (W48-D roving tabindex + arrow-key nav)', () => {
    it('declares roving tabindex pattern in the template', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/tabindex=\{idx === compassFocusIndex \? 0 : -1\}/)
    })

    it('advertises the key shortcuts on the <nav> for AT users', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/aria-keyshortcuts="ArrowUp ArrowDown Home End Enter Space"/)
    })

    it('binds onkeydown to the <nav>', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/onkeydown=\{handleCompassKeydown\}/)
    })

    it('declares compassFocusIndex state starting at 0', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/let compassFocusIndex = \$state\(0\)/)
    })

    it('handles ArrowDown by advancing focus and wrapping to 0 at the end', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/case 'ArrowDown':/)
        expect(src).toMatch(/compassFocusIndex < last \? compassFocusIndex \+ 1 : 0/)
    })

    it('handles ArrowUp by moving focus back and wrapping to the last', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/case 'ArrowUp':/)
        expect(src).toMatch(/compassFocusIndex > 0 \? compassFocusIndex - 1 : last/)
    })

    it('handles Home key by jumping to the first step', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/case 'Home':/)
        expect(src).toMatch(/nextIndex = 0/)
    })

    it('handles End key by jumping to the last step', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/case 'End':/)
        expect(src).toMatch(/nextIndex = last/)
    })

    it('handles Enter and Space by activating the focused step', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/case 'Enter':/)
        expect(src).toMatch(/case ' ':/)
        expect(src).toMatch(/handleAction\(steps\[compassFocusIndex\]\?\.phase \?\? ''\)/)
    })

    it('calls preventDefault on arrow / Home / End keypresses', () => {
        const src = readCompassRailSource()
        // The handler calls preventDefault() before focusing the next step.
        expect(src).toMatch(/event\.preventDefault\(\)/)
    })

    it('keeps the original aria-label + aria-current on each step button', () => {
        const src = readCompassRailSource()
        expect(src).toMatch(/aria-label="Navigate to \{step\.phase\}"/)
        expect(src).toMatch(/aria-current=\{step\.state === 'current' \? 'step' : undefined\}/)
    })

    it('tracks the focused step state in the {#each} block', () => {
        const src = readCompassRailSource()
        // The {#each} block must expose the index so tabindex can compare.
        expect(src).toMatch(/{#each compassSteps\(\) as step, idx \(step\.phase\)}/)
    })
})