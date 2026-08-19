import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installGestureMonitor } from '@lib/orchestration/wait-for-gesture'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

describe('installGestureMonitor', () => {
  let onReady: () => void
  let teardown: () => void

  beforeEach(() => {
    onReady = vi.fn()
    vi.useFakeTimers()
    vi.stubGlobal('__PLAYWRIGHT__', undefined)
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    })
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(window, 'removeEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('registers all gesture listeners on window with { passive: true }', () => {
    teardown = installGestureMonitor({ onReady })
    expect(window.addEventListener).toHaveBeenCalledTimes(4)
    expect(window.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), { passive: true })
    expect(window.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: true })
    expect(window.addEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true })
    expect(window.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true })
  })

  it('registers visibilitychange listener on document', () => {
    teardown = installGestureMonitor({ onReady })
    expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('returns a function', () => {
    teardown = installGestureMonitor({ onReady })
    expect(typeof teardown).toBe('function')
  })
})

describe('handleReady', () => {
  let onReady: () => void
  let teardown: () => void

  beforeEach(() => {
    onReady = vi.fn()
    vi.useFakeTimers()
    vi.stubGlobal('__PLAYWRIGHT__', undefined)
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    })
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(window, 'removeEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('fires onReady exactly once for multiple gestures', () => {
    teardown = installGestureMonitor({ onReady })
    const event = new Event('pointerdown')
    window.dispatchEvent(event)
    window.dispatchEvent(event)
    window.dispatchEvent(event)
    window.dispatchEvent(event)
    window.dispatchEvent(event)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('does not fire onReady when renderKind is placeholder2d', () => {
    Object.defineProperty(document.body, 'dataset', {
      value: { renderKind: 'placeholder2d' },
      configurable: true,
    })
    teardown = installGestureMonitor({ onReady })
    const event = new Event('pointerdown')
    window.dispatchEvent(event)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('does not fire onReady when event target is inside gesture gate', () => {
    const mockElement = document.createElement('div')
    mockElement.className = 'splash'
    mockElement.setAttribute('role', 'dialog')
    document.body.appendChild(mockElement)
    teardown = installGestureMonitor({ onReady })
    const event = new Event('pointerdown')
    Object.defineProperty(event, 'target', { value: mockElement, configurable: true })
    window.dispatchEvent(event)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('fires onReady when event target is not inside gesture gate', () => {
    const mockElement = document.createElement('div')
    document.body.appendChild(mockElement)
    teardown = installGestureMonitor({ onReady })
    const event = new Event('pointerdown')
    Object.defineProperty(event, 'target', { value: mockElement, configurable: true })
    window.dispatchEvent(event)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('fires onReady when called without an event', () => {
    teardown = installGestureMonitor({ onReady })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})

describe('cooldown and auto-teardown', () => {
  let onReady: () => void
  let teardown: () => void

  beforeEach(() => {
    onReady = vi.fn()
    vi.useFakeTimers()
    vi.stubGlobal('__PLAYWRIGHT__', undefined)
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    })
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(window, 'removeEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('schedules teardown after cooldown', () => {
    (window.removeEventListener as any).mockClear()
    teardown = installGestureMonitor({ onReady })
    const event = new Event('pointerdown')
    window.dispatchEvent(event)
    vi.advanceTimersByTime(201)
    expect(window.removeEventListener).toHaveBeenCalledTimes(4)
    expect(document.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('uses custom cooldownMs', () => {
    teardown = installGestureMonitor({ onReady, cooldownMs: 1000 })
    const event = new Event('pointerdown')
    window.dispatchEvent(event)
    vi.advanceTimersByTime(1001)
    expect(window.removeEventListener).toHaveBeenCalledTimes(4)
    expect(document.removeEventListener).toHaveBeenCalledTimes(1)
  })
})

describe('onVisibilityChange fallback', () => {
  let onReady: () => void
  let teardown: () => void

  beforeEach(() => {
    onReady = vi.fn()
    vi.useFakeTimers()
    vi.stubGlobal('__PLAYWRIGHT__', undefined)
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    })
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(window, 'removeEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('does not fire onReady on initial load', () => {
    teardown = installGestureMonitor({ onReady })
    expect(onReady).not.toHaveBeenCalled()
  })

  it('does not fire onReady when visibilityState is hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    teardown = installGestureMonitor({ onReady })
    const event = new Event('visibilitychange')
    document.dispatchEvent(event)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('fires onReady when visibilityState changes from hidden to visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    teardown = installGestureMonitor({ onReady })
    const hiddenEvent = new Event('visibilitychange')
    document.dispatchEvent(hiddenEvent)
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    const visibleEvent = new Event('visibilitychange')
    document.dispatchEvent(visibleEvent)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('does not double-call onReady on subsequent visibility changes', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    teardown = installGestureMonitor({ onReady })
    const hiddenEvent = new Event('visibilitychange')
    document.dispatchEvent(hiddenEvent)
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    const visibleEvent = new Event('visibilitychange')
    document.dispatchEvent(visibleEvent)
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(hiddenEvent)
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(visibleEvent)
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})

describe('Playwright/test auto-fire', () => {
  let onReady: () => void
  let teardown: () => void

  beforeEach(() => {
    onReady = vi.fn()
    vi.useFakeTimers()
    vi.stubGlobal('__PLAYWRIGHT__', undefined)
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    })
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(window, 'removeEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('auto-fires onReady when window.__PLAYWRIGHT__ is true', () => {
    vi.stubGlobal('__PLAYWRIGHT__', true)
    teardown = installGestureMonitor({ onReady })
    vi.advanceTimersByTime(1)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('auto-fires onReady when navigator.webdriver is true', () => {
    Object.defineProperty(navigator, 'webdriver', {
      value: true,
      configurable: true,
    })
    teardown = installGestureMonitor({ onReady })
    vi.advanceTimersByTime(1)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('does not auto-fire onReady when both flags are false', () => {
    teardown = installGestureMonitor({ onReady })
    vi.advanceTimersByTime(1)
    expect(onReady).not.toHaveBeenCalled()
  })
})

describe('teardown', () => {
  let onReady: () => void
  let teardown: () => void

  beforeEach(() => {
    onReady = vi.fn()
    vi.useFakeTimers()
    vi.stubGlobal('__PLAYWRIGHT__', undefined)
    Object.defineProperty(navigator, 'webdriver', {
      value: false,
      configurable: true,
    })
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    vi.spyOn(window, 'addEventListener')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(window, 'removeEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(document.body, 'dataset', {
      value: {},
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
  })

  it('removes all listeners', () => {
    teardown = installGestureMonitor({ onReady })
    teardown()
    expect(window.removeEventListener).toHaveBeenCalledTimes(4)
    expect(document.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('does not throw when called before any gesture fired', () => {
    teardown = installGestureMonitor({ onReady })
    expect(() => teardown()).not.toThrow()
  })

  it('does not throw when called twice', () => {
    teardown = installGestureMonitor({ onReady })
    teardown()
    expect(() => teardown()).not.toThrow()
  })
})
