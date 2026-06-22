/**
 * legend-map-collision.test.ts
 *
 * Ticket UI-6: Resolve Legend/InfoPanel collision in map view.
 *
 * Per the Mimo audit, the Legend (16, 451) 200×433 sat on top of the
 * InfoPanel sidebar (16, 0) 320×900 in map view. The fix repositions
 * the Legend to the bottom-right (right: 1rem; left: auto) via a
 * .map-view class applied when the mapView prop is true.
 *
 * Run: npx vitest run tests/unit-active/legend-map-collision.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readLegendComponent(): string {
    const p = resolve(__dirname, '../../src/components/Legend.svelte')
    return readFileSync(p, 'utf-8')
}

function readAppSvelte(): string {
    const p = resolve(__dirname, '../../src/App.svelte')
    return readFileSync(p, 'utf-8')
}

describe('UI-6: legend/info-panel collision in map view', () => {
    const legendSrc = readLegendComponent()

    it('Legend.svelte accepts a mapView prop', () => {
        // Should have mapView in the Props interface
        expect(legendSrc).toMatch(/mapView\??:\s*boolean/)
    })

    it('Legend.svelte destructures mapView from props', () => {
        expect(legendSrc).toMatch(/mapView\s*=\s*false/)
    })

    it('Legend.svelte applies class:map-view conditional binding', () => {
        expect(legendSrc).toMatch(/class:map-view=\{mapView\}/)
    })

    it('Legend.svelte scoped CSS has a .legend.map-view rule', () => {
        // The map-view rule should override left to auto and set right
        expect(legendSrc).toMatch(/\.legend\.map-view\s*\{/)
    })

    it('.legend.map-view sets left: auto to clear the default left: 1rem', () => {
        const match = legendSrc.match(/\.legend\.map-view\s*\{[^}]+\}/)
        expect(match).not.toBeNull()
        const block = match![0]
        expect(block).toMatch(/left\s*:\s*auto/)
    })

    it('.legend.map-view sets right: 1rem to position clear of InfoPanel sidebar', () => {
        const match = legendSrc.match(/\.legend\.map-view\s*\{[^}]+\}/)
        expect(match).not.toBeNull()
        const block = match![0]
        expect(block).toMatch(/right\s*:\s*1rem/)
    })

    it('App.svelte passes mapModeActive to Legend as mapView prop', () => {
        const appSrc = readAppSvelte()
        // Should pass mapView={mapModeActive} or similar reactive binding
        expect(appSrc).toMatch(/mapView=\{mapModeActive\}/)
    })

    it('default .legend rule has left: 1rem (collision position)', () => {
        // The base rule positions at left: 1rem — this is what collides in map view
        const baseMatch = legendSrc.match(/\.legend\s*\{[^}]+\}/)
        expect(baseMatch).not.toBeNull()
        const block = baseMatch![0]
        expect(block).toMatch(/left\s*:\s*1rem/)
    })

    it('no !important in the map-view CSS override', () => {
        const match = legendSrc.match(/\.legend\.map-view\s*\{[^}]+\}/)
        expect(match).not.toBeNull()
        expect(match![0]).not.toContain('!important')
    })
})
