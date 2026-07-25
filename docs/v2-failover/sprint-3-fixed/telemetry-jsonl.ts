import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { CarrierShapeClass } from '../v2-sprint1/types'

export type RequestedCapabilityAxis = 'vision' | 'toolUse' | 'code' | 'default'
export type TelemetryErrorClass = CarrierShapeClass['class']

/** One sequential upstream carrier call within a single dispatch. */
export interface TelemetryAttempt {
    route_id: string
    model_id: string
    status_class: string
    latencyMs: number
    tokensIn: number
    tokensOut: number
    error_class: TelemetryErrorClass | null
    /** Raw upstream response sample, capped and made safe for one-line JSONL output. */
    error_shape_sample: string | null
}

/** Gap #10: exactly one aggregate JSONL record per router dispatch. */
export interface TelemetryLine {
    ts: string
    requested_model: string
    requested_capability_axis: RequestedCapabilityAxis
    attempted_chains: TelemetryAttempt[]
    final_status_override: string | null
}

/** Mutable per-dispatch accumulator; it is written only when the dispatch finalizes. */
export interface DispatchTelemetryBuffer {
    ts: string
    requested_model: string
    requested_capability_axis: RequestedCapabilityAxis
    attempted_chains: TelemetryAttempt[]
}

export interface DaySummary {
    dateUtc: string
    dispatchesCount: number
    successCount: number
    failureCount: number
    breakdownByShape: Record<string, number>
    avgWallMs: number
    avgWallMsPerCarrier: Record<string, number>
    brokenCombosSeen: Array<{
        carrier: string
        modelId: string
        shape: string
        reason: string
    }>
    distinctModelsAttempted: number
    distinctCarriersAttempted: number
    totalCostUsd: number
}

export const OUTPUT_PATH = path.join(os.homedir(), '.pi', 'agent', 'telemetry', 'router-requests.jsonl')

const MAX_ERROR_SHAPE_SAMPLE_LEN = 512

function reportTelemetryIoFailure(operation: string, filePath: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[router-telemetry] ${operation} failed for ${filePath}: ${detail}`)
}

/** Preserve a useful raw response chunk while keeping every JSONL record on one physical line. */
export function sampleErrorShape(raw: string | null | undefined): string | null {
    if (raw == null) return null
    return raw
        .slice(0, MAX_ERROR_SHAPE_SAMPLE_LEN)
        .replace(/\r\n/g, '\\n')
        .replace(/[\r\n]/g, '\\n')
}

export function createTelemetryBuffer(
    requested_model: string,
    requested_capability_axis: RequestedCapabilityAxis,
    ts: string = new Date().toISOString()
): DispatchTelemetryBuffer {
    return { ts, requested_model, requested_capability_axis, attempted_chains: [] }
}

/** Add one sequential carrier attempt; this does not perform file I/O. */
export function appendAttemptToBuffer(
    buffer: DispatchTelemetryBuffer,
    attempt: TelemetryAttempt
): DispatchTelemetryBuffer {
    buffer.attempted_chains.push({
        ...attempt,
        error_shape_sample: sampleErrorShape(attempt.error_shape_sample)
    })
    return buffer
}

/**
 * Append one finalized dispatch to the single, append-only telemetry file.
 * Telemetry must never break routing, so mkdir/append failures are logged and swallowed.
 */
export async function appendTelemetryLine(line: TelemetryLine, outputPath: string = OUTPUT_PATH): Promise<void> {
    const safeLine: TelemetryLine = {
        ...line,
        attempted_chains: line.attempted_chains.map((attempt) => ({
            ...attempt,
            error_shape_sample: sampleErrorShape(attempt.error_shape_sample)
        }))
    }

    try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true })
        await fs.appendFile(outputPath, `${JSON.stringify(safeLine)}\n`, 'utf8')
    } catch (error) {
        reportTelemetryIoFailure('append', outputPath, error)
    }
}

/** Finalize the accumulator and write exactly one aggregate line for this dispatch. */
export async function finalizeTelemetryDispatch(
    buffer: DispatchTelemetryBuffer,
    final_status_override: string | null = null,
    outputPath: string = OUTPUT_PATH
): Promise<TelemetryLine> {
    const line: TelemetryLine = {
        ts: buffer.ts,
        requested_model: buffer.requested_model,
        requested_capability_axis: buffer.requested_capability_axis,
        attempted_chains: buffer.attempted_chains.map((attempt) => ({ ...attempt })),
        final_status_override
    }
    await appendTelemetryLine(line, outputPath)
    return line
}

function parseLine(raw: string): TelemetryLine | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
        const parsed = JSON.parse(trimmed) as Partial<TelemetryLine>
        if (
            typeof parsed.ts !== 'string' ||
            typeof parsed.requested_model !== 'string' ||
            typeof parsed.requested_capability_axis !== 'string' ||
            !Array.isArray(parsed.attempted_chains)
        ) {
            return null
        }
        return parsed as TelemetryLine
    } catch {
        return null
    }
}

function emptySummary(dateUtc: string): DaySummary {
    return {
        dateUtc,
        dispatchesCount: 0,
        successCount: 0,
        failureCount: 0,
        breakdownByShape: {},
        avgWallMs: 0,
        avgWallMsPerCarrier: {},
        brokenCombosSeen: [],
        distinctModelsAttempted: 0,
        distinctCarriersAttempted: 0,
        totalCostUsd: 0
    }
}

function attemptSucceeded(attempt: TelemetryAttempt): boolean {
    const status = attempt.status_class.toLowerCase()
    return attempt.error_class === null && (/^2\d\d$/.test(status) || status === 'ok' || status === 'success')
}

function computeSummary(dateUtc: string, lines: TelemetryLine[]): DaySummary {
    const summary = emptySummary(dateUtc)
    const carrierLatency: Record<string, { sum: number; count: number }> = {}
    const models = new Set<string>()
    const carriers = new Set<string>()
    const brokenKeys = new Set<string>()
    let totalDispatchLatency = 0

    summary.dispatchesCount = lines.length
    for (const line of lines) {
        const succeeded = line.final_status_override === null && line.attempted_chains.some(attemptSucceeded)
        if (succeeded) summary.successCount += 1
        else summary.failureCount += 1

        const dispatchLatency = line.attempted_chains.reduce((sum, attempt) => sum + (attempt.latencyMs || 0), 0)
        totalDispatchLatency += dispatchLatency

        for (const attempt of line.attempted_chains) {
            models.add(attempt.model_id)
            carriers.add(attempt.route_id)
            const shape = attempt.error_class ?? 'none'
            summary.breakdownByShape[shape] = (summary.breakdownByShape[shape] ?? 0) + 1

            const latency = carrierLatency[attempt.route_id] ?? { sum: 0, count: 0 }
            latency.sum += attempt.latencyMs || 0
            latency.count += 1
            carrierLatency[attempt.route_id] = latency

            if (attempt.error_class) {
                const key = `${attempt.route_id}|${attempt.model_id}|${attempt.error_class}`
                if (!brokenKeys.has(key)) {
                    brokenKeys.add(key)
                    summary.brokenCombosSeen.push({
                        carrier: attempt.route_id,
                        modelId: attempt.model_id,
                        shape: attempt.error_class,
                        reason: attempt.error_shape_sample ?? 'no-error-shape-sample'
                    })
                }
            }
        }
    }

    summary.avgWallMs = lines.length === 0 ? 0 : totalDispatchLatency / lines.length
    for (const [carrier, latency] of Object.entries(carrierLatency)) {
        summary.avgWallMsPerCarrier[carrier] = latency.count === 0 ? 0 : latency.sum / latency.count
    }
    summary.distinctModelsAttempted = models.size
    summary.distinctCarriersAttempted = carriers.size
    return summary
}

/**
 * Separate daily rollup over the single JSONL source. Invalid lines and other dates are ignored.
 * A missing/unreadable source produces an empty summary after logging non-ENOENT failures.
 */
export async function rollupDaySummary(date: string, source_filepath: string = OUTPUT_PATH): Promise<DaySummary> {
    let raw: string
    try {
        raw = await fs.readFile(source_filepath, 'utf8')
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            reportTelemetryIoFailure('rollup read', source_filepath, error)
        }
        return emptySummary(date)
    }

    const lines = raw
        .split('\n')
        .map(parseLine)
        .filter((line): line is TelemetryLine => line !== null)
        .filter((line) => line.ts.slice(0, 10) === date)
    return computeSummary(date, lines)
}
