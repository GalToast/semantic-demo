/**
 * focus-search-input-retry-contract.test.ts — pin the bounded cold-start
 * focus retry in src/lib/app/app-render.ts::focusSearchInputUntilLanded.
 *
 * This is the regression coverage for Finding #6 (the old App.svelte loop
 * re-fired focusSearchInput() every frame for a fixed 90-frame / 1500ms
 * window even after focus had landed). The new helper must:
 *   - stop retrying once focus is *stably* landed (no frames burned after landing),
 *   - keep retrying across frames while the input is absent (lazy hydration),
 *   - be bounded by a max wall-clock window even if focus never lands,
 *   - return a teardown that cancels the pending rAF (lifecycle-safe / M11).
 *
 * All timing + DOM access is injected, so no real event loop is needed.
 */
import { describe, expect, it, vi } from 'vitest'
import { focusSearchInputUntilLanded } from '@lib/app/app-render.ts'

/** Deterministic rAF scheduler: queued callbacks run only when tick() is called. */
function createRafDriver() {
    let nextId = 1
    const queue = new Map<number, FrameRequestCallback>()
    const raf = (cb: FrameRequestCallback): number => {
        const id = nextId++
        queue.set(id, cb)
        return id
    }
    const cancelRaf = (id: number): void => {
        queue.delete(id)
    }
    const tick = (): void => {
        const entries = [...queue.entries()]
        queue.clear()
        for (const [, cb] of entries) cb(0)
    }
    const pending = (): number => queue.size
    return { raf, cancelRaf, tick, pending }
}

/** An input whose `.focus()` flips the "active element" to itself. */
function makeInput() {
    let focused = false
    const input = { focus: () => { focused = true } }
    return {
        input: input as unknown as HTMLElement,
        focus: vi.spyOn(input, 'focus'),
        isFocused: () => focused,
        active: () => (focused ? input : null) as Element | null
    }
}

describe('focusSearchInputUntilLanded — bounded cold-start retry', () => {
    it('(a) does NOT call .focus() or reschedule when already landed at start', () => {
        const input = makeInput()
        const driver = createRafDriver()
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => input.input,
            // Already focused from the start.
            getActive: () => input.input
        })
        // First step sees landed focus; needs `stableFrames` (default 3) consecutive
        // landed frames before it stops, so it reschedules a few times but never focuses.
        expect(input.focus).not.toHaveBeenCalled()
        driver.tick()
        driver.tick()
        driver.tick()
        expect(input.focus).not.toHaveBeenCalled()
        expect(driver.pending()).toBe(0)
    })

    it('(b) focuses once, then stops after stable landing (no frames burned after landing)', () => {
        const input = makeInput()
        const driver = createRafDriver()
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => input.input,
            getActive: input.active
        })
        expect(input.isFocused()).toBe(false)
        driver.tick() // not landed -> focus()
        expect(input.isFocused()).toBe(true)
        expect(input.focus).toHaveBeenCalledTimes(1)
        expect(driver.pending()).toBe(1)
        driver.tick() // stable=1
        driver.tick() // stable=2
        driver.tick() // stable=3 -> stop
        expect(input.focus).toHaveBeenCalledTimes(1)
        expect(driver.pending()).toBe(0)
    })

    it('(c) keeps retrying across frames while #search-input is absent (lazy hydration)', () => {
        const input = makeInput()
        let present = false
        const driver = createRafDriver()
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => (present ? input.input : null),
            getActive: input.active
        })
        driver.tick() // input absent -> nothing focused, reschedule
        expect(input.isFocused()).toBe(false)
        expect(driver.pending()).toBe(1)
        present = true
        driver.tick() // input appears -> focus()
        expect(input.isFocused()).toBe(true)
        driver.tick()
        driver.tick()
        driver.tick() // stable -> stop
        expect(driver.pending()).toBe(0)
    })

    it('(d) survives a one-time trap yank and re-lands before stopping', () => {
        const input = makeInput()
        const driver = createRafDriver()
        let activeOverride: Element | null = null
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => input.input,
            getActive: () => activeOverride ?? input.active()
        })
        driver.tick() // focus lands
        expect(input.isFocused()).toBe(true)
        driver.tick() // stable=1
        // Splash trap restores focus to <body> right after engineReady.
        activeOverride = document.createElement('body')
        driver.tick() // yank detected -> re-focus, stable resets
        expect(input.isFocused()).toBe(true)
        activeOverride = null
        driver.tick() // stable=1
        driver.tick() // stable=2
        driver.tick() // stable=3 -> stop
        expect(driver.pending()).toBe(0)
    })

    it('(e) is bounded by maxMs even if focus never lands', () => {
        const input = makeInput()
        const driver = createRafDriver()
        let t = 0
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            maxMs: 100,
            now: () => (t += 200), // leap past the window on the first step
            // Input never present -> never lands.
            getInput: () => null,
            getActive: () => null
        })
        driver.tick()
        expect(driver.pending()).toBe(0)
    })

    it('(f) teardown cancels the pending rAF and makes further frames no-ops', () => {
        const input = makeInput()
        const driver = createRafDriver()
        const teardown = focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => null, // never present -> keeps retrying
            getActive: () => null
        })
        driver.tick()
        expect(driver.pending()).toBe(1)
        teardown()
        expect(driver.pending()).toBe(0)
        // A stray queued callback (if any) must be a no-op post-teardown.
        driver.tick()
        expect(driver.pending()).toBe(0)
        expect(input.focus).not.toHaveBeenCalled()
    })

    // W50 (2026-09-11): mobile place-first map boots never render search
    // chrome, so the input-absent frames must drive focus to the configured
    // fallback target instead of spinning out and stranding on <body>.
    it('(g) W50 fallback: focuses the fallback target while the input is absent', () => {
        const input = makeInput()
        const map = makeInput()
        const driver = createRafDriver()
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => null, // search input never mounts (map surface)
            getActive: map.active,
            getFallback: () => map.input
        })
        driver.tick() // input absent -> fallback probed -> focus(map)
        expect(map.isFocused()).toBe(true)
        expect(input.focus).not.toHaveBeenCalled()
        driver.tick()
        driver.tick()
        driver.tick() // stable=3 -> stop
        expect(map.focus).toHaveBeenCalledTimes(1)
        expect(driver.pending()).toBe(0)
    })

    it('(h) W50 fallback: input takes precedence over the fallback when it appears', () => {
        const input = makeInput()
        const map = makeInput()
        const driver = createRafDriver()
        let inputPresent = false
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            now: () => 0,
            getInput: () => (inputPresent ? input.input : null),
            getActive: input.active,
            getFallback: () => map.input
        })
        driver.tick() // fallback lands on map
        expect(map.isFocused()).toBe(true)
        inputPresent = true
        driver.tick() // input present AND not active -> steals focus to input
        expect(input.isFocused()).toBe(true)
        expect(input.focus).toHaveBeenCalledTimes(1)
        driver.tick()
        driver.tick()
        driver.tick() // stable -> stop
        expect(driver.pending()).toBe(0)
    })

    it('(i) W50 fallback: no fallback configured -> unchanged spin-out behavior', () => {
        const driver = createRafDriver()
        let t = 0
        focusSearchInputUntilLanded({
            raf: driver.raf,
            cancelRaf: driver.cancelRaf,
            maxMs: 100,
            now: () => (t += 200),
            getInput: () => null,
            getActive: () => null
            // no getFallback
        })
        driver.tick()
        expect(driver.pending()).toBe(0) // bounded window still applies
    })
})
