/**
 * DisposableRegistry SUPPLEMENTAL coverage.
 *
 * Closes gaps left by tests/unit-active/disposable-registry-contract.test.ts.
 *
 * The contract test already covers: timer (setTimeout+setInterval), listener,
 * subscription, resource, add() raw-fn-form, disposeAll() idempotent + error-
 * swallowing, addMany() fn+fn, size, factory, assertDisposed, reverse order,
 * label.
 *
 * THIS FILE adds coverage for the methods NOT exercised by the contract test:
 *   - raf(id)                  → cancelAnimationFrame wireup
 *   - add({dispose()})         → object-dispose form (only raw fn tested before)
 *   - schedule(ms, cb)         → setTimeout convenience wrapper (create+register+return id)
 *   - scheduleInterval(ms, cb) → setInterval convenience wrapper (create+register+return id)
 *   - dispose()                → alias of disposeAll()
 *   - addMany(...)             → mixed fn+object shapes + reverse-order preservation across mixed types
 *   - add() AFTER disposeAll() with warnAfterDispose:true → IS_DEV console.warn branch
 *
 * See src/lib/utils/disposable-registry.ts for the implementation under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DisposableRegistry } from '../../src/lib/utils/disposable-registry'

describe('DisposableRegistry supplemental coverage', () => {
    describe('Non-fake-timed coverage (raf / add-object / dispose alias / mixed addMany / warn-after-dispose)', () => {
        let registry: DisposableRegistry

        beforeEach(() => {
            registry = new DisposableRegistry({
                label: 'supplemental',
                warnAfterDispose: true
            })
        })

        afterEach(() => {
            registry.disposeAll()
            vi.restoreAllMocks()
            vi.unstubAllGlobals()
        })

        // ── raf() ───────────────────────────────────────────────────────
        describe('raf()', () => {
            it('tracks the rAF id and cancels it via cancelAnimationFrame on disposeAll()', () => {
                const cancelSpy = vi.fn()
                vi.stubGlobal('cancelAnimationFrame', cancelSpy)
                const id = 777
                registry.raf(id)
                expect(registry.size).toBe(1)
                registry.disposeAll()
                expect(cancelSpy).toHaveBeenCalledWith(id)
                expect(cancelSpy).toHaveBeenCalledTimes(1)
            })

            it('does NOT cancel the rAF id before disposeAll() runs', () => {
                const cancelSpy = vi.fn()
                vi.stubGlobal('cancelAnimationFrame', cancelSpy)
                registry.raf(888)
                expect(cancelSpy).not.toHaveBeenCalled()
            })
        })

        // ── add() object-dispose form ───────────────────────────────────
        describe('add() object-dispose form', () => {
            it('calls .dispose() on an object passed to add()', () => {
                const obj = { dispose: vi.fn() }
                registry.add(obj)
                registry.disposeAll()
                expect(obj.dispose).toHaveBeenCalledTimes(1)
            })

            it('defensively no-ops an object lacking dispose() (callDispose runtime guard)', () => {
                // callDispose's `else` branch checks `typeof d.dispose === 'function'`
                // before invoking — bare objects won't throw.
                const bare = {} as unknown as { dispose(): void }
                expect(() => {
                    registry.add(bare)
                    registry.disposeAll()
                }).not.toThrow()
            })

            it('coexists with raw-function form: both invoke on disposeAll() (one test, one registry)', () => {
                const fn = vi.fn()
                const obj = { dispose: vi.fn() }
                registry.add(fn)
                registry.add(obj)
                registry.disposeAll()
                expect(fn).toHaveBeenCalledTimes(1)
                expect(obj.dispose).toHaveBeenCalledTimes(1)
            })
        })

        // ── dispose() alias ─────────────────────────────────────────────
        describe('dispose() alias', () => {
            it('dispose() behaves identically to disposeAll() — invokes tracked cleanups once', () => {
                const fn = vi.fn()
                const obj = { dispose: vi.fn() }
                registry.add(fn)
                registry.add(obj)
                registry.dispose()
                expect(registry.isDisposed).toBe(true)
                expect(fn).toHaveBeenCalledTimes(1)
                expect(obj.dispose).toHaveBeenCalledTimes(1)
            })

            it('dispose() is idempotent — calling dispose() then disposeAll() runs cleanups only once', () => {
                const fn = vi.fn()
                registry.add(fn)
                registry.dispose()
                registry.disposeAll() // no-op
                expect(fn).toHaveBeenCalledTimes(1)
            })
        })

        // ── addMany() mixed fn+object shapes ────────────────────────────
        describe('addMany() mixed fn+object shapes', () => {
            it('handles a mix of raw-function and object disposables', () => {
                const fnCleanup = vi.fn()
                const obj = { dispose: vi.fn() }
                registry.addMany(fnCleanup, obj)
                registry.disposeAll()
                expect(fnCleanup).toHaveBeenCalledTimes(1)
                expect(obj.dispose).toHaveBeenCalledTimes(1)
            })

            it('preserves reverse-order cleanup across mixed shapes', () => {
                const order: string[] = []
                registry.addMany(
                    () => order.push('fn1'),
                    { dispose: () => order.push('obj2') },
                    () => order.push('fn3')
                )
                registry.disposeAll()
                expect(order).toEqual(['fn3', 'obj2', 'fn1'])
            })
        })

        // ── add() after disposeAll() with warnAfterDispose:true (IS_DEV branch) ──
        describe('add() after disposeAll() [warnAfterDispose:true, IS_DEV branch]', () => {
            it('emits a console.warn in DEV when a new disposable is added after disposeAll()', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
                registry.disposeAll()
                expect(registry.isDisposed).toBe(true)
                registry.add(() => {})
                // IS_DEV in vitest is `import.meta.env.DEV === true` — Vite replaces
                // import.meta.env in tests, defaulting DEV=true in dev/test mode. If the
                // test fails here, the env is reporting DEV=false; consult vitest.config.ts.
                expect(warnSpy.mock.calls.length).toBeGreaterThan(0)
                const firstCallArg = warnSpy.mock.calls[0]?.[0] ?? ''
                expect(String(firstCallArg)).toContain('supplemental')
                expect(String(firstCallArg)).toContain('leak risk')
            })

            it('does NOT warn when warnAfterDispose is false on the registry', () => {
                const silentReg = new DisposableRegistry({
                    label: 'silent',
                    warnAfterDispose: false
                })
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
                silentReg.disposeAll()
                silentReg.add(() => {})
                expect(warnSpy).not.toHaveBeenCalled()
                silentReg.disposeAll()
            })

            it('does NOT warn before disposeAll() has been called', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
                registry.add(() => {})
                expect(warnSpy).not.toHaveBeenCalled()
            })
        })
    })

    describe('Fake-timed coverage (schedule + scheduleInterval)', () => {
        let registry: DisposableRegistry

        beforeEach(() => {
            vi.useFakeTimers()
            registry = new DisposableRegistry({
                label: 'schedule',
                warnAfterDispose: false
            })
        })

        afterEach(() => {
            vi.useRealTimers()
            registry.disposeAll()
            vi.restoreAllMocks()
        })

        // ── schedule() — setTimeout convenience ────────────────────────
        describe('schedule() (setTimeout convenience)', () => {
            it('creates + registers a setTimeout — callback does NOT fire after disposeAll()', () => {
                const cb = vi.fn()
                const id = registry.schedule(1_000_000, cb)
                expect(id).toBeDefined()
                expect(registry.size).toBe(1)
                registry.disposeAll()
                vi.advanceTimersByTime(2_000_000)
                expect(cb).not.toHaveBeenCalled()
            })

            it('callback DOES fire if disposeAll() is not called', () => {
                const cb = vi.fn()
                registry.schedule(50, cb)
                vi.advanceTimersByTime(100)
                expect(cb).toHaveBeenCalledTimes(1)
            })
        })

        // ── scheduleInterval() — setInterval convenience ────────────────
        describe('scheduleInterval() (setInterval convenience)', () => {
            it('creates + registers a setInterval — callback does NOT fire after disposeAll()', () => {
                const cb = vi.fn()
                registry.scheduleInterval(100, cb)
                expect(registry.size).toBe(1)
                registry.disposeAll()
                vi.advanceTimersByTime(500)
                expect(cb).not.toHaveBeenCalled()
            })

            it('interval fires periodically when disposeAll() is NOT called', () => {
                const cb = vi.fn()
                registry.scheduleInterval(50, cb)
                vi.advanceTimersByTime(180)
                // 180ms / 50ms ≈ 3 full interval ticks (+0 or +1 depending on fake-timer accounting)
                expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3)
            })

            it('interval is cleared after disposeAll() — no further fires on advance', () => {
                const cb = vi.fn()
                registry.scheduleInterval(50, cb)
                vi.advanceTimersByTime(100) // → 2 ticks
                expect(cb.mock.calls.length).toBe(2)
                registry.disposeAll()
                vi.advanceTimersByTime(500)
                expect(cb.mock.calls.length).toBe(2) // unchanged after disposeAll
            })
        })
    })
})
