/**
 * probe-kl-cohere.test.ts — Vitest coverage for src/lib/orchestration/view-controller.ts getViewHandoffModel()
 *
 * Self-ID: probe-kl-cohere (model=kilo/cohere/north-mini-code:free, route=pi:router-kilo), dispatched 2026-07-26.
 */

import { describe, it, expect } from 'vitest'
// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller.ts'

// @ts-ignore
import { navStore } from '@lib/stores/navigation.svelte.ts'
// @ts-ignore
import { animateCameraToTerrainPrelude } from '@lib/engine/camera-controls'
// @ts-ignore
import { applyMapFlatteningLayout } from '@lib/utils/map-flattening-layout'

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: {
        subscribe: vi.fn(() => ({ currentView: 'galaxy', focusedIndex: null, surface: 'overview', trailDepth: 0 }))
    },
    updateNavState: vi.fn()
}))

vi.mock('@lib/engine/camera-controls', () => ({ animateCameraToTerrainPrelude: vi.fn() }))
vi.mock('@lib/utils/map-flattening-layout', () => ({ applyMapFlatteningLayout: vi.fn() }))

describe('getViewHandoffModel', () => {
    // 1. 'map' returns icon === 'map'
    it('map returns icon === "map"', () => {
        const model = getViewHandoffModel('map')
        expect(model.icon).toBe('map')
    })

    // 2. 'map' returns kicker === 'Switching views'
    it('map returns kicker === "Switching views"', () => {
        const model = getViewHandoffModel('map')
        expect(model.kicker).toBe('Switching views')
    })

    // 3. 'map' returns title === 'Entering map view'
    it('map returns title === "Entering map view"', () => {
        const model = getViewHandoffModel('map')
        expect(model.title).toBe('Entering map view')
    })

    // 4. 'map' returns note === 'Geographic terrain is loading.'
    it('map returns note === "Geographic terrain is loading."', () => {
        const model = getViewHandoffModel('map')
        expect(model.note).toBe('Geographic terrain is loading.')
    })

    // 5. 'galaxy' returns icon === 'mycelium'
    it('galaxy returns icon === "mycelium"', () => {
        const model = getViewHandoffModel('galaxy')
        expect(model.icon).toBe('mycelium')
    })

    // 6. 'galaxy' returns title === 'Returning to the Network'
    it('galaxy returns title === "Returning to the Network"', () => {
        const model = getViewHandoffModel('galaxy')
        expect(model.title).toBe('Returning to the Network')
    })

    // 7. 'galaxy' returns note === 'Network view is restoring.'
    it('galaxy returns note === "Network view is restoring."', () => {
        const model = getViewHandoffModel('galaxy')
        expect(model.note).toBe('Network view is restoring.')
    })
})
