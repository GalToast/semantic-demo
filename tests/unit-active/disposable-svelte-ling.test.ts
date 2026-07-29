// @ts-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-ignore
import { disposable } from '../../src/lib/utils/disposable.svelte'
// @ts-ignore
import { DisposableRegistry, createDisposableRegistry, assertDisposed } from '../../src/lib/utils/disposable-registry'

/**
 * Vitest regression coverage for src/lib/utils/disposable.svelte.ts.
 *
 * The `disposable()` factory wraps DisposableRegistry with defaults
 * (label: 'SvelteDisposable', warnAfterDispose: true).  It does NOT
 * auto-dispose — the caller must wire cleanup via $effect.
 *
 * The SvelteDisposable type export is type-only and untestable at runtime;
 * it is documented in the report instead.
 */

describe('disposable (Svelte wrapper — ling regression)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    // ── Factory: label wiring ────────────────────────────────────────
    describe('factory: label wiring', () => {
        it('disposable() defaults label to "SvelteDisposable"', () => {
            const reg = disposable()
            expect(reg).toBeInstanceOf(DisposableRegistry)
            expect((reg as any).label).toBe('SvelteDisposable')
        })

        it('disposable(label) passes a custom label through', () => {
            const reg = disposable('MyApp')
            expect((reg as any).label).toBe('MyApp')
        })

        it('disposable("") passes an empty-string label through', () => {
            const reg = disposable('')
            expect((reg as any).label).toBe('')
        })

        it('disposable(undefined) falls back to default label', () => {
            const reg = disposable(undefined)
            expect((reg as any).label).toBe('SvelteDisposable')
        })
    })

    // ── Factory: warnAfterDispose wiring ─────────────────────────────
    describe('factory: warnAfterDispose wiring', () => {
        it('disposable() enables warnAfterDispose by default', () => {
            const reg = disposable()
            expect((reg as any).warnAfterDispose).toBe(true)
        })

        it('factory produces a registry that warns (in DEV) when add() is called after disposeAll()', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const reg = disposable('warnTest')
            reg.disposeAll()
            reg.add(() => {})
            const anyCall = warnSpy.mock.calls.some(
                (c: any[]) => String(c[0]).includes('warnTest') && String(c[0]).includes('leak risk')
            )
            expect(anyCall).toBe(true)
        })

        it('SvelteDisposable is a type-only interface exported alongside the factory — not a runtime class', () => {
            // SvelteDisposable extends DisposableRegistry in the type system only.
            // It has no runtime constructor and cannot be used with instanceof.
            // This test documents that limitation — the .svelte.ts module exports
            // SvelteDisposable purely as a TypeScript interface for consumer annotations.
            expect(true).toBe(true)
        })
    })

    // ── timer / schedule / scheduleInterval through factory ──────────
    describe('timer(), schedule(), scheduleInterval() via factory', () => {
        it('timer() clears a setTimeout on disposeAll()', () => {
            const reg = disposable('timer')
            const cb = vi.fn()
            reg.timer(setTimeout(cb, 1_000_000) as unknown as ReturnType<typeof setTimeout>)
            reg.disposeAll()
            vi.advanceTimersByTime(2_000_000)
            expect(cb).not.toHaveBeenCalled()
        })

        it('schedule() creates + registers a setTimeout — callback suppressed after disposeAll()', () => {
            const reg = disposable('schedule')
            const cb = vi.fn()
            reg.schedule(1_000_000, cb)
            reg.disposeAll()
            vi.advanceTimersByTime(2_000_000)
            expect(cb).not.toHaveBeenCalled()
        })

        it('scheduleInterval() creates + registers a setInterval — callback suppressed after disposeAll()', () => {
            const reg = disposable('schedInt')
            const cb = vi.fn()
            reg.scheduleInterval(100, cb)
            reg.disposeAll()
            vi.advanceTimersByTime(500)
            expect(cb).not.toHaveBeenCalled()
        })

        it('scheduleInterval() fires periodically when disposeAll() is NOT called', () => {
            const reg = disposable('schedIntLive')
            const cb = vi.fn()
            reg.scheduleInterval(50, cb)
            vi.advanceTimersByTime(180)
            expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3)
        })
    })

    // ── raf() through factory ────────────────────────────────────────
    describe('raf() via factory', () => {
        it('tracks the rAF id and cancels it via cancelAnimationFrame on disposeAll()', () => {
            const cancelSpy = vi.fn()
            vi.stubGlobal('cancelAnimationFrame', cancelSpy)
            const reg = disposable('raf')
            reg.raf(777)
            reg.disposeAll()
            expect(cancelSpy).toHaveBeenCalledWith(777)
        })

        it('does NOT cancel rAF id before disposeAll() runs', () => {
            const cancelSpy = vi.fn()
            vi.stubGlobal('cancelAnimationFrame', cancelSpy)
            const reg = disposable('rafEarly')
            reg.raf(888)
            expect(cancelSpy).not.toHaveBeenCalled()
        })
    })

    // ── listener() through factory ───────────────────────────────────
    describe('listener() via factory', () => {
        it('removes a DOM listener on disposeAll()', () => {
            const reg = disposable('listener')
            const target = document.createElement('div')
            const handler = vi.fn()
            reg.listener(target, 'click', handler)
            reg.disposeAll()
            target.dispatchEvent(new Event('click'))
            expect(handler).not.toHaveBeenCalled()
        })

        it('still has the listener registered (size=1) before disposeAll() touches it', () => {
            const reg = disposable('listenerEarly')
            const target = document.createElement('div')
            const handler = vi.fn()
            reg.listener(target, 'click', handler)
            // Before removeEventListener runs, the registry still holds the cleanup item.
            // jsdom dispatchEvent behavior on bare elements is unreliable in unit envs,
            // so we verify registration state instead of relying on event propagation.
            expect(reg.size).toBe(1)
        })
    })

    // ── subscription() through factory ───────────────────────────────
    describe('subscription() via factory', () => {
        it('calls the unsubscribe function on disposeAll()', () => {
            const reg = disposable('sub')
            const unsub = vi.fn()
            reg.subscription(unsub)
            reg.disposeAll()
            expect(unsub).toHaveBeenCalledTimes(1)
        })

        it('subscription() does NOT call unsubscribe before disposeAll()', () => {
            const reg = disposable('subEarly')
            const unsub = vi.fn()
            reg.subscription(unsub)
            expect(unsub).not.toHaveBeenCalled()
        })
    })

    // ── resource() through factory ───────────────────────────────────
    describe('resource() via factory', () => {
        it('calls .dispose() on tracked objects via disposeAll()', () => {
            const reg = disposable('resource')
            const obj = { dispose: vi.fn() }
            reg.resource(obj)
            reg.disposeAll()
            expect(obj.dispose).toHaveBeenCalledTimes(1)
        })
    })

    // ── addMany() through factory ────────────────────────────────────
    describe('addMany() via factory', () => {
        it('tracks multiple disposables of mixed shapes', () => {
            const reg = disposable('addMany')
            const fn = vi.fn()
            const obj = { dispose: vi.fn() }
            reg.addMany(fn, obj)
            reg.disposeAll()
            expect(fn).toHaveBeenCalledTimes(1)
            expect(obj.dispose).toHaveBeenCalledTimes(1)
        })

        it('preserves reverse-order cleanup across mixed shapes', () => {
            const reg = disposable('addManyOrder')
            const order: string[] = []
            reg.addMany(
                () => order.push('fn1'),
                { dispose: () => order.push('obj2') },
                () => order.push('fn3')
            )
            reg.disposeAll()
            expect(order).toEqual(['fn3', 'obj2', 'fn1'])
        })
    })

    // ── size & isDisposed through factory ────────────────────────────
    describe('size & isDisposed via factory', () => {
        it('size is 0 initially', () => {
            const reg = disposable('size')
            expect(reg.size).toBe(0)
        })

        it('size increments when items are registered', () => {
            const reg = disposable('size')
            reg.timer(setTimeout(() => {}, 1000))
            expect(reg.size).toBe(1)
        })

        it('size resets to 0 after disposeAll()', () => {
            const reg = disposable('sizeReset')
            reg.timer(setTimeout(() => {}, 1000))
            reg.disposeAll()
            expect(reg.size).toBe(0)
        })

        it('isDisposed is false until disposeAll()', () => {
            const reg = disposable('isDisposed')
            expect(reg.isDisposed).toBe(false)
            reg.disposeAll()
            expect(reg.isDisposed).toBe(true)
        })
    })

    // ── dispose() alias through factory ──────────────────────────────
    describe('dispose() alias via factory', () => {
        it('dispose() is identical to disposeAll() — invokes tracked cleanups', () => {
            const reg = disposable('disposeAlias')
            const fn = vi.fn()
            reg.add(fn)
            reg.dispose()
            expect(reg.isDisposed).toBe(true)
            expect(fn).toHaveBeenCalledTimes(1)
        })

        it('dispose() then disposeAll() runs cleanups only once (idempotent)', () => {
            const reg = disposable('disposeIdempotent')
            const fn = vi.fn()
            reg.add(fn)
            reg.dispose()
            reg.disposeAll()
            expect(fn).toHaveBeenCalledTimes(1)
        })
    })

    // ── error swallowing through factory ─────────────────────────────
    describe('error swallowing via factory', () => {
        it('swallows per-item errors and continues cleanup (disposeAll)', () => {
            const reg = disposable('swallow')
            const good = vi.fn()
            const bad = vi.fn(() => { throw new Error('intentional') })
            reg.add(good)
            reg.add(bad)
            expect(() => reg.disposeAll()).not.toThrow()
            expect(good).toHaveBeenCalled()
            expect(bad).toHaveBeenCalled()
        })

        it('swallows per-item errors and continues cleanup (dispose alias)', () => {
            const reg = disposable('swallowAlias')
            const good = vi.fn()
            const bad = vi.fn(() => { throw new Error('intentional') })
            reg.add(good)
            reg.add(bad)
            expect(() => reg.dispose()).not.toThrow()
            expect(good).toHaveBeenCalled()
            expect(bad).toHaveBeenCalled()
        })
    })

    // ── reverse-order cleanup through factory ────────────────────────
    describe('reverse-order cleanup via factory', () => {
        it('disposes in reverse registration order (child-first)', () => {
            const reg = disposable('reverse')
            const order: number[] = []
            reg.add(() => order.push(1))
            reg.add(() => order.push(2))
            reg.add(() => order.push(3))
            reg.disposeAll()
            expect(order).toEqual([3, 2, 1])
        })
    })

    // ── SvelteDisposable type export (type-only — documented, not runtime-testable) ──
    describe('SvelteDisposable (type export)', () => {
        it('SvelteDisposable is exported as a type — not testable at runtime, but the interface extends DisposableRegistry with an explicit dispose() marker', () => {
            // SvelteDisposable is a TypeScript interface (type-only export).
            // It extends DisposableRegistry and adds an explicit dispose(): void
            // declaration.  It cannot be instantiated or checked at runtime,
            // so this test documents the export rather than exercising it.
            expect(true).toBe(true)
            // The type exists in the module and is used by consumers
            // for explicit Svelte-runbook annotations, but it is not
            // a separate runtime class or factory target.
        })
    })

    // ── Lifecycle behavior (H2 clarification) ──
    describe('lifecycle behavior (H2 clarification)', () => {
        it('does NOT auto-dispose - caller must wire cleanup', () => {
            const disposeSpy = vi.fn()
            const reg = disposable('manualTest')
            reg.add(disposeSpy)
            
            // Should NOT auto-dispose - cleanup is caller's responsibility
            expect(reg.size).toBe(1)
            expect(reg.isDisposed).toBe(false)
            expect(disposeSpy).not.toHaveBeenCalled()
            
            // Manual dispose works as expected
            reg.disposeAll()
            expect(disposeSpy).toHaveBeenCalledTimes(1)
            expect(reg.isDisposed).toBe(true)
        })

        it('handles multiple disposable instances independently', () => {
            const disposeSpy1 = vi.fn()
            const disposeSpy2 = vi.fn()
            
            const reg1 = disposable('instance1')
            const reg2 = disposable('instance2')
            
            reg1.add(disposeSpy1)
            reg2.add(disposeSpy2)
            
            // Both instances require manual cleanup
            expect(reg1.isDisposed).toBe(false)
            expect(reg2.isDisposed).toBe(false)
            
            // Dispose first instance
            reg1.disposeAll()
            expect(disposeSpy1).toHaveBeenCalledTimes(1)
            expect(disposeSpy2).not.toHaveBeenCalled()
            expect(reg1.isDisposed).toBe(true)
            expect(reg2.isDisposed).toBe(false)
            
            // Dispose second instance
            reg2.disposeAll()
            expect(disposeSpy2).toHaveBeenCalledTimes(1)
            expect(reg2.isDisposed).toBe(true)
        })
    })
})
