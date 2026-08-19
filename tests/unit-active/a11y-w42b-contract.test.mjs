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

    it('canvas element has role="img" (canon a11y: WebGL graphviz surfaces are img semantics per canvas-webgl-a11y skill)', () => {
        expect(src).toContain('role="img"')
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
        expect(src).toMatch(/id="focus-thread-inspector-meta-(populated|empty)"/)
        expect(src).toMatch(
            /id="focus-thread-inspector-meta-(populated|empty)"[\s\S]*?role="list"[\s\S]*?aria-label=\{metaAriaLabel\}/
        )
        // The literal descriptive phrase is generated in the metaAriaLabel derived value.
        expect(src).toContain('Connection statistics:')
    })

    it('meta stat items have role="listitem"', () => {
        expect(src).toMatch(/<span role="listitem">/)
        // Should have at least 3 listitem spans (segments, braids, endpoints)
        const listitemCount = (src.match(/role="listitem"/g) || []).length
        expect(listitemCount).toBeGreaterThanOrEqual(3)
    })

    it('title is descriptive — no just "Node N thread"', () => {
        // Renders as 'Similar to {name}' (when name present) or the fallback
        // 'Similar-Business Inspector' — never a raw lead_id / Node-number.
        expect(src).toMatch(/Similar to \$?\{/)
        expect(src).toMatch(/Similar-Business Inspector/)
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

    it('result list has role="list" and aria-label (ARIA sweep F3: listbox → list)', () => {
        // Anchor to the live container tag — the legacy comment pin also
        // contains role="list" as text.
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(
            /id="search-result-list"[^>]*role="list"[^>]*aria-label="Search result businesses"/
        )
    })

    it('result list has aria-keyshortcuts', () => {
        // W48-D: dropped ArrowLeft/Right from the advertised shortcuts since
        // they were removed from the handler. The list only honors
        // ArrowDown/Up (move), Home/End (jump), Enter/Space (activate),
        // Escape (clear).
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(/aria-keyshortcuts="ArrowDown ArrowUp Home End Enter Escape"/)
    })

    it('result list has NO aria-activedescendant (roving tabindex pattern instead)', () => {
        // ARIA sweep F3: the container emits role="list" without
        // aria-activedescendant — activedescendant + roving tabindex are
        // contradictory. The old literal survives ONLY in the comment pin, so
        // the absence check is anchored to the live container tag.
        const resultListSrc = read(SEARCH_RESULT_LIST)
        const liveTag = resultListSrc.match(/id="search-result-list"[^>]*>/)
        expect(liveTag).not.toBeNull()
        expect(liveTag[0]).not.toContain('aria-activedescendant')
        expect(liveTag[0]).toContain('role="list"')
    })

    it('result items are plain list children — no role/aria-selected, button keeps roving tabindex', () => {
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        // Live item div (anchored — the old literals survive only in the
        // comment pin, so whole-file absences would be vacuous).
        const itemDiv = childSrc.match(/class="search-result-listitem"[^>]*>/)
        expect(itemDiv).not.toBeNull()
        expect(itemDiv[0]).not.toContain('role=')
        expect(itemDiv[0]).not.toContain('aria-selected')
        // The inner result button carries the roving tabindex (exactly one
        // tabindex=0 across items, driven by `active`).
        const buttonTag = childSrc.match(/type="button"[^>]*>/)
        expect(buttonTag).not.toBeNull()
        expect(buttonTag[0]).toMatch(/tabindex=\{active \? 0 : -1\}/)
        expect(buttonTag[0].match(/tabindex=/g) || []).toHaveLength(1)
    })
})
