/**
 * Regression test: LoadingOverlay click-eating fix.
 *
 * The overlay uses Svelte `transition:fade`; during its ~600ms outro it stays
 * `position:fixed; inset:0` and ate the first click on the ready app. The fix
 * sets `pointer-events: none` on the base `.loading-overlay` rule so the fading
 * overlay can no longer swallow clicks, while `.loading-overlay.is-error`
 * restores `pointer-events: auto` so the error-state Reload button stays
 * clickable (`class:is-error={isError}` in LoadingOverlay.svelte).
 *
 * NOTE: `css/loading.css` already contains `pointer-events: none;` in the
 * `.loading-overlay.hidden` and `.loading-overlay::before/::after` rules, so a
 * naive whole-file substring check would pass even without this fix. This test
 * isolates the BASE `.loading-overlay` rule to make the assertion meaningful.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const css = readFileSync(path.resolve(process.cwd(), 'css/loading.css'), 'utf-8')

describe('LoadingOverlay pointer-events (css/loading.css)', () => {
    it('the base `.loading-overlay` rule sets `pointer-events: none`', () => {
        // Match only the bare `.loading-overlay { ... }` rule (not .hidden, .is-error,
        // ::before, ::after, or .launching, which all have a `.foo`/`::pseudo` suffix
        // between the selector name and the `{`).
        const baseRule = css.match(/\.loading-overlay\s*\{([^}]*)\}/)
        expect(baseRule, 'base `.loading-overlay` rule not found').not.toBeNull()
        expect(baseRule![1]).toContain('pointer-events: none')
    })

    it('the `.loading-overlay.is-error` rule sets `pointer-events: auto`', () => {
        const errorRule = css.match(/\.loading-overlay\.is-error\s*\{([^}]*)\}/)
        expect(errorRule, '`.loading-overlay.is-error` rule not found').not.toBeNull()
        expect(errorRule![1]).toContain('pointer-events: auto')
    })

    it('the base rule keeps its click-blocking disabled only when not errored', () => {
        // Sanity: base rule must NOT carry pointer-events: auto (that belongs to is-error).
        const baseRule = css.match(/\.loading-overlay\s*\{([^}]*)\}/)
        expect(baseRule![1]).not.toContain('pointer-events: auto')
    })
})
