/**
 * @lib/telemetry/telemetry-store.ts
 *
 * In-memory telemetry store. Ring buffer + aggregate counters, no Svelte
 * runes dependency so it can be imported from anywhere (including the
 * DevTelemetry overlay component and the subscriber module).
 *
 * Privacy: see telemetry-types.ts. We never store raw payloads — only
 * the keys + types + byte size. This keeps PII (search queries) out of
 * memory longer than necessary.
 *
 * Phase 9b (2026-06-26) — initial scaffold.
 */

import {
    DEFAULT_TELEMETRY_CONFIG,
    type TelemetryConfig,
    type TelemetryCounts,
    type TelemetryEvent,
    type TelemetrySnapshot
} from './telemetry-types'
import { debugLog } from '@lib/utils/debug'

// ── Internal State ─────────────────────────────────────────────────────────

class TelemetryStore {
    private config: TelemetryConfig = { ...DEFAULT_TELEMETRY_CONFIG }
    private buffer: TelemetryEvent[] = []
    private counts: Map<string, number> = new Map()
    private totalRecorded = 0
    private dropped = 0
    private seq = 0
    private listeners: Set<() => void> = new Set()

    // ── Configuration ────────────────────────────────────────────────────

    configure(partial: Partial<TelemetryConfig>): void {
        this.config = { ...this.config, ...partial }
        if (partial.bufferSize !== undefined && partial.bufferSize < this.buffer.length) {
            // Shrink buffer to new size, keeping newest events.
            this.buffer = this.buffer.slice(-partial.bufferSize)
        }
        this.notify()
    }

    getConfig(): TelemetryConfig {
        return { ...this.config }
    }

    // ── Record / Clear ───────────────────────────────────────────────────

    /**
     * Record an event. No-op if disabled. Buffers + counts in O(1).
     * Payload values are NOT stored — only key names + types.
     */
    record(eventName: string, payload: unknown): void {
        if (!this.config.enabled) return

        const seq = ++this.seq
        const timestamp = Date.now()
        const payloadKeys = payload && typeof payload === 'object'
            ? summarizePayload(payload as Record<string, unknown>)
            : []
        const payloadBytes = payload === undefined ? 0 : JSON.stringify(payload).length

        const event: TelemetryEvent = {
            seq,
            timestamp,
            eventName,
            payloadKeys,
            payloadBytes
        }

        // Append to ring buffer (drop oldest if full).
        if (this.buffer.length >= this.config.bufferSize) {
            this.buffer.shift()
            this.dropped++
        }
        this.buffer.push(event)

        // Bump aggregate count.
        this.counts.set(eventName, (this.counts.get(eventName) ?? 0) + 1)
        this.totalRecorded++

        if (this.config.mirrorToConsole) {
            // Use debugLog (gated by import.meta.env.DEV) instead of
            // console.log so production builds stay silent.
            const summary = payloadKeys.map((k) => k.key).join(',')
            debugLog(`telemetry #${seq} ${eventName} (${payloadBytes}b) {${summary}}`)
        }

        this.notify()
    }

    clear(): void {
        this.buffer = []
        this.counts = new Map()
        this.totalRecorded = 0
        this.dropped = 0
        this.seq = 0
        this.notify()
    }

    // ── Reads ─────────────────────────────────────────────────────────────

    getSnapshot(): TelemetrySnapshot {
        return {
            config: this.getConfig(),
            events: this.buffer.slice(),
            counts: Object.freeze(
                Object.fromEntries(
                    [...this.counts.entries()].sort(([a], [b]) => a.localeCompare(b))
                ) as Record<string, number>
            ) as TelemetryCounts,
            totalRecorded: this.totalRecorded,
            dropped: this.dropped
        }
    }

    /** Most recent N events (newest last). */
    getRecent(n: number): TelemetryEvent[] {
        if (n <= 0) return []
        return this.buffer.slice(-n)
    }

    getCount(eventName: string): number {
        return this.counts.get(eventName) ?? 0
    }

    // ── Subscription (for dev overlay reactivity) ────────────────────────

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    private notify(): void {
        for (const listener of this.listeners) listener()
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function summarizePayload(payload: Record<string, unknown>): Array<{ key: string; type: string }> {
    const out: Array<{ key: string; type: string }> = []
    for (const [key, value] of Object.entries(payload)) {
        // Skip DOM nodes, functions, etc. — they're not telemetry-friendly.
        if (value === null || value === undefined) {
            out.push({ key, type: value === null ? 'null' : 'undefined' })
        } else if (typeof value === 'object' && (value as { nodeType?: number }).nodeType !== undefined) {
            out.push({ key, type: 'DOMNode' })
        } else {
            out.push({ key, type: typeof value })
        }
    }
    return out
}

// ── Singleton Export ──────────────────────────────────────────────────────

/**
 * Process-wide telemetry store. Components read via `getSnapshot()` or
 * subscribe to `subscribe(listener)` for reactivity.
 */
export const telemetryStore = new TelemetryStore()

/** Convenience: read current snapshot. */
export function getSnapshot(): TelemetrySnapshot {
    return telemetryStore.getSnapshot()
}

/** Convenience: record an event. */
export function recordTelemetry(eventName: string, payload: unknown): void {
    telemetryStore.record(eventName, payload)
}

/** Convenience: configure the store. */
export function configureTelemetry(partial: Partial<TelemetryConfig>): void {
    telemetryStore.configure(partial)
}

/** Convenience: clear all recorded events. */
export function clearTelemetry(): void {
    telemetryStore.clear()
}