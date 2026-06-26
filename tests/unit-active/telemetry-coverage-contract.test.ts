/**
 * @vitest-environment node
 *
 * Telemetry Coverage Contract Test — Phase 9b (2026-06-26)
 *
 * Locks in the structural promises of the telemetry scaffold:
 *   - All EVENTS.* event names are enrolled by default
 *   - Adding a new event to the manifest auto-enrolls telemetry
 *   - The store is privacy-respecting (no raw payload exposure)
 *   - The store is dev-gated (disabled by default)
 */
import { describe, it, expect } from 'vitest'
import {
    DEFAULT_TELEMETRY_CONFIG,
    type TelemetryConfig,
    type TelemetryCounts,
    type TelemetryEvent,
    type TelemetrySnapshot
} from '@lib/telemetry/telemetry-types'
import { telemetryStore } from '@lib/telemetry/telemetry-store'
import { installTelemetry, TELEMETRY_EVENTS } from '@lib/telemetry/telemetry-subscriber'
import { EVENTS, type EventName } from '@lib/orchestration/event-bus'

// ── Type exports are usable (compile-time + runtime guarantees) ───────────

describe('telemetry types — public API stability', () => {
    it('exports TelemetryConfig, TelemetryCounts, TelemetryEvent, TelemetrySnapshot', () => {
        // These are type-only imports but verify the values can be referenced.
        const config: TelemetryConfig = { ...DEFAULT_TELEMETRY_CONFIG }
        expect(config).toBeDefined()
        // TelemetryCounts is a Record<string, number>
        const counts: TelemetryCounts = { SEARCH_STARTED: 1 }
        expect(counts.SEARCH_STARTED).toBe(1)
        // TelemetryEvent is structural
        const event: TelemetryEvent = {
            seq: 1,
            timestamp: Date.now(),
            eventName: 'TEST',
            payloadKeys: [],
            payloadBytes: 0
        }
        expect(event.seq).toBe(1)
        // TelemetrySnapshot is structural
        const snap: TelemetrySnapshot = {
            config,
            events: [event],
            counts,
            totalRecorded: 1,
            dropped: 0
        }
        expect(snap.totalRecorded).toBe(1)
    })

    it('DEFAULT_TELEMETRY_CONFIG has telemetry disabled by default', () => {
        // Safety: telemetry must never be on by default. Otherwise a
        // forgotten configureTelemetry() call would record in prod.
        expect(DEFAULT_TELEMETRY_CONFIG.enabled).toBe(false)
    })
})

// ── Subscriber enrolls every event in the manifest ─────────────────────

describe('subscriber — manifest parity', () => {
    it('TELEMETRY_EVENTS matches EVENTS manifest exactly', () => {
        const manifestNames = Object.values(EVENTS) as EventName[]
        expect(TELEMETRY_EVENTS.length).toBe(manifestNames.length)
        for (const name of manifestNames) {
            expect(TELEMETRY_EVENTS).toContain(name)
        }
    })

    it('subscribedEvents list (sorted) is alphabetically stable', () => {
        const handle = installTelemetry()
        try {
            // Manual sort check (the implementation uses [..TELEMETRY_EVENTS].sort()).
            const sorted = [...handle.subscribedEvents].sort()
            for (let i = 0; i < handle.subscribedEvents.length; i++) {
                expect(handle.subscribedEvents[i]).toBe(sorted[i])
            }
        } finally {
            handle.dispose()
        }
    })
})

// ── Privacy: store never exposes raw payload values ──────────────────────

describe('telemetry — privacy contract', () => {
    it('snapshot events do not include a payload field', () => {
        // The whole point of the design: callers CANNOT retrieve the
        // original payload, only keys + types. This protects against
        // accidental PII leakage via telemetry getters.
        telemetryStore.configure({ enabled: true })
        telemetryStore.clear()
        telemetryStore.record('TEST', {
            userQuery: 'secret',
            resultList: [1, 2, 3],
            domNode: { nodeType: 1 }
        })
        const event = telemetryStore.getSnapshot().events[0]
        // The event shape itself must not allow value access.
        const forbiddenKeys = ['payload', 'userQuery', 'resultList', 'domNode']
        for (const key of forbiddenKeys) {
            expect(event).not.toHaveProperty(key)
        }
        // Cleanup
        telemetryStore.clear()
        telemetryStore.configure(DEFAULT_TELEMETRY_CONFIG)
    })
})

// ── Singleton export is the same instance across imports ──────────────────

describe('telemetry — singleton identity', () => {
    it('telemetryStore is a singleton (same reference across calls)', async () => {
        const { telemetryStore: a } = await import('@lib/telemetry/telemetry-store')
        const { telemetryStore: b } = await import('@lib/telemetry/telemetry-store')
        expect(a).toBe(b)
    })
})