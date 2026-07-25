/**
 * @file w7-keyboard-target-extracted.test.ts
 *
 * Regression + structural contract for the W7 keyboard bugsweep F6 refactor applied
 * 2026-07-25 to extract the duplicate `isKeyboardTextEntryTarget` definitions:
 *
 * Pre-fix state (HEAD 38c1b9ff & earlier):
 *   - `src/lib/keyboard/keyboard-help.ts:16-32` had the type-predicate form
 *     `export function isKeyboardTextEntryTarget(target: EventTarget | null): target is HTMLElement`
 *   - `src/lib/orchestration/triggers.ts:62` had the boolean-checker form
 *     `function isKeyboardTextEntryTarget(target: HTMLElement): boolean`
 * Same name, same purpose, slightly different signatures — drift risk if one was updated but not the other.
 *
 * Post-fix state (W7 F6 wave):
 *   - `src/lib/utils/keyboard-target.ts` (NEW) — canonical `target is HTMLElement` type predicate source of truth.
 *   - `keyboard-help.ts` and `triggers.ts` import from the new util + delete their inline defs.
 *
 * Worker (ocw_e6c685e3, mimo-v2.5-free) landed the new util + both refactors via `write` + `edit` tool
 * calls before timing out at exit 124 (no regression test written). Per `worker-timeout-on-disk-edits-takeover`
 * (kind-1: edits landed but REPORT/TEST missing), main lane authors this test file + runs verification.
 *
 * Regex-on-source + readFileSync-in-isolation style (matches w7-keyboard-help-ime-guard.test.ts +
 * w7-keyboard-help-f2f4f5-followup.test.ts — avoids runtime DOM/Svelte imports for speed + isolation).
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const TARGET_PATH = resolve(import.meta.dirname, '../../src/lib/utils/keyboard-target.ts')
const targetSrc = readFileSync(TARGET_PATH, 'utf-8')

const HELP_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/keyboard-help.ts')
const helpSrc = readFileSync(HELP_PATH, 'utf-8')

const TRIG_PATH = resolve(import.meta.dirname, '../../src/lib/orchestration/triggers.ts')
const trigSrc = readFileSync(TRIG_PATH, 'utf-8')

describe('W7: F6 — extracted isKeyboardTextEntryTarget to shared util keyboard-target.ts', () => {
    it('keyboard-target.ts exports the canonical type-predicate signature (EventTarget | null → target is HTMLElement)', () => {
        // The canon type-predicate form is the more general shape — wider param signature than the
        // pre-existing boolean-checker variant of triggers.ts:62-69.
        expect(targetSrc).toMatch(
            /export function isKeyboardTextEntryTarget\(target: EventTarget \| null\): target is HTMLElement/
        )
    })

    it('keyboard-target.ts predicates the same input/textarea/contentEditable cases as the pre-extraction form', () => {
        expect(targetSrc).toContain("tagName === 'input'")
        // Pre-extraction keyboard-help def covered the text/search/email/url/password input types.
        expect(targetSrc).toContain("'text'")
        expect(targetSrc).toContain("'password'")
        expect(targetSrc).toContain("tagName === 'textarea'")
        expect(targetSrc).toContain('el.isContentEditable')
    })
})

describe('W7: F6 — keyboard-help.ts replaces inline def with import from new shared util', () => {
    it('keyboard-help.ts import block imports isKeyboardTextEntryTarget from @lib/utils/keyboard-target', () => {
        // The F5 import line is appended after the existing `import { showToast } from '@lib/stores/toast.svelte'`.
        // Verify substring contains the import (loose substring match — don't enforce strict line position).
        expect(helpSrc).toContain("import { isKeyboardTextEntryTarget } from '@lib/utils/keyboard-target'")
    })

    it('keyboard-help.ts no inline type-predicate def — exactly 1 occurrence of isKeyboardTextEntryTarget outside imports/callsites', () => {
        // The pre-fix body had `export function isKeyboardTextEntryTarget(target: EventTarget | null): target is HTMLElement {`.
        // Post-fix: this declaration must be gone (the canonical def lives in keyboard-target.ts now).
        // Count all occurrences — should be exactly 2 (one in import statement, one in handleGalaxyKeydown callsite).
        const occurrences = (helpSrc.match(/isKeyboardTextEntryTarget/g) || []).length
        expect(occurrences).toBe(2)
        // Inline `export function isKeyboardTextEntryTarget(` shape must be gone.
        expect(helpSrc).not.toContain('export function isKeyboardTextEntryTarget(')
    })

    it('keyboard-help.ts handleGalaxyKeydown callsite still resolves the imported predicate', () => {
        // The callsite at line 47 (post-extraction) uses `isKeyboardTextEntryTarget(e.target) || isKeyboardControlTarget(e.target)`.
        // F6 must not have broken the callsite — the imported predicate type-narrows `e.target` to HTMLElement.
        expect(helpSrc).toMatch(/isKeyboardTextEntryTarget\(e\.target\)/)
    })
})

describe('W7: F6 — triggers.ts replaces inline def with import from new shared util', () => {
    it('triggers.ts imports isKeyboardTextEntryTarget from @lib/utils/keyboard-target', () => {
        expect(trigSrc).toContain("import { isKeyboardTextEntryTarget } from '@lib/utils/keyboard-target'")
    })

    it('triggers.ts no inline boolean-checker def — exactly 1 occurrence of isKeyboardTextEntryTarget outside imports/callsites', () => {
        // The pre-fix body had `function isKeyboardTextEntryTarget(target: HTMLElement): boolean {`.
        // Post-fix: must be gone.
        // Count occurrences — should be exactly 2 (1 in import, 1 in handleGlobalKeydown callsite).
        const occurrences = (trigSrc.match(/isKeyboardTextEntryTarget/g) || []).length
        expect(occurrences).toBe(2)
        // Inline `function isKeyboardTextEntryTarget(target: HTMLElement)` shape must be gone.
        expect(trigSrc).not.toContain('function isKeyboardTextEntryTarget(target: HTMLElement)')
    })

    it('triggers.ts handleGlobalKeydown callsite resolves the imported predicate', () => {
        // The callsite at line ~77-79 of triggers.ts has `const target = event.target as HTMLElement`
        // then `if (isKeyboardTextEntryTarget(target)) return`. F6 preserves this — predicate
        // type-narrows target to HTMLElement at the if-branch.
        expect(trigSrc).toMatch(/isKeyboardTextEntryTarget\(target\)/)
    })
})

describe('W7: F6 — extracted file structural sanity (no accidental extraction regressions)', () => {
    it('keyboard-target.ts is a single-export module (no top-level side-effects beyond the predicate)', () => {
        // The util should be a pure type-predicate module — no document.* access, no window.* access,
        // no console.log. (Purity means it's safe to import from anywhere — the worker-report's
        // pre-work confirms no external callers; even if more callers emerge, the predicate is pure.)
        expect(targetSrc).not.toContain('document.')
        expect(targetSrc).not.toContain('window.')
        expect(targetSrc).not.toContain('console.')
        // Single named export (only `isKeyboardTextEntryTarget`).
        const exportCount = (targetSrc.match(/^export /gm) || []).length
        expect(exportCount).toBe(1)
    })
})
