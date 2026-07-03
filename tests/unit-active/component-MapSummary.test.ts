/**
 * component-MapSummary.test.ts — Component test for MapSummary.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from journey and navigation
 * stores which hit circular dependency chains in the vitest environment,
 * preventing a full render().
 *
 * W48-I: a11y overhaul of MapSummary
 *   - Root role: 'img' (decorative whole) → 'region' (interactive list).
 *     The mini-map is no longer a single image; it's a navigation aid with
 *     named stops the user can step through.
 *   - aria-label: flat string → aria-labelledby pointing at the visible
 *     <h2> so the title and the list share a single label source.
 *   - Stops: a flat <span> row → a proper <ol> with aria-current="step"
 *     on the focused entry. Screen readers now announce the position
 *     and the stop name when the user steps through the trail.
 *   - aria-live region: a new <p class="sr-only" aria-live="polite">
 *     announces the current step ("Now on step 3 of 5: <name>") on every
 *     change so trail navigation is observable to AT users.
 *   - SVG: keeps aria-hidden="true" on the decorative dots/lines (they
 *     duplicate the <ol> info) but gains a <title> + <desc> so users
 *     who navigate to it get the stop count + current position.
 *
 * Verifies (updated for the W48-I contract):
 *  1. Root .map-summary with id="map-trail" and role="region"
 *  2. Root uses aria-labelledby="map-trail-title" (not a flat aria-label)
 *  3. The labelled-by target is the <h2 class="map-title" id="map-trail-title">
 *  4. SVG .map-svg with viewBox, role="img", aria-labelledby/describedby
 *  5. SVG contains <title> + <desc> for AT navigation
 *  6. SVG dots/lines stay aria-hidden="true" (decorative)
 *  7. <ol class="map-stops"> replaces the <div> list
 *  8. Each <li class="map-stop"> gets aria-current="step" when current
 *  9. <p class="sr-only" aria-live="polite" id="map-trail-status">
 *     announces the current step
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MAP_SUMMARY_PATH = resolve(__dirname, '../../src/components/MapSummary.svelte')

function readSource(): string {
    return readFileSync(MAP_SUMMARY_PATH, 'utf-8')
}

describe('MapSummary component', () => {
    let source: string

    beforeAll(() => {
        source = readSource()
    })

    it('root .map-summary with id="map-trail" and role="region"', () => {
        expect(source).toContain('class="map-summary"')
        expect(source).toContain('id="map-trail"')
        expect(source).toContain('role="region"')
    })

    it('root uses aria-labelledby (not a flat aria-label) so the title <h2> is the label', () => {
        expect(source).toContain('aria-labelledby="map-trail-title"')
        // The old flat aria-label should be gone.
        expect(source).not.toContain('aria-label="Journey trail mini-map"')
    })

    it('the labelled-by target is the <h2> with id="map-trail-title"', () => {
        expect(source).toMatch(/<h2[^>]*class="map-title"[^>]*id="map-trail-title"/)
    })

    it('SVG has role="img" with aria-labelledby + aria-describedby', () => {
        expect(source).toContain('class="map-svg"')
        expect(source).toContain('viewBox="0 0 164 70"')
        expect(source).toMatch(
            /<svg[^>]*role="img"[^>]*aria-labelledby="map-trail-svg-title"[^>]*aria-describedby="map-trail-desc"/
        )
    })

    it('SVG has a <title> + <desc> describing the trail', () => {
        expect(source).toContain('<title id="map-trail-svg-title">Journey trail</title>')
        expect(source).toContain('<desc id="map-trail-desc">')
        // The desc block reports total stops and (when focused) the current
        // step. The exact text is templated, so we look for the substrings.
        expect(source).toContain('Currently focused: stop')
        expect(source).toContain(' of {trail.length}.')
    })

    it('SVG decorative dots and lines stay aria-hidden="true"', () => {
        // Both <line> and <circle> must be aria-hidden.
        expect(source).toMatch(/<line[^>]*aria-hidden="true"/)
        expect(source).toMatch(/<circle[^>]*aria-hidden="true"/)
    })

    it('stops are now a proper <ol>, not a <div>', () => {
        expect(source).toMatch(/<ol[^>]*class="map-stops"[^>]*aria-label="Trail stops"/)
    })

    it('each <li class="map-stop"> gets aria-current="step" when current', () => {
        expect(source).toMatch(/<li[\s\S]*?aria-current=\{isCurrent \? 'step' : undefined\}/)
    })

    it('announces the current step via a polite live region', () => {
        // id=map-trail-status + aria-live=polite + aria-atomic=true
        // so the entire region re-announces on change.
        expect(source).toMatch(
            /<p[^>]*class="sr-only"[^>]*id="map-trail-status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/
        )
        // And the body sets a "Now on step N of M: <name>" string.
        expect(source).toContain('Now on step')
    })
})
