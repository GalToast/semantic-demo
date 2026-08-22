/**
 * @file w46-b3-global-shortcuts-helper.test.ts
 *
 * Structural contract tests for W46-B3: global keyboard shortcut
 * handler extracted from App.svelte into src/lib/keyboard/global-shortcuts.ts.
 *
 * Verifies the helper file exists, exports the expected symbols, wires
 * the listener via window.addEventListener, and preserves all the
 * shortcut branches (Ctrl+1-6, /, ?, w, Escape) from the previous
 * inline $effect block.
 *
 * Same regex-on-source pattern as W11-T8 / W46-B1 / W46-B2a contract
 * tests — avoids runtime imports of the navigation store / URL state
 * which would require a full Svelte init environment.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HELPER_PATH = resolve(import.meta.dirname, '../../src/lib/keyboard/global-shortcuts.ts')
const src = readFileSync(HELPER_PATH, 'utf-8')

describe('W46-B3: global-shortcuts.ts helper exists with correct shape', () => {
    it('is a .ts file (not .svelte.ts — no runes needed)', () => {
        expect(HELPER_PATH).toMatch(/global-shortcuts\.ts$/)
    })

    it('exports setupGlobalShortcuts function', () => {
        expect(src).toMatch(/export\s+function\s+setupGlobalShortcuts\s*[<(]/)
    })

    it('exports GlobalShortcutsOptions interface with toggleWeather and optional toggleAudioMute', () => {
        expect(src).toMatch(/export\s+interface\s+GlobalShortcutsOptions\b/)
        expect(src).toMatch(/toggleWeather\s*:\s*\(\)\s*=>\s*void/)
        expect(src).toMatch(/toggleAudioMute\?\s*:\s*\(\)\s*=>\s*void/)
    })
})

describe('W46-B3: setupGlobalShortcuts wires window.addEventListener correctly', () => {
    it('registers a keydown listener via window.addEventListener', () => {
        expect(src).toMatch(/window\.addEventListener\(\s*['"]keydown['"]/)
    })

    it('cleanup function removes the keydown listener', () => {
        expect(src).toMatch(/window\.removeEventListener\(\s*['"]keydown['"]/)
    })

    it('toggleWeather option is wired into the `w` shortcut branch', () => {
        // The handler must call options.toggleWeather() inside the 'w' branch
        const wBranch = src.match(/e\.key\s*===\s*['"]w['"][\s\S]{0,400}?options\.toggleWeather\(\)/)
        expect(wBranch).not.toBeNull()
    })

    it('imports navigation actions from the canonical store path', () => {
        expect(src).toMatch(
            /import[\s\S]{0,80}dispatchNavTransition[\s\S]{0,40}NAV_TRANSITION_ACTIONS[\s\S]{0,40}navStore[\s\S]{0,40}from\s+['"]@lib\/stores\/navigation\.svelte\.ts['"]/
        )
    })

    it('imports the keyboard shortcuts hint helpers from the sibling module', () => {
        expect(src).toMatch(
            /import[\s\S]{0,80}initKeyboardShortcutsHint[\s\S]{0,40}showKeyboardShortcutsHint[\s\S]{0,40}from\s+['"]\.\/keyboard-help['"]/
        )
    })

    it('imports updateUrlState from the orchestration module', () => {
        expect(src).toMatch(/import[\s\S]{0,80}updateUrlState[\s\S]{0,40}from\s+['"]@lib\/orchestration\/url-state['"]/)
    })
})

describe('W46-B3: all 5 shortcut branches are preserved from the original App.svelte $effect', () => {
    it('handles Ctrl/Cmd + 1-6 mode switching', () => {
        // Switch on key with all 6 cases
        expect(src).toMatch(/e\.ctrlKey\s*\|\|\s*e\.metaKey/)
        expect(src).toMatch(/\^\[\d-\d\]\$/)
        expect(src).toMatch(/case\s+['"]1['"]/)
        expect(src).toMatch(/case\s+['"]6['"]/)
        // All 6 cases present
        for (const k of ['1', '2', '3', '4', '5', '6']) {
            expect(src).toMatch(new RegExp(`case\\s+['"]${k}['"]`))
        }
    })

    it('handles `/` focusing the search input', () => {
        // The `/` branch checks the key and focuses the search-input element
        expect(src).toMatch(/e\.key\s*===\s*['"]\/['"]/)
        expect(src).toMatch(/getElementById\(\s*['"]search-input['"]\s*\)\??\.focus\(\)/)
    })

    it('handles `?` or Shift + `/` opening the keyboard shortcuts overlay', () => {
        expect(src).toMatch(/e\.key\s*===\s*['"]\?['"]/)
        expect(src).toMatch(/e\.key\s*===\s*['"]\/['"]\s*&&\s*e\.shiftKey/)
        expect(src).toContain('initKeyboardShortcutsHint()')
        expect(src).toContain('showKeyboardShortcutsHint()')
    })

    it('handles `w` toggling weather visibility (via options.toggleWeather callback)', () => {
        expect(src).toMatch(/e\.key\s*===\s*['"]w['"]/)
        expect(src).toContain('options.toggleWeather()')
    })

    it('handles `m` toggling audio mute (optional, via options.toggleAudioMute callback)', () => {
        expect(src).toMatch(/e\.key\s*===\s*['"]m['"]/)
        expect(src).toMatch(/options\.toggleAudioMute\b/)
    })

    it('handles `Escape` returning to overview + clearing search input', () => {
        expect(src).toMatch(/e\.key\s*===\s*['"]Escape['"]/)
        // H-4 (bugsweep): clear search via setSearchQuery('') through the store.
        expect(src).toMatch(/setSearchQuery\(\s*['"]['"]\s*\)/)
        expect(src).toContain('NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW')
        // W58 fix: Escape now unconditionally strips stale ?q=/?offset= so a reload
        // doesn't re-trigger the dismissed search (was updateUrlState({}, 'return-overview')).
        // F7-A: also strips anchor/record with the SAME write so the URL replay cannot
        // re-arm SEARCH_FOCUS after RETURN_OVERVIEW (the re-encode bug was resurrecting
        // ?anchor= from navState.focusedIndex pre-reset).
        expect(src).toContain(
            "updateUrlState({ q: null, offset: null, anchor: null, record: null }, { reason: 'escape-clear' })"
        )
    })
})

describe('W46-B3: form-field guard preserved (suppresses shortcuts in inputs)', () => {
    it('checks for input/textarea/select/contentEditable form fields', () => {
        expect(src).toMatch(/isFormField/)
        expect(src).toMatch(/tag\s*===\s*['"]input['"]/)
        expect(src).toMatch(/tag\s*===\s*['"]textarea['"]/)
        expect(src).toMatch(/tag\s*===\s*['"]select['"]/)
        expect(src).toMatch(/isContentEditable/)
    })

    it('shortcuts suppress firing in form fields', () => {
        // The original App.svelte used two patterns:
        //   - Ctrl+1-6: `if (isFormField) return` (positive form, early return)
        //   - `/`, `?`, `w`: `&& !isFormField` (negative form in condition)
        // We preserve both for behavioral parity. Count guards (either form).
        //
        // W7ks1-F1 (commit after the 4c5f84a4 regression): the predicate was split so
        // Ctrl/Cmd+1-6 mode-switching + Escape return-to-overview use the narrow
        // `isTextInputField` (original pre-4c5f84a4 shape — input|textarea|select|
        // contentEditable only) so focused buttons/anchors do NOT block these
        // navigation shortcuts. Single-char shortcuts (`/`, `?`, `w`, `m`) keep
        // the broader `isFormField` (narrow || button || a). Both forms satisfy the
        // 'shortcuts suppress in form fields' invariant since `isTextInputField`
        // already covers all the native input elements.
        const positiveGuardCount =
            (src.match(/if\s*\(\s*isFormField\s*\)\s*return/g) || []).length +
            (src.match(/if\s*\(\s*isTextInputField\s*\)\s*return/g) || []).length
        const negativeGuardCount = (src.match(/!\s*isFormField/g) || []).length
        expect(positiveGuardCount + negativeGuardCount).toBeGreaterThanOrEqual(4)
        // Specifically: 2 positive (Ctrl+1-6 + Escape, both W7ks1-F1 narrow form)
        //   + 4 negative (`/`, `?`, `w`, `m`, all keep broad `isFormField`).
        expect(positiveGuardCount).toBeGreaterThanOrEqual(1)
        expect(negativeGuardCount).toBeGreaterThanOrEqual(3)
    })
})

describe('W46-B3: the `trail as any` cast is preserved with the audit comment', () => {
    it('dispatches SET_SURFACE with trail literal + a brief inline note', () => {
        // W48-Phase-3: the original code was `{ surface: 'trail' as any }`
        // with a comment that the surface enum was intentionally loose.
        // After NAV_TRANSITION_ACTIONS.SET_SURFACE was tightened to accept
        // string-literal surface names, the cast became unnecessary; the
        // inline note was preserved as a documented future-work marker.
        expect(src).toMatch(/surface:\s*['"]trail['"]/)
        // Inline note explains the historical loose typing
        const trailContext = src.match(/surface:\s*['"]trail['"][\s\S]{0,200}/)
        expect(trailContext).not.toBeNull()
        expect(trailContext![0]).toMatch(/narrow|enum|surface|intentional/i)
        // Guard: no `as any` cast remains on the trail surface literal
        expect(src).not.toMatch(/['"]trail['"]\s+as\s+any/)
    })
})
