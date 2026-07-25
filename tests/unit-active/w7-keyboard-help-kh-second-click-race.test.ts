/**
 * @file w7-keyboard-help-kh-second-click-race.test.ts
 *
 * Regression + structural contract for the KH-HELPBTN-SECOND-CLICK-RACE fix
 * applied 2026-07-25 to `src/components/Header.svelte`:
 *
 *   Root cause: TWO independent click handlers toggled the keyboard-hint panel
 *   on every click — `_rebindHelpBtnClickHandler` (capture-phase listener bound
 *   by initKeyboardShortcutsHint in keyboard-help.ts:354) AND Svelte 5's
 *   delegated bubble-phase `onclick={openKeyboardHelp}` at Header.svelte:111.
 *   openKeyboardHelp called BOTH `initKeyboardShortcutsHint()` AND
 *   `toggleKeyboardShortcutsHint()`, racing the capture listener's toggle.
 *   Net: 3 DOM mutations per click (capture open → bubble-capture close →
 *   Svelte-delegated reopen). Single clicks flickered; rapid double-clicks
 *   left the panel CLOSED (opened then immediately closed).
 *
 *   Fix (Option F from Track F bugsweep report by mimo worker): remove the
 *   duplicate `toggleKeyboardShortcutsHint()` call from openKeyboardHelp() so
 *   the capture-phase handler is the sole toggle authority. openKeyboardHelp
 *   now only ensures init so the button works on the very first click.
 *
 * Worker dispatch context: dispatched to mimo-v2.5-free worker `ocw_72756e11`
 * via router-opencode-zen. Worker COMPLETED at exit 0 (~6min wallclock, aligning
 * with the documented cold-start-pre-write-stall + steer-nudge unlock pattern
 * prescribed in the W7ks2 bench-doc). Report at
 * `tmp/bugsweep-2026-07-24/worker8-KH-HELPBTN-SECOND-CLICK-RACE-report.md`.
 *
 * Same regex-on-source + readFileSync-in-isolation style as
 * `w7-keyboard-help-f2f4f5-followup.test.ts` — avoids runtime DOM/Svelte imports.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { readFileSync } from 'node:fs'
// @ts-ignore
import { resolve } from 'node:path'

const HEADER_PATH = resolve(import.meta.dirname, '../../src/components/Header.svelte')
const headerSrc = readFileSync(HEADER_PATH, 'utf-8')

describe('W7: KH-HELPBTN-SECOND-CLICK-RACE — openKeyboardHelp no longer calls toggleKeyboardShortcutsHint', () => {
    it('Header.svelte openKeyboardHelp body does NOT contain toggleKeyboardShortcutsHint', () => {
        // The race was caused by openKeyboardHelp calling BOTH init + toggle: the toggle call
        // raced the capture-phase listener bound by init. Fix (Option F): remove the toggle
        // call so the capture handler is the sole toggle authority.
        const fnIdx = headerSrc.indexOf('function openKeyboardHelp(): void {')
        expect(fnIdx).toBeGreaterThan(-1)
        const body = headerSrc.slice(fnIdx, fnIdx + 300)
        expect(body).not.toContain('toggleKeyboardShortcutsHint')
    })

    it('Header.svelte openKeyboardHelp still calls initKeyboardShortcutsHint', () => {
        // The init call is REQUIRED for the first-click path — it creates the panel + binds the
        // capture-phase listener (F5 re-bind helper). On the very first click, the capture
        // listener added by _rebindHelpBtnClickHandler fires synchronously during the same event
        // and opens the panel (panel not-yet-visible → openPanel called).
        const fnIdx = headerSrc.indexOf('function openKeyboardHelp(): void {')
        expect(fnIdx).toBeGreaterThan(-1)
        const body = headerSrc.slice(fnIdx, fnIdx + 300)
        expect(body).toContain('initKeyboardShortcutsHint')
    })

    it('Header.svelte import line no longer references toggleKeyboardShortcutsHint (dead-import cleanup)', () => {
        // Removing the only call site from this file means the import also must be trimmed, or
        // eslint/prettier would flag the unused identifier. This assertion catches a future
        // mechanical "re-add the call but forget to re-add the import" OR "re-add the import but
        // forget to re-add the call" regression — both produce a working tree where the toggle
        // path silently re-enters near Header.
        const importIdx = headerSrc.indexOf("from '@lib/keyboard/keyboard-help'")
        expect(importIdx).toBeGreaterThan(-1)
        const importLine = headerSrc.slice(Math.max(0, importIdx - 200), importIdx + 40)
        expect(importLine).not.toContain('toggleKeyboardShortcutsHint')
        // Sanity: the initKeyboardShortcutsHint identifier must remain in the import line.
        expect(importLine).toContain('initKeyboardShortcutsHint')
    })

    it('Header.svelte still wires onclick={openKeyboardHelp} on #btn-keyboard-help', () => {
        // The button keeps its idiomatic Svelte 5 onclick handler — the fix only changes what
        // openKeyboardHelp does (init-only, no toggle), not the wiring at the call site.
        const btnIdx = headerSrc.indexOf('id="btn-keyboard-help"')
        expect(btnIdx).toBeGreaterThan(-1)
        const btnBlock = headerSrc.slice(btnIdx, btnIdx + 400)
        expect(btnBlock).toContain('onclick={openKeyboardHelp}')
    })

    it('Header.svelte annotates the fix with a grep-arable W7 marker comment', () => {
        // Convention from the F4/F5 wave: surgical fixes carry a `KH-HELPBTN-SECOND-CLICK-RACE`
        // marker comment immediately above the function body so future grep audits surface them.
        const markerIdx = headerSrc.indexOf('KH-HELPBTN-SECOND-CLICK-RACE fix')
        expect(markerIdx).toBeGreaterThan(-1)
        // The marker must appear BEFORE the openKeyboardHelp function definition.
        const fnIdx = headerSrc.indexOf('function openKeyboardHelp(): void {')
        expect(markerIdx).toBeLessThan(fnIdx)
    })
})
