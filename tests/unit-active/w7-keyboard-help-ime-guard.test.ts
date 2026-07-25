/**
 * @file w7-keyboard-help-ime-guard.test.ts
 *
 * Regression test + structural contract for the W7 keyboard bugsweep main-lane-authored
 * fix landed on 2026-07-25 in `src/lib/keyboard/keyboard-help.ts`:
 *   - F1: replayBtn click handler's catch-block fallback to legacy `startMicroDemo()`
 *     (lines 181-183) contradicted the M15 invariant (~lines 122-130 of the click handler's
 *     comment block: "Replay must NOT stack demos"). Fix: swap to `console.warn`.
 *   - F3: IME-composition guard (`if (e.isComposing) return`) was added to
 *     `global-shortcuts.ts:65` by commit 6ad96301 but never mirrored into `keyboard-help.ts`'s
 *     `handleGalaxyKeydown` + `_onPanelKeydown` handlers. Fix: add the guard symmetrically.
 *
 * Findings detailed in:
 *   tmp/bugsweep-2026-07-24/worker7-ks-keyboard-help-report.md (the F1 + F3 findings).
 * The symmetric W7ks1 Finding 4 (global-shortcuts IME-guard) was already enforced by
 * commit 6ad96301 itself — this test only locks the W7ks2 cross-handler parity fix.
 *
 * Same regex-on-source-contents pattern as t1-keyboard-help-replay-no-stack.test.ts +
 * w46-b3-global-shortcuts-helper.test.ts — avoids runtime imports of the navigation
 * store / Svelte init which would require a full DOM-environment harness.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const HELP_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/keyboard-help.ts')
const src = readFileSync(HELP_PATH, 'utf-8')

describe('W7: keyboard-help IME-composition guard parity with global-shortcuts.ts (F3 fix)', () => {
    it('handleGalaxyKeydown has `if (e.isComposing) return` early-return guard', () => {
        // The guard must be present in handleGalaxyKeydown — symmetric with global-shortcuts.ts:65
        // introduced by commit 6ad96301 (which only added the guard to global-shortcuts.ts).
        // Match the export function body — keep the slice narrow so the guard assertion is scoped.
        const handleFnMatch = src.match(/export\s+function\s+handleGalaxyKeydown[\s\S]{0,800}?\n\}/)
        expect(handleFnMatch).not.toBeNull()
        expect(handleFnMatch![0]).toMatch(/if\s*\(\s*e\.isComposing\s*\)\s*return/)
    })

    it('_onPanelKeydown has `if (e.isComposing) return` early-return guard', () => {
        // The inner _onPanelKeydown function (inside initKeyboardShortcutsHint) must also guard.
        const panelMatch = src.match(/function\s+_onPanelKeydown[\s\S]{0,2000}?\n    \}/)
        expect(panelMatch).not.toBeNull()
        expect(panelMatch![0]).toMatch(/if\s*\(\s*e\.isComposing\s*\)\s*return/)
    })
})

describe('W7: replayBtn click handler preserves the M15 invariant (F1 fix)', () => {
    it('replayBtn click-handler catch-block does NOT fall back to legacy startMicroDemo', () => {
        // The catch-block used to call `startMicroDemo()` (the legacy 6-phase path the M15 comment
        // block above EXPLICITLY forbids stacking). The W7 fix replaces it with `console.warn`.
        // Assert startMicroDemo is no longer CALLED anywhere in the file (it's still imported in
        // some legacy sibling modules — the assertion scope is this file's body).
        expect(src).not.toContain('startMicroDemo()')
    })

    it('replayBtn catch-block logs an informative warning when dispatch fails', () => {
        // The catch block now logs the failure reason via console.warn — guards future debugging
        // while preserving the M15 invariant (no stacked demos from a catch fallback).
        // The catch block lives inside the replayBtn click handler `addEventListener('click', ...)`.
        const catchMatch = src.match(/} catch \(e\) \{\s*console\.warn\(['"][\s\S]{0,400}?\}\)/)
        expect(catchMatch).not.toBeNull()
        expect(catchMatch![0]).toMatch(/M15|M15 invariant/i)
    })
})

describe('W7: @lib/demo/choreography import drops startMicroDemo (no unused-import warning)', () => {
    it('startMicroDemo removed from @lib/demo/choreography import line', () => {
        // After removing the only startMicroDemo callsite, the import should drop startMicroDemo
        // from the @lib/demo/choreography import line. cancelMicroDemo still appears (still used
        // in the replayBtn try-block).
        const choreographyImportMatch = src.match(
            /import\s+\{[\s\S]{0,200}?\}\s+from\s+['"]@lib\/demo\/choreography['"]/
        )
        expect(choreographyImportMatch).not.toBeNull()
        expect(choreographyImportMatch![0]).not.toMatch(/startMicroDemo/)
        expect(choreographyImportMatch![0]).toMatch(/cancelMicroDemo/)
    })
})
