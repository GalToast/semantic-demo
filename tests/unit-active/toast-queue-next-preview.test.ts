/**
 * toast-queue-next-preview.test.ts — W49-A Toast queue + next-title preview
 *
 * Locks in two behaviors added for the W49-A queue polish:
 *
 *  1. Queue FIFO ordering:  when a toast is shown while another is
 *     already visible, the new one waits behind it; dismissing the
 *     visible toast (manual or auto) advances to the queued one.
 *
 *  2. Next-title preview:   toastStore exposes a `nextTitle` string that
 *     is the title of the next-in-line queued toast. The Toast UI uses
 *     this to surface "Next: <title>" so the user knows what's coming
 *     without dismissing the current toast first.
 *
 * Source inspection + a structured store-import test keeps this test
 * CI-friendly (no DOM rendering). The store uses a single module-scoped
 * queue + writable store; tests share that state and reset it via
 * clearToastQueue() in beforeEach to avoid ordering leakage.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import {
    showToast,
    showToastSpec,
    showErrorToast,
    dismissToast,
    clearToastQueue,
    toastStore
} from '../../src/lib/stores/toast.svelte'

function readState() {
    return get(toastStore)
}

describe('toast queue + next-title preview (W49-A)', () => {
    beforeEach(() => {
        clearToastQueue()
    })

    it('first toast becomes visible immediately (queue empty path)', () => {
        showToast('First', 'first copy')
        const s = readState()
        expect(s.active).toBe(true)
        expect(s.title).toBe('First')
        expect(s.copy).toBe('first copy')
        expect(s.queueLength).toBe(0)
        expect(s.nextTitle).toBe('')
    })

    it('second toast enqueues behind the visible one (queue depth 1)', () => {
        showToast('First', 'first copy')
        showToast('Second', 'second copy')
        const s = readState()
        // First is still visible; second is queued.
        expect(s.title).toBe('First')
        expect(s.queueLength).toBe(1)
        // Next-title preview surfaces the queued toast's title.
        expect(s.nextTitle).toBe('Second')
    })

    it('third toast keeps the next-title as the second (FIFO)', () => {
        showToast('First', '')
        showToast('Second', '')
        showToast('Third', '')
        const s = readState()
        expect(s.title).toBe('First')
        expect(s.queueLength).toBe(2)
        // The preview shows the next-in-line, not the last-in-line.
        expect(s.nextTitle).toBe('Second')
    })

    it('dismissToast() advances to the queued toast and clears nextTitle', () => {
        showToast('First', 'first copy')
        showToast('Second', 'second copy')
        dismissToast()
        const s = readState()
        expect(s.active).toBe(true)
        expect(s.title).toBe('Second')
        expect(s.queueLength).toBe(0)
        expect(s.nextTitle).toBe('')
    })

    it('clearToastQueue() drops everything (no further visible)', () => {
        showToast('First', '')
        showToast('Second', '')
        showErrorToast('Third error', '')
        clearToastQueue()
        const s = readState()
        expect(s.active).toBe(false)
        expect(s.queueLength).toBe(0)
        expect(s.nextTitle).toBe('')
    })

    it('nextTitle updates correctly across a queue transition', () => {
        showToast('A', '')
        showToast('B', '')
        showToast('C', '')
        // State: A visible, B is next, C queued behind B.
        expect(readState().nextTitle).toBe('B')
        // Advance once: B becomes visible, C is next.
        dismissToast()
        expect(readState().title).toBe('B')
        expect(readState().nextTitle).toBe('C')
        // Advance again: C becomes visible, no queue.
        dismissToast()
        expect(readState().title).toBe('C')
        expect(readState().nextTitle).toBe('')
        // Advance past the end: nothing left visible.
        dismissToast()
        expect(readState().active).toBe(false)
    })

    it('store surface has nextTitle:string in the type contract', () => {
        // Lock the public shape: a future refactor that drops nextTitle
        // from ToastState would silently break the UI, so we forbid it.
        // We test by reading the initial default state.
        const s = readState()
        expect(typeof s.nextTitle).toBe('string')
    })

    it('dedupeKey swallows an identical queued toast (W10 BS-B#8)', () => {
        // The 'End of results' boundary toast uses a stable dedupeKey so
        // repeated ArrowDown-past-end presses don't spam the FIFO queue.
        // showToastSpec with the same dedupeKey while one is queued must
        // NOT enqueue a duplicate.
        showToast('First', 'first copy')
        showToastSpec({
            title: 'End of results',
            copy: 'Press Escape to clear search.',
            dedupeKey: 'search:end-of-results'
        })
        // First is visible; End-of-results is queued (next).
        expect(readState().queueLength).toBe(1)
        expect(readState().nextTitle).toBe('End of results')
        // Identical dedupeKey again → swallowed, queue stays at 1.
        showToastSpec({
            title: 'End of results',
            copy: 'Press Escape to clear search.',
            dedupeKey: 'search:end-of-results'
        })
        expect(readState().queueLength).toBe(1)
        // Different dedupeKey still enqueues.
        showToastSpec({ title: 'Searching local data', copy: 'live search slow', dedupeKey: 'search:local-fallback' })
        expect(readState().queueLength).toBe(2)
    })
})
