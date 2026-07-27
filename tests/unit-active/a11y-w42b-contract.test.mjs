/**
 * a11y-w42b-contract.mjs — W42-B accessibility contract tests
 *
 * Covers 3 a11y improvements landed in the W42-B sweep:
 *   1. Canvas focus-visible ring (WCAG 2.4.7)
 *   2. Thread inspector screen reader labels (WCAG 1.3.1, 4.1.2)
 *   3. Search results live announcement region (WCAG 4.1.3)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const CANVAS = join(ROOT, 'src/components/Canvas.svelte')
const THREAD_INSPECTOR_PARENT = join(ROOT, 'src/components/ThreadInspector.svelte')
const THREAD_INSPECTOR_PANEL = join(ROOT, 'src/lib/components/journey/ThreadInspectorPanel.svelte')
const SEARCH_RESULTS = join(ROOT, 'src/components/SearchResults.svelte')
const SEARCH_RESULT_LIST = join(ROOT, 'src/lib/components/search/SearchResultList.svelte')
const SEARCH_RESULT_ITEM = join(ROOT, 'src/components/SearchResultItem.svelte')

function read(path) {
    return readFileSync(path, 'utf-8')
}

// ── 1. Canvas: focus-visible ring (WCAG 2.4.7) ────────────────────────────

describe('A11y W42-B: Canvas focus-visible indicator', () => {
    let src

    beforeAll(() => {
        src = read(CANVAS)
    })

    it('canvas element has tabindex when interactive', () => {
        expect(src).toMatch(/tabindex=\{interactive \? 0 : -1\}/)
    })

    it('canvas element has role="application"', () => {
        expect(src).toContain('role="application"')
    })

    it('canvas element has aria-keyshortcuts', () => {
        expect(src).toMatch(/aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Plus Minus"/)
    })

    it('canvas element has aria-label', () => {
        expect(src).toMatch(/aria-label="3D business network"/)
    })

    it('canvas has :focus-visible CSS rule for visible focus ring', () => {
        expect(src).toContain('.semantic-canvas:focus-visible')
        expect(src).toMatch(/outline:\s*2px solid/)
    })
})

// ── 2. Thread inspector: screen reader labels (WCAG 1.3.1, 4.1.2) ──────────

describe('A11y W42-B: Thread inspector screen reader labels', () => {
    let src

    beforeAll(() => {
        src = read(THREAD_INSPECTOR_PARENT) + read(THREAD_INSPECTOR_PANEL)
    })

    it('inspector wrapper has aria-live="polite" for dynamic updates', () => {
        expect(src).toMatch(/role="complementary"[\s\S]*?aria-live="polite"/)
    })

    it('inspector has aria-labelledby pointing to title', () => {
        expect(src).toContain('aria-labelledby="focus-thread-inspector-title"')
    })

    it('meta stats div has role="list" with descriptive aria-label', () => {
        expect(src).toContain('id="focus-thread-inspector-meta"')
        expect(src).toMatch(/id="focus-thread-inspector-meta"[\s\S]*?role="list"[\s\S]*?aria-label=\{metaAriaLabel\}/)
        // The literal descriptive phrase is generated in the metaAriaLabel derived value.
        expect(src).toContain('Connection statistics:')
    })

    it('meta stat items have role="listitem"', () => {
        expect(src).toMatch(/<span role="listitem">/)
        // Should have at least 3 listitem spans (segments, braids, endpoints)
        const listitemCount = (src.match(/role="listitem"/g) || []).length
        expect(listitemCount).toBeGreaterThanOrEqual(3)
    })

    it('title is descriptive (not just "Node N thread")', () => {
        // Renders as 'Connection to {name}' (when name present) or 'Connection to a nearby business'.
        expect(src).toMatch(/Connection to \$?\{/)
    })

    it('close button has aria-label', () => {
        expect(src).toContain('aria-label="Close inspector"')
    })
})

// ── 3. Search results: live announcement region (WCAG 4.1.3) ───────────────

describe('A11y W42-B: Search results live announcement', () => {
    let src

    beforeAll(() => {
        src = read(SEARCH_RESULTS)
    })

    it('has sr-only live region with aria-live="polite"', () => {
        expect(src).toMatch(/aria-live="polite"[\s\S]*?role="status"/)
    })

    it('live region uses sr-only class for offscreen positioning', () => {
        expect(src).toContain('class="sr-only"')
    })

    it('sr-only CSS class exists in styles', () => {
        expect(src).toContain('.sr-only {')
        expect(src).toContain('position: absolute')
        expect(src).toContain('clip: rect(0, 0, 0, 0)')
    })

    it('liveAnnouncement state variable is declared', () => {
        expect(src).toMatch(/let liveAnnouncement = \$state\(''\)/)
    })

    it('liveAnnouncement is updated when activeIndex changes', () => {
        expect(src).toMatch(/liveAnnouncement = .*Focus/)
    })

    it('result listbox has aria-label', () => {
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(/role="listbox"[\s\S]*?aria-label="Search result businesses"/)
    })

    it('result listbox has aria-keyshortcuts', () => {
        // W48-D: dropped ArrowLeft/Right from the advertised shortcuts since
        // they were removed from the handler. The listbox only honors
        // ArrowDown/Up (move), Home/End (jump), Enter/Space (activate),
        // Escape (clear).
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(/aria-keyshortcuts="ArrowDown ArrowUp Home End Enter Escape"/)
    })

    it('result listbox has aria-activedescendant', () => {
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(/aria-activedescendant=\{activeIndex >= 0 \? `search-result-/)
    })

    it('result options have aria-selected', () => {
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        expect(childSrc).toMatch(/role="option"[\s\S]*?aria-selected=\{active\}/)
    })
})
