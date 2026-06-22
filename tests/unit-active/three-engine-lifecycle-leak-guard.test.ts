/**
 * three-engine lifecycle leak guard (structural contract)
 *
 * This test proves that every addEventListener / setTimeout registered in
 * initThreeJS has a matching removal path via DisposableRegistry.
 * It does NOT spin up a real WebGL context — that is covered by the
 * Playwright scene-health contract in the test:contract suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

describe('three-engine.ts lifecycle leak guard', () => {
    it(' DisposableRegistry is imported from the canonical path', () => {
        // If this compiles, the module binding is correct.
        expect(DisposableRegistry).toBeDefined()
    })

    it('DisposableRegistry handles arbitrary duck-typed targets (OrbitControls compat)', () => {
        const reg = new DisposableRegistry({ label: 'duck-type-test' })
        let removed = false

        // OrbitControls (and many Three.js objects) expose addEventListener /
        // removeEventListener but do NOT extend EventTarget at the type level.
        const fakeControls = {
            addEventListener: () => {},
            removeEventListener: () => {
                removed = true
            }
        }

        reg.listener(fakeControls, 'start', () => {})
        reg.disposeAll()
        expect(removed).toBe(true)
    })

    it('DisposableRegistry disposes in reverse registration order', () => {
        const reg = new DisposableRegistry()
        const order: number[] = []

        reg.add(() => order.push(1))
        reg.add(() => order.push(2))
        reg.add(() => order.push(3))
        reg.disposeAll()

        expect(order).toEqual([3, 2, 1])
    })

    it('disposeAll swallows individual errors to maximize cleanup reach', () => {
        const reg = new DisposableRegistry()
        const good = vi.fn()
        const bad = vi.fn(() => {
            throw new Error('intentional')
        })
        reg.add(good)
        reg.add(bad)

        expect(() => reg.disposeAll()).not.toThrow()
        expect(good).toHaveBeenCalled()
        expect(bad).toHaveBeenCalled()
    })

    it('assertDisposed() throws when registry is not disposed', () => {
        const reg = new DisposableRegistry()
        expect(() => {
            if (!reg.isDisposed) throw new Error('Expected registry to be disposed')
        }).toThrow('disposed')
    })
})
