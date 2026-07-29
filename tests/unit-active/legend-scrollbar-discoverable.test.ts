/**
 * legend-scrollbar-discoverable.test.ts
 *
 * PR-T4: Make the categories panel scrollbar more discoverable.
 * The previous 6px / 0.28 opacity scrollbar was nearly invisible
 * against the dark glass background; users didn't realize the
 * panel was scrollable (it has 21 categories but only ~10 fit in
 * 60vh max-height). PR-O3 added a 'N of M shown • scroll for more ↓'
 * overflow indicator; this change makes the actual scrollbar more
 * visible during active scrolling.
 *
 * Bumped to 8px width, 0.5 thumb opacity, and 0.08 track tint so
 * the track and thumb are both visible during scroll. Affects only
 * the legend-panel; the other 3 panels (search-results, journey-
 * compass, info-panel) keep their original thin scrollbar style.
 *
 * Run: npx vitest run tests/unit-active/legend-scrollbar-discoverable.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readLayoutBase(): string {
    const p = resolve(__dirname, '../../css/layout_base.css')
    return readFileSync(p, 'utf-8')
}

describe('PR-T4: Legend scrollbar discoverable', () => {
    it('legend-panel scrollbar width is bumped from 6px to 8px', () => {
        const css = readLayoutBase()
        // The legend-specific .legend::-webkit-scrollbar block
        // (with ` {` after, not `,`) is the unique one. The shared
        // block ends with `, .journey-compass::-webkit-scrollbar`.
        const t4Idx = css.indexOf('/* PR-T4:')
        const afterT4 = css.slice(t4Idx)
        // The legend-specific block has `.legend::-webkit-scrollbar {`
        const blockIdx = afterT4.indexOf('.legend::-webkit-scrollbar {')
        const blockEnd = afterT4.indexOf('}', blockIdx)
        const block = afterT4.slice(blockIdx, blockEnd)
        expect(block).toMatch(/width:\s*8px/)
    })

    it('legend-panel scrollbar thumb is bumped from 0.28 to 0.5 opacity', () => {
        const css = readLayoutBase()
        // Same pattern: look after PR-T4 comment
        const t4Idx = css.indexOf('/* PR-T4:')
        const afterT4 = css.slice(t4Idx)
        const blockIdx = afterT4.indexOf('.legend::-webkit-scrollbar-thumb {')
        const blockEnd = afterT4.indexOf('}', blockIdx)
        const block = afterT4.slice(blockIdx, blockEnd)
        expect(block).toMatch(/background:\s*rgba\(var\(--color-primary-rgb\),\s*0\.5\)/)
    })

    it('legend-panel scrollbar track has subtle visible tint (0.08)', () => {
        const css = readLayoutBase()
        const t4Idx = css.indexOf('/* PR-T4:')
        const afterT4 = css.slice(t4Idx)
        const blockIdx = afterT4.indexOf('.legend::-webkit-scrollbar-track {')
        const blockEnd = afterT4.indexOf('}', blockIdx)
        const block = afterT4.slice(blockIdx, blockEnd)
        expect(block).toMatch(/background:\s*rgba\(var\(--color-primary-rgb\),\s*0\.08\)/)
        expect(block).not.toMatch(/background:\s*transparent/)
    })

    it('legend-panel keeps the standard CSS scrollbar-color (cross-browser fallback)', () => {
        const css = readLayoutBase()
        const t4Idx = css.indexOf('/* PR-T4:')
        const afterT4 = css.slice(t4Idx)
        expect(afterT4).toMatch(
            /scrollbar-color:\s*rgba\(var\(--color-primary-rgb\),\s*0\.5\)\s*rgba\(var\(--color-primary-rgb\),\s*0\.08\)/
        )
    })

    it('does NOT modify the shared rule for .search-results, .journey-compass, .info-panel', () => {
        const css = readLayoutBase()
        // The shared block (with all 4 selectors comma-separated) should
        // still have width: 6px and 0.28
        const sharedBlock = css.slice(
            css.indexOf('.search-results::-webkit-scrollbar'),
            css.indexOf('.search-results::-webkit-scrollbar-track')
        )
        expect(sharedBlock).toMatch(/width:\s*6px/)
        expect(sharedBlock).not.toMatch(/width:\s*8px/)
    })

    it('comment explains why the legend got a more visible scrollbar (PR-T4)', () => {
        const css = readLayoutBase()
        expect(css).toMatch(/\/\* PR-T4:.*legend.*scrollbar/s)
    })
})
