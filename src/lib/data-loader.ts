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
    LeadEnrichment,
    SemanticThreadBundle,
    SemanticThreadDataResult,
    SemanticNeighborEntry,
    SemanticNeighborDetail,
    LayoutManifest
} from '@lib/types/business'
import { debugInfo, debugWarn } from '@lib/utils/debug'
import { cleanOptionalValue } from '@lib/utils/dom-formatters'
import { normalizeRelationshipRole } from '@lib/utils/relationship-roles'
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

const MAX_BUSINESS_RETRIES = 3

const THREAD_REQUEST_URLS_REL = ['data/semantic_threads_ui.dat', 'data/semantic_threads.dat']

const THREAD_FETCH_CONFIGS: RequestInit[] = [
    { cache: 'default' },
    { cache: 'force-cache' },
    { cache: 'reload' },
    { cache: 'no-store' }
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildAssetUrl(path: string): string {
    if (typeof window === 'undefined') return path
    return new URL(path, window.location.href).href
}

const cleanOptional = cleanOptionalValue

function parseFinite(value: unknown): number | null {
    const num = parseFloat(String(value))
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
    return `v=${Math.floor(Date.now() / (1000 * 60 * 60))}`
}

function artifactNameFromUrl(url: string): string {
    try {
        return new URL(url, window.location.href).pathname.split('/').pop() || url
    } catch {
        return url.split('?')[0] ?? url
    }
}

// ── Web Worker helpers ──────────────────────────────────────────────────────

interface WorkerResponse {
    type: string
    payload: unknown
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

function callDataWorker(type: 'LOAD_RECORDS', payload: { url: string }): Promise<LoadRecordsWorkerResult>
function callDataWorker<T>(type: string, payload: unknown): Promise<T>
function callDataWorker<T>(type: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: 'module' })
        let settled = false
        const settle = (fn: () => void): void => {
            if (settled) return
            settled = true
            clearTimeout(timeoutId)
            worker.removeEventListener('message', handler)
            worker.removeEventListener('messageerror', messageErrorHandler)
            worker.removeEventListener('error', errorHandler)
            worker.terminate()
            fn()
        }
        const timeoutId = setTimeout(() => {
            settle(() => reject(new Error('Worker timeout')))
        }, 30_000)
        const handler = (event: MessageEvent<WorkerResponse>): void => {
            const res = event.data
            if (res.type === `${type}_SUCCESS`) {
                settle(() => resolve(res.payload as T))
            } else if (res.type === 'ERROR') {
                settle(() => reject(new Error((res.payload as { message?: string })?.message || 'Worker failed')))
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
        worker.postMessage({ type, payload })
    })
}

interface LoadThreadsWorkerResult {
    neighborEntries: Array<[string, SemanticNeighborEntry]>
    artifactName: string | null
    bundle: unknown
}

// ── Business Data Loading ─────────────────────────────────────────────────────

/**
 * Fetches and parses business records from data.dat (array-of-arrays format).
 */

export async function loadBusinessData(): Promise<BusinessDataResult> {
    const dataUrl = buildAssetUrl(`data.dat?${cacheBustParam()}`)

    // Offload the heavy JSON.parse + typed-array construction to the Web Worker.
    const workerResult = await callDataWorker('LOAD_RECORDS', { url: dataUrl }).catch((err: unknown) => {
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
    const raw = await fetchWithRetries(dataUrl, MAX_BUSINESS_RETRIES)

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

// ── Semantic Thread Loading ───────────────────────────────────────────────────

/**
 * Fetches semantic thread neighbor data from semantic_threads.dat
 * (or semantic_threads_ui.dat as primary).
 *
 * The bundle contains a `nodes` object keyed by fallback lead_id,
 * each with neighbors that describe semantic relationships.
 *
 * Returns a normalized neighbor map keyed by lead_id.
 */
export async function loadSemanticThreads(): Promise<SemanticThreadDataResult> {
    const requestUrls = THREAD_REQUEST_URLS_REL.map((rel) => buildAssetUrl(`${rel}?${cacheBustParam()}`))

    try {
        const result = await callDataWorker<LoadThreadsWorkerResult>('LOAD_THREADS', {
            urls: requestUrls,
            attemptConfigs: THREAD_FETCH_CONFIGS as Array<{ cache: string }>
        })

        const neighborMap = new Map<string, SemanticNeighborEntry>(result.neighborEntries)

        debugInfo(
            `[data-loader] Loaded semantic threads (via worker): ${result.artifactName}, ` +
                `${neighborMap.size.toLocaleString()} node entries`
        )

        return {
            bundle: result.bundle as SemanticThreadBundle,
            artifactName: result.artifactName || 'unknown',
            neighborMap,
            layoutManifest: null
        }
    } catch (err) {
        debugWarn('[data-loader] Worker thread load failed, falling back to main thread:', err)
        return _loadSemanticThreadsMainThread(requestUrls)
    }
}

/** Main-thread fallback for semantic-thread loading (kept for worker failure / SSR / old browsers). */
async function _loadSemanticThreadsMainThread(requestUrls: string[]): Promise<SemanticThreadDataResult> {
    let bundle: SemanticThreadBundle | null = null
    let artifactName: string | null = null
    let lastError: Error | null = null

    for (const url of requestUrls) {
        const name = artifactNameFromUrl(url)
        for (const config of THREAD_FETCH_CONFIGS) {
            try {
                const response = await fetch(url, config)
                if (!response.ok) {
                    throw new Error(`[data-loader] Semantic thread artifact unavailable (${response.status})`)
                }
                bundle = (await response.json()) as SemanticThreadBundle
                artifactName = name
                break
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err))
                await delay(220 * (THREAD_FETCH_CONFIGS.indexOf(config) + 1))
            }
        }
        if (bundle) break
    }

    if (!bundle || !artifactName) {
        throw lastError ?? new Error('[data-loader] Semantic thread artifact unavailable')
    }

    if (!bundle.nodes || typeof bundle.nodes !== 'object') {
        throw new Error('[data-loader] Semantic thread bundle has no nodes object')
    }

    const neighborMap = buildSemanticNeighborMap(bundle)

    debugInfo(
        `[data-loader] Loaded semantic threads (main thread): ${artifactName}, ` +
            `${neighborMap.size.toLocaleString()} node entries`
    )

    return {
        bundle,
        artifactName,
        neighborMap,
        layoutManifest: null
    }
}

/**
 * Load the semantic space layout manifest for validation.
 * Non-critical — returns null on failure.
 */
export async function loadLayoutManifest(): Promise<LayoutManifest | null> {
    try {
        const url = buildAssetUrl(`data/semantic_space_layout_manifest.json?${cacheBustParam()}`)
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) return null
        const manifest = (await response.json()) as LayoutManifest
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            return null
        }
        return manifest
    } catch {
        return null
    }
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

async function fetchWithRetries(url: string, maxAttempts: number): Promise<unknown> {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            try {
                return await response.json()
            } catch (jsonErr) {
                throw new Error(`Invalid JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`, {
                    cause: jsonErr
                })
            }
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            debugWarn(`[data-loader] Fetch attempt ${attempt}/${maxAttempts} failed for ${url}:`, lastError.message)
            if (attempt < maxAttempts) {
                await delay(500 * attempt)
            }
        }
    }
    throw new Error(
        `[data-loader] Failed to fetch ${url} after ${maxAttempts} attempts` +
            (lastError ? `: ${lastError.message}` : '')
    )
}

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

function buildSemanticNeighborMap(bundle: SemanticThreadBundle): Map<string, SemanticNeighborEntry> {
    const map = new Map<string, SemanticNeighborEntry>()
    const nodes = bundle.nodes

    for (const [fallbackLeadId, node] of Object.entries(nodes)) {
        const leadId = normalizeLeadId(node?.lead_id ?? fallbackLeadId)
        if (!leadId) continue

        const neighbors: SemanticNeighborDetail[] = Array.isArray(node?.neighbors)
            ? node.neighbors
                  .map((n) => {
                      const nLeadId = normalizeLeadId(n?.lead_id)
                      if (!nLeadId) return null
                      return {
                          leadId: nLeadId,
                          score: Number(n?.score ?? 0),
                          semanticScore: Number(n?.semantic_score ?? 0),
                          sameCity: Boolean(n?.same_city),
                          sameStatus: Boolean(n?.same_status),
                          bridgeScore: Number(n?.bridge_score ?? 0),
                          signalScore: Number(n?.signal_score ?? 0),
                          threadType: cleanOptional(n?.thread_type) ?? 'local_semantic_neighbor',
                          relationshipRole: normalizeRelationshipRole(cleanOptional(n?.relationship_role)),
                          relationshipAxis: cleanOptional(n?.relationship_axis) ?? '',
                          roleReason: cleanOptional(n?.role_reason) ?? '',
                          reason: cleanOptional(n?.reason) ?? 'semantic neighbor'
                      }
                  })
                  .filter((n): n is SemanticNeighborDetail => n !== null)
            : []

        map.set(leadId, {
            leadId,
            name: node?.name ?? null,
            city: node?.city ?? null,
            status: node?.status ?? null,
            signalScore: Number(node?.signal_score ?? 0),
            neighbors
        })
    }

    return map
}

function normalizeLeadId(id: unknown): string | null {
    if (id === null || id === undefined) return null
    const s = String(id).trim()
    return s.length > 0 ? s : null
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
