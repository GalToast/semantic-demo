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

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const THREAD_INSPECTOR_PARENT_PATH = resolve(__dirname, '../../src/components/ThreadInspector.svelte')
const THREAD_INSPECTOR_PANEL_PATH = resolve(__dirname, '../../src/lib/components/journey/ThreadInspectorPanel.svelte')

function readParentSource(): string {
    return readFileSync(THREAD_INSPECTOR_PARENT_PATH, 'utf-8')
}

function readPanelSource(): string {
    return readFileSync(THREAD_INSPECTOR_PANEL_PATH, 'utf-8')
}

describe('PR-T1: ThreadInspector close button + Escape key', () => {
    let panelSource: string
    let parentSource: string

    beforeAll(() => {
        panelSource = readPanelSource()
        parentSource = readParentSource()
    })

    it('close button no longer has &times; text content', () => {
        // The × must not be in HTML text — only CSS ::before may render it
        expect(panelSource).not.toMatch(/&times;/)
    })

    it('close button has an aria-label so it is announced as "Close inspector"', () => {
        // The panel renders a single close button (shared active/empty state).
        const matches = panelSource.match(/class="inspector-close"[^>]*aria-label="Close inspector"/g) || []
        expect(matches.length).toBe(1)
    })

    it('CSS provides a × visual via ::before pseudo-element', () => {
        // The × is now in CSS content, not HTML text
        expect(panelSource).toMatch(/\.inspector-close::before\s*\{[^}]*content:\s*['"]\\00d7['"]/)
    })

    it('adds a global Escape key handler that calls clearThreadInspector', () => {
        // The Escape key effect lives in the parent ThreadInspector.svelte
        expect(parentSource).toMatch(
            /\$effect\(\(\)\s*=>\s*\{[^}]*!\s*visible\s*\|\|\s*!focusSnapshot\.threadInspector\.active[^}]*return;[\s\S]{0,200}event\.key\s*===\s*['"]Escape['"][\s\S]{0,200}clearThreadInspector\(\)/
        )
    })

    it('Escape key handler is removed on cleanup (no listener leak)', () => {
        // The $effect cleanup (removeEventListener) lives in the parent
        // @ts-ignore — harness: regex match can return null
    // @ts-ignore — harness: regex match can return null
    // @ts-ignore — harness: regex match can return null
    const escapeEffect = parentSource.match(
            /\$effect\(\(\)\s*=>\s*\{[\s\S]{0,800}event\.key\s*===\s*['"]Escape['"][\s\S]{0,500}\}\)/
        )
        expect(escapeEffect).toBeTruthy()
        expect(escapeEffect![0]).toMatch(/window\.removeEventListener\(['"]keydown['"]/)
    })

    it('Escape key calls preventDefault + stopPropagation to prevent double-handling', () => {
        expect(parentSource).toMatch(/event\.preventDefault\(\)/)
        expect(parentSource).toMatch(/event\.stopPropagation\(\)/)
    })
})
