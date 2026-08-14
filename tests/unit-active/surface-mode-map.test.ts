import { describe, expect, it } from 'vitest'
import {
    getSurfaceModePatch,
    isMapFamilySurface,
    isPanelSurface,
    PANEL_SURFACES
} from '@lib/stores/navigation/surface-mode-map'

describe('canonical panel surface mapping', () => {
    it('enumerates each PanelSurface exactly once', () => {
        expect(new Set(PANEL_SURFACES).size).toBe(PANEL_SURFACES.length)
        expect(PANEL_SURFACES).toEqual(
            expect.arrayContaining(['idle', 'search', 'trail', 'focus', 'focus-search', 'inside'])
        )
    })

    it.each([
        ['idle', 'overview', 'galaxy'],
        ['search', 'search', 'galaxy'],
        ['trail', 'trail', 'galaxy'],
        ['focus', 'focus', 'galaxy'],
        ['inside', 'inside', 'galaxy'],
        ['focus-search', undefined, 'galaxy'],
        ['map', undefined, 'map'],
        ['map-trail', undefined, 'map'],
        ['map-focus', undefined, 'map'],
        ['map-focus-search', undefined, 'map']
    ] as const)('%s maps to mode=%s and viewFamily=%s', (surface, mode, viewFamily) => {
        expect(getSurfaceModePatch(surface)).toEqual({ mode, viewFamily })
    })

    it('recognises map-family surfaces without broadening the surface contract', () => {
        expect(isMapFamilySurface('map')).toBe(true)
        expect(isMapFamilySurface('map-focus-search')).toBe(true)
        expect(isMapFamilySurface('focus-search')).toBe(false)
        expect(isPanelSurface('map-focus-search')).toBe(true)
        expect(isPanelSurface('not-a-surface')).toBe(false)
    })
})
