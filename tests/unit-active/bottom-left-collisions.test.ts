/**
 * bottom-left-collisions.test.ts
 *
 * Ticket UI-2: Resolve bottom-left triple collision in focus state.
 *
 * Per the M3 audit (2026-06-13), Legend, JourneyChrome, and MapSummary
 * all overlap in the bottom-left quadrant (x:16–290, y:451–884) when
 * data-panel-surface starts with "focus". Legend renders at (16,451),
 * JourneyChrome at (97,545), and MapSummary at (16,679).
 *
 * Layout contract: when focusActive is true, Legend is concealed via
 * the concealedByFocus prop. JourneyChrome and MapSummary remain
 * visible — JourneyChrome shows trail controls, MapSummary shows the
 * mini-map. The Legend (category list) is not needed in focus mode.
 *
 * Run: npx vitest run tests/unit-active/bottom-left-collisions.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readComponent(file: string): string {
    const p = resolve(__dirname, '../../src/components', file)
    return readFileSync(p, 'utf-8')
}

function readAppSvelte(): string {
    const p = resolve(__dirname, '../../src/App.svelte')
    return readFileSync(p, 'utf-8')
}

describe('UI-2: bottom-left triple collision in focus state', () => {
    const legendSrc = readComponent('Legend.svelte')
    const appSrc = readAppSvelte()

    // ── Legend.svelte: concealedByFocus prop ──

    it('Legend.svelte accepts a concealedByFocus prop', () => {
        expect(legendSrc).toMatch(/concealedByFocus\??:\s*boolean/)
    })

    it('Legend.svelte destructures concealedByFocus with default false', () => {
        expect(legendSrc).toMatch(/concealedByFocus\s*=\s*false/)
    })

    it('Legend.svelte applies class:concealed-by-focus conditional binding', () => {
        expect(legendSrc).toMatch(/class:concealed-by-focus=\{concealedByFocus\}/)
    })

    it('Legend.svelte sets aria-hidden when concealedByFocus is true', () => {
        // aria-hidden should be gated by concealedByFocus
        expect(legendSrc).toMatch(/aria-hidden=\{!open \|\| concealedByFocus\}/)
    })

    it('Legend.svelte scoped CSS has a .legend.concealed-by-focus rule', () => {
        expect(legendSrc).toMatch(/\.legend\.concealed-by-focus\s*\{/)
    })

    it('.legend.concealed-by-focus sets display: none', () => {
        const match = legendSrc.match(/\.legend\.concealed-by-focus\s*\{[^}]+\}/)
        expect(match).not.toBeNull()
        expect(match![0]).toMatch(/display\s*:\s*none/)
    })

    it('.legend.concealed-by-focus does not use !important', () => {
        const match = legendSrc.match(/\.legend\.concealed-by-focus\s*\{[^}]+\}/)
        expect(match).not.toBeNull()
        expect(match![0]).not.toContain('!important')
    })

    // ── App.svelte: passes concealedByFocus to Legend ──

    it('App.svelte passes concealedByFocus={focusActive} to Legend', () => {
        expect(appSrc).toMatch(/concealedByFocus=\{focusActive\}/)
    })

    // ── App.svelte: focusActive derivation includes focus-search ──

    it('App.svelte derives focusActive covering focus-search surface', () => {
        // focusActive is derived in app-orchestration.svelte.ts; App.svelte reads v.focusActive
        const orchPath = resolve(__dirname, '../../src/lib/orchestration/app-orchestration.svelte.ts')
        const orchSrc = readFileSync(orchPath, 'utf-8')
        expect(orchSrc).toMatch(/focusSearchForced/)
    })

    // ── JourneyChrome: no changes needed (self-gating) ──

    it('JourneyChrome.svelte gates visibility with isJourneyIdle', () => {
        const chromeSrc = readComponent('JourneyChrome.svelte')
        expect(chromeSrc).toMatch(/isJourneyIdle/)
    })

    it('JourneyChrome.svelte renders with {#if visible && !isJourneyIdle}', () => {
        const chromeSrc = readComponent('JourneyChrome.svelte')
        expect(chromeSrc).toMatch(/\{#if visible && !isJourneyIdle\}/)
    })

    // ── MapSummary: no changes needed (self-gating via showMap) ──

    it('MapSummary.svelte self-gates via showMap derived from visible && trail-depth-check && trail.length > 0', () => {
        const summarySrc = readComponent('MapSummary.svelte')
        // Two functionally equivalent gating patterns are accepted: the
        // legacy `hasTrail()` selector OR an inline `trailDepth > 0` check
        // (when the component inlines nav state and no longer pulls
        // `hasTrail` from the navigation store). Both produce the same
        // render-gate truthiness; the test guards the contract, not the
        // specific selector.
        expect(summarySrc).toMatch(
            /showMap\s*=\s*\$derived\(\s*visible\s*&&\s*(?:hasTrail\(\)\s*&&\s*trail\.length\s*>\s*0|\(?\s*nav\.trailDepth\s*\?\?\s*0\s*\)?\s*>\s*0\s*&&\s*trail\.length\s*>\s*0)/
        )
    })

    // ── Contract: no two of {Legend, JourneyChrome, MapSummary} collide ──

    it('Legend is display:none when concealedByFocus is true (no collision with JourneyChrome/MapSummary)', () => {
        // The .legend.concealed-by-focus rule must use display: none,
        // not just opacity or transform, to fully remove from layout
        const match = legendSrc.match(/\.legend\.concealed-by-focus\s*\{[^}]+\}/)
        expect(match).not.toBeNull()
        expect(match![0]).toMatch(/display\s*:\s*none/)
    })

    it('Legend default style still uses transform (not display:none) for non-focus hiding', () => {
        // The base .legend rule should hide via transform, not display:none
        // This ensures the concealed-by-focus display:none is the stronger gate
        const baseMatch = legendSrc.match(/\.legend\s*\{[^}]+\}/)
        expect(baseMatch).not.toBeNull()
        expect(baseMatch![0]).toMatch(/transform\s*:\s*translateX/)
    })
})
