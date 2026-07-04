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

const THREAD_INSPECTOR_PATH = resolve(__dirname, '../../src/components/ThreadInspector.svelte')

function readSource(): string {
    return readFileSync(THREAD_INSPECTOR_PATH, 'utf-8')
}

describe('ThreadInspector component', () => {
    let source: string

    beforeAll(() => {
        source = readSource()
    })

    it('root .thread-inspector with id="thread-inspector" and role="complementary"', () => {
        expect(source).toContain('class="thread-inspector"')
        expect(source).toContain('id="thread-inspector"')
        expect(source).toContain('role="complementary"')
    })

    it('root has aria-label="Connection inspector"', () => {
        expect(source).toContain('aria-label="Connection inspector"')
    })

    it('clear action button (#btn-thread-clear) is labelled "Close" (UX-2 Clear→Close rename)', () => {
        expect(source).toContain('id="btn-thread-clear"')
        // The visible action label changed from "Clear" to "Close" (the button
        // keeps its id; only the user-facing text was renamed).
        expect(source).toMatch(/>\s*Close\s*</)
        expect(source).not.toMatch(/>\s*Clear\s*</)
    })

    it('section .focus-thread-inspector with aria-labelledby', () => {
        expect(source).toContain('class="focus-thread-inspector active"')
        expect(source).toContain('id="focus-thread-inspector"')
        expect(source).toContain('aria-labelledby="focus-thread-inspector-title"')
    })

    it('header .inspector-header with kicker text and close button', () => {
        expect(source).toContain('class="inspector-header"')
        expect(source).toContain('Connection Preview')
        expect(source).toContain('aria-label="Close inspector"')
        // PR-T1 changed the close button from &times; text to a CSS ::before pseudo-element
        expect(source).toContain('.inspector-close::before')
    })

    it('h2 .focus-thread-inspector-title with id', () => {
        expect(source).toContain('id="focus-thread-inspector-title"')
        expect(source).toMatch(/class="[^"]*\bfocus-thread-inspector-title\b[^"]*"/)
    })

    it('copy paragraph .focus-thread-inspector-copy with id', () => {
        expect(source).toContain('id="focus-thread-inspector-copy"')
        expect(source).toMatch(/class="[^"]*\bfocus-thread-inspector-copy\b[^"]*"/)
        expect(source).toContain('Previewing the connection')
    })

    it('meta stats .focus-thread-inspector-meta for stops/overlapping paths/destinations', () => {
        expect(source).toContain('id="focus-thread-inspector-meta"')
        expect(source).toMatch(/class="[^"]*\bfocus-thread-inspector-meta\b[^"]*"/)
        expect(source).toContain('stops')
        expect(source).toContain('overlapping paths')
        expect(source).toContain('destinations')
    })

    it('action buttons: #btn-thread-pin, #btn-thread-follow, #btn-thread-clear', () => {
        expect(source).toContain('id="btn-thread-pin"')
        expect(source).toContain('class="thread-action primary"')
        expect(source).toContain('id="btn-thread-follow"')
        expect(source).toContain('id="btn-thread-clear"')
        expect(source).toContain('aria-label="Connection actions"')
    })
})
