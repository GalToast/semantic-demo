import { describe, it, expect, vi } from 'vitest'
// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller'
// @ts-ignore
import { navStore, updateNavState } from '@lib/stores/navigation.svelte.ts'
// @ts-ignore
import { animateCameraToTerrainPrelude } from '@lib/engine/camera-controls'
// @ts-ignore
import { applyMapFlatteningLayout } from '@lib/utils/map-flattening-layout'

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
  navStore: { subscribe: (cb: any) => cb({ currentView: 'galaxy', focusedIndex: null, surface: 'overview', trailDepth: 0 }), set: vi.fn() },
  updateNavState: vi.fn()
}))

vi.mock('@lib/engine/camera-controls', () => ({
  animateCameraToTerrainPrelude: vi.fn()
}))

vi.mock('@lib/utils/map-flattening-layout', () => ({
  applyMapFlatteningLayout: vi.fn()
}))

describe('getViewHandoffModel', () => {
  // Map view tests
  it('map returns icon === map', () => {
    const result = getViewHandoffModel('map')
    expect(result.icon).toBe('map')
  })

  it('map returns kicker === Switching views', () => {
    const result = getViewHandoffModel('map')
    expect(result.kicker).toBe('Switching views')
  })

  it('map returns title === Entering map view', () => {
    const result = getViewHandoffModel('map')
    expect(result.title).toBe('Entering map view')
  })

  it('map returns note === Geographic terrain is loading.', () => {
    const result = getViewHandoffModel('map')
    expect(result.note).toBe('Geographic terrain is loading.')
  })

  // Galaxy view tests
  it('galaxy returns icon === mycelium', () => {
    const result = getViewHandoffModel('galaxy')
    expect(result.icon).toBe('mycelium')
  })

  it('galaxy returns title === Returning to the Network', () => {
    const result = getViewHandoffModel('galaxy')
    expect(result.title).toBe('Returning to the Network')
  })

  it('galaxy returns note === Network view is restoring.', () => {
    const result = getViewHandoffModel('galaxy')
    expect(result.note).toBe('Network view is restoring.')
  })
})