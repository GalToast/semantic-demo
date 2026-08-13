/**
 * @lib/data-loader.ts — Async data fetching and parsing
 *
 * Ported from and
 * Pure async functions — no global state mutation. Returns typed results
 * that the data-store populates into Svelte stores.
 */

import type {
    BusinessRecord,
    BusinessDataResult,
    LeadEnrichment
} from '@lib/types/business'
import { debugInfo, debugWarn } from '@lib/utils/debug'
import { cleanOptionalValue } from '@lib/utils/dom-formatters'
import { retryWithBackoff } from '@lib/utils/retry-with-backoff'
import { workerUrl } from '@lib/workers/data-worker-url'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Positional column indices matching data-schema.js DATA_COLUMNS */
const COL = {
    X: 0,
    Y: 1,
    Z: 2,
    CLUSTER: 3,
    NAME: 4,
    WHAT: 5,
    CITY: 6,
    LEAD_ID: 7,
    LAT: 8,
    LNG: 9,
    WEBSITE: 10,
    EMAIL: 11,
    PHONE: 12,
    TRIVIA: 13,
    STATUS: 14,
    NAICS: 15
} as const

/** Max retries for the main-thread fetch fallback. Each is exponential backoff with jitter. */
const MAX_BUSINESS_RETRIES = 3

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildAssetUrl(path: string): string {
    if (typeof window === 'undefined') return path
    return new URL(path, window.location.href).href
}

const cleanOptional = cleanOptionalValue

/**
 * Parses a numeric coordinate to a finite number, or null for bad input.
 *
 * PARITY CONTRACT: must stay byte-identical in behavior to
 * `parseFiniteNumber` in src/lib/workers/data-worker.ts. This main-thread
 * fallback runs when the worker fails and MUST agree with the worker on the
 * same file. Both accept any full-string numeric form Number() understands
 * ("0.50", "1e-3", "1e3", " 12 ") and reject non-numeric / non-finite /
 * non-string input. Locked by tests/unit-active/worker-parser-parity.test.ts.
 */
export function parseFinite(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
}

/**
 * Normalizes a slug-style business name to a clean display name.
 * Matches data-mapper.js normalizeSlugName.
 */
function normalizeSlugName(name: string | null): string | null {
    if (!name || typeof name !== 'string') return name
    if (!/^(\d+-)?[a-z]+(-[a-z]+)+$/.test(name)) return name
    name = name.replace(/^\d+-/, '')
    name = name.replace(/-/g, ' ')
    return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

function cacheBustParam(): string {
    // W63: use the per-build id instead of an hourly wall-clock value so the
    // data asset URL is stable across a release and can be cached effectively.
    const buildId =
        typeof import.meta.env !== 'undefined' && typeof import.meta.env.VITE_BUILD_ID === 'string'
            ? import.meta.env.VITE_BUILD_ID
            : 'dev'
    return `v=${buildId}`
}

// ── Web Worker helpers ──────────────────────────────────────────────────────

interface WorkerResponse {
    type: string
    payload: unknown
}

/** Optional controls for {@link callDataWorker}: abort + request correlation. */
interface CallDataWorkerOptions {
    /** AbortSignal; when aborted mid-flight the worker is terminated and the promise rejects with AbortError. */
    signal?: AbortSignal
    /** Optional caller-supplied request id; when omitted a monotonic id is generated so the worker's supersession guard stays live. */
    requestId?: number
}

/** Monotonic request id source for callDataWorker (see CallDataWorkerOptions.requestId). */
let _dataWorkerRequestId = 0

/**
 * Raised when application teardown cancels an in-flight data request.
 *
 * This is deliberately distinct from a worker failure: teardown must not
 * silently fall back to a second main-thread parse while the old app is being
 * replaced.
 */
class DataLoaderAbortError extends Error {
    constructor() {
        super('Data worker request aborted during application teardown')
        this.name = 'AbortError'
    }
}

function isDataLoaderAbortError(error: unknown): boolean {
    return (
        error instanceof DataLoaderAbortError ||
        (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
    )
}

const _activeDataWorkerAborters = new Set<() => void>()

/** Cancel all data-worker requests owned by the current app instance. */
export function terminateDataLoaderWorkers(): void {
    for (const abort of Array.from(_activeDataWorkerAborters)) {
        abort()
    }
}

interface LoadRecordsWorkerResult {
    points: Array<{
        cluster: number
        name: string | null
        what: string | null
        city: string | null
        lead_id: string | null
        lat: number | null
        lng: number | null
        website: string | null
        email: string | null
        phone: string | null
        trivia: string | null
        status: string | null
        naics: string | null
    }>
    pointIndexByLeadId: Record<string, number>
    positionsBuffer: Float32Array
    clustersBuffer: Uint16Array
    invalidPositionIndices: number[]
}

/**
 * Send one request to a fresh data worker and await its reply.
 * The worker is terminated on the first settled response.
 *
 * F6 (data-pipeline bugsweep 2026-08-08): `type: 'PING'` is supported for
 * future liveness checks — data-worker.ts answers PING with PONG, which this
 * handler resolves. Per-call fresh workers make pingId correlation unnecessary.
 */
export function callDataWorker(
    type: 'LOAD_RECORDS',
    payload: { url: string },
    options?: CallDataWorkerOptions
): Promise<LoadRecordsWorkerResult>
export function callDataWorker<T>(type: string, payload: unknown, options?: CallDataWorkerOptions): Promise<T>
export function callDataWorker<T>(type: string, payload: unknown, options?: CallDataWorkerOptions): Promise<T> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: 'module' })
        let settled = false
        const signal = options?.signal

        // Handle an already-aborted caller without creating a timer or
        // registering event handlers that would otherwise outlive the request.
        if (signal?.aborted) {
            worker.terminate()
            reject(new DOMException('Worker request aborted', 'AbortError'))
            return
        }

        let activeAborter: (() => void) | null = null
        // Each call gets a monotonic requestId so the worker's supersession
        // guard (_activeRequestId) is live even though callDataWorker spins up
        // a fresh worker per call.
        const requestId = options?.requestId ?? ++_dataWorkerRequestId
        const settle = (fn: () => void): void => {
            if (settled) return
            settled = true
            clearTimeout(timeoutId)
            if (signal) signal.removeEventListener('abort', abortHandler)
            if (activeAborter) {
                _activeDataWorkerAborters.delete(activeAborter)
                activeAborter = null
            }
            worker.removeEventListener('message', handler)
            worker.removeEventListener('messageerror', messageErrorHandler)
            worker.removeEventListener('error', errorHandler)
            worker.terminate()
            fn()
        }
        // eslint-disable-next-line no-restricted-syntax -- local-scoped promise timeout, cleared in finally
        const timeoutId = setTimeout(() => {
            settle(() => reject(new Error('Worker timeout')))
        }, 30_000)
        const abortHandler = (): void => {
            // Aborted mid-flight: tear down the worker (cancels the in-flight
            // 8,406-record / 40 MB artifact fetch) and reject.
            settle(() => reject(new DOMException('Worker request aborted', 'AbortError')))
        }
        const teardownAbort = (): void => {
            settle(() => reject(new DataLoaderAbortError()))
        }
        activeAborter = teardownAbort
        _activeDataWorkerAborters.add(teardownAbort)
        if (signal) signal.addEventListener('abort', abortHandler)
        const handler = (event: MessageEvent<WorkerResponse>): void => {
            const res = event.data
            if (res.type === `${type}_SUCCESS`) {
                settle(() => resolve(res.payload as T))
            } else if (res.type === 'ERROR') {
                settle(() => reject(new Error((res.payload as { message?: string })?.message || 'Worker failed')))
            } else if (type === 'PING' && res.type === 'PONG') {
                // F6: worker answered the liveness ping — treat as success.
                settle(() => resolve({ pong: true } as T))
            }
        }
        const messageErrorHandler = (): void => {
            // Fires when postMessage fails to structured-clone the payload.
            settle(() => reject(new Error('Worker payload could not be structured-cloned (messageerror).')))
        }
        const errorHandler = (event: ErrorEvent): void => {
            settle(() => reject(new Error(event.message || 'Worker error event')))
        }
        worker.addEventListener('message', handler)
        worker.addEventListener('messageerror', messageErrorHandler)
        worker.addEventListener('error', errorHandler)
        try {
            worker.postMessage({ type, payload, requestId })
        } catch (error) {
            settle(() => reject(error instanceof Error ? error : new Error(String(error))))
        }
    })
}

// ── Business Data Loading ─────────────────────────────────────────────────────

/**
 * Fetches and parses business records from data.dat (array-of-arrays format).
 */

export async function loadBusinessData(): Promise<BusinessDataResult> {
    const dataUrl = buildAssetUrl(`data.dat?${cacheBustParam()}`)

    // Offload the heavy JSON.parse + typed-array construction to the Web Worker.
    const workerResult = await callDataWorker('LOAD_RECORDS', { url: dataUrl }).catch((err: unknown) => {
        if (isDataLoaderAbortError(err)) throw err
        debugWarn('[data-loader] Worker load failed, falling back to main thread:', err)
        return null
    })

    if (workerResult) {
        return buildBusinessDataResult(workerResult, null)
    }

    return loadBusinessDataMainThread(dataUrl, null)
}

/** Build BusinessDataResult from the worker's raw result. */
function buildBusinessDataResult(
    workerResult: LoadRecordsWorkerResult,
    enrichment: Record<string, LeadEnrichment> | null
): BusinessDataResult {
    const {
        points,
        pointIndexByLeadId: workerIndex,
        positionsBuffer: rawPositions,
        clustersBuffer: rawClusters,
        invalidPositionIndices
    } = workerResult
    const count = points.length

    // The worker returns typed arrays directly; no reconstruction needed.
    const positionsBuffer = rawPositions
    const clustersBuffer = rawClusters

    // Convert worker's simple objects to BusinessRecord shape
    const records: BusinessRecord[] = points.map((p, i) => {
        const leadId = cleanOptional(p.lead_id) ?? ''
        const name = normalizeSlugName(cleanOptional(p.name))
        return {
            id: `point-${i}`,
            lead_id: leadId,
            name: name ?? 'Unnamed business',
            what: cleanOptional(p.what) ?? 'Montgomery County business',
            public_note: '',
            public_detail: '',
            status: (cleanOptional(p.status) as BusinessRecord['status']) ?? 'active',
            category: '',
            cluster: p.cluster,
            city: cleanOptional(p.city) ?? 'Montgomery County',
            zip: '',
            website: cleanOptional(p.website),
            email: cleanOptional(p.email),
            phone: cleanOptional(p.phone),
            lat: p.lat,
            lng: p.lng,
            geocoded: p.lat !== null && p.lng !== null
        }
    })

    replaceInvalidPositionsWithBoundsCenter(positionsBuffer, new Set(invalidPositionIndices))

    // Rebuild the lead index after applying the same cleanup rules as the main-thread path.
    const pointIndexByLeadId = new Map<string, number>()
    for (let i = 0; i < records.length; i++) {
        const leadId = records[i]?.lead_id
        if (leadId) pointIndexByLeadId.set(leadId, i)
    }
    for (const [key, val] of Object.entries(workerIndex)) {
        const leadId = cleanOptional(key)
        if (leadId && !pointIndexByLeadId.has(leadId)) pointIndexByLeadId.set(leadId, val)
    }

    checkDataBounds(positionsBuffer)

    debugInfo(
        `[data-loader] Loaded ${count.toLocaleString()} business records (via worker), ` +
            `${pointIndexByLeadId.size.toLocaleString()} with lead IDs`
    )

    return {
        records,
        positionsBuffer,
        clustersBuffer,
        pointIndexByLeadId,
        enrichment
    }
}

/** Main-thread fallback — kept for worker failure / SSR / old browsers. */
async function loadBusinessDataMainThread(
    dataUrl: string,
    enrichment: Record<string, LeadEnrichment> | null
): Promise<BusinessDataResult> {
    const raw = await retryWithBackoff(
        async () => {
            const response = await fetch(dataUrl)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            return await response.json()
        },
        { maxRetries: MAX_BUSINESS_RETRIES, label: 'data-loader.main-thread' }
    )

    if (!raw || !Array.isArray(raw) || raw.length === 0) {
        throw new Error(`[data-loader] data.dat returned no records (got ${typeof raw})`)
    }

    const count = raw.length
    const positionsBuffer = new Float32Array(count * 3)
    const clustersBuffer = new Uint16Array(count)
    const pointIndexByLeadId = new Map<string, number>()

    const invalidPositionIndices = new Set<number>()

    const records: BusinessRecord[] = new Array(count)

    for (let i = 0; i < count; i++) {
        const p = raw[i] as unknown[]
        const xVal = parseFinite(p[COL.X])
        const yVal = parseFinite(p[COL.Y])
        const zVal = parseFinite(p[COL.Z])
        const x = xVal ?? 0
        const y = yVal ?? 0
        const z = zVal ?? 0
        const cluster = parseInt(String(p[COL.CLUSTER] ?? '0'), 10) || 0

        if (xVal === null || yVal === null || zVal === null) {
            invalidPositionIndices.add(i)
        }

        positionsBuffer[i * 3] = x
        positionsBuffer[i * 3 + 1] = y
        positionsBuffer[i * 3 + 2] = z
        clustersBuffer[i] = cluster

        const rawName = cleanOptional(p[COL.NAME])
        const name = normalizeSlugName(rawName)
        const leadId = cleanOptional(p[COL.LEAD_ID]) ?? ''

        records[i] = {
            id: `point-${i}`,
            lead_id: leadId,
            name: name ?? 'Unnamed business',
            what: cleanOptional(p[COL.WHAT]) ?? 'Montgomery County business',
            public_note: '',
            public_detail: '',
            status: (cleanOptional(p[COL.STATUS]) as BusinessRecord['status']) ?? 'active',
            category: '',
            cluster,
            city: cleanOptional(p[COL.CITY]) ?? 'Montgomery County',
            zip: '',
            website: cleanOptional(p[COL.WEBSITE]),
            email: cleanOptional(p[COL.EMAIL]),
            phone: cleanOptional(p[COL.PHONE]),
            lat: parseFinite(p[COL.LAT]),
            lng: parseFinite(p[COL.LNG]),
            geocoded: parseFinite(p[COL.LAT]) !== null && parseFinite(p[COL.LNG]) !== null
        }

        if (leadId) {
            pointIndexByLeadId.set(leadId, i)
        }
    }

    checkDataBounds(positionsBuffer)

    replaceInvalidPositionsWithBoundsCenter(positionsBuffer, invalidPositionIndices)

    debugInfo(
        `[data-loader] Loaded ${count.toLocaleString()} business records (main thread), ` +
            `${pointIndexByLeadId.size.toLocaleString()} with lead IDs`
    )

    return {
        records,
        positionsBuffer,
        clustersBuffer,
        pointIndexByLeadId,
        enrichment
    }
}

function replaceInvalidPositionsWithBoundsCenter(
    positionsBuffer: Float32Array,
    invalidPositionIndices: Set<number>
): void {
    if (invalidPositionIndices.size === 0) return

    const count = positionsBuffer.length / 3
    let minX = Infinity,
        minY = Infinity,
        minZ = Infinity
    let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity
    let validCount = 0

    for (let i = 0; i < count; i++) {
        if (invalidPositionIndices.has(i)) continue
        const bx = positionsBuffer[i * 3]!
        const by = positionsBuffer[i * 3 + 1]!
        const bz = positionsBuffer[i * 3 + 2]!
        if (bx < minX) minX = bx
        if (by < minY) minY = by
        if (bz < minZ) minZ = bz
        if (bx > maxX) maxX = bx
        if (by > maxY) maxY = by
        if (bz > maxZ) maxZ = bz
        validCount++
    }

    if (validCount <= 0) return

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    for (const idx of invalidPositionIndices) {
        positionsBuffer[idx * 3] = cx
        positionsBuffer[idx * 3 + 1] = cy
        positionsBuffer[idx * 3 + 2] = cz
    }
    debugWarn(
        `[data-loader] ${invalidPositionIndices.size} vertex(es) had missing coordinates; ` +
            `replaced with bounds center [${cx.toFixed(3)}, ${cy.toFixed(3)}, ${cz.toFixed(3)}].`
    )
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

async function fetchEnrichment(url: string): Promise<Record<string, LeadEnrichment> | null> {
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        const data = (await response.json()) as Record<string, LeadEnrichment>
        return data
    } catch {
        return null
    }
}

export async function loadLeadEnrichmentData(): Promise<Record<string, LeadEnrichment> | null> {
    const enrichmentUrl = buildAssetUrl(`data/leadEnrichment.public.json?${cacheBustParam()}`)

    try {
        const result = await callDataWorker<{ enrichment: Record<string, LeadEnrichment> | null }>(
            'LOAD_LEAD_ENRICHMENT',
            { url: enrichmentUrl }
        )
        return result.enrichment
    } catch (err: unknown) {
        if (isDataLoaderAbortError(err)) throw err
        debugWarn('[data-loader] Worker enrichment load failed, falling back to main thread:', err)
        return fetchEnrichment(enrichmentUrl)
    }
}

function checkDataBounds(buffer: Float32Array): void {
    if (!buffer || buffer.length === 0) return

    const MAX_SAMPLES = 600
    const totalFloats = buffer.length
    const step = totalFloats <= MAX_SAMPLES ? 1 : Math.ceil(totalFloats / MAX_SAMPLES)
    const oobValues: Array<{ index: number; value: number }> = []

    for (let i = 0; i < totalFloats; i += step) {
        const val = buffer[i]!
        if (val < -0.1 || val > 1.1) {
            oobValues.push({ index: i, value: val })
        }
    }

    if (oobValues.length > 0) {
        const samples = oobValues
            .slice(0, 10)
            .map((o) => `  index ${o.index}: ${o.value}`)
            .join('\n')
        const more = oobValues.length > 10 ? `\n  ...and ${oobValues.length - 10} more out-of-bounds values.` : ''
        debugWarn(
            `[data-loader] Positions out of bounds: ${oobValues.length} value(s) outside [0, 1]:\n` +
                `${samples}${more}\n` +
                `Expected [0, 1] range. MYCELIUM_FIELD_SCALE will cause extreme camera scaling.`
        )
    }
}
