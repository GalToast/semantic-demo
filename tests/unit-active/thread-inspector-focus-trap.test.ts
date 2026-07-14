/**
 * thread-inspector-focus-trap.test.ts
 *
 * PR-T3: Focus trap for ThreadInspector.
 *
 * Two related fixes:
 *  1. focus-trap-bindings.ts now includes '.thread-inspector' in the
 *     focus-trap selector set when a focus surface is active. Without
 *     this, Tab from a thread-inspector button jumped to
 *     .search-container because the inspector wasn't in any of the
 *     trap selectors.
 *  2. ThreadInspector.svelte now moves focus to the close button when
 *     the inspector opens, and restores focus to the trigger element
 *     when the inspector closes. This anchors keyboard navigation
 *     inside the panel and lands the user back where they came from.
 *
 * Run: npx vitest run tests/unit-active/thread-inspector-focus-trap.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readFocusTrapBindings(): string {
    const p = resolve(__dirname, '../../src/lib/utils/focus-trap-bindings.ts')
    return readFileSync(p, 'utf-8')
}

function readThreadInspector(): string {
    const p = resolve(__dirname, '../../src/components/ThreadInspector.svelte')
    return readFileSync(p, 'utf-8')
}

describe('PR-T3: ThreadInspector focus trap', () => {
    it('focus-trap-bindings includes .thread-inspector in the selector set', () => {
        const src = readFocusTrapBindings()
        // The selector array should now contain '.thread-inspector'
        expect(src).toMatch(/['"]\.thread-inspector['"]/)
    })

    it('focus-trap-bindings still includes the prior focus surfaces', () => {
        const src = readFocusTrapBindings()
        // Don't accidentally drop the existing selectors
        expect(src).toMatch(/['"]\.search-container['"]/)
        expect(src).toMatch(/['"]#info-panel['"]/)
        expect(src).toMatch(/['"]\.journey-compass['"]/)
        expect(src).toMatch(/['"]\.controls['"]/)
    })

    it('selector list is inside a trapFocusIn([...]) call within the focus surface branch', () => {
        const src = readFocusTrapBindings()
        // The selectors are only active when panelSurface is one of
        // search/focus-search/focus/semantic-dive (the inspector
        // opens in those states). Verify the placement.
        expect(src).toMatch(
            /surface === ['"]focus['"][\s\S]{0,500}trapFocusIn\(\[[\s\S]{0,2000}\.thread-inspector[\s\S]{0,500}\]\)/
        )
    })

    it('ThreadInspector captures the previously focused element on open', () => {
        const src = readThreadInspector()
        // The $effect should record document.activeElement before
        // moving focus to the close button
        expect(src).toMatch(/let\s+previouslyFocused:\s*HTMLElement\s*\|\s*null\s*=\s*null/)
        expect(src).toMatch(/previouslyFocused\s*=\s*document\.activeElement/)
    })

    it('ThreadInspector moves focus to the close button on open', () => {
        const src = readThreadInspector()
        // The effect should focus .thread-inspector .inspector-close
        // after the next tick (so the inspector is in the DOM)
        expect(src).toMatch(/document\.querySelector<HTMLElement>\(['"]\.thread-inspector \.inspector-close['"]\)/)
        expect(src).toMatch(/closeBtn\.focus\(\)/)
    })

    it('ThreadInspector restores focus to the trigger element on close', () => {
        const src = readThreadInspector()
        // The cleanup branch should call previouslyFocused.focus()
        // wrapped in try/catch (element may be detached)
        expect(src).toMatch(/previouslyFocused\.focus\(\)/)
        expect(src).toMatch(/try\s*\{[\s\S]{0,80}previouslyFocused\.focus/)
    })

    it('focus restoration is guarded with try/catch for detached elements', () => {
        const src = readThreadInspector()
        // The close effect should NOT throw if the trigger element
        // was removed from the DOM between open and close
        const restoreBlock = src.match(/catch\s*\{[\s\S]{0,200}ignore[\s\S]{0,200}\}/)
        expect(restoreBlock).toBeTruthy()
    })

    it('focus move waits for the next tick (so the inspector is in the DOM)', () => {
        const src = readThreadInspector()
        // Use tick() to wait for Svelte to commit the DOM
        expect(src).toMatch(/void\s+tick\(\)\.then\(/)
    })
})
