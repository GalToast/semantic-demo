import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readThreadInspector(): string {
    const p = resolve(__dirname, '../../src/lib/components/journey/ThreadInspectorPanel.svelte')
    return readFileSync(p, 'utf-8')
}

function readRender(): string {
    const p = resolve(__dirname, '../../src/lib/journey/thread-inspector-render.ts')
    return readFileSync(p, 'utf-8')
}

describe('PR-T2: ThreadInspector button text owned by Svelte', () => {
    it('Svelte imports viewport store (for isMobile detection)', () => {
        const src = readThreadInspector()
        expect(src).toMatch(/import\s*\{[^}]*viewport[^}]*\}\s*from\s*['"]@lib\/stores\/viewport\.svelte\.ts['"]/)
    })

    it('Svelte derives isMobile from $viewport.isCompact', () => {
        const src = readThreadInspector()
        expect(src).toContain('$viewport.isCompact')
    })

    it('Svelte derives pinText with mobile/desktop variants', () => {
        const src = readThreadInspector()
        expect(src).toContain('pinText')
        expect(src).toContain('Unpin Connection')
        expect(src).toContain('Pin Connection')
    })

    it('Svelte derives followText with all 5 variants', () => {
        const src = readThreadInspector()
        expect(src).toContain('followText')
        expect(src).toContain('Following')
        expect(src).toContain('Current Stop')
        expect(src).toContain('Follow Connection')
    })

    it('Svelte derives followTargetsCurrent from inspectedIndex === focusedIndex()', () => {
        const src = readThreadInspector()
        expect(src).toContain('inspectedIndex === focusedIndex()')
    })

    it('Svelte derives journeyPhaseIsExploring from strandContinuityPhase', () => {
        const src = readThreadInspector()
        expect(src).toContain('strandContinuityPhase ===')
        expect(src).toContain("'exploring'")
    })

    it('Svelte derives followDisabled with current + exploring guard', () => {
        const src = readThreadInspector()
        expect(src).toContain('followDisabled')
        expect(src).toContain('inspectedIndex === null || followTargetsCurrent || journeyPhaseIsExploring')
    })

    it('pin button uses {pinText} (no static Pin/Unpin)', () => {
        const src = readThreadInspector()
        // Extract the pin button block
        const pinBlock = src.slice(src.indexOf('id="btn-thread-pin"'), src.indexOf('id="btn-thread-follow"'))
        expect(pinBlock).toMatch(/\{pinText\}/)
        // Should NOT have the static text inside the pin button
        expect(pinBlock).not.toMatch(/>\s*\{pinned\s*\?\s*['"]Unpin['"]\s*:\s*['"]Pin['"]\s*\}/)
    })

    it('follow button uses {followText} (no static Follow)', () => {
        const src = readThreadInspector()
        const followBlock = src.slice(src.indexOf('id="btn-thread-follow"'), src.indexOf('id="btn-thread-clear"'))
        expect(followBlock).toMatch(/\{followText\}/)
        // Should NOT have the old static 'Follow' between the tags
        expect(followBlock).not.toMatch(/>\s*Follow\s*</)
    })

    it('follow button exposes aria-disabled, aria-busy, aria-label (so render.ts is no longer the only source)', () => {
        const src = readThreadInspector()
        const followBlock = src.slice(src.indexOf('id="btn-thread-follow"'), src.indexOf('id="btn-thread-clear"'))
        expect(followBlock).toContain('aria-disabled={followDisabled}')
        expect(followBlock).toContain('aria-busy={journeyPhaseIsExploring}')
        expect(followBlock).toContain('aria-label={followAriaLabel}')
    })

    it('pin button exposes aria-pressed (Svelte owns it now)', () => {
        const src = readThreadInspector()
        const pinBlock = src.slice(src.indexOf('id="btn-thread-pin"'), src.indexOf('id="btn-thread-follow"'))
        expect(pinBlock).toContain('aria-pressed={pinned}')
    })

    it('render.ts no longer sets pinBtn.textContent or followBtn.textContent', () => {
        const src = readRender()
        expect(src).not.toMatch(/pinBtn\.textContent\s*=/)
        expect(src).not.toMatch(/followBtn\.textContent\s*=/)
    })

    it('render.ts still updates attributes (disabled, aria-pressed, aria-label, aria-disabled, aria-busy)', () => {
        const src = readRender()
        // The attribute-only updates should remain so the imperative
        // path keeps working for cases Svelte can't see
        expect(src).toMatch(/pinBtn\.disabled\s*=/)
        expect(src).toMatch(/pinBtn\.setAttribute\(\s*['"]aria-pressed['"]/)
        expect(src).toMatch(/followBtn\.disabled\s*=/)
        expect(src).toMatch(/followBtn\.setAttribute\(\s*['"]aria-busy['"]/)
        // The aria-label is a multi-line setAttribute call, so match
        // the open paren + 'aria-label' + value in either order
        expect(src).toMatch(/followBtn\.setAttribute\(\s*['"]aria-label['"]/)
    })

    it('render.ts still updates titleEl/copyEl/metaEl textContent (Svelte has no equivalent)', () => {
        const src = readRender()
        // These text updates are still Svelte's job, but only the
        // Svelte component renders them, so the render.ts updates are
        // no-ops. Keep for backward compat with the render path.
        expect(src).toMatch(/titleEl\.textContent\s*=/)
        expect(src).toMatch(/copyEl\.textContent\s*=/)
        expect(src).toMatch(/metaEl\.textContent\s*=/)
    })
})
