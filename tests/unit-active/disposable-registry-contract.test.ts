/**
 * disposable-registry contract tests
 * Verifies DisposableRegistry prevents the leak class that occupies
 * 37% of recent commits (timers, listeners, subscriptions not cleaned up).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DisposableRegistry, createDisposableRegistry, assertDisposed } from '../../src/lib/utils/disposable-registry'

describe('DisposableRegistry', () => {
    let registry: DisposableRegistry

    beforeEach(() => {
        vi.useFakeTimers()
        registry = new DisposableRegistry({ label: 'test', warnAfterDispose: false })
    })

    afterEach(() => {
        // Restore real timers so fake timer state doesn't leak between tests
        vi.useRealTimers()
        registry.disposeAll()
    })

    describe('timer()', () => {
        it('clears a setTimeout on disposeAll()', () => {
            const fn = vi.fn()
            const id = setTimeout(fn, 1_000_000)
            registry.timer(id as unknown as ReturnType<typeof setTimeout>)
            registry.disposeAll()
            expect(registry.isDisposed).toBe(true)
            // Timer should not fire
            vi.advanceTimersByTime(2_000_000)
            expect(fn).not.toHaveBeenCalled()
        })

        it('clears a setInterval on disposeAll()', () => {
            const fn = vi.fn()
            const id = setInterval(fn, 100)
            registry.timer(id as unknown as ReturnType<typeof setTimeout>)
            registry.disposeAll()
            vi.advanceTimersByTime(500)
            expect(fn).not.toHaveBeenCalled()
        })
    })

    describe('listener()', () => {
        it('removes a DOM listener on disposeAll()', () => {
            const target = document.createElement('div')
            const handler = vi.fn()
            registry.listener(target, 'click', handler)
            registry.disposeAll()
            target.dispatchEvent(new Event('click'))
            expect(handler).not.toHaveBeenCalled()
        })
    })

    describe('subscription()', () => {
        it('calls the unsubscribe function on disposeAll()', () => {
            const unsub = vi.fn()
            registry.subscription(unsub)
            registry.disposeAll()
            expect(unsub).toHaveBeenCalledTimes(1)
        })
    })

    describe('resource()', () => {
        it('calls .dispose() on tracked objects', () => {
            const obj = { dispose: vi.fn() }
            registry.resource(obj)
            registry.disposeAll()
            expect(obj.dispose).toHaveBeenCalledTimes(1)
        })
    })

    describe('add() raw function', () => {
        it('calls raw dispose functions', () => {
            const fn = vi.fn()
            registry.add(fn)
            registry.disposeAll()
            expect(fn).toHaveBeenCalledTimes(1)
        })
    })

    describe('disposeAll()', () => {
        it('is idempotent (calling twice is safe)', () => {
            const fn = vi.fn()
            registry.add(fn)
            registry.disposeAll()
            registry.disposeAll() // should not throw
            expect(fn).toHaveBeenCalledTimes(1)
        })

        it('swallows per-item errors to maximize cleanup', () => {
            const good = vi.fn()
            const bad = vi.fn(() => {
                throw new Error('intentional')
            })
            registry.add(good)
            registry.add(bad)
            expect(() => registry.disposeAll()).not.toThrow()
            expect(good).toHaveBeenCalled()
            expect(bad).toHaveBeenCalled()
        })
    })

    describe('addMany()', () => {
        it('tracks multiple disposables at once', () => {
            const a = vi.fn()
            const b = vi.fn()
            registry.addMany(a, b)
            registry.disposeAll()
            expect(a).toHaveBeenCalledTimes(1)
            expect(b).toHaveBeenCalledTimes(1)
        })
    })

    describe('size', () => {
        it('reflects the number of active disposables', () => {
            expect(registry.size).toBe(0)
            registry.timer(setTimeout(() => {}, 1_000))
            expect(registry.size).toBe(1)
            registry.add(() => {})
            expect(registry.size).toBe(2)
            registry.disposeAll()
            expect(registry.size).toBe(0)
        })
    })

    describe('factory', () => {
        it('createDisposableRegistry() returns a new instance', () => {
            const a = createDisposableRegistry()
            const b = createDisposableRegistry()
            expect(a).not.toBe(b)
            expect(a instanceof DisposableRegistry).toBe(true)
        })
    })

    describe('assertDisposed()', () => {
        it('throws if the registry is not disposed', () => {
            expect(() => assertDisposed(registry, 'myReg')).toThrow('myReg')
        })

        it('does not throw if the registry is disposed', () => {
            registry.disposeAll()
            expect(() => assertDisposed(registry)).not.toThrow()
        })
    })

    describe('reverse order cleanup', () => {
        it('disposes in reverse registration order', () => {
            const order: number[] = []
            registry.add(() => order.push(1))
            registry.add(() => order.push(2))
            registry.add(() => order.push(3))
            registry.disposeAll()
            expect(order).toEqual([3, 2, 1])
        })
    })

    describe('label', () => {
        it('preserves the debug label', () => {
            expect((registry as any).label).toBe('test')
        })
    })
})
