/**
 * component-Splash.test.ts — Source-inspection test for Splash.svelte
 * (W48-D CTA feedback).
 *
 * The Splash is a modal gate that hides once the user clicks "Explore".
 * Adding aria-describedby + aria-busy + disabled feedback to the CTA
 * closes a real a11y gap: previously the button had no hint description,
 * no busy feedback during the transition, and double-clicks could fire
 * `engineReady.signalReady()` multiple times.
 *
 * Uses the source-inspection pattern from component-FocusCard.test.ts
 * because Splash imports from @lib/stores/* which has a circular
 * dependency chain in vitest.
 *
 * Verifies:
 *   1. The CTA declares aria-describedby pointing to the hint + busy hint
 *   2. The hint <p> has the matching id="splash-hint"
 *   3. aria-busy reflects the ctaBusy state
 *   4. The CTA is disabled while busy
 *   5. The CTA label swaps to "Entering…" while busy
 *   6. dismiss() sets ctaBusy = true before signalReady()
 *   7. The busy hint is an aria-live region
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SPLASH_PATH = resolve(__dirname, '../../src/components/Splash.svelte')

function readSplashSource(): string {
    return readFileSync(SPLASH_PATH, 'utf8')
}

describe('Splash component (W48-D CTA feedback)', () => {
    it('CTA declares aria-describedby pointing to the hint + busy hints', () => {
        const src = readSplashSource()
        expect(src).toMatch(
            /aria-describedby="splash-hint splash-cta-busy"/
        )
    })

    it('hint <p> carries id="splash-hint" matching the aria-describedby', () => {
        const src = readSplashSource()
        expect(src).toMatch(/<p[^>]*class="splash-hint"[^>]*id="splash-hint"/)
    })

    it('CTA has reactive aria-busy bound to ctaBusy state', () => {
        const src = readSplashSource()
        expect(src).toMatch(/aria-busy=\{ctaBusy\}/)
    })

    it('CTA is disabled while busy (prevents double-fire of signalReady)', () => {
        const src = readSplashSource()
        expect(src).toMatch(/disabled=\{ctaBusy\}/)
    })

    it('CTA label swaps to "Entering…" while busy', () => {
        const src = readSplashSource()
        expect(src).toMatch(/\{ctaBusy \? 'Entering…' : 'Explore'\}/)
    })

    it('dismiss() flips ctaBusy to true before signalReady()', () => {
        const src = readSplashSource()
        // Assert the assignment precedes the signalReady call within dismiss.
        const dismissMatch = src.match(
            /const dismiss = \(e\?: Event\) => \{[\s\S]*?\n\s+\}/
        )
        expect(dismissMatch, 'dismiss() handler must exist').toBeTruthy()
        const dismissBody = dismissMatch?.[0] ?? ''
        const busyIdx = dismissBody.indexOf('ctaBusy = true')
        const signalIdx = dismissBody.indexOf('engineReady.signalReady')
        expect(busyIdx).toBeGreaterThan(-1)
        expect(signalIdx).toBeGreaterThan(-1)
        expect(busyIdx).toBeLessThan(signalIdx)
    })

    it('declares ctaBusy as $state', () => {
        const src = readSplashSource()
        expect(src).toMatch(/let ctaBusy = \$state\(false\)/)
    })

    it('busy hint is an aria-live region for AT announcement', () => {
        const src = readSplashSource()
        expect(src).toMatch(/<span[^>]*id="splash-cta-busy"[^>]*aria-live="polite"/)
    })

    it('busy hint uses .sr-only (defined in css/base.css)', () => {
        const baseCss = readFileSync(
            resolve(__dirname, '../../css/base.css'),
            'utf8'
        )
        expect(baseCss).toMatch(/\.sr-only\s*\{/)
        const src = readSplashSource()
        expect(src).toMatch(/<span class="sr-only"[^>]*id="splash-cta-busy"/)
    })
})