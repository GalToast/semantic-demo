/**
 * thread-inspector-close-a11y.test.ts
 *
 * PR-T1: ThreadInspector close button text + Escape key.
 *
 * Fix 1: Close button had `&times;` as text content + aria-label="Close inspector".
 * Screen readers can read the `×` character (multiplication sign) in some
 * screen reader / language combinations, contradicting the aria-label intent.
 * Move the × to a CSS pseudo-element so it's purely visual.
 *
 * Fix 2: Inspector had no Escape key handler — users had to click the close
 * button to dismiss the panel. Add a window-level keydown listener that
 * fires clearThreadInspector() when Escape is pressed and the inspector
 * is active.
 *
 * Run: npx vitest run tests/unit-active/thread-inspector-close-a11y.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readThreadInspector(): string {
    const p = resolve(__dirname, '../../src/components/ThreadInspector.svelte')
    return readFileSync(p, 'utf-8')
}

describe('PR-T1: ThreadInspector close button + Escape key', () => {
    it('close button no longer has &times; text content', () => {
        const src = readThreadInspector()
        // The × must not be in HTML text — only CSS ::before may render it
        expect(src).not.toMatch(/&times;/)
    })

    it('close button has an aria-label so it is announced as "Close inspector"', () => {
        const src = readThreadInspector()
        // Count: there should be exactly 2 close buttons (one in active state,
        // one in empty state), each with the same aria-label
        const matches = src.match(/class="inspector-close"[^>]*aria-label="Close inspector"/g) || []
        expect(matches.length).toBe(2)
    })

    it('CSS provides a × visual via ::before pseudo-element', () => {
        const src = readThreadInspector()
        // The × is now in CSS content, not HTML text
        expect(src).toMatch(/\.inspector-close::before\s*\{[^}]*content:\s*['"]\\?00d7['"]/)
    })

    it('adds a global Escape key handler that calls clearThreadInspector', () => {
        const src = readThreadInspector()
        // Find the Escape key effect
        expect(src).toMatch(/\$effect\(\(\)\s*=>\s*\{[^}]*!\s*visible\s*\|\|\s*!focusSnapshot\.threadInspector\.active[^}]*return;[\s\S]{0,200}event\.key\s*===\s*['"]Escape['"][\s\S]{0,200}clearThreadInspector\(\)/)
    })

    it('Escape key handler is removed on cleanup (no listener leak)', () => {
        const src = readThreadInspector()
        // The $effect should return a cleanup that removes the listener
        const escapeEffect = src.match(/\$effect\(\(\)\s*=>\s*\{[\s\S]{0,800}event\.key\s*===\s*['"]Escape['"][\s\S]{0,500}\}\)/)
        expect(escapeEffect).toBeTruthy()
        expect(escapeEffect![0]).toMatch(/window\.removeEventListener\(['"]keydown['"]/)
    })

    it('Escape key calls preventDefault + stopPropagation to prevent double-handling', () => {
        const src = readThreadInspector()
        // The handler should cancel the event before clearing so no
        // outer handler (e.g. the splash close) re-fires
        expect(src).toMatch(/event\.preventDefault\(\)/)
        expect(src).toMatch(/event\.stopPropagation\(\)/)
    })
});
