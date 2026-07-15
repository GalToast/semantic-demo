/**
 * Regression test: keyboard-help replay must NOT stack a second demo.
 *
 * The Help panel's replay handler dispatches `demo-replay-requested`; DemoChoreography
 * consumes it and re-runs attemptStart after sceneReady (M15 — prevents stacked veils).
 * A legacy `setTimeout(startMicroDemo, 500)` fallback could start a second demo on top
 * of an active one. This test guards that the fallback is gone.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('t1 keyboard-help replay does not stack a demo', () => {
    it('no legacy setTimeout(startMicroDemo) fallback in the replay handler', () => {
        const src = read('../../src/lib/keyboard/keyboard-help.ts')
        // The banned fallback referenced the demo-choreography element + startMicroDemo
        // inside a setTimeout. Assert those markers are gone.
        expect(src).not.toContain("getElementById('demo-choreography')")
        expect(src).not.toContain('if (!phase) startMicroDemo()')
    })
})
