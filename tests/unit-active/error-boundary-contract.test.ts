/**
 * @vitest-environment jsdom
 *
 * Error Boundary Contract Test — Phase 9a (2026-06-26)
 *
 * Locks in the structural promises of the global error boundary:
 *   - ErrorStore record/dismiss/clear/latest behave correctly
 *   - Window error and unhandledrejection events are captured
 *   - APP_ERROR_CAUGHT is published with the correct payload shape
 *   - uninstall() removes window handlers
 *   - Privacy: payload never contains stack traces
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { errorStore, type AppError } from '@lib/error-boundary/error-store.svelte'
import { installErrorHandlers, type ErrorHandlerHandle } from '@lib/error-boundary/error-handlers'
import { EVENTS, subscribe } from '@lib/orchestration/event-bus'

// ── ErrorStore — core behaviour ────────────────────────────────────────

describe('ErrorStore — record/dismiss/clear', () => {
    beforeEach(() => {
        errorStore.clear()
    })

    it('record() adds an error to items', () => {
        const err = errorStore.record('test', 'something failed', 'error')
        expect(errorStore.items.length).toBe(1)
        expect(errorStore.items[0].message).toBe('something failed')
        expect(errorStore.items[0].source).toBe('test')
        expect(errorStore.items[0].kind).toBe('error')
        expect(err.id).toBeTruthy()
        expect(err.timestamp).toBeTypeOf('number')
    })

    it('dismiss() removes error by id', () => {
        const err = errorStore.record('test', 'first', 'error')
        errorStore.record('test', 'second', 'error')
        expect(errorStore.items.length).toBe(2)
        errorStore.dismiss(err.id)
        expect(errorStore.items.length).toBe(1)
        expect(errorStore.items[0].message).toBe('second')
    })

    it('clear() removes all errors', () => {
        errorStore.record('test', 'a', 'error')
        errorStore.record('test', 'b', 'error')
        errorStore.record('test', 'c', 'rejection')
        expect(errorStore.items.length).toBe(3)
        errorStore.clear()
        expect(errorStore.items.length).toBe(0)
    })

    it('latest getter returns the most recent error', () => {
        expect(errorStore.latest).toBeNull()
        errorStore.record('test', 'first', 'error')
        errorStore.record('test', 'second', 'rejection')
        expect(errorStore.latest).not.toBeNull()
        expect(errorStore.latest!.message).toBe('second')
    })
})

// — Handlers — window error capture ────────────────────────────────────

describe('installErrorHandlers — window error capture', () => {
    let handle: ErrorHandlerHandle

    beforeEach(() => {
        errorStore.clear()
        handle = installErrorHandlers()
    })

    afterEach(() => {
        handle.uninstall()
    })

    it("window 'error' event is captured and stored", () => {
        const event = new ErrorEvent('error', {
            error: new Error('boom'),
            message: 'boom'
        })
        window.dispatchEvent(event)
        expect(errorStore.items.length).toBe(1)
        expect(errorStore.items[0].message).toBe('boom')
        expect(errorStore.items[0].source).toBe('window.error')
        expect(errorStore.items[0].kind).toBe('error')
    })

    it("unhandledrejection event is captured with kind='rejection'", (done) => {
        // PromiseRejectionEvent constructor is not always available in jsdom,
        // so we build it manually with the expected shape. We attach a Promise
        // but attach a .catch() to suppress jsdom's unhandled-rejection noise —
        // the handler under test will still see the .reason field.
        const event = new Event('unhandledrejection') as Event & PromiseRejectionEvent
        ;(event as unknown as Record<string, unknown>).reason = 'something broke'
        const promise = Promise.reject('something broke')
        promise.catch(() => undefined) // suppress jsdom unhandled-rejection report
        ;(event as unknown as Record<string, unknown>).promise = promise
        window.dispatchEvent(event)
        // The handler runs synchronously, but let's be safe:
        setTimeout(() => {
            expect(errorStore.items.length).toBe(1)
            expect(errorStore.items[0].source).toBe('unhandledrejection')
            expect(errorStore.items[0].kind).toBe('rejection')
            expect(errorStore.items[0].message).toBe('something broke')
            done()
        }, 50)
    })

    it('APP_ERROR_CAUGHT is published with correct payload shape', () => {
        let captured: { source: string; message: string; kind: string } | null = null
        const unsub = subscribe(EVENTS.APP_ERROR_CAUGHT, (payload) => {
            captured = payload as { source: string; message: string; kind: string }
        })
        const event = new ErrorEvent('error', {
            error: new Error('published-error'),
            message: 'published-error'
        })
        window.dispatchEvent(event)
        expect(captured).not.toBeNull()
        expect(captured!.source).toBe('window.error')
        expect(captured!.message).toBe('published-error')
        expect(captured!.kind).toBe('error')
        unsub()
    })

    it('uninstall() removes window handlers so errors are no longer captured', () => {
        errorStore.clear()
        handle.uninstall()
        // After uninstall, dispatching an error should NOT add to the store.
        // Use a plain ErrorEvent with just a message (no error object) to
        // avoid jsdom re-throwing the error prop as an unhandled exception.
        const event = new ErrorEvent('error', {
            message: 'should-not-capture'
        })
        window.dispatchEvent(event)
        expect(errorStore.items.length).toBe(0)
    })
})

// — Privacy: payload never contains stack traces ────────────────────────

describe('ErrorStore — privacy contract', () => {
    beforeEach(() => {
        errorStore.clear()
    })

    it('recorded error does not include a stack property', () => {
        const errWithStack = new Error('has-stack')
        errWithStack.stack = 'Error: has-stack\n    at foo (file:///secret/path.ts:1:2)'
        const recorded = errorStore.record('test', errWithStack.message, 'error')
        expect('stack' in recorded).toBe(false)
        expect(recorded.message).toBe('has-stack')
        // The message should not contain file paths
        expect(recorded.message).not.toContain('file://')
        expect(recorded.message).not.toContain('secret')
    })
})
