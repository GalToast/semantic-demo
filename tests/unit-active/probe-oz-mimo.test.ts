// Self-ID: probe-oz-mimo (model=opencode/mimo-v2.5-free, route=pi:router-opencode), dispatched 2026-07-26.
/**
 * probe-oz-mimo.test.ts — Vitest coverage for getViewHandoffModel
 * from src/lib/orchestration/view-controller.ts
 */
import { describe, it, expect, vi } from 'vitest'
// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller'

// Mock dependency chain so the module can load without DOM/store real wiring
const mockNav = vi.hoisted(() => {
  const { writable } = require('svelte/store')
  return {
    navStore: writable({ currentView: 'galaxy', focusedIndex: null, surface: 'overview', trailDepth: 0 }),
    updateNavState: vi.fn()
  }
})
vi.mock('@lib/stores/navigation.svelte.ts', () => mockNav)
vi.mock('@lib/engine/camera-controls', () => ({ animateCameraToTerrainPrelude: vi.fn() }))
vi.mock('@lib/utils/map-flattening-layout', () => ({ applyMapFlatteningLayout: vi.fn() }))

describe('getViewHandoffModel', () => {
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
})
