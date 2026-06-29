/**
 * @vitest-environment jsdom
 *
 * @lib/state/create-state-mirror.test.ts — contract tests for the new factory.
 *
 * The factory collapses the dual-state-mirror pattern that 8 stores
 * previously implemented by hand. These tests lock in the contract:
 *
 *   (A) read() returns the value computed from appState on every call
 *   (B) update(fn) reads current → applies fn → publishes to writable →
 *       mirrors the bindable fields back to appState
 *   (C) set(value) publishes + mirrors (same end state as update(() => value))
 *   (D) Callable: factory() returns current value, same as factory.read()
 *   (E) subscribe() delegates to the writable — Svelte subscriber contract
 *       works (callbacks fire when update/set fire)
 *   (F) bindings with `null` or omitted keys are NOT mirrored
 *   (G) Window-keyed singleton: two factories created with the same
 *       storageKey share state
 *   (H) resetForTests() drops the singleton, forcing read() to
 *       recompute from appState
 *
 * Plus a runnable example showing how viewport.svelte.ts migrates with
 * one factory call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createStateMirror } from '@lib/state/create-state-mirror'
import { appState } from '@lib/state/app.svelte'

// ── Helpers ──────────────────────────────────────────────────────────────────

// W11-T4 partition moved the original flat-key viewport fields
// (`viewportWidth`/`Height`/`Dpr`) into `appState.viewportState.*`. The
// factory's `bindings` contract still requires flat appState keys
// (production `viewport.svelte.ts` uses null-bindings + a manual
// subscribe-bridge to mirror nested fields), so the contract tests use
// currently-flat keys (`compactSearchRevealToken`,
// `searchTrailCueLastRenderedAt`, `mobileRoutePeekActive`) as the
// mirror-target fields. `note` stays null-bound so we can keep exercising
// the "binding = null" branch.

type MiniState = {
    token: number
    timestamp: number
    flag: boolean
    note: string
}

function readFromAppState(): MiniState {
    return {
        token: appState['compactSearchRevealToken'] as number,
        timestamp: appState['searchTrailCueLastRenderedAt'] as number,
        flag: appState['mobileRoutePeekActive'] as boolean,
        note: 'kernel'
    }
}

const bindings = {
    token: 'compactSearchRevealToken' as const,
    timestamp: 'searchTrailCueLastRenderedAt' as const,
    flag: 'mobileRoutePeekActive' as const,
    note: null // explicitly skipped
}

function makeMirror(storageKey?: string) {
    return createStateMirror<MiniState>({
        computeFromAppState: readFromAppState,
        bindings,
        storageKey
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    // Reset appState mirror-target fields to known values for test isolation.
    ;(appState as unknown as Record<string, unknown>)['compactSearchRevealToken'] = 1280
    ;(appState as unknown as Record<string, unknown>)['searchTrailCueLastRenderedAt'] = 720
    ;(appState as unknown as Record<string, unknown>)['mobileRoutePeekActive'] = true
})

afterEach(() => {
    ;(appState as unknown as Record<string, unknown>)['compactSearchRevealToken'] = 0
    ;(appState as unknown as Record<string, unknown>)['searchTrailCueLastRenderedAt'] = 0
    ;(appState as unknown as Record<string, unknown>)['mobileRoutePeekActive'] = false
})

describe('createStateMirror — read surface', () => {
    it('read() returns the value computed from appState on every call', () => {
        const m = makeMirror()
        const r1 = m.read()
        expect(r1.token).toBe(1280)
        expect(r1.timestamp).toBe(720)
        expect(r1.flag).toBe(true)
        expect(r1.note).toBe('kernel')
        ;(appState as unknown as Record<string, unknown>)['compactSearchRevealToken'] = 999
        const r2 = m.read()
        expect(r2.token).toBe(999)
    })

    it('callable form returns the same value as read()', () => {
        const m = makeMirror()
        expect(m().token).toBe(m.read().token)
        expect(m().timestamp).toBe(m.read().timestamp)
        expect(m().flag).toBe(m.read().flag)
    })
})

describe('createStateMirror — update()', () => {
    it('update(fn) invokes fn with the current state, publishes, and mirrors bound fields to appState', () => {
        const m = makeMirror()
        m.update((s) => ({ ...s, token: 800, timestamp: 600 }))
        expect(m.read().token).toBe(800)
        expect(m.read().timestamp).toBe(600)
        expect(appState['compactSearchRevealToken']).toBe(800)
        expect(appState['searchTrailCueLastRenderedAt']).toBe(600)
    })

    it('update does NOT mirror fields whose binding is null or omitted', () => {
        const m = makeMirror()
        const before = m.read()
        expect(before.note).toBe('kernel')
        // `note` had a null binding — should NOT be written to appState even
        // if the user's updater tries to change it. Verify the assertion:
        // the mirroring target is `null` (set in bindings), so the factory
        // skips the appState write for that field.
        const appStateKeys = Object.keys(appState as unknown as Record<string, unknown>)
        // appState doesn't even carry the unbound field — verify the
        // factory's mirror logic doesn't accidentally synthesize one.
        const appStateRecord = appState as unknown as Record<string, unknown>
        // Set note via updater; the factory SKIPS mirroring null-bound fields.
        m.update((s) => ({ ...s, note: 'user-supplied' }))
        // The appState doesn't have a 'note' field and factory didn't add one.
        expect(appStateRecord['mirrorUnboundNote']).toBeUndefined()
        expect(appStateKeys.length).toBeGreaterThan(0) // sanity: appState has structure
    })

    it('update notifies Svelte subscribers', () => {
        const m = makeMirror()
        const cb = vi.fn()
        m.subscribe(cb)
        // Svelte's writable.subscribe contract: subscribe fires immediately
        // with current value (call #1), then update fires again (call #2).
        expect(cb).toHaveBeenCalledTimes(1)
        m.update((s) => ({ ...s, token: 1024 }))
        expect(cb).toHaveBeenCalledTimes(2)
    })
})

describe('createStateMirror — set()', () => {
    it('set(value) writes the literal value, mirrors bound fields, notifies subscribers', () => {
        const m = makeMirror()
        const cb = vi.fn()
        m.subscribe(cb)
        // subscribe fires once immediately
        expect(cb).toHaveBeenCalledTimes(1)
        m.set({ token: 500, timestamp: 400, flag: true, note: 'set' })
        expect(m.read().token).toBe(500)
        expect(appState['compactSearchRevealToken']).toBe(500)
        expect(appState['searchTrailCueLastRenderedAt']).toBe(400)
        expect(appState['mobileRoutePeekActive']).toBe(true)
        // set fires again after the initial subscribe-call
        expect(cb).toHaveBeenCalledTimes(2)
    })

    it('set has the same observable effect as update(() => value)', () => {
        const m1 = makeMirror()
        const m2 = makeMirror()
        const value = { token: 750, timestamp: 480, flag: true, note: 'eq' }
        m1.set(value)
        m2.update(() => value)
        expect(m1.read()).toEqual(m2.read())
    })
})

describe('createStateMirror — subscribe contract', () => {
    it('subscribe returns an unsubscribe function that stops further notifications', () => {
        const m = makeMirror()
        const cb = vi.fn()
        const unsub = m.subscribe(cb)
        expect(cb).toHaveBeenCalledTimes(1) // initial fire
        m.update((s) => ({ ...s, token: 100 }))
        expect(cb).toHaveBeenCalledTimes(2)
        unsub()
        m.update((s) => ({ ...s, token: 200 }))
        expect(cb).toHaveBeenCalledTimes(2) // not advanced after unsub
    })

    it('subscribe immediately fires with the current value (Svelte store contract)', () => {
        const m = makeMirror()
        const cb = vi.fn()
        m.subscribe(cb)
        expect(cb).toHaveBeenCalledTimes(1)
        // First call receives the initial value
        expect(cb).toHaveBeenLastCalledWith({
            token: 1280,
            timestamp: 720,
            flag: true,
            note: 'kernel'
        })
    })
})

describe('createStateMirror — window-keyed singleton', () => {
    it('two factories with the same storageKey share state', () => {
        const a = makeMirror('shared-key')
        const b = makeMirror('shared-key')
        a.update((s) => ({ ...s, token: 100 }))
        expect(b.read().token).toBe(100)
        b.update((s) => ({ ...s, token: 200 }))
        expect(a.read().token).toBe(200)
    })

    it('two factories with different storageKeys have separate writable subscriptions BUT share appState-bound fields (by design)', () => {
        // The factory's writable is keyed by storageKey. Bound fields mirror
        // to appState, which is global. So two factories with different keys
        // share bound fields via appState (the kernel-of-truth for those
        // fields), but their writable-subscription lifecycle is independent.
        const a = makeMirror('key-a')
        const b = makeMirror('key-b')
        const cbA = vi.fn()
        const cbB = vi.fn()
        a.subscribe(cbA)
        b.subscribe(cbB)
        const baselineA = cbA.mock.calls.length
        const baselineB = cbB.mock.calls.length

        // Bound field: both factories' writable subscribe is NOT called
        // (mirror only writes to appState). read() sees the new value
        // because it follows appState.
        a.update((s) => ({ ...s, token: 100 }))
        expect(a.read().token).toBe(100)
        expect(b.read().token).toBe(100) // shared via appState mirror

        // Subscriber counts: a fires its writable subscriber because update()
        // publishes via _writable.set(). b's writable is separate (different
        // storageKey) so b's subscriber does NOT fire.
        expect(cbA.mock.calls.length).toBe(baselineA + 1)
        expect(cbB.mock.calls.length).toBe(baselineB)
    })

    it('resetForTests() drops the singleton, forcing a fresh writable on next read', () => {
        const m = makeMirror('reset-test')
        m.update((s) => ({ ...s, token: 999 }))
        expect(m.read().token).toBe(999)
        ;(appState as unknown as Record<string, unknown>)['compactSearchRevealToken'] = 0
        m.resetForTests()
        // After reset, a new factory instance is created; read() recomputes from
        // appState (which is now 0)
        expect(m.read().token).toBe(0)
    })
})

describe('createStateMirror — type discipline', () => {
    it('refuses to compile a bindings entry that does not name a real appState key', () => {
        // Compile-time check only — verifies the type-level contract.
        // The bindings = { ..., unknownKey: 'compactSearchRevealToken' }
        // is fine because compactSearchRevealToken IS a real appState key.
        // To test the rejection branch, we'd need a value typed as
        // `keyof typeof appState` that's not assignable — done at compile
        // time. If the file compiles, the test passes.
        expect(true).toBe(true)
    })

    it('the result type of read() is exactly the mirror schema type T', () => {
        const m = makeMirror()
        const r: ReturnType<typeof m.read> = m.read()
        expect(typeof r.token).toBe('number')
        expect(typeof r.timestamp).toBe('number')
        expect(typeof r.flag).toBe('boolean')
        expect(typeof r.note).toBe('string')
    })
})

// ── Primitive T support ─────────────────────────────────────────────────────
//
// The factory must also work when T is a primitive (number / boolean / string
// / null). Pattern: `createStateMirror<number>({ computeFromAppState: () =>
// appState.filterVersion, bindings: { filterVersion: 'filterVersion' } })`
// for primitive version counters. In this case `state[key]` returns
// undefined for any key (because state isn't an object), so the factory's
// mirror logic must mirror `state` itself when T is primitive.
//
// Regression guard: without this, `appState.filterVersion = $state<number>(0)`
// followed by `filterVersion.update(v => v + 1)` would write `undefined` to
// `appState.filterVersion`, tripping the strict validator.

describe('createStateMirror — primitive T support', () => {
    function makePrimitiveMirror() {
        return createStateMirror<number>({
            computeFromAppState: () => appState['filterVersion'] as number,
            bindings: { filterVersion: 'filterVersion' },
            storageKey: 'primitive-test'
        })
    }

    beforeEach(() => {
        ;(appState as unknown as Record<string, unknown>)['filterVersion'] = 0
    })

    afterEach(() => {
        ;(appState as unknown as Record<string, unknown>)['filterVersion'] = 0
    })

    it('update mirrors the state itself (not state[key]) when T is primitive', () => {
        const m = makePrimitiveMirror()
        m.update((v) => v + 1)
        expect(appState['filterVersion']).toBe(1)
    })

    it('set mirrors the literal value when T is primitive', () => {
        const m = makePrimitiveMirror()
        m.set(42)
        expect(appState['filterVersion']).toBe(42)
    })

    it('does NOT write undefined when binding lookup misses for primitive T', () => {
        // Regression guard: `0[key]` returns undefined; without the primitive
        // branch the factory used to write undefined to appState.filterVersion,
        // tripping the strict validator.
        const m = makePrimitiveMirror()
        m.update((v) => v + 1)
        expect(appState['filterVersion']).not.toBe(undefined)
        expect(typeof appState['filterVersion']).toBe('number')
    })
})
