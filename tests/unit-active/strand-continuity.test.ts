import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StrandContinuityManager,
  getStrandContinuityManager,
  resetStrandContinuityManager
} from '../../src/lib/utils/strand-continuity'

describe('StrandContinuityManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetStrandContinuityManager()
    vi.useRealTimers()
  })

  it('tracks timers by purpose and replaces an existing purpose timer', () => {
    const manager = new StrandContinuityManager()
    const first = vi.fn()
    const second = vi.fn()

    manager.setTimer('settle', 100, first)
    manager.setTimer('settle', 100, second)

    expect(manager.activeTimerCount).toBe(1)
    vi.advanceTimersByTime(100)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(manager.activeTimerCount).toBe(0)
  })

  it('cancels every tracked timer without blocking future timers', () => {
    const manager = new StrandContinuityManager()
    const arrival = vi.fn()
    const settle = vi.fn()
    const next = vi.fn()

    manager.setTimer('arrival', 100, arrival)
    manager.setTimer('settle', 200, settle)
    expect(manager.activeTimerCount).toBe(2)

    manager.cancelAll()
    vi.advanceTimersByTime(250)

    expect(arrival).not.toHaveBeenCalled()
    expect(settle).not.toHaveBeenCalled()
    expect(manager.activeTimerCount).toBe(0)

    manager.setTimer('arrival', 50, next)
    vi.advanceTimersByTime(50)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('returns snapshots without replacing the live state object', () => {
    const manager = new StrandContinuityManager()
    const stateRef = manager.state

    const snapshot = manager.setPhase('exploring', {
      targetIndex: 7,
      fromIndex: 3,
      reason: 'route'
    })

    expect(manager.state).toBe(stateRef)
    expect(snapshot).not.toBe(manager.state)
    expect(snapshot).toMatchObject({
      phase: 'exploring',
      targetIndex: 7,
      fromIndex: 3,
      reason: 'route'
    })
    expect(manager.snapshot()).toEqual(snapshot)
  })

  it('fires configured sync callbacks for phase changes', () => {
    const onBodySync = vi.fn()
    const onArrivalSync = vi.fn()
    const onArrivalDispose = vi.fn()
    const onPhaseChange = vi.fn()
    const manager = new StrandContinuityManager({
      onBodySync,
      onArrivalSync,
      onArrivalDispose,
      onPhaseChange
    })

    manager.setPhase('exploring')
    manager.setPhase('arrived')
    manager.clear('done')

    expect(onBodySync).toHaveBeenCalledTimes(3)
    expect(onArrivalSync).toHaveBeenCalledTimes(2)
    expect(onArrivalDispose).toHaveBeenCalledTimes(1)
    expect(onPhaseChange).toHaveBeenLastCalledWith('idle', expect.objectContaining({ reason: 'done' }))
  })

  it('resets the global singleton and clears its timers', () => {
    const manager = getStrandContinuityManager()
    manager.setTimer('arrival', 100, vi.fn())

    expect(getStrandContinuityManager()).toBe(manager)
    expect(manager.activeTimerCount).toBe(1)

    resetStrandContinuityManager()

    const fresh = getStrandContinuityManager()
    expect(fresh).not.toBe(manager)
    expect(fresh.activeTimerCount).toBe(0)
  })
})
