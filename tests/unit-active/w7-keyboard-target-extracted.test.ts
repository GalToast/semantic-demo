/**
 * @file w7-keyboard-target-extracted.test.ts
 *
 * Reconciliation contract for the W7 F6 extraction refactor AND its f5b4c9d8 reversal.
 *
 * History:
 *   2026-07-25 (W7 F6): the duplicate `isKeyboardTextEntryTarget` definitions were
 *   extracted to a shared util `src/lib/utils/keyboard-target.ts` (canonical
 *   `target is HTMLElement` type predicate).
 *   2026-08-07 (f5b4c9d8): the util's only production caller was the dead
 *   `handleGalaxyKeydown` chain, which was deleted — so `keyboard-target.ts` was
 *   deleted too. The LIVE text-entry suppression now lives as inline guards in
 *   `src/lib/keyboard/global-shortcuts.ts` (`isTextInputField` / `isFormField`).
 *
 * This test locks the reconciliation state:
 *   1. `src/lib/utils/keyboard-target.ts` is gone (no resurrected shared util).
 *   2. `isKeyboardTextEntryTarget` appears nowhere in `src/` (no dangling imports/callsites).
 *   3. The live replacement in `global-shortcuts.ts` retains text-entry suppression
 *      (input/textarea/select/contentEditable detection + the split predicate names).
 *   4. `keyboard-help.ts` no longer imports the deleted util.
 *   5. `triggers.ts` still has no keyboard-handler wiring (separation retained).
 *
 * The guards themselves are NOT exported (module-local consts inside
 * `handleGlobalKeydown`), so the observable effect — shortcuts suppressed while
 * typing in an input/textarea/contentEditable — is locked structurally:
 * `w7-global-shortcuts-isformfield-split.test.ts` asserts the per-branch guard
 * placement (narrow `isTextInputField` in the Ctrl/Cmd+1-6 + Escape branches,
 * wide `isFormField` for `/`, `?`, `w`, `m`). Regex-on-source is the established
 * style for keyboard contracts here (see that file's header: "DOM/store plumbing
 * is brittle inside jsdom isolation, so the contract asserts on the textual shape
 * of the dispatching predicates instead").
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
// @ts-ignore
import { resolve, join } from 'node:path'

const SRC_ROOT = resolve(import.meta.dirname, '../../src')
const KEYBOARD_TARGET_PATH = resolve(import.meta.dirname, '../../src/lib/utils/keyboard-target.ts')
const GLOBAL_SHORTCUTS_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/global-shortcuts.ts')
const HELP_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/keyboard-help.ts')
const TRIG_PATH = resolve(import.meta.dirname, '../../src/lib/orchestration/triggers.ts')

const globalShortcutsSrc = readFileSync(GLOBAL_SHORTCUTS_PATH, 'utf-8')
const helpSrc = readFileSync(HELP_PATH, 'utf-8')
const trigSrc = readFileSync(TRIG_PATH, 'utf-8')

/** Recursively list all source files under src/ (ts/svelte/js) for a full-tree scan. */
function walkSrc(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            out.push(...walkSrc(full))
        } else if (/\.(ts|svelte|js)$/.test(entry)) {
            out.push(full)
        }
    }
    return out
}

describe('W7: F6 — extracted keyboard-target.ts util is retired with its dead caller chain (f5b4c9d8)', () => {
    it('src/lib/utils/keyboard-target.ts no longer exists on disk', () => {
        // The canonical shared util was deleted with the dead handleGalaxyKeydown
        // chain (f5b4c9d8) — its only production caller is gone. Assert the file
        // does NOT exist so a resurrected duplicate util is caught immediately.
        expect(existsSync(KEYBOARD_TARGET_PATH)).toBe(false)
    })

    it('isKeyboardTextEntryTarget appears nowhere in src/ (no dangling imports/callsites)', () => {
        // Full-tree scan: the sweep removed the util import from keyboard-help.ts;
        // nothing in the live codebase may reference the retired predicate.
        const hits: string[] = []
        for (const file of walkSrc(SRC_ROOT)) {
            const content = readFileSync(file, 'utf-8')
            if (content.includes('isKeyboardTextEntryTarget')) hits.push(file)
        }
        expect(hits).toEqual([])
    })

    it('keyboard-help.ts no longer imports the deleted util', () => {
        // The F5-era import line `import { isKeyboardTextEntryTarget } from
        // '@lib/utils/keyboard-target'` must be gone from the panel module.
        expect(helpSrc).not.toContain("from '@lib/utils/keyboard-target'")
        expect(helpSrc).not.toContain('isKeyboardTextEntryTarget')
    })
})

describe('W7: F6 — live replacement: inline text-entry guards in global-shortcuts.ts', () => {
    it('handleGlobalKeydown retains input/textarea/select/contentEditable detection (the isKeyboardTextEntryTarget domain)', () => {
        // The deleted predicate's domain (text-entry targets) survives inline:
        // `isTextInputField` is computed from tagName + isContentEditable.
        expect(globalShortcutsSrc).toContain("tag === 'input'")
        expect(globalShortcutsSrc).toContain("tag === 'textarea'")
        expect(globalShortcutsSrc).toContain("tag === 'select'")
        expect(globalShortcutsSrc).toContain('target?.isContentEditable === true')
    })

    it('the split predicate names isTextInputField / isFormField are the live guard mechanism', () => {
        // Detailed per-branch guard placement (narrow for Ctrl/Cmd+1-6 + Escape,
        // wide for `/` `?` `w` `m`) is locked in
        // w7-global-shortcuts-isformfield-split.test.ts — here we pin the names
        // so the replacement mechanism can't silently rename/merge back into one
        // over-broad predicate (the 4c5f84a4 regression shape).
        expect(globalShortcutsSrc).toMatch(/const isTextInputField =/)
        expect(globalShortcutsSrc).toMatch(/const isFormField =/)
    })

    it('handleGlobalKeydown is registered as the global keydown dispatcher (single listener owner)', () => {
        // setupGlobalShortcuts is the surviving keyboard owner (f5b4c9d8): the
        // handler it registers IS the live text-entry-guarded dispatcher.
        expect(globalShortcutsSrc).toMatch(/function handleGlobalKeydown\(/)
        expect(globalShortcutsSrc).toMatch(/window\.addEventListener\('keydown', handleGlobalKeydown\)/)
    })
})

describe('W7: F6 — triggers.ts key-handler separation retained', () => {
    it('triggers.ts no longer contains keyboard-handler wiring (moved to global-shortcuts.ts)', () => {
        // f0bceb84 retired the dead view-button bindings and key-handler duplicate
        // from triggers.ts; the live key dispatch lives in global-shortcuts.ts.
        // This test locks in that separation so future refactors don't reintroduce
        // a duplicate text-entry guard definition in the event-bus module.
        expect(trigSrc).not.toContain('function isKeyboardTextEntryTarget(')
        expect(trigSrc).not.toContain('handleGlobalKeydown')
    })
})
