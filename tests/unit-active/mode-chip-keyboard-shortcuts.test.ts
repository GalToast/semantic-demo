/**
 * mode-chip-keyboard-shortcuts.test.ts
 *
 * A2-4: Ctrl/Cmd+1 through Ctrl/Cmd+6 keyboard shortcuts enable mode switching
 * from anywhere in the app without trapping keyboard users in a single mode.
 *
 * W46-B3: keyboard handler lives in src/lib/keyboard/global-shortcuts.ts
 * (the orchestrator that originally held this was deleted in W47 cleanup).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APP = resolve(import.meta.dirname, '../../src/lib/keyboard/global-shortcuts.ts')
const CHIPRAIL = resolve(import.meta.dirname, '../../src/lib/components/header/ModeChipRail.svelte')

function readApp(): string {
    return readFileSync(APP, 'utf-8')
}

function readChipRail(): string {
    return readFileSync(CHIPRAIL, 'utf-8')
}

describe('A2-4: Ctrl+1-6 keyboard shortcuts for mode switching', () => {
    const appSrc = readApp()
    const chipRailSrc = readChipRail()

    it('has a Ctrl/Cmd+1-6 handler block in App.svelte', () => {
        expect(appSrc).toContain('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
    })

    it('skips shortcuts when user is typing in an input/textarea/select', () => {
        // W7ks1-F1 fix: split the predicate per-shortcut-class. Ctrl/Cmd+1-6
        // mode-switch + Escape return-to-overview use the NARROW form
        // `isTextInputField` (input/textarea/select/contentEditable) so focused
        // buttons/anchors fire repeat shortcuts too — the broad-form `isFormField`
        // from the regression-inducing commit `4c5f84a4` was blocking Mode-switch
        // when focus sat on the chip-rail button the user just clicked.
        //
        // The test now anchors to the narrow-form gate the F1 fix lands inside
        // the Ctrl+1-6 branch directly (tests/unit-active/w7-global-shortcuts-
        // isformfield-split.test.ts locks the broader split-predicate contract).
        expect(appSrc).toMatch(/if\s*\(\s*isTextInputField\s*\)\s*return/)
    })

    it('skips shortcuts when target is contentEditable', () => {
        // isFormField is computed from tagName + isContentEditable
        expect(appSrc).toContain('target?.isContentEditable === true')
    })

    it('prevents default browser behavior on shortcut match', () => {
        // W7ks1-F1 fix: `if (isTextInputField) return` now lands BEFORE
        // `e.preventDefault()` in the Ctrl+1-6 branch (narrow form). The
        // previous slice `shortcutIdx → first-return-after-shortcutIdx+100`
        // captured only the F1 early-return line + comment, so the block
        // ran out before `e.preventDefault()`. The pre-existing `return`
        // approach is now midpoint-of-branch; switch to locating
        // `e.preventDefault()` directly inside the Ctrl+1-6 branch span by
        // anchoring it to the upcoming `switch (e.key)` dispatch block.
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const preventIdx = appSrc.indexOf('e.preventDefault()', shortcutIdx)
        expect(preventIdx, 'e.preventDefault() must follow the Ctrl+1-6 shortcut condition').toBeGreaterThan(
            shortcutIdx
        )
        const switchIdx = appSrc.indexOf('switch (e.key)', preventIdx)
        expect(
            switchIdx,
            'switch (e.key) dispatch must follow preventDefault() inside the Ctrl+1-6 branch'
        ).toBeGreaterThan(preventIdx)
        const block = appSrc.slice(shortcutIdx, switchIdx)
        expect(block).toContain('e.preventDefault()')
    })

    it('maps Ctrl+1 to RETURN_OVERVIEW', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const switchIdx = appSrc.indexOf('switch (e.key)', shortcutIdx)
        expect(switchIdx).toBeGreaterThan(shortcutIdx)
        const block = appSrc.slice(switchIdx, switchIdx + 600)
        expect(block).toContain("case '1'")
        expect(block).toContain('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW')
    })

    it('maps Ctrl+2 to SET_SURFACE with search', () => {
        // W7ks1-F1 widened the Ctrl+1-6 branch body by ~100 chars (narrow-form
        // `if (isTextInputField) return` guard + the 6-line W7ks1-F1 comment)
        // pushing `surface: 'search'` to ~char 1201 from shortcutIdx — right
        // at the prior 1200-char slice boundary. Widened to 4000 to match the
        // sibling case '3'-'6' tests (which already had 2500 for the same
        // reason: more leading comments than the original orchestrator had).
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const block = appSrc.slice(shortcutIdx, shortcutIdx + 4000)
        expect(block).toContain("case '2'")
        expect(block).toContain("surface: 'search'")
        expect(block).toContain('NAV_TRANSITION_ACTIONS.SET_SURFACE')
    })

    it('returns galaxy before Ctrl/Cmd+2-5 galaxy-panel surfaces', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const switchIdx = appSrc.indexOf('switch (e.key)', shortcutIdx)
        expect(switchIdx).toBeGreaterThan(shortcutIdx)
        const block = appSrc.slice(shortcutIdx, switchIdx)

        expect(block).toMatch(
            /if\s*\(modeId !== ['"]overview['"] && modeId !== ['"]map['"]\)\s*\{[\s\S]*?NAV_TRANSITION_ACTIONS\.SET_VIEW,\s*\{\s*view:\s*['"]galaxy['"]\s*\}/
        )
    })

    it('maps Ctrl+3 to SET_SURFACE with trail', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const block = appSrc.slice(shortcutIdx, shortcutIdx + 4000)
        expect(block).toContain("case '3'")
        expect(block).toContain("surface: 'trail'")
    })

    it('maps Ctrl+4 to SET_SURFACE with focus', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const block = appSrc.slice(shortcutIdx, shortcutIdx + 4000)
        expect(block).toContain("case '4'")
        expect(block).toContain("surface: 'focus'")
    })

    it('maps Ctrl+5 to SET_SURFACE with inside', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const block = appSrc.slice(shortcutIdx, shortcutIdx + 4000)
        expect(block).toContain("case '5'")
        expect(block).toContain("surface: 'inside'")
    })

    it('maps Ctrl+6 to SET_VIEW map + SET_SURFACE map (matching Header.selectMode)', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        // Wider slice: case '6' dispatches BOTH SET_VIEW and SET_SURFACE
        // (two lines), and global-shortcuts.ts has more leading comments
        // than the original orchestrator did.
        const block = appSrc.slice(shortcutIdx, shortcutIdx + 4000)
        expect(block).toContain("case '6'")
        expect(block).toContain("view: 'map'")
        expect(block).toContain("surface: 'map'")
        // Must dispatch both SET_VIEW and SET_SURFACE for Map mode
        const case6Idx = block.indexOf("case '6'")
        const case6Block = block.slice(case6Idx, case6Idx + 700)
        expect(case6Block).toContain('NAV_TRANSITION_ACTIONS.SET_VIEW')
        expect(case6Block).toContain('NAV_TRANSITION_ACTIONS.SET_SURFACE')
    })

    it('shortcut handler fires BEFORE the Escape handler', () => {
        const shortcutIdx = appSrc.indexOf('(e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)')
        const escapeIdx = appSrc.indexOf("e.key === 'Escape'")
        expect(shortcutIdx).toBeLessThan(escapeIdx)
    })

    it('mode-chips radiogroup has aria-keyshortcuts including Control+1-6', () => {
        expect(chipRailSrc).toMatch(/aria-keyshortcuts="[^"]*Control\+1[^"]*Control\+6[^"]*"/)
    })

    it('aria-keyshortcuts preserves existing Arrow/Home/End shortcuts', () => {
        expect(chipRailSrc).toMatch(/aria-keyshortcuts="[^"]*ArrowUp[^"]*ArrowDown[^"]*Home[^"]*End[^"]*"/)
    })
})
