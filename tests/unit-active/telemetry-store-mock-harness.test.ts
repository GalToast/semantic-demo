/**
 * @vitest-environment node
 *
 * Telemetry Store + Subscriber Contract Test — Phase 9b (2026-06-26)
 *
 * Verifies the telemetry scaffold without spinning up the full app:
 *   - Store records events with payload summaries (no raw values)
 *   - Store respects bufferSize (ring buffer)
 *   - Store respects enabled flag
 *   - Subscriber hooks every EVENTS.* event to the store
 *   - Privacy: only payload keys + types are recorded, never values
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    telemetryStore,
    configureTelemetry,
    clearTelemetry,
    getSnapshot,
    recordTelemetry
} from '@lib/telemetry/telemetry-store'
import { installTelemetry, uninstallTelemetry, TELEMETRY_EVENTS } from '@lib/telemetry/telemetry-subscriber'
import { EVENTS, publish } from '@lib/orchestration/event-bus'

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
    clearTelemetry()
    uninstallTelemetry()
    // Default to disabled; tests opt-in explicitly.
    configureTelemetry({ enabled: false, bufferSize: 200, mirrorToConsole: false })
})

// ── Store: disabled / enabled ────────────────────────────────────────────

describe('telemetryStore — enable/disable', () => {
    it('does not record when disabled', () => {
        configureTelemetry({ enabled: false })
        recordTelemetry('TEST_EVENT', { foo: 'bar' })
        const snap = getSnapshot()
        expect(snap.totalRecorded).toBe(0)
        expect(snap.events.length).toBe(0)
    })

    it('records when enabled', () => {
        configureTelemetry({ enabled: true })
        recordTelemetry('TEST_EVENT', { foo: 'bar' })
        const snap = getSnapshot()
        expect(snap.totalRecorded).toBe(1)
        expect(snap.events.length).toBe(1)
    })
})

// ── Store: privacy (no raw payload values) ──────────────────────────────

describe('telemetryStore — privacy guarantees', () => {
    beforeEach(() => configureTelemetry({ enabled: true }))

    it('records payload keys but never values', () => {
        recordTelemetry('SEARCH_STARTED', { query: 'sensitive user input', index: 42 })
        const event = getSnapshot().events[0]
        // Keys + types are recorded
        expect(event.payloadKeys.map((k) => k.key).sort()).toEqual(['index', 'query'])
        expect(event.payloadKeys.find((k) => k.key === 'query')?.type).toBe('string')
        expect(event.payloadKeys.find((k) => k.key === 'index')?.type).toBe('number')
        // The event itself does NOT expose the raw payload
        expect(event).not.toHaveProperty('payload')
        expect(event).not.toHaveProperty('query')
        expect(event).not.toHaveProperty('index')
    })

    it('redacts DOM nodes to type "DOMNode"', () => {
        const fakeNode = { nodeType: 1, nodeName: 'DIV' }
        recordTelemetry('TOOLTIP_POSITION_REQUESTED', { x: 10, y: 20, anchor: fakeNode })
        const event = getSnapshot().events[0]
        expect(event.payloadKeys.find((k) => k.key === 'anchor')?.type).toBe('DOMNode')
        expect(event.payloadKeys.find((k) => k.key === 'x')?.type).toBe('number')
    })

    it('handles null/undefined payloads gracefully', () => {
        recordTelemetry('OVERVIEW_REQUESTED', undefined)
        const event = getSnapshot().events[0]
        expect(event.payloadKeys).toEqual([])
        expect(event.payloadBytes).toBe(0)
    })

    it('handles empty-object payload gracefully', () => {
        recordTelemetry('STATE_RESET', {})
        const event = getSnapshot().events[0]
        expect(event.payloadKeys).toEqual([])
    })

    it('records payload byte size estimate for cost visibility', () => {
        recordTelemetry('SEARCH_SUCCESS', { results: [{ a: 1 }, { b: 2 }, { c: 3 }] })
        const event = getSnapshot().events[0]
        expect(event.payloadBytes).toBeGreaterThan(0)
    })
})

// ── Store: ring buffer ───────────────────────────────────────────────────

describe('telemetryStore — ring buffer', () => {
    it('respects bufferSize and drops oldest events', () => {
        configureTelemetry({ enabled: true, bufferSize: 5 })
        for (let i = 0; i < 12; i++) {
            recordTelemetry('TEST', { i })
        }
        const snap = getSnapshot()
        expect(snap.events.length).toBe(5)
        expect(snap.totalRecorded).toBe(12)
        expect(snap.dropped).toBe(7)
        // Newest 5 events kept (indices 7..11)
        expect(snap.events[0].payloadKeys.find((k) => k.key === 'i')?.type).toBe('number')
        // Verify ordering by seq (monotonic)
        const seqs = snap.events.map((e) => e.seq)
        expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
    })

    it('clear() resets buffer + counts + dropped + total', () => {
        configureTelemetry({ enabled: true, bufferSize: 3 })
        for (let i = 0; i < 10; i++) recordTelemetry('TEST', { i })
        clearTelemetry()
        const snap = getSnapshot()
        expect(snap.totalRecorded).toBe(0)
        expect(snap.dropped).toBe(0)
        expect(snap.events.length).toBe(0)
    })
})

// ── Store: aggregate counts ─────────────────────────────────────────────

describe('telemetryStore — aggregate counts', () => {
    beforeEach(() => configureTelemetry({ enabled: true }))

    it('counts occurrences per event name', () => {
        recordTelemetry('SEARCH_STARTED', {})
        recordTelemetry('SEARCH_STARTED', {})
        recordTelemetry('SEARCH_SUCCESS', {})
        const snap = getSnapshot()
        expect(snap.counts['SEARCH_STARTED']).toBe(2)
        expect(snap.counts['SEARCH_SUCCESS']).toBe(1)
    })

    it('returns frozen counts (snapshot-safe)', () => {
        recordTelemetry('SEARCH_STARTED', {})
        const snap = getSnapshot()
        expect(Object.isFrozen(snap.counts)).toBe(true)
    })
})

// ── Store: subscription (for dev overlay reactivity) ─────────────────────

describe('telemetryStore — subscription', () => {
    it('notifies subscribers on record()', () => {
        configureTelemetry({ enabled: true })
        const listener = vi.fn()
        const unsubscribe = telemetryStore.subscribe(listener)
        recordTelemetry('SEARCH_STARTED', {})
        expect(listener).toHaveBeenCalledTimes(1)
        recordTelemetry('SEARCH_SUCCESS', {})
        expect(listener).toHaveBeenCalledTimes(2)
        unsubscribe()
        recordTelemetry('SEARCH_EMPTY', { query: 'x' })
        expect(listener).toHaveBeenCalledTimes(2) // no more calls after unsubscribe
    })

    it('notifies subscribers on clear()', () => {
        configureTelemetry({ enabled: true })
        recordTelemetry('TEST', {})
        const listener = vi.fn()
        const unsubscribe = telemetryStore.subscribe(listener)
        clearTelemetry()
        expect(listener).toHaveBeenCalled()
        unsubscribe()
    })
})

// ── Subscriber: hooks every event in EVENTS manifest ─────────────────────

describe('installTelemetry — event-bus wiring', () => {
    it('subscribes to every EVENTS.* event', () => {
        const handle = installTelemetry()
        try {
            expect(handle.subscriptionCount).toBe(Object.keys(EVENTS).length)
            // The subscribed list should be the full manifest, sorted.
            expect(handle.subscribedEvents.length).toBe(TELEMETRY_EVENTS.length)
            for (const name of TELEMETRY_EVENTS) {
                expect(handle.subscribedEvents).toContain(name)
            }
        } finally {
            handle.dispose()
        }
    })

    it('captures events fired through publish()', () => {
        configureTelemetry({ enabled: true })
        const handle = installTelemetry()
        try {
            publish(EVENTS.SEARCH_STARTED, { query: 'coffee' })
            publish(EVENTS.SEARCH_SUCCESS, { resultCount: 12 })
            const snap = getSnapshot()
            expect(snap.counts['SEARCH_STARTED']).toBe(1)
            expect(snap.counts['SEARCH_SUCCESS']).toBe(1)
            // Privacy: only keys + types, not values.
            const ev = snap.events.find((e) => e.eventName === 'SEARCH_STARTED')
            expect(ev?.payloadKeys.map((k) => k.key)).toEqual(['query'])
            expect(ev?.payloadKeys[0].type).toBe('string')
        } finally {
            handle.dispose()
        }
    })

    it('is idempotent — calling install twice returns same handle', () => {
        const a = installTelemetry()
        const b = installTelemetry()
        expect(a).toBe(b)
        a.dispose()
        // After dispose, install should give us a fresh handle.
        const c = installTelemetry()
        expect(c).not.toBe(a)
        c.dispose()
    })

    it('dispose stops recording', () => {
        configureTelemetry({ enabled: true })
        const handle = installTelemetry()
        publish(EVENTS.SEARCH_STARTED, { query: 'before' })
        expect(getSnapshot().counts['SEARCH_STARTED']).toBe(1)
        handle.dispose()
        publish(EVENTS.SEARCH_STARTED, { query: 'after' })
        expect(getSnapshot().counts['SEARCH_STARTED']).toBe(1) // no new event
    })
})

// ── End-to-end: subscriber + store + bus ────────────────────────────────

describe('end-to-end telemetry pipeline', () => {
    it('a typical user flow produces expected counts', () => {
        configureTelemetry({ enabled: true, bufferSize: 100 })
        const handle = installTelemetry()
        try {
            // Simulated user session
            publish(EVENTS.STATE_RESET, { reason: 'app boot' })
            publish(EVENTS.SEARCH_STARTED, { query: 'coffee' })
            publish(EVENTS.SEARCH_SUCCESS, { resultCount: 12 })
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: 5 })
            publish(EVENTS.CAMERA_MOVED, { reason: 'focus' })
            publish(EVENTS.SEARCH_CLEARED, {})

            const snap = getSnapshot()
            expect(snap.totalRecorded).toBe(6)
            expect(snap.counts['STATE_RESET']).toBe(1)
            expect(snap.counts['SEARCH_STARTED']).toBe(1)
            expect(snap.counts['SEARCH_SUCCESS']).toBe(1)
            expect(snap.counts['SEARCH_FOCUS_REQUESTED']).toBe(1)
            expect(snap.counts['CAMERA_MOVED']).toBe(1)
            expect(snap.counts['SEARCH_CLEARED']).toBe(1)
        } finally {
            handle.dispose()
        }
    })
})
