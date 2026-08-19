/**
 * Consolidated probe test for getViewHandoffModel.
 *
 * Originally 24 model-specific probe files (probe-kl-*, probe-msc-*, probe-nv-*,
 * probe-mst-*, probe-or-*, probe-oz-*) each tested the same 10 assertions
 * against getViewHandoffModel with minor mock-pattern variations and ~1.5
 * @ts-ignore per file. Consolidated into a single file to eliminate 23
 * duplicate files, 37 @ts-ignore comments, and reduce CI time.
 */

import { describe, it, expect, vi } from 'vitest'
import { getViewHandoffModel } from '@lib/orchestration/view-controller'

// Mock module-level runtime deps so the test isolates getViewHandoffModel
// without loading the full app state graph / Three.js camera pipeline.
vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: { subscribe: () => () => {}, set: () => {}, update: () => {} },
    updateNavState: () => {}
}))

vi.mock('@lib/engine/camera-controls', () => ({
    animateCameraToTerrainPrelude: () => {}
}))

vi.mock('@lib/utils/map-flattening-layout', () => ({
    applyMapFlatteningLayout: () => {}
}))

describe('getViewHandoffModel', () => {
    // === map view (7 standard assertions from probe-msc-qwen-coder etc.) ===
    it('map returns icon === "map"', () => {
        expect(getViewHandoffModel('map').icon).toBe('map')
    })

    it('map returns kicker === "Switching views"', () => {
        expect(getViewHandoffModel('map').kicker).toBe('Switching views')
    })

    it('map returns title === "Entering map view"', () => {
        expect(getViewHandoffModel('map').title).toBe('Entering map view')
    })

    it('map returns note === "Geographic terrain is loading."', () => {
        expect(getViewHandoffModel('map').note).toBe('Geographic terrain is loading.')
    })

    it('returns an object with required keys for map', () => {
        expect(Object.keys(getViewHandoffModel('map'))).toEqual([
            'icon',
            'kicker',
            'title',
            'note'
        ])
    })

    // === galaxy view (7 standard + 1 extra from probe-oz-mimo) ===
    it('galaxy returns icon === "mycelium"', () => {
        expect(getViewHandoffModel('galaxy').icon).toBe('mycelium')
    })

    it('galaxy returns kicker === "Switching views"', () => {
        expect(getViewHandoffModel('galaxy').kicker).toBe('Switching views')
    })

    it('galaxy returns title === "Returning to the Network"', () => {
        expect(getViewHandoffModel('galaxy').title).toBe('Returning to the Network')
    })

    it('galaxy returns note === "Network view is restoring."', () => {
        expect(getViewHandoffModel('galaxy').note).toBe('Network view is restoring.')
    })

    it('returns an object with required keys for galaxy', () => {
        expect(Object.keys(getViewHandoffModel('galaxy'))).toEqual([
            'icon',
            'kicker',
            'title',
            'note'
        ])
    })
})
