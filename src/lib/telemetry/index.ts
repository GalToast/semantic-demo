/**
 * @lib/telemetry/index.ts
 *
 * Phase 9b — In-house telemetry scaffold (2026-06-26).
 *
 * Lightweight, privacy-friendly in-process telemetry that subscribes to
 * the event bus and records aggregate counts + key-only payload summaries.
 * No external dependency, no PII in memory, no production HTTP traffic.
 *
 * Public API:
 *   - `configureTelemetry({ enabled, bufferSize, mirrorToConsole })`
 *   - `installTelemetry()` — wire to the event bus; returns disposable
 *   - `getSnapshot()` — read current events + counts
 *   - `recordTelemetry(name, payload)` — manual record (rare)
 *   - `clearTelemetry()` — wipe in-memory state
 *
 * The dev-only `DevTelemetry` overlay component lives in
 * `@components/DevTelemetry.svelte` (lazy-loaded, tree-shaken in prod).
 */

export {
    DEFAULT_TELEMETRY_CONFIG,
    type TelemetryConfig,
    type TelemetryCounts,
    type TelemetryEvent,
    type TelemetrySnapshot
} from './telemetry-types'

export { telemetryStore, getSnapshot, recordTelemetry, configureTelemetry, clearTelemetry } from './telemetry-store'

export {
    installTelemetry,
    uninstallTelemetry,
    TELEMETRY_EVENTS,
    type TelemetrySubscription
} from './telemetry-subscriber'
