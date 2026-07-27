/**
 * W7ks1-F1 regression-test contract for `src/lib/keyboard/global-shortcuts.ts`.
 *
 * Background: commit `4c5f84a4` widened `isFormField` to include `button` + `a`
 * tags so single-char shortcuts (`/`, `?`, `w`, `m`) would suppress on focused
 * buttons/anchors (preserving the `GS-ISFORMFIELD-CONTROLTAGS` intent). But the
 * SAME widened predicate was also used for the Ctrl/Cmd+1-6 mode-switch block +
 * the Escape return-to-overview branch, causing a regression: pressing `Ctrl+1`
 * while focused on a chip-rail button (just clicked Search chip) silently no-op'd
 * because `isFormField` returned true.
 *
 * Fix shape (per `tmp/bugsweep-2026-07-24/worker7-ks-global-shortcuts-report.md`
 * Finding 1): split the predicate into a narrow `isTextInputField` (the
 * pre-4c5f84a4 shape — `input|textarea|select|contentEditable`) used by
 * Ctrl/Cmd+1-6 + Escape; keep the widened `isFormField` (now compositionally
 * `isTextInputField || button || a`) for the single-char shortcuts.
 *
 * This file is a substring-extraction contract test (vitest) using indexOf +
 * slice rather than fragile regex matching — DOM/store plumbing is brittle inside
 * jsdom isolation, so the contract asserts on the textual shape of the dispatching
 * predicates instead.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC_PATH = resolve(__dirname, '../../src/lib/keyboard/global-shortcuts.ts')
let src: string
beforeAll(() => {
    src = readFileSync(SRC_PATH, 'utf-8')
})

describe('W7ks1-F1: isFormField split predicate — Ctrl+1-6/Escape get narrow form', () => {
    it('declares a narrow `isTextInputField` predicate (the pre-4c5f84a4 shape)', () => {
        const start = src.indexOf('const isTextInputField =')
        expect(start).toBeGreaterThan(-1)

        const endMarker = 'target?.isContentEditable === true'
        const end = src.indexOf(endMarker, start)
        expect(end).toBeGreaterThan(start)
        const textPred = src.slice(start, end + endMarker.length)

        expect(textPred).toMatch(/tag === 'input'/)
        expect(textPred).toMatch(/tag === 'textarea'/)
        expect(textPred).toMatch(/tag === 'select'/)
        expect(textPred).toMatch(/target\?\.isContentEditable === true/)
        // Narrow predicate must NOT include button/a clauses (those are the broader isFormField).
        expect(textPred).not.toMatch(/tag === 'button'/)
        expect(textPred).not.toMatch(/tag === 'a'/)
    })

    it('declares the broader `isFormField` compositionally (widened via isTextInputField)', () => {
        const start = src.indexOf('const isFormField =')
        expect(start).toBeGreaterThan(-1)

        // `isFormField = isTextInputField || tag === 'button' || tag === 'a'`
        // — search for the next `tag === 'a'` after `const isFormField =`.
        const aClauseIdx = src.indexOf("tag === 'a'", start)
        expect(aClauseIdx).toBeGreaterThan(start)

        const widePred = src.slice(start, aClauseIdx + "tag === 'a'".length)

        expect(widePred).toMatch(/isTextInputField/)
        expect(widePred).toMatch(/tag === 'button'/)
        expect(widePred).toMatch(/tag === 'a'/)
    })

    it('Ctrl/Cmd+1-6 mode-switching branch uses the narrow `isTextInputField` (regression fixed)', () => {
        // Match the Ctrl+1-6 block — indexOf anchored at `((e.ctrlKey || e.metaKey) && /^[1-6]$/`.
        // The block-of-interest (predicate-guard + dispatch) is the first 500 chars
        // from the block-opener.
        const ctrlOpenIdx = src.indexOf('((e.ctrlKey || e.metaKey) && /^[1-6]$/')
        expect(ctrlOpenIdx).toBeGreaterThan(-1)

        const block = src.slice(ctrlOpenIdx, ctrlOpenIdx + 500)

        // Inner guard must use the narrow `isTextInputField`.
        expect(block).toMatch(/if\s*\(\s*isTextInputField\s*\)\s*return/)
        // Inner guard must NOT use the broad `isFormField` (the regression).
        expect(block).not.toMatch(/if\s*\(\s*isFormField\s*\)\s*return/)
    })

    it('Escape branch uses the narrow `isTextInputField` (regression fixed)', () => {
        const escIdx = src.indexOf("if (e.key === 'Escape')")
        expect(escIdx).toBeGreaterThan(-1)

        // 600 chars is enough to capture the immediate inner guard.
        const block = src.slice(escIdx, escIdx + 600)

        expect(block).toMatch(/if\s*\(\s*isTextInputField\s*\)\s*return/)
        // The Escape branch must NOT keep the old broad `isFormField` guard.
        expect(block).not.toMatch(/if\s*\(\s*isFormField\s*\)\s*return/)
    })

    it('single-char `/` shortcut KEEPs the broad `isFormField` (preserves 4c5f84a4 intent)', () => {
        const slashIdx = src.indexOf("if (e.key === '/' && !e.metaKey")
        expect(slashIdx).toBeGreaterThan(-1)
        const block = src.slice(slashIdx, slashIdx + 200)

        // `/` handler must still suppress on focused buttons/anchors via `isFormField`.
        expect(block).toMatch(/&& !isFormField\)/)
        expect(block).not.toMatch(/&& !isTextInputField\)/)
    })

    it('single-char `?` shortcut KEEPs the broad `isFormField` (preserves 4c5f84a4 intent)', () => {
        // The `?` handler combines `?` AND `Shift+/` cases in one block.
        // Anchored at: `if ((e.key === '?' || (e.key === '/' && e.shiftKey))`
        const qIdx = src.indexOf("if ((e.key === '?' || (e.key === '/' && e.shiftKey))")
        expect(qIdx).toBeGreaterThan(-1)
        const block = src.slice(qIdx, qIdx + 300)

        expect(block).toMatch(/&& !isFormField\)/)
        expect(block).not.toMatch(/&& !isTextInputField\)/)
    })

    it('single-char `w` + `m` shortcuts KEEP the broad `isFormField` (preserves 4c5f84a4 intent)', () => {
        const wIdx = src.indexOf("if (e.key === 'w' && !e.metaKey")
        expect(wIdx).toBeGreaterThan(-1)
        const wBlock = src.slice(wIdx, wIdx + 200)
        expect(wBlock).toMatch(/&& !isFormField\)/)

        const mIdx = src.indexOf("if (e.key === 'm' && !e.metaKey")
        expect(mIdx).toBeGreaterThan(-1)
        const mBlock = src.slice(mIdx, mIdx + 200)
        expect(mBlock).toMatch(/&& !isFormField\)/)
    })
})
