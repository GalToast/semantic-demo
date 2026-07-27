// Self-ID: probe-kl-laguna (model=kilo/poolside/laguna-m.1:free, route=pi:router-kilo), dispatched 2026-07-26.

import { describe, it, expect, vi } from 'vitest'
// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller'
// Mock dependencies (static navStore object — avoids vi.mock hoisting trap with writable())
vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: { get: vi.fn() },
    updateNavState: vi.fn()
}))

vi.mock('@lib/engine/camera-controls', () => ({
    animateCameraToTerrainPrelude: vi.fn()
}))

vi.mock('@lib/utils/map-flattening-layout', () => ({
    applyMapFlatteningLayout: vi.fn()
}))

describe('getViewHandoffModel', () => {
    it("'map' returns icon === 'map'", () => {
        const result = getViewHandoffModel('map')
        expect(result.icon).toBe('map')
    })

    it("'map' returns kicker === 'Switching views'", () => {
        const result = getViewHandoffModel('map')
        expect(result.kicker).toBe('Switching views')
    })

    it("'map' returns title === 'Entering map view'", () => {
        const result = getViewHandoffModel('map')
        expect(result.title).toBe('Entering map view')
    })

    it("'map' returns note === 'Geographic terrain is loading.'", () => {
        const result = getViewHandoffModel('map')
        expect(result.note).toBe('Geographic terrain is loading.')
    })

    it("'galaxy' returns icon === 'mycelium'", () => {
        const result = getViewHandoffModel('galaxy')
        expect(result.icon).toBe('mycelium')
    })

    it("'galaxy' returns title === 'Returning to the Network'", () => {
        const result = getViewHandoffModel('galaxy')
        expect(result.title).toBe('Returning to the Network')
    })

    it("'galaxy' returns note === 'Network view is restoring.'", () => {
        const result = getViewHandoffModel('galaxy')
        expect(result.note).toBe('Network view is restoring.')
    })
})
