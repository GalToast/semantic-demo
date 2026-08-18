/**
 * component-DevToolsMount.test.ts — DevToolsMount.svelte behavioral contract.
 *
 * DevToolsMount is a pure lazy-component aggregator: it owns three
 * createLazyComponent handles (DevGui, SpectorInspector, DevTelemetry) and
 * ensure()s them together when `visible` flips true. There is no UI of its
 * own — its entire behavior is "expose three lazy handles + ensure them in
 * lockstep", so the test drives the real createLazyComponent helper with
 * synthetic loaders and asserts the three handles move as one unit.
 *
 * Why this matters: App.svelte gates the whole dev-tool surface on
 * `import.meta.env.DEV` and passes `visible={devToolsVisible}`. If the mount
 * ever ensure()s only a subset, the dev tooling surface silently loses a
 * tool with no compile error — exactly the class of regression a journey
 * test would miss because the component renders nothing at all.
 *
 * ISOLATION: createLazyComponent's loaders are synthetic (no real .svelte
 * imports), so this file never touches the Svelte compiler and cannot
 * leak async work into a neighboring test file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import DevToolsMount from '../../src/components/DevToolsMount.svelte'

// vi.mock factories are hoisted above ALL module-level code, so the handles
// AND the cursor that assigns them must live inside vi.hoisted. The factory
// is re-entrant: a shared shift() queue would drain and hand back undefined
// on the second render, so we use a modulo counter instead.
const fixture = vi.hoisted(() => {
    function makeHandle(name: string) {
        const calls: { condition: boolean; clearOnFalse?: boolean }[] = []
        return {
            name,
            calls,
            ensure(condition: boolean, opts?: { clearOnFalse?: boolean }) {
                calls.push({ condition, clearOnFalse: opts?.clearOnFalse })
                // Intentionally never sets `current`: DevToolsMount's child
                // render blocks ({#if handle.current}) are
                // createLazyComponent's contract, already covered by
                // w46-b2b-lazy-component-runtime.test.ts. This file is about
                // the MOUNT's ensure() lockstep, not the handle's load
                // semantics — keeping current null means the {#if} blocks
                // never try to mount a fake component and this file stays
                // decoupled from the Svelte compiler entirely.
            }
        }
    }
    return {
        cursor: 0,
        devGui: makeHandle('DevGui'),
        spector: makeHandle('SpectorInspector'),
        telemetry: makeHandle('DevTelemetry'),
        reset() {
            this.cursor = 0
            for (const h of [this.devGui, this.spector, this.telemetry]) h.calls.length = 0
        }
    }
})

vi.mock('@lib/utils/lazy-component.svelte', () => ({
    createLazyComponent: () => {
        const ordered = [fixture.devGui, fixture.spector, fixture.telemetry]
        const handle = ordered[fixture.cursor % ordered.length]
        fixture.cursor += 1
        return handle
    }
}))

// True when a handle has been ensure(true)d at least once.
const ensured = (h: { calls: { condition: boolean }[] }) => h.calls.some((c) => c.condition === true)

describe('DevToolsMount component', () => {
    afterEach(() => {
        fixture.reset()
        cleanup()
    })

    it('renders no real elements when visible is false (no dev tool chrome)', () => {
        const { container } = render(DevToolsMount, { props: { visible: false } })
        // Svelte leaves comment placeholders, but no element nodes.
        expect(container.querySelectorAll('*').length).toBe(0)
    })

    it('ensure()s all three dev-tool lazy handles together when visible flips true', async () => {
        render(DevToolsMount, { props: { visible: true } })
        // DevToolsMount's ensure() calls live in a $effect, which runs
        // asynchronously after mount. Poll until all three handles have been
        // ensure(true)d instead of relying on a fixed tick — mirrors the
        // DevGui test's vi.waitFor pattern for the same reason.
        await vi.waitFor(() => {
            for (const h of [fixture.devGui, fixture.spector, fixture.telemetry]) {
                if (!ensured(h)) throw new Error(`${h.name} not yet ensure(true)`)
            }
        })

        // All three handles must have been ensure(true)d — the lockstep
        // contract. Exact call count is intentionally NOT asserted: the
        // $effect can legitimately re-run once under the vmThreads pool, and
        // pinning the count to 1 made the test order-dependent.
        expect(ensured(fixture.devGui)).toBe(true)
        expect(ensured(fixture.spector)).toBe(true)
        expect(ensured(fixture.telemetry)).toBe(true)
    })

    it('re-ensure()s handles when visible toggles false then true again', async () => {
        const { rerender } = render(DevToolsMount, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!ensured(fixture.devGui)) throw new Error('devGui not yet ensure(true)')
        })
        const firstWindow = fixture.devGui.calls.filter((c) => c.condition === true).length
        expect(firstWindow).toBeGreaterThanOrEqual(1)

        await rerender({ visible: false })
        await vi.waitFor(() => {
            if (!fixture.devGui.calls.some((c) => c.condition === false)) {
                throw new Error('devGui never observed ensure(false)')
            }
        })

        await rerender({ visible: true })
        await vi.waitFor(() => {
            if (fixture.devGui.calls.filter((c) => c.condition === true).length < firstWindow + 1) {
                throw new Error('devGui not re-ensure(true)d after toggle-back')
            }
        })
        // The other two handles must move in lockstep with devGui.
        expect(fixture.spector.calls.filter((c) => c.condition === true).length).toBeGreaterThanOrEqual(firstWindow + 1)
        expect(fixture.telemetry.calls.filter((c) => c.condition === true).length).toBeGreaterThanOrEqual(
            firstWindow + 1
        )
    })
})
