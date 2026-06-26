/**
 * @vitest-environment node
 *
 * Search Cancel UX — Contract tests (Phase 9c, 2026-06-26)
 *
 * Pure-logic / mock-harness tests for the SEARCH_CANCELLED event,
 * AbortController abort flow, and telemetry auto-enrollment.
 * No DOM, no Svelte component rendering, no Three.js.
 *
 * Covered:
 *   - Event manifest contract (EVENTS.SEARCH_CANCELLED exists + payload shape)
 *   - AbortController flow contract (abort() propagates to subscribers)
 *   - Telemetry auto-enrollment (subscriber receives SEARCH_CANCELLED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EVENTS, publish, subscribe, clearAllSubscribers, type EventPayloads, type EventName } from '@lib/orchestration/event-bus'

// ── 1. Event manifest contract ──────────────────────────────────────────────

describe('EVENTS manifest — SEARCH_CANCELLED', () => {
    it('EVENTS.SEARCH_CANCELLED equals the string "SEARCH_CANCELLED"', () => {
        expect(EVENTS.SEARCH_CANCELLED).toBe('SEARCH_CANCELLED')
    })

    it('EventPayloads includes SEARCH_CANCELLED with correct shape', () => {
        // Type-level check: this compiles only if EventPayloads[SEARCH_CANCELLED]
        // is assignable to { query: string; durationMs: number }.
        const payload: EventPayloads[typeof EVENTS.SEARCH_CANCELLED] = {
            query: 'coffee shop',
            durationMs: 42
        }
        expect(payload).toHaveProperty('query')
        expect(payload).toHaveProperty('durationMs')
        expect(typeof payload.query).toBe('string')
        expect(typeof payload.durationMs).toBe('number')
    })

    it('SEARCH_CANCELLED appears in the EVENTS object keys', () => {
        const keys = Object.keys(EVENTS)
        expect(keys).toContain('SEARCH_CANCELLED')
    })
})

// ── 2. AbortController flow contract ────────────────────────────────────────

describe('AbortController abort propagation', () => {
    beforeEach(() => {
        clearAllSubscribers()
    })

    it('calling abort() fires all subscribers for the aborted signal', () => {
        const controller = new AbortController()
        let abortFired = false

        controller.signal.addEventListener('abort', () => {
            abortFired = true
        }, { once: true })

        expect(abortFired).toBe(false)
        controller.abort()
        expect(abortFired).toBe(true)
    })

    it('multiple listeners all receive the abort event', () => {
        const controller = new AbortController()
        const received: string[] = []

        controller.signal.addEventListener('abort', () => {
            received.push('listener-1')
        }, { once: true })
        controller.signal.addEventListener('abort', () => {
            received.push('listener-2')
        }, { once: true })

        controller.abort()
        expect(received).toEqual(['listener-1', 'listener-2'])
    })

    it('aborted signal remains aborted after the call', () => {
        const controller = new AbortController()
        expect(controller.signal.aborted).toBe(false)
        controller.abort()
        expect(controller.signal.aborted).toBe(true)
    })
})

// ── 3. Telemetry auto-enrollment ────────────────────────────────────────────

describe('telemetry auto-enrollment for SEARCH_CANCELLED', () => {
    beforeEach(() => {
        clearAllSubscribers()
    })

    it('publishing SEARCH_CANCELLED reaches a subscriber', () => {
        const received: Array<{ eventName: string; payload: unknown }> = []

        const unsub = subscribe(EVENTS.SEARCH_CANCELLED, (payload) => {
            received.push({ eventName: EVENTS.SEARCH_CANCELLED, payload })
        })

        try {
            publish(EVENTS.SEARCH_CANCELLED, { query: 'test query', durationMs: 123 })

            expect(received).toHaveLength(1)
            expect(received[0].eventName).toBe('SEARCH_CANCELLED')
            expect(received[0].payload).toEqual({ query: 'test query', durationMs: 123 })
        } finally {
            unsub()
        }
    })

    it('subscriber receives the exact payload shape { query, durationMs }', () => {
        let capturedPayload: EventPayloads[typeof EVENTS.SEARCH_CANCELLED] | undefined

        const unsub = subscribe(EVENTS.SEARCH_CANCELLED, (payload) => {
            capturedPayload = payload
        })

        try {
            publish(EVENTS.SEARCH_CANCELLED, { query: 'latte', durationMs: 99 })

            expect(capturedPayload).toBeDefined()
            expect(capturedPayload!.query).toBe('latte')
            expect(capturedPayload!.durationMs).toBe(99)
        } finally {
            unsub()
        }
    })

    it('unsubscribe stops receiving further events', () => {
        let count = 0

        const unsub = subscribe(EVENTS.SEARCH_CANCELLED, () => {
            count++
        })

        publish(EVENTS.SEARCH_CANCELLED, { query: 'a', durationMs: 1 })
        expect(count).toBe(1)

        unsub()

        publish(EVENTS.SEARCH_CANCELLED, { query: 'b', durationMs: 2 })
        expect(count).toBe(1) // unchanged
    })

    it('SEARCH_CANCELLED is in the TELEMETRY_EVENTS list', async () => {
        // Dynamic import to avoid side-effects from installTelemetry
        const { TELEMETRY_EVENTS } = await import('@lib/telemetry/telemetry-subscriber')
        expect(TELEMETRY_EVENTS).toContain('SEARCH_CANCELLED')
    })

    it('adding SEARCH_CANCELLED did not break manifest parity', async () => {
        const { TELEMETRY_EVENTS } = await import('@lib/telemetry/telemetry-subscriber')
        const { EVENTS: EVENTS_REF } = await import('@lib/orchestration/event-bus')
        const manifestNames = Object.values(EVENTS_REF) as EventName[]
        expect(TELEMETRY_EVENTS.length).toBe(manifestNames.length)
        for (const name of manifestNames) {
            expect(TELEMETRY_EVENTS).toContain(name)
        }
    })
})
