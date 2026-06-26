/**
 * @lib/telemetry/telemetry-types.ts
 *
 * Public types for the in-house telemetry scaffold. Privacy-friendly by
 * design: payloads are summarized to keys + counts, never the full payload
 * (which may contain user input or PII).
 *
 * Phase 9b (2026-06-26) — initial scaffold.
 */

// ── Configuration ──────────────────────────────────────────────────────────

export interface TelemetryConfig {
    /** Master switch. Off in production, on in dev. */
    enabled: boolean
    /** Maximum events kept in the ring buffer. Older events drop off. */
    bufferSize: number
    /** Whether to mirror events to the dev console (debug channel). */
    mirrorToConsole: boolean
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
    enabled: false, // Caller is expected to enable explicitly in dev.
    bufferSize: 200,
    mirrorToConsole: false
}

// ── Event Record ──────────────────────────────────────────────────────────

/**
 * A single telemetry record. We deliberately keep the payload summary
 * lightweight — full payloads can be large (e.g. search result arrays)
 * and may contain user input we don't want sitting in memory or logs.
 *
 * `payloadKeys` is the set of top-level keys in the original payload
 * (with their typeof). It's enough to verify "did we send a query?" or
 * "did we include an index?" without storing the actual values.
 */
export interface TelemetryEvent {
    /** Monotonic counter — useful for ordering when timestamps tie. */
    seq: number
    /** Wall-clock timestamp (Date.now()). */
    timestamp: number
    /** Event name (from EVENTS manifest). */
    eventName: string
    /** Top-level keys of the payload (with typeof) — no values. */
    payloadKeys: Array<{ key: string; type: string }>
    /** Total payload byte size estimate (JSON.stringify.length). */
    payloadBytes: number
}

// ── Aggregate Counts ──────────────────────────────────────────────────────

/**
 * Aggregate counter per event name. Lets the dev overlay show "we fired
 * SEARCH_STARTED 12 times in this session" at a glance.
 */
export type TelemetryCounts = Readonly<Record<string, number>>

// ── Snapshot (for reads / dev overlay) ─────────────────────────────────────

/**
 * Read-only snapshot of the telemetry state for a given moment. Returned
 * by `getSnapshot()` so consumers (dev overlay, tests, future debug
 * endpoints) don't observe mid-update arrays.
 */
export interface TelemetrySnapshot {
    config: TelemetryConfig
    events: readonly TelemetryEvent[]
    counts: TelemetryCounts
    /** Total events recorded since `clear()` or install. */
    totalRecorded: number
    /** Events dropped due to buffer overflow since install. */
    dropped: number
}
