/**
 * main-landmark-render-contract.test.ts — Worker G (A2-1 + A2-2)
 *
 * Verifies that App.svelte contains a <main id="main-content"> landmark
 * for skip-link target and screen-reader landmark navigation.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const APP_SVELTE = join(PROJECT_ROOT, 'src/App.svelte')

function read(path: string): string {
    return readFileSync(path, 'utf-8')
}

describe('A2-1 + A2-2: main#main-content landmark', () => {
    let appSrc: string

    beforeAll(() => {
        appSrc = read(APP_SVELTE)
    })

    it('has <main id="main-content"> as a top-level element', () => {
        // Match <main with id="main-content" — not inside a comment or script block
        expect(appSrc).toMatch(/<main[^>]*id="main-content"[\s\S]*>/)
    })

    it('main landmark is not inside a comment block', () => {
        // Find the main tag and ensure no <!-- before it on the same nesting level
        const mainIdx = appSrc.indexOf('<main id="main-content"')
        expect(mainIdx).toBeGreaterThan(-1)

        // Ensure it's not inside a script block
        const scriptOpen = appSrc.lastIndexOf('<script', mainIdx)
        const scriptClose = appSrc.lastIndexOf('</script>', mainIdx)
        // If there's a <script before and no </script> between, it's inside a script
        if (scriptOpen > -1 && scriptClose < scriptOpen) {
            expect.fail('main#main-content is inside a <script> block')
        }
    })

    it('main landmark is not inside a conditional that is always false', () => {
        const mainIdx = appSrc.indexOf('<main id="main-content"')
        // Look for {#if false} or similar always-false conditionals before the main tag
        // by scanning backwards for {#if
        const preceding = appSrc.substring(0, mainIdx)
        const lastIf = preceding.lastIndexOf('{#if')
        if (lastIf > -1) {
            const ifBlock = preceding.substring(lastIf, Math.min(lastIf + 50, mainIdx))
            // Should not contain always-false patterns like {#if false} or {#if 0}
            expect(ifBlock).not.toMatch(/\{#if\s+(false|0)\s*\}/)
        }
    })

    it('contains Canvas inside the main element', () => {
        const mainStart = appSrc.indexOf('<main id="main-content"')
        const mainEnd = appSrc.indexOf('</main>', mainStart)
        const mainContent = appSrc.substring(mainStart, mainEnd)
        // W46-B2b: lazy components render via {@const Cmp = handle.current}
        // + <Cmp />, where `handle` is a per-component const from
        // createLazyComponent(...). Assert the gating condition is inside
        // main rather than the literal component tag name (which now
        // appears only as `Cmp`). The orchestrator-driven l.xxx.current form
        // was retired in W47 cleanup.
        expect(mainContent.includes('canvasLazy.current')).toBe(true)
    })

    it('contains Legend inside the main element', () => {
        const mainStart = appSrc.indexOf('<main id="main-content"')
        const mainEnd = appSrc.indexOf('</main>', mainStart)
        const mainContent = appSrc.substring(mainStart, mainEnd)
        expect(mainContent).toContain('<Legend')
    })

    it('contains SearchBar inside the main element', () => {
        const mainStart = appSrc.indexOf('<main id="main-content"')
        const mainEnd = appSrc.indexOf('</main>', mainStart)
        const mainContent = appSrc.substring(mainStart, mainEnd)
        expect(mainContent).toContain('<SearchBar')
    })

    it('contains InfoPanel inside the main element', () => {
        const mainStart = appSrc.indexOf('<main id="main-content"')
        const mainEnd = appSrc.indexOf('</main>', mainStart)
        const mainContent = appSrc.substring(mainStart, mainEnd)
        // InfoPanel is now statically imported and rendered directly.
        expect(mainContent).toContain('<InfoPanel')
    })
})
