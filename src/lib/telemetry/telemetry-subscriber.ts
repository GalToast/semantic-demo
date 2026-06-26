/**
 * @lib/telemetry/telemetry-subscriber.ts
 *
 * Wires the telemetry store to the event bus. Calls `subscribe()` for
 * every event in the EVENTS manifest and forwards payloads to the store.
 *
 * Privacy: only `eventName` and a payload-summary (keys + types + bytes)
 * are persisted. We never store the raw payload. This is enforced by
 * the store, not just convention.
 *
 * Phase 9b (2026-06-26) — initial scaffold.
 */

import { subscribe, EVENTS, type EventName } from '@lib/orchestration/event-bus'
import { recordTelemetry } from './telemetry-store'

// ── Event Manifest (re-exported locally for clarity) ──────────────────────

/**
 * All known event names. Derived from EVENTS manifest so adding a new event
 * automatically enrolls it in telemetry — no separate list to maintain.
 */
export const TELEMETRY_EVENTS = Object.values(EVENTS) as EventName[]

// ── Install / Uninstall ───────────────────────────────────────────────────

export interface TelemetrySubscription {
    /** Unsubscribe all subscribers. Idempotent. */
    dispose: () => void
    /** Number of event-bus subscriptions registered. */
    subscriptionCount: number
    /** Event names that were subscribed (sorted). */
    subscribedEvents: readonly EventName[]
}

/**
 * Subscribe to every event in the EVENTS manifest and forward each payload
 * to the telemetry store. Returns a disposable handle.
 *
 * Idempotency: calling installTelemetry() while a previous handle is
 * still active is a no-op — returns the existing handle. Call dispose()
 * first if you want to re-install.
 */
let activeHandle: TelemetrySubscription | null = null

export function installTelemetry(): TelemetrySubscription {
    if (activeHandle) return activeHandle

    const unsubscribers: Array<() => void> = []
    for (const eventName of TELEMETRY_EVENTS) {
        // `subscribe` is generic in K, so passing the callback with a typed
        // payload parameter lets TS infer K = typeof eventName.
        const unsubscribe = subscribe(eventName, (payload) => {
            recordTelemetry(eventName, payload)
        })
        unsubscribers.push(unsubscribe)
    }

    const dispose = (): void => {
        for (const off of unsubscribers) off()
        unsubscribers.length = 0
        activeHandle = null
    }

    activeHandle = {
        dispose,
        subscriptionCount: unsubscribers.length,
        subscribedEvents: [...TELEMETRY_EVENTS].sort()
    }
    return activeHandle
}

/** Convenience: dispose the active telemetry subscription if any. */
export function uninstallTelemetry(): void {
    activeHandle?.dispose()
}