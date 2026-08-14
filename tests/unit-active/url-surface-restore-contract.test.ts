import { describe, expect, it } from 'vitest'
import { surfaceParamToNavMode } from '@lib/orchestration/url-params'

describe('URL surface restoration uses the canonical surface mapping', () => {
    it('returns null when no surface parameter is present', () => {
        expect(surfaceParamToNavMode(null)).toBeNull()
    })

    it.each([
        ['idle', { surface: 'idle', mode: 'overview' }],
        ['search', { surface: 'search', mode: 'search' }],
        ['focus', { surface: 'focus', mode: 'focus' }],
        ['inside', { surface: 'inside', mode: 'inside' }],
        ['map-trail', { surface: 'map-trail', currentView: 'map' }],
        ['map-focus-search', { surface: 'map-focus-search', currentView: 'map' }],
        ['focus-search', { surface: 'focus-search' }]
    ] as const)('%s restores the expected navigation patch', (surface, expected) => {
        expect(surfaceParamToNavMode(surface)).toEqual(expected)
    })

    it('preserves unknown surfaces without inventing a mode or view', () => {
        expect(surfaceParamToNavMode('legacy-surface')).toEqual({ surface: 'legacy-surface' })
    })
})
