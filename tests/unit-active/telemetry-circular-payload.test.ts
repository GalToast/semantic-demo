/**
 * @vitest-environment node
 *
 * W60 regression: recordTelemetry circular-payload safety.
 *
 * recordTelemetry is invoked from event-bus subscriber callbacks; pre-fix the
 * store computed `JSON.stringify(payload).length` unconditionally, so a
 * circular/non-serializable event payload threw TypeError and crashed the
 * subscriber (the event was lost). Fix: try/catch the stringify with a 0-byte
 * fallback. This test asserts no throw + the event is still recorded + the
 * size estimate falls back to 0.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    configureTelemetry,
    clearTelemetry,
    getSnapshot,
    recordTelemetry,
} from '@lib/telemetry/telemetry-store'
import { uninstallTelemetry } from '@lib/telemetry/telemetry-subscriber'

describe('telemetryStore — circular payload (W60 fix)', () => {
    beforeEach(() => {
        clearTelemetry()
        uninstallTelemetry()
        configureTelemetry({ enabled: true, bufferSize: 200, mirrorToConsole: false })
    })

    it('does not throw when the payload is circular', () => {
        const a: Record<string, unknown> = {}
        const b: Record<string, unknown> = {}
        a.self = b
        b.back = a // circular reference
        expect(() => recordTelemetry('CIRCULAR_TEST', a)).not.toThrow()
    })

    it('still records the event despite the circular payload', () => {
        const a: Record<string, unknown> = { loop: null }
        a.loop = a // self-referential
        recordTelemetry('CIRCULAR_TEST', a)
        const snap = getSnapshot()
        expect(snap.totalRecorded).toBe(1)
        expect(snap.events.length).toBe(1)
    })

    it('falls back payloadBytes to 0 on a non-serializable payload', () => {
        const circular: Record<string, unknown> = { me: null }
        circular.me = circular
        recordTelemetry('CIRCULAR_TEST', circular)
        const ev = getSnapshot().events[0]
        // JSON.stringify throws on the cycle -> the try/catch stores 0 bytes.
        expect(ev.payloadBytes).toBe(0)
    })
})
