/**
 * @file w7-keyboard-help-kh-second-click-race.test.ts
 *
 * Regression + structural contract for the KH-HELPBTN-SECOND-CLICK-RACE fix.
 *
 * ## Wave-3 supersession (2026-07-25)
 * The original Track F "Option F" fix at commit `df3f5c15` REMOVED
 * `toggleKeyboardShortcutsHint()` from `openKeyboardHelp()` and trimmed the
 * import — leaving the capture-phase handler (bound by `initKeyboardShortcutsHint`'s
 * `_rebindHelpBtnClickHandler`) as the sole toggle authority. But DOM dispatch
 * rules forbid *newly-bound listeners* from firing during the SAME current event,
 * so the capture handler created on first click could not fire on the same
 * click → first-click FAILED to OPEN the panel (PHASE-1 timing issue surfaced
 * by `tests/keyboard-hint-panel-journey.spec.js`).
 *
 * Wave-3 (parallel-session supersession, uncommitted as of 2026-07-25T23:Z)
 * revised the contract:
 *   - `Header.svelte:openKeyboardHelp()` KEEPS `initKeyboardShortcutsHint()` AND
 *     `toggleKeyboardShortcutsHint()` — bubble-phase toggle handles the first
 *     click (panel created + opened in one tick) and the post-close case where
 *     the capture handler at-target early-returns when `panel == null`.
 *   - `keyboard-help.ts:_rebindHelpBtnClickHandler` capture-phase handler now calls
 *     `e.stopImmediatePropagation()` (line ~388) AFTER the early-return guard so
 *     it silences Svelte 5's compiled-bubble-phase `onclick={openKeyboardHelp}` on
 *     2nd+ clicks. Per W3C DOM spec, `stopPropagation()` does NOT block
 *     same-element bubble listeners; only `stopImmediatePropagation()` does.
 *     Capture handler remains the sole toggle authority on second+ clicks →
 *     single-toggle wins → no race.
 *
 * This regression test asserts the Wave-3 contract — that openKeyboardHelp keeps
 * init + toggle AND that the capture-phase handler has the stopImmediatePropagation
 * shield. Same regex-on-source + readFileSync-in-isolation style as
 * `w7-keyboard-help-f2f4f5-followup.test.ts` — avoids runtime DOM/Svelte imports.
 *
 * History: the prior Option F assertions ("body lacks toggle" / "import trimmed")
 * were the Option F contract. After Wave-3 they would FAIL by design — see git
 * history at `df3f5c15` for the Option F contract that was superseded.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HEADER_PATH = resolve(import.meta.dirname, '../../src/components/Header.svelte')
const KEYBOARD_HELP_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/keyboard-help.ts')
const headerSrc = readFileSync(HEADER_PATH, 'utf-8')
const keyboardHelpSrc = readFileSync(KEYBOARD_HELP_PATH, 'utf-8')

describe('W7: KH-HELPBTN-SECOND-CLICK-RACE — Wave-3 fix (capture stopImmediatePropagation + openKeyboardHelp init+toggle)', () => {
    it('Header.svelte openKeyboardHelp body calls initKeyboardShortcutsHint (first-click path)', () => {
        // The init call is REQUIRED for the first-click path — it creates the panel + binds
        // the capture-phase _rebindHelpBtnClickHandler listener. openKeyboardHelp MUST call
        // init so the very first click after page load binds the capture handler.
        const fnIdx = headerSrc.indexOf('function openKeyboardHelp(): void {')
        expect(fnIdx).toBeGreaterThan(-1)
        const body = headerSrc.slice(fnIdx, fnIdx + 300)
        expect(body).toContain('initKeyboardShortcutsHint')
    })

    it('Header.svelte openKeyboardHelp body ALSO calls toggleKeyboardShortcutsHint (first-click open + post-close reopen)', () => {
        // Wave-3 (NOT Option F): openKeyboardHelp keeps BOTH init and toggle. The bubble-phase
        // toggle runs on the first click (panel created + opened in one tick) and handles the
        // post-close case where the capture handler at-target early-returns because the panel
        // was closed + null. The capture handler then only takes authority on 2nd+ clicks
        // through stopImmediatePropagation (next assertion).
        const fnIdx = headerSrc.indexOf('function openKeyboardHelp(): void {')
        expect(fnIdx).toBeGreaterThan(-1)
        const body = headerSrc.slice(fnIdx, fnIdx + 300)
        expect(body).toContain('toggleKeyboardShortcutsHint')
    })

    it('Header.svelte still wires onclick={openKeyboardHelp} on #btn-keyboard-help', () => {
        // The button keeps its idiomatic Svelte 5 onclick handler. The Wave-3 fix only
        // changes what the capture handler does (stopImmediatePropagation); it does NOT
        // change the call-site wiring.
        const btnIdx = headerSrc.indexOf('id="btn-keyboard-help"')
        expect(btnIdx).toBeGreaterThan(-1)
        const btnBlock = headerSrc.slice(btnIdx, btnIdx + 400)
        expect(btnBlock).toContain('onclick={openKeyboardHelp}')
    })

    it('keyboard-help.ts capture-phase handler calls e.stopImmediatePropagation() (root-cause Wave-3 fix)', () => {
        // This is the heart of the Wave-3 fix. Without this call, Svelte 5's compiled
        // bubble-phase openKeyboardHelp races the capture handler on 2nd+ clicks because
        // e.stopPropagation() does NOT block same-element bubble listeners (W3C DOM spec).
        // Only stopImmediatePropagation does. Removing this call re-introduces the race
        // silently — the journey test in keyboard-hint-panel-journey.spec.js PHASE 4-6 catches
        // it at runtime; this assertion catches it at the source-string level too so grep
        // audits get an audit-trail signal.
        expect(keyboardHelpSrc).toContain('e.stopImmediatePropagation()')
        // The Wave-3 marker comment above the stopImmediatePropagation call makes the fix
        // grep-arable for future audits. Without the marker, the call could be removed
        // silently + re-introduce the race.
        expect(keyboardHelpSrc).toContain('Wave-3 (KH-HELPBTN-SECOND-CLICK-RACE)')
    })

    it('Header.svelte annotates the fix with a grep-arable W7 marker comment above openKeyboardHelp', () => {
        // Convention from the F4/F5 wave + Wave-3: surgical fixes carry a
        // `KH-HELPBTN-SECOND-CLICK-RACE fix` marker immediately above the function body so
        // future grep audits (e.g. `rg -n "KH-HELPBTN-SECOND-CLICK-RACE"`) surface them.
        const markerIdx = headerSrc.indexOf('KH-HELPBTN-SECOND-CLICK-RACE fix')
        expect(markerIdx).toBeGreaterThan(-1)
        // The marker must appear BEFORE the openKeyboardHelp function definition.
        const fnIdx = headerSrc.indexOf('function openKeyboardHelp(): void {')
        expect(fnIdx).toBeGreaterThan(-1)
        expect(markerIdx).toBeLessThan(fnIdx)
    })
})
