// Self-ID: probe-kl-nano-omni (model=kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, route=pi:router-kilo), dispatched 2026-07-26.
// @ts-ignore
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller'

// Mock external modules to avoid side effects
vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: {
        get: vi.fn(),
    },
    updateNavState: vi.fn(),
}))
vi.mock('@lib/engine/camera-controls', () => ({
    animateCameraToTerrainPrelude: vi.fn(),
}))
vi.mock('@lib/utils/map-flattening-layout', () => ({
    applyMapFlatteningLayout: vi.fn(),
}))

describe('getViewHandoffModel', () => {
    // Test that map view returns the correct handoff model
    it('map returns icon === "map"', () => {
        const model = getViewHandoffModel('map')
        expect(model.icon).toBe('map')
    })

    // Test map kicker text
    it('map returns kicker === "Switching views"', () => {
        const model = getViewHandoffModel('map')
        expect(model.kicker).toBe('Switching views')
    })

    // Test map title
    it('map returns title === "Entering map view"', () => {
        const model = getViewHandoffModel('map')
        expect(model.title).toBe('Entering map view')
    })

    // Test map note
    it('map returns note === "Geographic terrain is loading."', () => {
        const model = getViewHandoffModel('map')
        expect(model.note).toBe('Geographic terrain is loading.')
    })

    // Test galaxy icon
    it('galaxy returns icon === "mycelium"', () => {
        const model = getViewHandoffModel('galaxy')
        expect(model.icon).toBe('mycelium')
    })

    // Test galaxy title
    it('galaxy returns title === "Returning to the Network"', () => {
        const model = getViewHandoffModel('galaxy')
        expect(model.title).toBe('Returning to the Network')
    })

    // Test galaxy note
    it('galaxy returns note === "Network view is restoring."', () => {
        const model = getViewHandoffModel('galaxy')
        expect(model.note).toBe('Network view is restoring.')
    })

    // Verify result contains all expected properties for map
    it('returns an object with required keys for map', () => {
        const model = getViewHandoffModel('map')
        expect(Object.keys(model)).toEqual(['icon', 'kicker', 'title', 'note'])
    })

    // Verify result contains all expected properties for galaxy
    it('returns an object with required keys for galaxy', () => {
        const model = getViewHandoffModel('galaxy')
        expect(Object.keys(model)).toEqual(['icon', 'kicker', 'title', 'note'])
    })
})