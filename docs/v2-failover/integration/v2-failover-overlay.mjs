/**
 * ====================================================================
 * V2 Failover Overlay — Sprint-1/2/3 Integration
 * ====================================================================
 *
 * Self-contained JavaScript implementation of the V2 failover overlay
 * transpiled from TypeScript scaffold under docs/v2-failover/sprint-{1,2,3}/.
 *
 * How to wire into opencode-key-router.mjs (OPATH):
 *   1. import { v2FailoverDispatch, createV2Overlay } from './v2-failover-overlay.mjs'
 *   2. In your failover path (around line 3515 / 4050), before the V1 tryFailover call:
 *        const r = await v2FailoverDispatch(req)
 *        if (r.success) return r            // short-circuit: client gets response
 *   3. To configure with runtime data (recommended for production):
 *        const overlay = createV2Overlay({ modelMatrix, keySlotAcquire })
 *        const r = await overlay.dispatch(req)
 *
 * What's deferred to Phase-5B live activation:
 *   - Conditional gating behind a header flag (not yet wired into key-router)
 *   - Per-(carrier,model) affinity initialization from existing registry state
 *   - StreamQualityMeter per-tuple telemetry hooks for real chunks
 *   - KeyAffinityMap warm-start from existing activeKeyIndexes state
 *
 * Module scope: EXPOSES ONLY v2FailoverDispatch + createV2Overlay.
 * All internal modules are sealed as private functions/classes.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * TYPES (Sprint-1 types.ts — translated to JSDoc)
 * ────────────────────────────────────────────────────────────────────────── */

// CapabilityAxis      = 'vision' | 'toolUse' | 'code'
// RouterMatrixEntry   = { modelId, family, qualityPerCapability, canVision, canToolUse,
//                         canCode, contextWindowLimit, longContext, streamingSmooth,
//                         streamingSafe, toolExecutionReliability, preferredCarrierKey,
//                         multiCarrierRouteIds, degradedVariantOf }
// ForceModelValue     = 'original' | 'best'
// FailedAttempt       = { modelId, carrier, route, shape, error, attemptMs }
// CarrierShapeClass   = { shape, ...extra-fields-per-class }

const ALLOW_DEGRADED_DEFAULT = false
const TRANSIENT_COOLDOWN_DEFAULT_MS = 60_000
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 5_000
const PER_KEY_CONCURRENCY_CAP = 3
const ROLLING_WINDOW_SIZE = 64
const INTER_CHUNK_DELTA_P95_MS_THRESHOLD = 250
const LAST_CHUNK_LATENCY_MS_THRESHOLD = 1_500
const PERFORMANCE_DEGRADATION_CONSECUTIVE_THRESHOLD = 5

/* ──────────────────────────────────────────────────────────────────────────
 * UTILITIES
 * ────────────────────────────────────────────────────────────────────────── */

function truncateError(err, maxLen = 500) {
    if (err == null) return null
    return err.length <= maxLen ? String(err) : String(err).slice(0, maxLen)
}

function urlEncodeJson(obj) {
    return encodeURIComponent(JSON.stringify(obj))
}

function randomUUID() {
    return crypto.randomUUID()
}

/* ──────────────────────────────────────────────────────────────────────────
 * CIRCUIT BREAKER — two-realm registry (Sprint-1 breaker-registry.ts)
 * Gap #7 (realm-A per-key transient + realm-B per-carrier-model permanent)
 * Gap #14 (mutex single-flight atomicity)
 * ────────────────────────────────────────────────────────────────────────── */

class CircuitBreaker {
    constructor() {
        this.perKey = new Map()
        this.perCarrierModel = new Map()
        this.currentLockHolders = new Map()
        this.lockWaiters = new Map()
    }

    async acquireBreakerLock(carrier, model) {
        const lockKey = `${carrier}|${model}`
        if (this.currentLockHolders.has(lockKey)) return null
        let released = false
        const mapRef = this.currentLockHolders
        const handle = {
            release() {
                if (!released) {
                    released = true
                    mapRef.delete(lockKey)
                }
            }
        }
        this.currentLockHolders.set(lockKey, handle)
        return handle
    }

    isCarrierModelBroken(carrier, model) {
        return this.perCarrierModel.has(`${carrier}|${model}`)
    }

    peekTransientCooldown(key) {
        const entry = this.perKey.get(key)
        if (!entry) return null
        const remaining = entry.cooldownUntilMs - Date.now()
        if (remaining <= 0) {
            this.perKey.delete(key)
            return null
        }
        return remaining
    }

    async tripPermanentBreaker(carrier, model, shape, reason) {
        this.perCarrierModel.set(`${carrier}|${model}`, {
            breakerTrippedAtMs: Date.now(),
            shape,
            reason
        })
    }

    async markTransientCooldown(carrier, key, reason, ttlMs = TRANSIENT_COOLDOWN_DEFAULT_MS) {
        this.perKey.set(key, { cooldownUntilMs: Date.now() + ttlMs, reason })
    }

    async clearCarrierModel(carrier, model) {
        this.perCarrierModel.delete(`${carrier}|${model}`)
    }
}

const breaker = new CircuitBreaker()

/* ──────────────────────────────────────────────────────────────────────────
 * CARRIER ERROR SHAPE SNIFFER (Sprint-1 carrier-error-sniffer.ts)
 * 7 shape recognizers mapped to gateway-specific matchers
 * ────────────────────────────────────────────────────────────────────────── */

function carrierErrorShapeSniffer(resp, modelId, carrierKey) {
    if (resp.errorMessage === 'Connection error.') {
        return { shape: 'transient_unknown_connection', carrier: carrierKey, modelId }
    }
    if (resp.status === 404 && (!resp.body || !String(resp.body).trim())) {
        return { shape: 'permanent_unknown_id', statusCode: 404, body: undefined, carrier: carrierKey, modelId }
    }
    if (resp.status === 401 && resp.body) {
        const text = String(resp.body)
        if (text.includes('CreditsError') || text.includes('No payment method')) {
            const m = text.match(/https?:\/\/[^\s"]+/)
            return {
                shape: 'permanent_no_payment_method',
                statusCode: 401,
                billingUrl: m ? m[0] : null,
                carrier: carrierKey,
                modelId
            }
        }
    }
    if (resp.status === 402 && resp.body) {
        const text = String(resp.body)
        if (text.includes('Paid Model') && text.includes('Credits Required')) {
            try {
                const obj = JSON.parse(text)
                if (typeof obj.balance === 'number' && typeof obj.buyCreditsUrl === 'string') {
                    return {
                        shape: 'permanent_credit_balance_exhausted',
                        statusCode: 402,
                        balance: obj.balance,
                        buyCreditsUrl: obj.buyCreditsUrl,
                        carrier: carrierKey,
                        modelId
                    }
                }
            } catch {
                const balMatch = text.match(/"balance"\s*:\s*([-\d.eE]+)/)
                const buyMatch = text.match(/"buyCreditsUrl"\s*:\s*"([^"]+)"/)
                return {
                    shape: 'permanent_credit_balance_exhausted',
                    statusCode: 402,
                    balance: balMatch ? Number(balMatch[1]) : NaN,
                    buyCreditsUrl: buyMatch ? buyMatch[1] : '',
                    carrier: carrierKey,
                    modelId
                }
            }
        }
    }
    if (resp.status === 502) {
        const h = `${resp.body ?? ''} ${resp.errorMessage ?? ''}`
        if (h.includes('Upstream stream failed before output')) {
            return {
                shape: 'transient_upstream_stream_failed_before_output',
                statusCode: 502,
                willRetry: true,
                carrier: carrierKey,
                modelId
            }
        }
    }
    if (resp.status === 404 && resp.body) {
        const text = String(resp.body)
        if (text.includes('unavailable for free') && text.includes('slug instead')) {
            const sm = text.match(/slug instead:\s*([^"\s]+)/)
            if (sm && sm[1]) {
                return {
                    shape: 'permanent_404_unavailable_for_free_with_paid_redirect',
                    statusCode: 404,
                    slugHint: sm[1],
                    carrier: carrierKey,
                    modelId
                }
            }
        }
    }
    if (resp.body || resp.errorMessage) {
        const h = `${resp.body ?? ''} ${resp.errorMessage ?? ''}`
        if (h.includes('Unsupported external subagent model')) {
            return { shape: 'dispatcher_unsupported_model_prefix', carrier: carrierKey, modelId }
        }
    }
    return null
}

/* ──────────────────────────────────────────────────────────────────────────
 * EXTENDED CARRIER MATCHERS (Sprint-3 carrier-matchers-extended.ts)
 * kilo, openrouter, neuralwatt, poolside route-specific shapes
 * ────────────────────────────────────────────────────────────────────────── */

function sniffExtended(routeId, modelId, bodyJson, statusCode) {
    if (!bodyJson || typeof bodyJson !== 'object') return null
    if (typeof routeId === 'string') {
        if (routeId.startsWith('router-kilo')) {
            if (
                bodyJson.balance < 0 &&
                bodyJson.buyCreditsUrl &&
                typeof bodyJson.title === 'string' &&
                /Paid Model - Credits Required/i.test(bodyJson.title)
            ) {
                return {
                    shape: 'permanent_credit_balance_exhausted',
                    statusCode,
                    balance: bodyJson.balance,
                    buyCreditsUrl: bodyJson.buyCreditsUrl,
                    routeId,
                    modelId
                }
            }
        }
        if (routeId.startsWith('router-openrouter')) {
            const codeVal = bodyJson.code ?? bodyJson.error?.code
            if (statusCode === 402 && (codeVal === 402 || codeVal === '402')) {
                const msg = bodyJson.message ?? bodyJson.error?.message ?? ''
                if (typeof msg === 'string' && msg) {
                    return { shape: 'permanent_insufficient_credits', statusCode: 402, message: msg, routeId, modelId }
                }
            }
        }
        if (routeId.startsWith('router-neuralwatt')) {
            if (
                bodyJson.type === 'insufficient_credits' &&
                (bodyJson.code === 'credit_balance_exhausted' || bodyJson.code === 402)
            ) {
                return {
                    shape: 'permanent_credit_balance_exhausted',
                    statusCode: 402,
                    balance: bodyJson.balance ?? 0,
                    buyCreditsUrl: bodyJson.buyCreditsUrl ?? '',
                    routeId,
                    modelId
                }
            }
        }
        if (routeId.startsWith('router-poolside') || routeId.includes('poolside')) {
            if (
                bodyJson.code === 429 &&
                bodyJson.metadata &&
                bodyJson.metadata.provider_name === 'Poolside' &&
                typeof bodyJson.metadata.raw === 'string' &&
                /rate-limited upstream/i.test(bodyJson.metadata.raw)
            ) {
                return {
                    shape: 'transient_upstream_rate_limit',
                    statusCode: 429,
                    rawHint: bodyJson.metadata.raw,
                    providerName: bodyJson.metadata.provider_name,
                    isByok: !!bodyJson.metadata.is_byok,
                    routeId,
                    modelId
                }
            }
        }
    }
    return null
}

/* ──────────────────────────────────────────────────────────────────────────
 * TELEMETRY — JSONL append (Sprint-1 telemetry-jsonl.ts)
 * ────────────────────────────────────────────────────────────────────────── */

async function writeTelemetryLine(telemetryDir, line) {
    const fs = await import('node:fs')
    const pathMod = await import('node:path')

    function pad2(n) {
        return String(n).padStart(2, '0')
    }
    const y = line.utcDate.getUTCFullYear()
    const m = pad2(line.utcDate.getUTCMonth() + 1)
    const d = pad2(line.utcDate.getUTCDate())
    const bucket = `${y}-${m}-${d}`
    const dir = pathMod.default.resolve(telemetryDir)
    await fs.promises.mkdir(dir, { recursive: true })
    const filePath = pathMod.default.join(dir, `${bucket}.jsonl`)
    const safeLine = { ...line, error: truncateError(line.error, 500) }
    await fs.promises.appendFile(filePath, JSON.stringify(safeLine) + '\n', 'utf8')
}

/* ──────────────────────────────────────────────────────────────────────────
 * BARRIER FILTER (Sprint-2 barrier-filter.ts)
 * ────────────────────────────────────────────────────────────────────────── */

function parseForceModelValue(headers) {
    const raw = headers.get('x-router-force-model')
    if (raw === null) return undefined
    if (raw === 'original') return 'original'
    if (raw === 'best') return 'best'
    return undefined
}

function isAllowingDegradedVariants(headers) {
    const raw = headers.get('x-router-allow-degraded-variants')
    if (raw === null) return ALLOW_DEGRADED_DEFAULT
    if (raw === 'true') return true
    return false
}

function filterDegradedVariants(matrix, allowDegraded) {
    return matrix.filter((e) => {
        if (e.degradedVariantOf === undefined || e.degradedVariantOf == null) return true
        return allowDegraded === true
    })
}

function applyForcePin(forceModel, requestedModelId, candidates) {
    if (forceModel === undefined || forceModel === 'best') return candidates
    // forceModel === 'original'
    return candidates.filter((d) => d.modelId === requestedModelId)
}

/* ──────────────────────────────────────────────────────────────────────────
 * CAPABILITY GATE (Sprint-2 capability-gate.ts)
 * ────────────────────────────────────────────────────────────────────────── */

function hasCapabilityForAxis(entry, capAxis) {
    switch (capAxis) {
        case 'vision':
            return entry.canVision === true
        case 'toolUse':
            return entry.canToolUse === true && entry.toolExecutionReliability !== 'LOW'
        case 'code':
            return entry.canCode === true
        default:
            return false
    }
}

function filterByCapability(matrix, capAxis) {
    return matrix.filter((e) => hasCapabilityForAxis(e, capAxis))
}

function filterByContextWindow(matrix, requestContextWindow) {
    return matrix.filter((e) => {
        const limit = e.contextWindowLimit
        if (limit == null || limit === 0) return false
        return limit >= requestContextWindow
    })
}

function buildCapabilityUnsatisfiedHeader(matrix, capAxis) {
    const dropped = []
    for (const entry of matrix) {
        if (!hasCapabilityForAxis(entry, capAxis)) {
            const routeId = entry.preferredCarrierKey ?? entry.modelId
            let reason
            switch (capAxis) {
                case 'vision':
                    reason = 'canVision is false'
                    break
                case 'toolUse':
                    reason = entry.canToolUse
                        ? `toolExecutionReliability is ${entry.toolExecutionReliability}`
                        : 'canToolUse is false'
                    break
                case 'code':
                    reason = 'canCode is false'
                    break
                default:
                    reason = 'capability not supported'
            }
            dropped.push({ routeId, modelId: entry.modelId, reason })
        }
    }
    const payload = { axis: capAxis, dropped, attemptTs: new Date().toISOString() }
    return urlEncodeJson(payload)
}

/* ──────────────────────────────────────────────────────────────────────────
 * DESCENT LADDER (Sprint-2 descent-ladder.ts)
 * T0 → T1 → T2 → T3 → T4 tier composition
 * ────────────────────────────────────────────────────────────────────────── */

function qualityNow(modelId, matrix, capAxis) {
    const entry = matrix.find((e) => e.modelId === modelId)
    if (!entry) return 0
    return (entry.qualityPerCapability && entry.qualityPerCapability[capAxis]) ?? 0
}

function primaryRouteIdForModel(matrix, modelId, capAxis) {
    const capMatch = matrix.find((e) => e.modelId === modelId && hasCapabilityForAxis(e, capAxis))
    if (capMatch) return capMatch.preferredCarrierKey ?? capMatch.multiCarrierRouteIds?.[0]
    const anyMatch = matrix.find((e) => e.modelId === modelId)
    if (anyMatch) return anyMatch.preferredCarrierKey ?? anyMatch.multiCarrierRouteIds?.[0]
    return undefined
}

function multiCarrierRouteIds(matrix, modelId) {
    const routes = new Set()
    for (const e of matrix) {
        if (e.modelId === modelId && Array.isArray(e.multiCarrierRouteIds)) {
            for (const r of e.multiCarrierRouteIds) routes.add(r)
        }
    }
    return Array.from(routes)
}

function equivalentQualityBank(matrix, modelId, capAxis) {
    const baseQuality = qualityNow(modelId, matrix, capAxis)
    return matrix.filter(
        (e) => e.modelId !== modelId && Math.abs((e.qualityPerCapability?.[capAxis] ?? 0) - baseQuality) <= 5
    )
}

function bandDropBelow(matrix, baseQuality, capAxis) {
    return matrix.filter((e) => {
        const q = e.qualityPerCapability?.[capAxis] ?? 0
        return q >= baseQuality - 15 && q < baseQuality - 5
    })
}

function sortByQualityDesc(entries, capAxis) {
    return [...entries].sort(
        (a, b) => (b.qualityPerCapability?.[capAxis] ?? 0) - (a.qualityPerCapability?.[capAxis] ?? 0)
    )
}

function composeDescentChain(matrix, mId, capAxis, forcePin, allowDv) {
    let chain = []

    // T0: primary route for requested model
    const pr = primaryRouteIdForModel(matrix, mId, capAxis)
    if (pr) {
        chain.push({
            modelId: mId,
            routeId: pr,
            qualityScore: qualityNow(mId, matrix, capAxis),
            isPrimaryRoute: true,
            tier: 0
        })
    } else {
        // Fallback: any route for the model
        const fr = multiCarrierRouteIds(matrix, mId)
        if (fr.length > 0) chain.push({ modelId: mId, routeId: fr[0], qualityScore: 0, isPrimaryRoute: true, tier: 0 })
    }

    // T1: same model, other carriers
    const primary = chain.length > 0 ? chain[0].routeId : null
    const t1routes = multiCarrierRouteIds(matrix, mId)
    const qs = qualityNow(mId, matrix, capAxis)
    for (const r of t1routes) {
        if (r === primary) continue
        chain.push({ modelId: mId, routeId: r, qualityScore: qs, isPrimaryRoute: false, tier: 1 })
    }

    // T2-T4: vertical descent (unless force-pin)
    if (!forcePin) {
        const bank = sortByQualityDesc(equivalentQualityBank(matrix, mId, capAxis), capAxis)
        for (const entry of bank) {
            const routes = multiCarrierRouteIds(matrix, entry.modelId)
            for (const r of routes) {
                chain.push({
                    modelId: entry.modelId,
                    routeId: r,
                    qualityScore: entry.qualityPerCapability?.[capAxis] ?? 0,
                    isPrimaryRoute: false,
                    tier: 2
                })
            }
        }

        // T3: one-band drop
        const baseQ = qualityNow(mId, matrix, capAxis)
        const drop1 = bandDropBelow(matrix, baseQ, capAxis)
        for (const entry of sortByQualityDesc(drop1, capAxis)) {
            const routes = multiCarrierRouteIds(matrix, entry.modelId)
            for (const r of routes) {
                chain.push({
                    modelId: entry.modelId,
                    routeId: r,
                    qualityScore: entry.qualityPerCapability?.[capAxis] ?? 0,
                    isPrimaryRoute: false,
                    tier: 3
                })
            }
        }

        // T4: two-band drop
        const drop2 = matrix.filter((e) => {
            const q = e.qualityPerCapability?.[capAxis] ?? 0
            return q >= baseQ - 25 && q < baseQ - 15
        })
        for (const entry of sortByQualityDesc(drop2, capAxis)) {
            const routes = multiCarrierRouteIds(matrix, entry.modelId)
            for (const r of routes) {
                chain.push({
                    modelId: entry.modelId,
                    routeId: r,
                    qualityScore: entry.qualityPerCapability?.[capAxis] ?? 0,
                    isPrimaryRoute: false,
                    tier: 4
                })
            }
        }
    }

    // Post-filter: degraded variants + capability gate
    chain = chain.filter((c) => {
        const entry = matrix.find((e) => e.modelId === c.modelId)
        if (!entry) return false
        if (!allowDv && entry.degradedVariantOf != null && entry.degradedVariantOf !== '') return false
        if (!hasCapabilityForAxis(entry, capAxis)) return false
        return true
    })

    return chain
}

/* ──────────────────────────────────────────────────────────────────────────
 * FIRST-BYTE TIMEOUT DISPATCHER (Sprint-2 first-byte-timeout.ts)
 * ────────────────────────────────────────────────────────────────────────── */

function classifyResponseForSniffer(statusCode, body, errorMessage) {
    if (statusCode >= 200 && statusCode < 300) return null // success
    return { status: statusCode, body: body ?? '', errorMessage }
}

async function postWithFirstByteTimeout(url, opts) {
    const { firstByteTimeoutMs, externalAbortSignal, ...fetchInit } = opts
    const timeoutMs = firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS
    const start = Date.now()
    const ac = new AbortController()
    const tid = setTimeout(() => ac.abort(), timeoutMs)

    try {
        const resp = await fetch(url, { signal: ac.signal, ...fetchInit })
        clearTimeout(tid)
        // Drain body to string for shape sniffing
        let body
        try {
            body = await resp.text()
        } catch {
            body = ''
        }
        return { status: resp.status, statusText: resp.statusText, body, waitMs: Date.now() - start }
    } catch (err) {
        clearTimeout(tid)
        const waited = Date.now() - start
        return {
            status: 0,
            statusText: '',
            body: '',
            error: err instanceof Error ? err : new Error(String(err)),
            waitMs: waited
        }
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 * KEY SLOT ACQUIRE (Sprint-2 per-key-acquire.ts)
 * ────────────────────────────────────────────────────────────────────────── */

const perKeySlots = new Map()
const breakerChains = new Map()

async function withBreakerLock(region, fn) {
    const prev = breakerChains.get(region) ?? Promise.resolve()
    const next = prev.then(
        () => fn(),
        () => fn()
    )
    breakerChains.set(region, next)
    try {
        return await next
    } finally {
        if (breakerChains.get(region) === next) breakerChains.delete(region)
    }
}

function ensureSet(k) {
    let s = perKeySlots.get(k)
    if (!s) {
        s = new Set()
        perKeySlots.set(k, s)
    }
    return s
}

export async function keySlotAcquire(carrierKey, routeId) {
    return withBreakerLock('per-key-acquire', async () => {
        const set = ensureSet(carrierKey)
        if (set.size >= PER_KEY_CONCURRENCY_CAP) {
            throw new Error(`Key concurrency cap reached for "${carrierKey}" (${set.size}/${PER_KEY_CONCURRENCY_CAP})`)
        }
        set.add(routeId)
        return {
            carrierKey,
            routeId,
            acquiredAt: Date.now(),
            release: async () => {
                const s = perKeySlots.get(carrierKey)
                if (s) {
                    s.delete(routeId)
                    if (s.size === 0) perKeySlots.delete(carrierKey)
                }
            }
        }
    })
}

/* ──────────────────────────────────────────────────────────────────────────
 * STREAM QUALITY METER (Sprint-3 stream-quality-meter.ts)
 * Rolling P95 deltas via ring buffer
 * ────────────────────────────────────────────────────────────────────────── */

function computeP95(samples) {
    if (samples.length === 0) return 0
    const sorted = [...samples].sort((a, b) => a - b)
    const n = sorted.length
    const idx = Math.max(0, Math.min(n - 1, Math.ceil(0.95 * n) - 1))
    return sorted[idx]
}

class StreamQualityMeter {
    constructor(windowSize = ROLLING_WINDOW_SIZE) {
        this.windowSize = windowSize
        this.deltas = new Array(windowSize).fill(0)
        this.head = 0
        this.count = 0
        this.previousTimestamp = undefined
        this.firstChunkTimestamp = undefined
        this.lastChunkLatencyMs = 0
        this.consecutiveDegraded = 0
    }

    observe(ts) {
        if (this.previousTimestamp === undefined) {
            this.firstChunkTimestamp = ts
        } else {
            const delta = ts - this.previousTimestamp
            this.deltas[this.head] = delta
            this.head = (this.head + 1) % this.windowSize
            if (this.count < this.windowSize) this.count++
        }
        this.previousTimestamp = ts
    }

    observeEnd(ts) {
        this.lastChunkLatencyMs = this.firstChunkTimestamp != null ? ts - this.firstChunkTimestamp : 0
    }

    snapshot() {
        const samples = []
        for (let i = 0; i < this.count; i++) {
            const ringIdx = (this.head - this.count + i + this.windowSize) % this.windowSize
            samples.push(this.deltas[ringIdx])
        }
        const p95 = computeP95(samples)
        const smooth = !(
            p95 > INTER_CHUNK_DELTA_P95_MS_THRESHOLD && this.lastChunkLatencyMs > LAST_CHUNK_LATENCY_MS_THRESHOLD
        )
        return {
            interChunkDeltaP95Ms: p95,
            lastChunkLatencyMs: this.lastChunkLatencyMs,
            sampleCount: this.count,
            streamingSmooth: smooth
        }
    }

    recordDispatchEnd(streamingSmooth) {
        if (streamingSmooth) {
            this.consecutiveDegraded = 0
        } else {
            this.consecutiveDegraded++
        }
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 * KEY AFFINITY MAP (Sprint-3 key-affinity-map.ts)
 * ────────────────────────────────────────────────────────────────────────── */

class KeyAffinityMap {
    constructor() {
        this.store = new Map()
    }

    _k(routeId, modelId) {
        return `${routeId}\0${modelId}`
    }

    getPreferredKeySequence(routeId, modelId) {
        const list = this.store.get(this._k(routeId, modelId))
        return list ? list.slice() : []
    }

    recordSuccess(routeId, modelId, keyId) {
        const k = this._k(routeId, modelId)
        let list = this.store.get(k)
        if (!list) {
            list = []
            this.store.set(k, list)
        }
        let rec = list.find((r) => r.keyId === keyId)
        if (!rec) {
            rec = { keyId, lastUsedAt: Date.now(), recentSuccessCount: 0 }
            list.unshift(rec)
        } else {
            rec.recentSuccessCount += 1
            rec.lastUsedAt = Date.now()
        }
        list.sort((a, b) => b.recentSuccessCount - a.recentSuccessCount || b.lastUsedAt - a.lastUsedAt)
        this.store.set(k, list)
    }

    recordTransientFailure(routeId, modelId, keyId, registry, reason) {
        const k = this._k(routeId, modelId)
        let list = this.store.get(k)
        if (!list) {
            list = []
            this.store.set(k, list)
        }
        let rec = list.find((r) => r.keyId === keyId)
        if (!rec) {
            rec = { keyId, lastUsedAt: Date.now(), recentSuccessCount: 0 }
            list.push(rec)
        } else {
            rec.recentSuccessCount = Math.max(0, rec.recentSuccessCount - 1)
            rec.lastUsedAt = Date.now()
            const idx = list.indexOf(rec)
            if (idx >= 0) list.splice(idx, 1)
            list.push(rec)
        }
        registry.coolDownKey(routeId, keyId, reason, TRANSIENT_COOLDOWN_DEFAULT_MS)
        this.store.set(k, list)
    }

    clearForRouteModel(routeId, modelId) {
        this.store.delete(this._k(routeId, modelId))
    }
    size() {
        return this.store.size
    }
}

class InMemoryKeyCooldownRegistry {
    constructor() {
        this.store = new Map()
    }

    _rk(routeId, keyId) {
        return `${routeId}\0${keyId}`
    }

    coolDownKey(routeId, keyId, reason, ttlMs) {
        this.store.set(this._rk(routeId, keyId), { expiresAt: Date.now() + ttlMs, reason })
    }

    remainingCooldownMs(routeId, keyId) {
        const e = this.store.get(this._rk(routeId, keyId))
        if (!e) return 0
        return Math.max(0, e.expiresAt - Date.now())
    }

    isCoolingDown(routeId, keyId) {
        return this.remainingCooldownMs(routeId, keyId) > 0
    }

    releaseKey(routeId, keyId) {
        this.store.delete(this._rk(routeId, keyId))
    }

    clearForRoute(routeId) {
        const prefix = `${routeId}\0`
        for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k)
    }

    activeCooldownCount() {
        const now = Date.now()
        let count = 0
        for (const e of this.store.values()) if (e.expiresAt > now) count++
        return count
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 * X-ROUTER DIAGNOSTIC HEADER BUILDER (Sprint-3 x-router-diagnostic-header.ts)
 * ────────────────────────────────────────────────────────────────────────── */

function classifyStatusClass(shape, statusCode) {
    if (shape) return shape.shape
    if (statusCode === 0) return 'no_response'
    if (statusCode >= 200 && statusCode <= 299) return 'ok'
    if (statusCode >= 301 && statusCode <= 308) return 'redirect'
    if (statusCode === 429) return 'transient_rate_limited'
    if (statusCode >= 500 && statusCode <= 599) return 'transient_server_error'
    if ([401, 402, 404, 422].includes(statusCode)) return 'permanent'
    return 'unknown'
}

function buildDiagnosticHeader(failedAttempts, selectedIndex, forcedPin, capabilityAxis, totalLatencyMs) {
    const payload = {
        attemptedChains: failedAttempts,
        selectedIndex,
        forcedPin,
        capabilityAxis,
        totalLatencyMs,
        detectedAtGmt: Date.now()
    }
    return { name: 'X-Router-Diagnostic', value: urlEncodeJson(payload) }
}

function appendHeader(headers, attempt, selectedIndex, forcedPin, capabilityAxis, totalLatencyMs) {
    const built = buildDiagnosticHeader(attempt, selectedIndex, forcedPin, capabilityAxis, totalLatencyMs)
    return { ...headers, [built.name]: built.value }
}

/* ════════════════════════════════════════════════════════════════════════════
 * MAIN DISPATCH ENTRY POINT
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Build diagnostics response for complete failure (all candidates exhausted).
 */
function buildFailureResponse(attempted, forceModel, capAxis, matrix, hasAttempts, totalLatencyMs) {
    const forcedPin = forceModel === 'original'
    const selectedIndex = undefined

    if (!hasAttempts) {
        // No candidates at all — probably failed capability gate entirely
        const diag = buildDiagnosticHeader([], selectedIndex, forcedPin, capAxis, totalLatencyMs)
        const headers = {
            [diag.name]: diag.value,
            'X-Router-Failover-Applied': 'false',
            'X-Router-Force-Model': forceModel || 'default',
            'X-Router-Allow-Degraded-Variants': String(ALLOW_DEGRADED_DEFAULT)
        }
        return {
            status: 503,
            headers,
            body: JSON.stringify({ error: 'No failover candidates found for this request', attempts: [] }),
            success: false
        }
    }

    const diag = buildDiagnosticHeader(attempted, selectedIndex, forcedPin, capAxis, totalLatencyMs)
    const capsatHeader = buildCapabilityUnsatisfiedHeader(matrix, capAxis)
    const headers = {
        ...diag,
        ...appendHeader({}, attempted, selectedIndex, forcedPin, capAxis, totalLatencyMs),
        'X-Router-Failover-Applied': 'false',
        'X-Router-Force-Model': forceModel || 'default',
        'X-Router-Allow-Degraded-Variants': String(ALLOW_DEGRADED_DEFAULT),
        'X-Router-Capability-Unsatisfied': capsatHeader
    }
    // Flatten duplicate X-Router-Diagnostic
    delete headers['X-Router-Diagnostic']

    const built = appendHeader({}, attempted, selectedIndex, forcedPin, capAxis, totalLatencyMs)
    headers[built.name] = built.value

    return {
        status: 503,
        headers,
        body: JSON.stringify({
            error: 'All failover candidates exhausted',
            attempted,
            capabilityUnsatisfied: capAxis
        }),
        success: false
    }
}

/**
 * Main entry point — the dispatch handler for V2 failover.
 *
 * @param {{ headers: Headers, body: Record<string, unknown>, model: string }} req
 *   - req.headers: Fetch-standard Headers instance
 *   - req.body: Request body as parsed JSON object
 *   - req.model: The requested model id (e.g., "laguna-s-2.1:free")
 * @param {{
 *   modelMatrix: RouterMatrixEntry[],
 *   capabilityAxis: CapabilityAxis,
 *   fetchUpstream: (url: string, init: RequestInit) => Promise<{status:number,body:string,error?:Error,waitMs:number}>,
 *   apiEndpointUrl?: string,               // fallback URL for fetchUpstream
 *   keySlotAcquireFn?: (carrierKey, routeId) => Promise<{release():Promise<void>}>,
 *   telemetryDir?: string,                 // ~/.pi/agent/telemetry
 *   preferredKeysFn?: () => Record<string,string[]>  // optional V1 state bridge
 * }} ctx
 *   - modelMatrix: Complete router-capability matrix
 *   - capabilityAxis: Desired capability ('vision'|'toolUse'|'code')
 *   - fetchUpstream: Function to call the API for one candidate
 *   - apiEndpointUrl: Base URL to use when fetchUpstream is not provided
 *   - keySlotAcquireFn: Optional per-key slot acquire from V1
 *   - telemetryDir: Directory for JSONL telemetry output
 *   - preferredKeysFn: Optional callback to bridge V1 preferred-key state
 * @returns {Promise<{
 *   success: boolean,
 *   status: number,
 *   headers: Record<string, string>,
 *   body: string,
 *   selectedCandidate?: { modelId, routeId, tier }
 * }>}
 */
export async function v2FailoverDispatch(req, ctx) {
    /* Initialize defaults in-context */
    const modelMatrix = ctx?.modelMatrix ?? []
    const capAxis = ctx?.capabilityAxis ?? 'toolUse'
    const apiEndpointUrl = ctx?.apiEndpointUrl ?? '/opencode-zen/v1/chat/completions'
    const telemetryDir = ctx?.telemetryDir ?? '~/.pi/agent/telemetry'
    const ksAcquire = ctx?.keySlotAcquireFn

    const headers = req.headers
    const reqBody = req.body
    const mId = req.model

    /* Parse force-pin & degraded header from request */
    const forceModel = parseForceModelValue(headers)
    const allowDegraded = isAllowingDegradedVariants(headers)
    const forcePin = forceModel === 'original'

    /* Compose descent chain: T0 → T1 → T2 → T3 → T4 */
    let chain = composeDescentChain(modelMatrix, mId, capAxis, forcePin, allowDegraded)

    if (chain.length === 0) {
        /* No candidates at all — capability gate eliminated everything */
        const failed = []
        const totalLatency = 0
        return buildFailureResponse(failed, forceModel, capAxis, modelMatrix, false, totalLatency)
    }

    /* State */
    const affinity = new KeyAffinityMap()
    const meter = new StreamQualityMeter(ROLLING_WINDOW_SIZE)
    const registry = new InMemoryKeyCooldownRegistry()
    const attempts = []
    let selectedIndex = undefined
    let succeeded = false
    const startTime = Date.now()

    /* Dispatch through each candidate */
    for (let i = 0; i < chain.length; i++) {
        const cand = chain[i]
        const key = `${cand.routeId}|${cand.modelId}`

        /* Check permanent breaker (realm B) — skip if tripped */
        if (breaker.isCarrierModelBroken(cand.routeId, cand.modelId)) continue

        /* Check transient cooldown (realm A) */
        if (breaker.peekTransientCooldown(key) > 0) continue

        const attemptStartTime = Date.now()
        let routeId = cand.routeId
        let modelId = cand.modelId
        let shapeClass = null
        let errorStr = null
        let respStatus = 0
        let respBody = ''
        let attemptOk = false
        let tokens = { input: 0, output: 0, reasoning: 0, totalTokens: 0 }
        let costUsd = 0
        let wallMs = 0

        try {
            /* Build request for upstream */
            const fetchBody = JSON.stringify({
                ...(reqBody ?? {}),
                model: modelId
            })

            /* Fetch with first-byte timeout */
            const url = `${apiEndpointUrl}`
            const fetchResult = await postWithFirstByteTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(req.headers instanceof Headers ? Object.fromEntries(req.headers.entries()) : {})
                },
                body: fetchBody,
                firstByteTimeoutMs: DEFAULT_FIRST_BYTE_TIMEOUT_MS
            })

            wallMs = fetchResult.waitMs
            respStatus = fetchResult.status
            respBody = fetchResult.body ?? ''

            if (fetchResult.error) {
                /* Network error / timeout — classify & skip to next candidate */
                wallMs = fetchResult.waitMs
                errorStr = fetchResult.error.message

                const snifferResp = { errorMessage: errorStr, status: 0, body: '' }
                shapeClass = carrierErrorShapeSniffer(snifferResp, modelId, routeId)

                attempts.push({
                    modelId,
                    carrier: routeId,
                    route: routeId,
                    shape: shapeClass ? shapeClass.shape : null,
                    error: truncateError(errorStr),
                    attemptMs: wallMs
                })

                /* Route transient failures to cooldown */
                const lockHandle = await breaker.acquireBreakerLock(routeId, modelId)
                if (lockHandle) {
                    await breaker.markTransientCooldown(routeId, key, 'network_error')
                    affinity.recordTransientFailure(routeId, modelId, routeId, registry, 'network_error')
                    lockHandle.release()
                }

                continue /* <-- critical: advance to next candidate */
            } else if (respStatus < 200 || respStatus >= 300) {
                /* HTTP error status */
                let bodyJson = null
                try {
                    bodyJson = JSON.parse(respBody)
                } catch {
                    /* keep null */
                }
                const snifferResp = classifyResponseForSniffer(respStatus, respBody, '')

                /* Try extended matchers first (Sprint-3 carrier-matchers) */
                if (bodyJson) {
                    const ext = sniffExtended(routeId, modelId, bodyJson, respStatus)
                    if (ext) shapeClass = ext
                }

                /* Fall back to generic sniffer */
                if (!shapeClass) {
                    shapeClass = carrierErrorShapeSniffer(snifferResp, modelId, routeId)
                }

                errorStr = `HTTP ${respStatus}: ${respBody.substring(0, 500)}`

                /* Classify realm for circuit-breaker routing */
                const isTransient =
                    shapeClass &&
                    (shapeClass.shape === 'transient_unknown_connection' ||
                        shapeClass.shape === 'transient_upstream_stream_failed_before_output' ||
                        shapeClass.shape === 'transient_upstream_rate_limit')
                const isPermanent = !isTransient && shapeClass != null

                if (slotHandle) await slotHandle.release()

                /* Build failed attempt record */
                attempts.push({
                    modelId,
                    carrier: routeId,
                    route: routeId,
                    shape: shapeClass ? shapeClass.shape : null,
                    error: truncateError(errorStr),
                    attemptMs: wallMs
                })

                /* Route to breaker realms */
                if (isTransient) {
                    const lockHandle = await breaker.acquireBreakerLock(routeId, modelId)
                    if (lockHandle) {
                        await breaker.markTransientCooldown(routeId, key, shapeClass.shape || 'network_error')
                        affinity.recordTransientFailure(
                            routeId,
                            modelId,
                            routeId,
                            registry,
                            shapeClass.shape || 'network_error'
                        )
                        lockHandle.release()
                    }
                } else if (isPermanent) {
                    const lockHandle = await breaker.acquireBreakerLock(routeId, modelId)
                    if (lockHandle) {
                        await breaker.tripPermanentBreaker(routeId, modelId, shapeClass.shape || 'permanent', errorStr)
                        lockHandle.release()
                    }
                }

                /* Continue to next candidate */
                continue
            } else {
                /* Success path */
                attemptOk = true
                selectedCandidate = { modelId, routeId, tier: cand.tier }

                /* Parse usage from response */
                try {
                    const jsonResp = JSON.parse(respBody)
                    tokens.input = jsonResp.usage?.prompt_tokens ?? 0
                    tokens.output = jsonResp.usage?.completion_tokens ?? 0
                    tokens.reasoning = jsonResp.usage?.reasoning_tokens ?? 0
                    tokens.totalTokens = jsonResp.usage?.total_tokens ?? tokens.input + tokens.output
                } catch {
                    /* best effort parsing */
                }

                if (slotHandle) await slotHandle.release()

                /* Record in affinity + meter */
                affinity.recordSuccess(routeId, modelId, routeId)
                meter.observe(attemptStartTime)
                const snap = meter.snapshot()
                meter.recordDispatchEnd(snap.streamingSmooth)

                /* Build attempt record (for telemetry only) */
                attempts.push({
                    modelId,
                    carrier: routeId,
                    route: routeId,
                    shape: null,
                    error: null,
                    attemptMs: wallMs
                })

                /* Write telemetry line */
                try {
                    await writeTelemetryLine(telemetryDir, {
                        uuid: crypto.randomUUID(),
                        utcTimestamp: new Date().toISOString(),
                        attemptedModelId: modelId,
                        attemptedCarrier: routeId,
                        attemptedRoute: routeId,
                        attemptIndex: i,
                        success: true,
                        shapeClass: null,
                        error: null,
                        usage: tokens,
                        costUsd,
                        wallMs,
                        utcDate: new Date()
                    })
                } catch {
                    /* telemetry is best-effort */
                }

                /* Build success diagnostic header */
                selectedIndex = attempts.length - 1
                const forcedPin = forceModel === 'original'
                const totalLatency = Date.now() - startTime
                const diag = buildDiagnosticHeader(attempts, selectedIndex, forcedPin, capAxis, totalLatency)

                const allHeaders = {
                    ...diag,
                    'X-Router-Failover-Applied': String(attempts.length > 1),
                    'X-Router-Force-Model': forceModel || 'default',
                    'X-Router-Allow-Degraded-Variants': String(allowDegraded)
                }

                succeeded = true
                return {
                    success: true,
                    status: respStatus,
                    headers: allHeaders,
                    body: respBody,
                    selectedCandidate: { modelId, routeId, tier: cand.tier }
                }
            }
        } catch (err) {
            /* Unexpected error — treat as transient network error */
            wallMs = Date.now() - attemptStartTime
            errorStr = err instanceof Error ? err.message : String(err)

            const snifferResp = { errorMessage: errorStr, status: 0, body: '' }
            shapeClass = carrierErrorShapeSniffer(snifferResp, modelId, routeId)

            attempts.push({
                modelId,
                carrier: routeId,
                route: routeId,
                shape: shapeClass ? shapeClass.shape : null,
                error: truncateError(errorStr),
                attemptMs: wallMs
            })

            // Always try breaker update; silently fail if it throws
            try {
                const lockHandle = await breaker.acquireBreakerLock(routeId, modelId)
                if (lockHandle) {
                    await breaker.markTransientCooldown(routeId, key, 'unexpected_error')
                    affinity.recordTransientFailure(routeId, modelId, routeId, registry, 'unexpected_error')
                    lockHandle.release()
                }
            } catch (_) {
                /* breaker update best-effort */
            }

            continue
        }
    }
    /* All candidates exhausted — build failure response */
    const totalLatency = Date.now() - startTime
    return buildFailureResponse(attempts, forceModel, capAxis, modelMatrix, true, totalLatency)
}

/**
 * Factory to create a fully-configured overlay with runtime dependencies.
 * Used when opencode-key-router.mjs wants to inject its own state + key accessors.
 *
 * @param {{ modelMatrix, keySlotAcquire?, apiEndpointUrl?, telemetryDir? }} opts
 * @returns {{ dispatch(reqCtx): Promise<DispatchResult> }}
 */
export function createV2Overlay(opts) {
    const cfg = { ...opts }
    return {
        /**
         * Dispatch a failover request with pre-injected runtime config.
         * @param {{ headers: Headers, body: Record<string,unknown>, model: string }} reqCtx
         * @returns {Promise<DispatchResult>}
         */
        async dispatch(reqCtx) {
            return v2FailoverDispatch(reqCtx, {
                modelMatrix: cfg.modelMatrix,
                capabilityAxis: cfg.capabilityAxis ?? 'toolUse',
                apiEndpointUrl: cfg.apiEndpointUrl ?? '/opencode-zen/v1/chat/completions',
                keySlotAcquireFn: cfg.keySlotAcquire,
                telemetryDir: cfg.telemetryDir ?? '~/.pi/agent/telemetry'
            })
        }
    }
}
