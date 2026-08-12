import { describe, it, expect, beforeEach, vi } from 'vitest'

// NOTE: vi.hoisted factories run BEFORE imports resolve, so they cannot
// reference imported defaults — inline the literal shape here.
const _setRenderKind = vi.hoisted(() => () => {})

vi.mock('@lib/orchestration/parity-attrs.svelte.ts', () => ({
    setRenderKind: _setRenderKind
}))

// ── pendingSearch ──────────────────────────────────────────────────────────────

import { pendingSearch } from '@lib/stores/pending-search.svelte.ts'

function resetPendingSearch(): void {
    // consume any staged query so each test starts from empty-pending
    pendingSearch.consume()
}

describe('pendingSearch store contract', () => {
    beforeEach(resetPendingSearch)

    it('(a) initial state = empty-pending (null)', () => {
        expect(pendingSearch.value).toBeNull()
    })

    it('(b) set(query) flips value to the staged query', () => {
        pendingSearch.set('coffee shops')
        expect(pendingSearch.value).toBe('coffee shops')
    })

    it('(b) set(empty string) collapses to null', () => {
        pendingSearch.set('   ')
        expect(pendingSearch.value).toBeNull()
    })

    it('(c) repeated set() calls are idempotent (no throw, last value wins)', () => {
        pendingSearch.set('first')
        pendingSearch.set('second')
        pendingSearch.set('third')
        expect(pendingSearch.value).toBe('third')
    })

    it('(d) consume() returns the staged query and clears to null', () => {
        pendingSearch.set('bakery')
        const taken = pendingSearch.consume()
        expect(taken).toBe('bakery')
        expect(pendingSearch.value).toBeNull()
    })

    it('(d) consume() returns null when nothing is staged', () => {
        expect(pendingSearch.consume()).toBeNull()
        expect(pendingSearch.value).toBeNull()
    })

    it('primitive shape: value is string | null, set accepts string, consume returns string | null', () => {
        pendingSearch.set('x')
        const v: string | null = pendingSearch.value
        expect(typeof v).toBe('string')
        const c: string | null = pendingSearch.consume()
        expect(c === null || typeof c === 'string').toBe(true)
    })
})

// ── engineReady ───────────────────────────────────────────────────────────────

describe('engineReady store contract', () => {
    it('(a) initial state = not-ready (false) on fresh module', async () => {
        // Isolate the persisted flag so a fresh import sees the default.
        sessionStorage.removeItem('semantic-explorer.engineReady')
        vi.resetModules()
        const { engineReady } = await import('@lib/stores/engine-ready.svelte.ts')
        expect(engineReady.value).toBe(false)
    })

    it('(b) signalReady() flips value to true', async () => {
        sessionStorage.removeItem('semantic-explorer.engineReady')
        vi.resetModules()
        const { engineReady } = await import('@lib/stores/engine-ready.svelte.ts')
        engineReady.signalReady()
        expect(engineReady.value).toBe(true)
    })

    it('(c) repeated signalReady() calls are idempotent (no throw, stays true)', async () => {
        sessionStorage.removeItem('semantic-explorer.engineReady')
        vi.resetModules()
        const { engineReady } = await import('@lib/stores/engine-ready.svelte.ts')
        engineReady.signalReady()
        engineReady.signalReady()
        engineReady.signalReady()
        expect(engineReady.value).toBe(true)
    })

    it('(d) getter/read returns expected primitive shape (boolean)', async () => {
        sessionStorage.removeItem('semantic-explorer.engineReady')
        vi.resetModules()
        const { engineReady } = await import('@lib/stores/engine-ready.svelte.ts')
        const v: boolean = engineReady.value
        expect(typeof v).toBe('boolean')
        expect(engineReady.getReady()).toBe(false)
    })

    it('subscribe invokes immediately with current value and can unsubscribe', async () => {
        sessionStorage.removeItem('semantic-explorer.engineReady')
        vi.resetModules()
        const { engineReady } = await import('@lib/stores/engine-ready.svelte.ts')
        const values: boolean[] = []
        const unsub = engineReady.subscribe((v) => values.push(v))
        expect(values).toEqual([false])
        engineReady.signalReady()
        expect(values).toEqual([false, true])
        unsub()
        // after unsub, further signals do not reach this listener
        engineReady.signalReady() // already true, idempotent
        expect(values).toEqual([false, true])
    })
})
