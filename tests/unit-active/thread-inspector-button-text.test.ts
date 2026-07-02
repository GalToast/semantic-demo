/**
 * thread-inspector-button-text.test.ts
 *
 * PR-T2: Eliminate the button text flash between Svelte's static
 * 'Pin/Follow/Clear' initial paint and the imperative
 * thread-inspector-render.ts overwriting it with the dynamic
 * 'Pin Connection/Follow Connection/Current/Following' on the next
 * tick. The Svelte component now owns the button text via derived
 * expressions that match the render.ts logic (mobile vs desktop,
 * pinned vs unpinned, journeyPhase === 'exploring', etc.).
 *
 * Run: npx vitest run tests/unit-active/thread-inspector-button-text.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readThreadInspector(): string {
    const p = resolve(__dirname, '../../src/components/ThreadInspector.svelte')
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
        expect(src).toMatch(/\{@const\s+isMobile\s*=\s*\$viewport\.isCompact\}/)
    })

    it('Svelte derives pinText with mobile/desktop variants', () => {
        const src = readThreadInspector()
        // The pinText must encode the 4 cases: mobile Pin, mobile Unpin,
        // desktop Pin Connection, desktop Unpin Connection
        expect(src).toMatch(/\{@const\s+pinText\s*=\s*pinned\s*\?\s*\(isMobile\s*\?\s*['"]Unpin['"]\s*:\s*['"]Unpin Connection['"]\)\s*:\s*\(isMobile\s*\?\s*['"]Pin['"]\s*:\s*['"]Pin Connection['"]\)\}/)
    })

    it('Svelte derives followText with all 5 variants', () => {
        const src = readThreadInspector()
        // The followText encodes Following, Current, Current Stop,
        // Follow, Follow Connection
        expect(src).toMatch(/\{@const\s+followText\s*=\s*journeyPhaseIsExploring\s*\?\s*['"]Following['"]\s*:\s*followTargetsCurrent\s*\?\s*\(isMobile\s*\?\s*['"]Current['"]\s*:\s*['"]Current Stop['"]\)\s*:\s*\(isMobile\s*\?\s*['"]Follow['"]\s*:\s*['"]Follow Connection['"]\)\}/)
    })

    it('Svelte derives followTargetsCurrent from inspectedIndex === focusedIndex()', () => {
        const src = readThreadInspector()
        expect(src).toMatch(/\{@const\s+followTargetsCurrent\s*=\s*inspectedIndex\s*!=\s*null\s*&&\s*Number\.isFinite\(inspectedIndex\)\s*&&\s*inspectedIndex\s*===\s*focusedIndex\(\)\}/)
    })

    it('Svelte derives journeyPhaseIsExploring from strandContinuityPhase', () => {
        const src = readThreadInspector()
        expect(src).toMatch(/\{@const\s*journeyPhaseIsExploring\s*=\s*focusSnapshot\.strandContinuityPhase\s*===\s*['"]exploring['"]\}/)
    })

    it('Svelte derives followDisabled with current + exploring guard', () => {
        const src = readThreadInspector()
        expect(src).toMatch(/\{@const\s*followDisabled\s*=\s*inspectedIndex\s*===\s*null\s*\|\|\s*followTargetsCurrent\s*\|\|\s*journeyPhaseIsExploring\}/)
    })

    it('pin button uses {pinText} (no static Pin/Unpin)', () => {
        const src = readThreadInspector()
        // Extract the pin button block
        const pinBlock = src.slice(
            src.indexOf('id="btn-thread-pin"'),
            src.indexOf('id="btn-thread-follow"')
        )
        expect(pinBlock).toMatch(/\{pinText\}/)
        // Should NOT have the static text inside the pin button
        expect(pinBlock).not.toMatch(/>\s*\{pinned\s*\?\s*['"]Unpin['"]\s*:\s*['"]Pin['"]\s*\}/)
    })

    it('follow button uses {followText} (no static Follow)', () => {
        const src = readThreadInspector()
        const followBlock = src.slice(
            src.indexOf('id="btn-thread-follow"'),
            src.indexOf('id="btn-thread-clear"')
        )
        expect(followBlock).toMatch(/\{followText\}/)
        // Should NOT have the old static 'Follow' between the tags
        expect(followBlock).not.toMatch(/>\s*Follow\s*</)
    })

    it('follow button exposes aria-disabled, aria-busy, aria-label (so render.ts is no longer the only source)', () => {
        const src = readThreadInspector()
        const followBlock = src.slice(
            src.indexOf('id="btn-thread-follow"'),
            src.indexOf('id="btn-thread-clear"')
        )
        expect(followBlock).toMatch(/aria-disabled=\{followDisabled\}/)
        expect(followBlock).toMatch(/aria-busy=\{journeyPhaseIsExploring\}/)
        expect(followBlock).toMatch(/aria-label=\{followAriaLabel\}/)
    })

    it('pin button exposes aria-pressed (Svelte owns it now)', () => {
        const src = readThreadInspector()
        const pinBlock = src.slice(
            src.indexOf('id="btn-thread-pin"'),
            src.indexOf('id="btn-thread-follow"')
        )
        expect(pinBlock).toMatch(/aria-pressed=\{pinned\}/)
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
        expect(src).toMatch(/pinBtn\.setAttribute\(['"]aria-pressed['"]/)
        expect(src).toMatch(/followBtn\.disabled\s*=/)
        expect(src).toMatch(/followBtn\.setAttribute\(['"]aria-busy['"]/)
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
});
