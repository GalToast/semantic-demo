/**
 * data-worker.ts
 *
 * Background worker for fetching and parsing large datasets.
 * Prevents main-thread blocking during application loading.
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface PointRecord {
    cluster: number
    name: string | null
    what: string
    city: string
    lead_id: string | null
    lat: number | null
    lng: number | null
    website: string | null
    email: string | null
    phone: string | null
    trivia: string | null
    status: string
    naics: string | null
}

interface LoadRecordsResult {
    points: PointRecord[]
    pointIndexByLeadId: Record<string, number>
    positionsBuffer: Float32Array
    clustersBuffer: Uint16Array
    invalidPositionIndices: number[]
}

export interface NeighborEntry {
    leadId: string
    name: string | null
    city: string | null
    status: string | null
    signalScore: number
    neighbors: Array<{
        leadId: string
        score: number
        semanticScore: number
        sameCity: boolean
        sameStatus: boolean
        bridgeScore: number
        signalScore: number
        threadType: string
        relationshipRole: string
        relationshipAxis: string
        roleReason: string
        reason: string
    }>
}

interface LoadThreadsResult {
    neighborEntries: Array<[string, NeighborEntry]>
    artifactName: string | null
    bundle: unknown
}

interface LoadLeadEnrichmentResult {
    enrichment: Record<string, LeadEnrichment> | null
}

interface LeadEnrichment {
    lead_id: string
    category?: string
    website_status?: string
    email_verified?: boolean
    synergy_score?: number
    cluster_assignment?: string
}

interface AttemptConfig {
    cache?: string
}

// ── Inline retry helpers (self-contained; workers can't import from Vite aliases) ────

/** HTTP status codes considered permanent (not worth retrying). */
const PERMANENT_HTTP_STATUSES: ReadonlySet<number> = new Set([400, 401, 402, 403, 404, 405, 410, 422])

function isPermanentError(err: unknown): boolean {
    const status = extractStatusCode(err)
    if (status !== null) return PERMANENT_HTTP_STATUSES.has(status)

    const message = err instanceof Error ? err.message : String(err ?? '')
    const lower = message.toLowerCase()
    const fourxxMatch = lower.match(/\b(4\d\d)\b/)
    if (fourxxMatch) {
        const code = parseInt(fourxxMatch[1]!, 10)
        if (code >= 400 && code < 500 && code !== 429) return true
    }

    return false
}

function extractStatusCode(err: unknown): number | null {
    if (!err) return null
    if (err instanceof TypeError || err instanceof DOMException) return null
    const e = err as Record<string, unknown>
    if (typeof e.status === 'number') return e.status
    const msg = typeof e.message === 'string' ? e.message : String(err)
    const httpMatch = msg.match(/\b(?:HTTP\s*)?(4\d\d|5\d\d)\b/)
    if (httpMatch) return parseInt(httpMatch[1]!, 10)
    return null
}

function computeBackoffDelay(attempt: number, baseDelay = 500): number {
    const exponential = baseDelay * Math.pow(2, attempt)
    const capped = Math.min(exponential, 8000)
    return Math.round(capped * (0.5 + Math.random() * 0.5))
}

function delayInWorker(ms: number): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retryFetch(url: string, options?: RequestInit, maxRetries = 3, label = 'fetch'): Promise<Response> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options)
            if (!response.ok) {
                // Attach status code to the error so isTransientError / isPermanentError
                // can classify it via the `.status` property.
                const httpErr = new Error(`HTTP ${response.status}`) as Error & { status: number }
                httpErr.status = response.status
                throw httpErr
            }
            return response
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            lastError = error

            if (isPermanentError(err)) {
                throw error
            }

            if (attempt >= maxRetries) {
                // Last attempt exhausted
                throw error
            }

            const backoffMs = computeBackoffDelay(attempt)
            if (import.meta.env.DEV) {
                console.warn(
                    `[worker:${label}] attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${backoffMs}ms:`,
                    error.message
                )
            }
            await delayInWorker(backoffMs)
        }
    }
    throw lastError ?? new Error(`${label}: all retries exhausted`)
}

// ── Worker body ─────────────────────────────────────────────────────────────

let _activeRequestId = 0

self.onmessage = async (event: MessageEvent) => {
    const data = event.data
    // Handle non-object payloads (e.g., main thread sent null or a primitive)
    // by short-circuiting with an ERROR reply rather than silently hanging.
    if (!data || typeof data !== 'object') {
        self.postMessage({
            type: 'ERROR',
            payload: { message: 'Worker received a non-object payload.', stack: undefined },
            requestId: undefined
        })
        return
    }
    // Narrow fields explicitly so downstream assignments stay type-safe.
    const raw = data as { type?: unknown; payload?: unknown; pingId?: unknown; requestId?: unknown }
    const type = raw.type
    const payload = raw.payload
    const pingId = raw.pingId
    const incomingRequestId = typeof raw.requestId === 'number' ? raw.requestId : undefined

    // Health-check ping: respond immediately without incrementing requestId.
    if (type === 'PING') {
        self.postMessage({ type: 'PONG', pingId })
        return
    }

    // Always assign a strictly monotonic requestId so supersede checks
    // (requestId !== _activeRequestId) can never match stale responses.
    // The incomingRequestId from the main thread, if provided, is used
    // only for logging/tracing — never for counter assignment.
    const requestId = ++_activeRequestId
    if (incomingRequestId !== undefined && incomingRequestId <= _activeRequestId) {
        // Stale or duplicate requestId from main thread — reject silently.
        // The worker's own monotonic counter already advanced past it.
    }

    try {
        if (type === 'LOAD_RECORDS') {
            const result = await handleLoadRecords(payload as { url: string })
            if (requestId !== _activeRequestId) return // Transfer buffers to main thread to eliminate cloning overhead
            ;(self as unknown as { postMessage(message: unknown, transfer?: Transferable[]): void }).postMessage(
                { type: 'LOAD_RECORDS_SUCCESS', payload: result, requestId },
                [result.positionsBuffer.buffer, result.clustersBuffer.buffer] as Transferable[]
            )
        } else if (type === 'LOAD_THREADS') {
            const result = await handleLoadThreads(
                payload as { urls: string[]; attemptConfigs: (string | AttemptConfig)[] },
                requestId
            )
            if (requestId !== _activeRequestId) return
            self.postMessage({ type: 'LOAD_THREADS_SUCCESS', payload: result, requestId })
        } else if (type === 'LOAD_LEAD_ENRICHMENT') {
            const result = await handleLoadLeadEnrichment(payload as { url: string }, requestId)
            if (requestId !== _activeRequestId) return
            self.postMessage({ type: 'LOAD_LEAD_ENRICHMENT_SUCCESS', payload: result, requestId })
        } else {
            // Unknown command type: surface as an ERROR reply so the main
            // thread can fail fast instead of hanging on a 30s timeout.
            self.postMessage({
                type: 'ERROR',
                payload: {
                    message: `Worker received unknown command type: ${typeof type === 'string' ? type : String(type)}`,
                    stack: undefined
                },
                requestId
            })
        }
    } catch (error: unknown) {
        if (requestId !== _activeRequestId) return
        const err = error instanceof Error ? error : new Error(String(error))
        self.postMessage({
            type: 'ERROR',
            payload: { message: err.message, stack: err.stack },
            requestId
        })
    }
}

async function handleLoadRecords({ url }: { url: string }): Promise<LoadRecordsResult> {
    const response = await retryFetch(url, undefined, 3, 'load-records')

    let raw: unknown
    try {
        raw = await response.json()
    } catch (jsonErr: unknown) {
        const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
        throw new Error(`Invalid JSON in data.dat: ${msg}`, { cause: jsonErr })
    }
    if (!raw || !Array.isArray(raw)) throw new Error('Invalid records payload')

    const count = raw.length
    const positionsBuffer = new Float32Array(count * 3)
    const clustersBuffer = new Uint16Array(count)
    const invalidPositionIndices: number[] = []

    const points: PointRecord[] = raw.map((p: unknown, i: number) => {
        // Guard each row: the outer `raw` was Array.isArray-checked, but a
        // single null/undefined/non-array row in data.dat would throw on
        // `p.length` and crash the WHOLE records load (blank app). Skip the row
        // with a zero-position sentinel so indices stay aligned with the
        // pre-allocated position/cluster buffers.
        if (!Array.isArray(p)) {
            invalidPositionIndices.push(i)
            return {
                cluster: 0,
                name: null,
                what: 'Montgomery County business',
                city: 'Montgomery County',
                lead_id: null,
                lat: null,
                lng: null,
                website: null,
                email: null,
                phone: null,
                trivia: null,
                status: 'active',
                naics: null
            }
        }
        const xVal = p.length > 0 ? parseFiniteNumber(p[0]) : null
        const yVal = p.length > 1 ? parseFiniteNumber(p[1]) : null
        const zVal = p.length > 2 ? parseFiniteNumber(p[2]) : null
        const x = xVal ?? 0
        const y = yVal ?? 0
        const z = zVal ?? 0
        const cluster = p.length > 3 ? (parseFiniteNumber(p[3]) ?? 0) | 0 : 0

        if (xVal === null || yVal === null || zVal === null) {
            invalidPositionIndices.push(i)
        }

        positionsBuffer[i * 3] = x
        positionsBuffer[i * 3 + 1] = y
        positionsBuffer[i * 3 + 2] = z
        clustersBuffer[i] = cluster

        return {
            cluster,
            name: p.length > 4 ? cleanOptionalValue(p[4]) : null,
            what:
                p.length > 5 ? cleanOptionalValue(p[5]) || 'Montgomery County business' : 'Montgomery County business',
            city: p.length > 6 ? cleanOptionalValue(p[6]) || 'Montgomery County' : 'Montgomery County',
            lead_id: p.length > 7 ? cleanOptionalValue(p[7]) : null,
            lat: p.length > 8 ? parseFiniteNumber(p[8]) : null,
            lng: p.length > 9 ? parseFiniteNumber(p[9]) : null,
            website: p.length > 10 ? cleanOptionalValue(p[10]) : null,
            email: p.length > 11 ? cleanOptionalValue(p[11]) : null,
            phone: p.length > 12 ? cleanOptionalValue(p[12]) : null,
            trivia: p.length > 13 ? cleanOptionalValue(p[13]) : null,
            status: p.length > 14 ? cleanOptionalValue(p[14]) || 'active' : 'active',
            // NAICS code (e.g. "624410" or "611512"). Optional column added in
            // 2026-06-04 by scripts/augment_data.py. Records without a NAICS
            // fall through to text matching in the search code.
            naics: p.length > 15 ? cleanOptionalValue(p[15]) : null
        }
    })

    const pointIndexByLeadId: Record<string, number> = {}
    points.forEach((point, index) => {
        if (point.lead_id !== null && point.lead_id !== undefined && point.lead_id !== '') {
            pointIndexByLeadId[String(point.lead_id)] = index
        }
    })

    return { points, pointIndexByLeadId, positionsBuffer, clustersBuffer, invalidPositionIndices }
}

/**
 * Validate the shape of a decoded semantic-thread artifact. The artifact is
 * the relationship map keyed by lead id under `nodes`; `nodes` MUST be present
 * and a (possibly empty) object. A malformed (but valid-JSON) artifact would
 * otherwise yield an empty neighbor map and silently lose every relationship.
 */
function isValidThreadArtifact(bundle: unknown): boolean {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false
    const nodes = (bundle as Record<string, unknown>).nodes
    return nodes != null && typeof nodes === 'object' && !Array.isArray(nodes)
}

async function handleLoadThreads(
    { urls, attemptConfigs }: { urls: string[]; attemptConfigs: (string | AttemptConfig)[] },
    requestId: number
): Promise<LoadThreadsResult | null> {
    let bundle: unknown = null
    let loadedArtifactName: string | null = null
    let lastError: unknown = null

    outer: for (const url of urls) {
        if (requestId !== _activeRequestId) throw new Error('Request superseded by newer request')
        const artifactName = artifactNameFromUrl(url)
        for (const config of attemptConfigs) {
            try {
                const cacheMode = typeof config === 'string' ? config : (config as AttemptConfig)?.cache
                const response = await retryFetch(
                    url,
                    cacheMode ? { cache: cacheMode as RequestCache } : undefined,
                    2,
                    'load-threads'
                )
                if (requestId !== _activeRequestId) throw new Error('Request superseded by newer request')
                if (!response.ok) throw new Error(`Thread artifact unavailable (${response.status})`)
                const parsed = await response.json()
                // A malformed (but valid-JSON) ~40MB artifact would otherwise
                // yield an empty neighbor map and silently lose every
                // relationship. Validate the shape and, on failure, treat it
                // like a fetch error so the loop retries alternate sources
                // (and surfaces a clear ERROR if all are malformed) instead of
                // silently emitting an empty map.
                if (!isValidThreadArtifact(parsed)) {
                    throw new Error(`Thread artifact shape invalid (artifact=${artifactName})`)
                }
                bundle = parsed
                loadedArtifactName = artifactName
                break outer
            } catch (error) {
                // Supersede errors must propagate immediately — do not
                // swallow them as lastError (which would waste remaining
                // fetch attempts and surface a misleading error message).
                if (requestId !== _activeRequestId) throw error
                lastError = error
            }
        }
    }

    if (requestId !== _activeRequestId) throw new Error('Request superseded by newer request')
    if (!bundle) throw lastError || new Error('No thread artifacts could be loaded')

    // Transform node map to entries for Map reconstruction on main thread
    const neighborEntries: Array<[string, NeighborEntry]> = []
    const bundleObj = bundle as { nodes?: Record<string, unknown> }
    if (bundleObj.nodes && typeof bundleObj.nodes === 'object') {
        Object.entries(bundleObj.nodes).forEach(([fallbackLeadId, node]) => {
            const n = node as Record<string, unknown>
            const leadId = normalizeLeadId((n?.lead_id as string) ?? fallbackLeadId)
            if (!leadId) return

            const rawNeighbors = Array.isArray(n?.neighbors) ? (n.neighbors as Record<string, unknown>[]) : []
            const neighbors = rawNeighbors
                .map((neighbor) => ({
                    leadId: normalizeLeadId(neighbor?.lead_id as string) as string,
                    score: Number(neighbor?.score ?? 0),
                    semanticScore: Number(neighbor?.semantic_score ?? 0),
                    sameCity: Boolean(neighbor?.same_city),
                    sameStatus: Boolean(neighbor?.same_status),
                    bridgeScore: Number(neighbor?.bridge_score ?? 0),
                    signalScore: Number(neighbor?.signal_score ?? 0),
                    threadType: String(neighbor?.thread_type || '') || 'local_semantic_neighbor',
                    relationshipRole: String(neighbor?.relationship_role || ''),
                    relationshipAxis: String(neighbor?.relationship_axis || '') || '',
                    roleReason: String(neighbor?.role_reason || '') || '',
                    reason: String(neighbor?.reason || '') || 'semantic neighbor'
                }))
                .filter((neighbor) => neighbor.leadId)

            neighborEntries.push([
                leadId,
                {
                    leadId,
                    name: (n?.name as string) || null,
                    city: (n?.city as string) || null,
                    status: (n?.status as string) || null,
                    signalScore: Number(n?.signal_score ?? 0),
                    neighbors
                }
            ])
        })
    }

    return { neighborEntries, artifactName: loadedArtifactName, bundle }
}

// ── UTILS ───────────────────────────────────────────────────────────────────

const NULLISH_SENTINELS: ReadonlySet<string> = new Set(['unknown', 'not found', 'none', 'none detected', 'n/a', 'null'])

function cleanOptionalValue(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null
    const text = String(value).trim()
    if (!text || text === 'NULL' || NULLISH_SENTINELS.has(text.toLowerCase())) {
        return null
    }
    return text
}

function parseFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    return Number.isFinite(num) && String(num) === trimmed ? num : null
}

function normalizeLeadId(id: unknown): string | null {
    if (id === null || id === undefined) return null
    const s = String(id).trim()
    return s.length > 0 ? s : null
}

function artifactNameFromUrl(url: string): string {
    try {
        return new URL(url).pathname.split('/').pop() || url.split('?')[0] || url
    } catch {
        return url.split('?')[0] || url
    }
}

/**
 * Load and parse lead enrichment JSON.
 */
async function handleLoadLeadEnrichment(
    { url }: { url: string },
    requestId: number
): Promise<LoadLeadEnrichmentResult> {
    const response = await retryFetch(url, undefined, 2, 'load-enrichment')
    if (requestId !== _activeRequestId) return { enrichment: null }

    const text = await response.text()
    if (requestId !== _activeRequestId) return { enrichment: null }
    return { enrichment: parseEnrichmentJson(text) }
}

function parseEnrichmentJson(text: string): Record<string, LeadEnrichment> | null {
    try {
        const raw = JSON.parse(text) as unknown
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
        return raw as Record<string, LeadEnrichment>
    } catch {
        return null
    }
}
