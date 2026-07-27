// Self-ID: probe-oz-deepseek (model=opencode/deepseek-v4-flash-free, route=pi:router-opencode-zen), dispatched 2026-07-26.

import { describe, it, expect, vi } from 'vitest'
import { writable } from 'svelte/store'

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
  navStore: writable({ currentView: 'galaxy', focusedIndex: null, surface: 'overview', trailDepth: 0 }),
  updateNavState: vi.fn()
}))
vi.mock('@lib/engine/camera-controls', () => ({ animateCameraToTerrainPrelude: vi.fn() }))
vi.mock('@lib/utils/map-flattening-layout', () => ({ applyMapFlatteningLayout: vi.fn() }))

// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller'

describe('getViewHandoffModel', () => {

  it('map returns icon === "map"', () => {
    const m = getViewHandoffModel('map')
    expect(m.icon).toBe('map')
  })

  it('map returns kicker === "Switching views"', () => {
    const m = getViewHandoffModel('map')
    expect(m.kicker).toBe('Switching views')
  })

  it('map returns title === "Entering map view"', () => {
    const m = getViewHandoffModel('map')
    expect(m.title).toBe('Entering map view')
  })

  it('map returns note === "Geographic terrain is loading."', () => {
    const m = getViewHandoffModel('map')
    expect(m.note).toBe('Geographic terrain is loading.')
  })

  it('galaxy returns icon === "mycelium"', () => {
    const m = getViewHandoffModel('galaxy')
    expect(m.icon).toBe('mycelium')
  })

  it('galaxy returns title === "Returning to the Network"', () => {
    const m = getViewHandoffModel('galaxy')
    expect(m.title).toBe('Returning to the Network')
  })

  it('galaxy returns note === "Network view is restoring."', () => {
    const m = getViewHandoffModel('galaxy')
    expect(m.note).toBe('Network view is restoring.')
  })
})
