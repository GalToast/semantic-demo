/**
 * component-ThreadInspector.test.ts — Component test for ThreadInspector.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from focus and navigation
 * stores which hit circular dependency chains in the vitest environment,
 * preventing a full render().
 *
 * Verifies:
 *  1. Root .thread-inspector with id="thread-inspector" and role="complementary"
 *  2. Root has aria-label="Connection inspector"
 *  3. Section .focus-thread-inspector with aria-labelledby
 *  4. Header .inspector-header with kicker text and close button
 *  5. h2 .focus-thread-inspector-title with id
 *  6. Copy paragraph .focus-thread-inspector-copy with id
 *  7. Meta stats .focus-thread-inspector-meta for stops/overlapping paths/destinations
 *  8. Action buttons: #btn-thread-pin, #btn-thread-follow, #btn-thread-clear (Clear→Close)
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

describe('ThreadInspector component', () => {
    let parentSource: string
    let panelSource: string

    beforeAll(() => {
        parentSource = readParentSource()
        panelSource = readPanelSource()
    })

    it('root .thread-inspector with id="thread-inspector" and role="complementary"', () => {
        expect(parentSource).toContain('class="thread-inspector"')
        expect(parentSource).toContain('id="thread-inspector"')
        expect(parentSource).toContain('role="complementary"')
    })

    it('root has aria-label="Connection inspector"', () => {
        expect(parentSource).toContain('aria-label="Connection inspector"')
    })

    it('clear action button (#btn-thread-clear) is labelled "Close" (UX-2 Clear→Close rename)', () => {
        expect(panelSource).toContain('id="btn-thread-clear"')
        // The visible action label changed from "Clear" to "Close" (the button
        // keeps its id; only the user-facing text was renamed).
        expect(panelSource).toMatch(/>\s*Close\s*</)
        expect(panelSource).not.toMatch(/>\s*Clear\s*</)
    })

    it('section .focus-thread-inspector with aria-labelledby', () => {
        expect(panelSource).toContain('class="focus-thread-inspector"')
        expect(panelSource).toContain('class:active={active}')
        expect(panelSource).toContain('id="focus-thread-inspector"')
        expect(panelSource).toContain('aria-labelledby="focus-thread-inspector-title"')
    })

    it('header .inspector-header with kicker text and close button', () => {
        expect(panelSource).toContain('class="inspector-header"')
        expect(panelSource).toContain('Similar-Business Preview')
        expect(panelSource).toContain('aria-label="Close inspector"')
        // PR-T1 changed the close button from &times; text to a CSS ::before pseudo-element
        expect(panelSource).toContain('.inspector-close::before')
    })

    it('h2 .focus-thread-inspector-title with id', () => {
        expect(panelSource).toContain('id="focus-thread-inspector-title"')
        expect(panelSource).toMatch(/class="[^"]*\bfocus-thread-inspector-title\b[^"]*"/)
    })

    it('copy paragraph .focus-thread-inspector-copy with id', () => {
        expect(panelSource).toContain('id="focus-thread-inspector-copy"')
        expect(panelSource).toMatch(/class="[^"]*\bfocus-thread-inspector-copy\b[^"]*"/)
        expect(panelSource).toContain('Previewing the connection')
    })

    it('meta stats .focus-thread-inspector-meta for stops/overlapping paths/destinations', () => {
        expect(panelSource).toMatch(/id="focus-thread-inspector-meta-(populated|empty)"/)
        expect(panelSource).toMatch(/class="[^"]*\bfocus-thread-inspector-meta\b[^"]*"/)
        expect(panelSource).toContain('stops')
        expect(panelSource).toContain('overlapping paths')
        expect(panelSource).toContain('destinations')
    })

    it('action buttons: #btn-thread-pin, #btn-thread-follow, #btn-thread-clear', () => {
        expect(panelSource).toContain('id="btn-thread-pin"')
        expect(panelSource).toContain('class="thread-action primary"')
        expect(panelSource).toContain('id="btn-thread-follow"')
        expect(panelSource).toContain('id="btn-thread-clear"')
        expect(panelSource).toContain('aria-label="Connection actions"')
    })
})
