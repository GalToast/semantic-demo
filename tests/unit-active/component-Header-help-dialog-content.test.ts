/**
 * component-Header-help-dialog-content.test.ts — W49-B content audit
 *
 * Locks the plain-English copy of the help dialog so a future refactor
 * can't silently revert to vague 3D-engineer phrasing like "Dots close
 * together do similar things" or "Search, click, and discover connections".
 *
 * The help dialog auto-opens on first visit (W52-UX). It is one of the
 * highest-leverage surfaces for clarity because:
 *   - it's the FIRST content new users see
 *   - it's the surface that sets up the user's mental model
 *   - vague copy trains users to ignore the help affordance entirely
 *
 * Each assertion targets a specific copy improvement:
 *   1. Title names what the app does ("Explore ...") not what it is
 *      ("What is Semantic Explorer?" — meta question)
 *   2. Body sentence names the dataset ("8,406 local businesses")
 *      and the insight ("by what a business does")
 *   3. A concrete list of next actions (Search / Click / arrow keys /
 *      drag) replaces the vague "explore connections" sentence
 *   4. The body mentions a keyboard-shortcut hint ("?") to route the
 *      user to the second discovery surface (keyboard help)
 *   5. Forbidden jargon: "Dots close together" / "nearby neighborhoods"
 *      / engineer's terms don't appear in user-visible strings
 *
 * We use source inspection (readFileSync + string assertions) instead
 * of a full render() because Header imports keyboard-shortcuts + the
 * mode nav store, both of which hit circular dependency chains in
 * vitest.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const HELPDIALOG_PATH = resolve(__dirname, '../../src/lib/components/header/HelpDialog.svelte')

function readHelpDialogSource(): string {
    return readFileSync(HELPDIALOG_PATH, 'utf-8')
}

describe('Header help-dialog content (W49-B)', () => {
    let src: string

    beforeAll(() => {
        src = readHelpDialogSource()
    })

    it('title names what the user can do, not what the app is', () => {
        // Old copy was meta: "What is Semantic Explorer?". That now lives
        // ONLY as the aria-label of the help toggle button (line ~232),
        // not as the dialog title itself — the dialog leads with the
        // action-shaped copy.
        expect(src).not.toMatch(/<h3[^>]*id="help-title"[^>]*>What is Semantic Explorer\?</)
        expect(src).toContain('id="help-title">Explore Montgomery County businesses visually</h3>')
    })

    it('body sentence names the dataset and the key insight', () => {
        expect(src).toContain('All <strong>8,406 local businesses</strong>')
        // "by what a business does" — the loading-overlay (W48-H) already
        // uses this phrasing, so users see it consistently across
        // surfaces.
        expect(src).toMatch(/by what a business does/)
    })

    it('replaces the vague "explore connections" sentence with concrete actions', () => {
        // The 3-step quickstart <ul> must exist with all three actions.
        expect(src).toContain('<ul class="help-dialog-steps"')
        expect(src).toContain('aria-label="Quick start steps"')
        // Each action gets a strong label so screen readers and visual
        // users can scan the list.
        expect(src).toMatch(/<li><strong>Search<\/strong>/)
        expect(src).toMatch(/<li><strong>Click<\/strong>/)
        // Arrow keys + drag are the third step (no <strong> wrapper
        // since the verb is the keys themselves).
        expect(src).toContain('arrow keys')
        expect(src).toContain('drag')
        // Old vague phrase must NOT reappear.
        expect(src).not.toContain('Dots close together')
        expect(src).not.toContain('discover connections')
    })

    it('surfaces the keyboard-shortcut hint as a one-liner', () => {
        expect(src).toContain('class="help-dialog-hint"')
        // The <kbd>?</kbd> is rendered as a real keyboard glyph.
        expect(src).toMatch(/<kbd[^>]*>\?<\/kbd>/)
    })

    it('forbids 3D-engineering jargon inside the help dialog', () => {
        // The whole file is scanned, not just the dialog markup, so
        // accidental leak via a follow-up edit is caught. Allowed
        // terms: comments, identifier names, aria/role attribute
        // values. Forbidden: literal user-facing text that mentions
        // 3D/WebGL internals.
        const forbidden = ['mycelium', 'node-graph', 'spore', 'dot cloud']
        for (const word of forbidden) {
            const re = new RegExp(`\\b${word}\\b`, 'i')
            expect(
                re.test(src),
                `help dialog or Header template references forbidden term "${word}"`
            ).toBe(false)
        }
    })

    it('keeps the close-button label stable', () => {
        // Don't regression on the close copy — that change would also
        // require updating tests/integration/widget-journey.spec.js.
        expect(src).toContain('Got it')
    })
})
