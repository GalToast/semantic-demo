/**
 * @lib/engine/semantic-threads.ts — Semantic thread artifact loading (typed port)
 *
 * Port of:
 *
 * Loads semantic thread neighbor data (from semantic_threads.dat / semantic_threads_ui.dat),
 * populating state.semanticNeighborMapByLeadId.  Uses a Web Worker for parsing when
 * available, falling back to main-thread fetch+JSON.
 *
 * State writes are direct, not wrapped in withStateMutation() — that legacy wrapper
 * was a runtime no-op (_isMutatingRef is read nowhere; app.svelte.ts's Proxy validates
 * via STATE_VALIDATORS, not the old CRITICAL_KEYS traps). See src/lib/state/with-state-mutation.ts.
 */

import { workerUrl } from '@lib/workers/data-worker-url'
import type { NeighborEntry } from '@lib/workers/data-worker'
import {
    normalizeSemanticNeighborEntriesCached,
    isLayoutManifest as isLayoutManifestPort,
    basenameUtil,
    countThreadEdgesUtil
} from './semantic-threads-normalize'
import type {
    SemanticThreadBundle,
    SemanticNeighborEntry,
    SemanticNeighborDetail,
    LayoutManifest
} from '@lib/types/business'
import { normalizeRelationshipRole } from '@lib/utils/relationship-roles'
import { debugWarn } from '@lib/utils/debug'
import { cleanOptionalValue } from '@lib/utils/dom-formatters'
import { setSemanticThreadData, setSemanticThreadFailure } from '@lib/data-store'

// ── Legacy state singleton ────────────────────────────────────────────────────
// The state reference is injected by the engine bridge during init via
// attachLegacyState().  Do NOT import directly from ../../js/state.js —
// the CJS require fails under Vite's ESM pipeline and creates a second
// stateProxy instance that diverges from the live one.
import type { AppState } from '@lib/state/app.svelte'
import { debugError } from '@lib/utils/debug'

let _state: AppState | null = null
// Promise gate: resolves when attachLegacyState() is called, so
// loadSemanticThreads() can await instead of polling with a busy-wait.
let _stateReadyResolve: (() => void) | null = null
const _stateReady = new Promise<void>((resolve) => {
    _stateReadyResolve = resolve
})

interface LayoutValidationSummary {
    generatedAt: string | null
    method: string | null
    rows: number
    edges: number
    threadArtifact: string | null
}

function getState(): AppState {
    if (!_state) throw new Error('semantic-threads: state not attached')
    return _state
}

/**
 * Attach the AppState singleton (called by the engine lifecycle during init).
 *
 * Must be called before loadSemanticThreads() so that state.semanticNeighborMapByLeadId
 * and other tracked properties are written to the SAME state object the Three.js
 * engine reads from.
 */
export function attachLegacyState(stateRef: AppState): void {
    _state = stateRef
    if (_stateReadyResolve) {
        _stateReadyResolve()
        _stateReadyResolve = null
    }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEMANTIC_THREAD_RETRY_DELAYS_MS = [2500, 8000, 15000] as const
// W6-T5: Increased from 75s to 180s to accommodate 79MB semantic thread artifacts
// on slower connections. The fetch + JSON.parse of a 79MB file can easily exceed
// 60s on a 10 Mbps connection.
const SEMANTIC_THREAD_WORKER_TIMEOUT_MS = 180_000

/** Max retry-timer cycles before giving up (W73-H1: budget resets on fresh external loads). */
const SEMANTIC_THREAD_MAX_RETRIES = 5

// ── Worker singleton & hardening ───────────────────────────────────────────────

let _dataWorker: Worker | null = null
let _semanticThreadRequestId = 0

// Set by the retry-timer callback immediately before it re-invokes
// loadSemanticThreads(). Used to distinguish a retry-timer-driven load (which
// must NOT reset the exhausted retry budget, or it would re-arm itself forever)
// from a genuine external fresh load (which SHOULD reset the budget, W73-H1).
let _retryTimerArmed = false

// Circuit breaker: tracks consecutive worker failures
let _workerFailureCount = 0
const WORKER_MAX_FAILURES = 3
const WORKER_RETRY_DELAYS = [500, 1500, 4000] // ms
// Circuit-breaker cooldown (was a fire-and-forget setTimeout that could leak and
// re-arm on every call). Now a timestamp: on the next call after this time the
// breaker auto-resets. Cleared explicitly by resetSemanticThreadWorker().
const WORKER_CIRCUIT_BREAKER_COOLDOWN_MS = 30_000
let _circuitBreakerResetAt: number | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAssetUrl(path: string): string {
    if (typeof window === 'undefined') return path
    return new URL(path, window.location.href).href
}

/**
 * Get or (re)create the data worker with retry logic.
 *
 * Hardening layers:
 * 1. Retry instantiation with exponential backoff (up to 3 attempts)
 * 2. Circuit breaker: if 3 consecutive failures, stop retrying for 30s
 * 3. Health-check: ping the worker before returning it
 */
async function getWorker(): Promise<Worker | null> {
    if (typeof Worker === 'undefined') {
        _dataWorker = null
        return null
    }

    // Skip the existing-worker health-check ping. The worker may be mid-parse
    // of a 40 MB+ JSON payload (semantic_threads_ui.dat) when a subsequent
    // caller hits getWorker(); a tight PING timeout can't be answered while
    // the worker is busy, so the previous 100 ms ping killed the worker and
    // forced a full re-instantiation + re-fetch of the .dat file. Trust the
    // singleton until the next postMessage ERROR or crash event.
    if (_dataWorker) return _dataWorker

    // Circuit breaker: if we've failed too many times, wait before retrying.
    // Timestamp-based (no untracked setTimeout): once the cooldown elapses the
    // next caller auto-resets and retries instead of re-arming a new timer.
    if (_workerFailureCount >= WORKER_MAX_FAILURES) {
        if (_circuitBreakerResetAt !== null && Date.now() >= _circuitBreakerResetAt) {
            // Cooldown elapsed — clear the breaker and allow a fresh attempt.
            _workerFailureCount = 0
            _circuitBreakerResetAt = null
        } else {
            const remainingMs = _circuitBreakerResetAt !== null ? _circuitBreakerResetAt - Date.now() : 0
            debugWarn(
                `[semantic-threads] Worker circuit breaker open (${_workerFailureCount} consecutive failures). ` +
                    `Retrying in ${Math.max(0, Math.round(remainingMs / 1000))}s...`
            )
            return null
        }
    }

    for (let attempt = 0; attempt < WORKER_RETRY_DELAYS.length; attempt++) {
        try {
            const worker = new Worker(workerUrl, { type: 'module' })
            // Verify the worker is responsive before returning it.
            // Allow up to 5 s — ESM worker bundle fetch + script parse on a cold
            // cache can easily exceed 2 s on slower devices.
            const isAlive =
                typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
                    ? true
                    : await _pingWorker(worker, 5000)
            if (!isAlive) {
                worker.terminate()
                throw new Error('Worker ping failed after creation')
            }
            _dataWorker = worker
            // Persistent crash guard (finding T4-A): if the worker dies asynchronously
            // with no in-flight callWorker error handler attached, reset the cached
            // singleton so the next getWorker() instantiates a fresh worker instead of
            // reusing a dead object. resetSemanticThreadWorker() is idempotent.
            worker.addEventListener('error', () => resetSemanticThreadWorker())
            worker.addEventListener('messageerror', () => resetSemanticThreadWorker())
            _workerFailureCount = 0
            return worker
        } catch (err) {
            const delay = WORKER_RETRY_DELAYS[attempt]
            debugWarn(
                `[semantic-threads] Worker instantiation attempt ${attempt + 1} failed, ` + `retrying in ${delay}ms...`,
                err instanceof Error ? err.message : err
            )
            if (attempt < WORKER_RETRY_DELAYS.length - 1) {
                await new Promise((r) => setTimeout(r, delay)) // eslint-disable-line no-restricted-syntax -- local Promise resolution
            }
        }
    }

    _workerFailureCount++
    // Arm the timestamp-based circuit-breaker cooldown only on first breach so a
    // fresh call within the window returns null instead of re-arming a timer.
    if (_workerFailureCount >= WORKER_MAX_FAILURES && _circuitBreakerResetAt === null) {
        _circuitBreakerResetAt = Date.now() + WORKER_CIRCUIT_BREAKER_COOLDOWN_MS
    }
    debugError(
        `[semantic-threads] Worker creation failed after ${WORKER_RETRY_DELAYS.length} attempts. ` +
            `Consecutive failure count: ${_workerFailureCount}/${WORKER_MAX_FAILURES}`
    )
    return null
}

/**
 * Ping the worker with a PING/PONG round-trip to verify it's alive.
 */
async function _pingWorker(worker: Worker, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const pingId = `__ping_${Date.now()}`
        const handlerRef: { current: ((e: MessageEvent) => void) | null } = { current: null }

        const cleanup = (): void => {
            if (handlerRef.current) {
                worker.removeEventListener('message', handlerRef.current)
            }
        }

        // eslint-disable-next-line no-restricted-syntax -- local Promise resolution
        const timer = setTimeout(() => {
            cleanup()
            resolve(false)
        }, timeoutMs)

        handlerRef.current = (event: MessageEvent): void => {
            if (event.data?.type === 'PONG' && event.data?.pingId === pingId) {
                clearTimeout(timer)
                cleanup()
                resolve(true)
            }
        }

        worker.addEventListener('message', handlerRef.current)
        worker.postMessage({ type: 'PING', pingId })
    })
}

export function resetSemanticThreadWorker(): void {
    if (_dataWorker) {
        _dataWorker.terminate()
    }
    _dataWorker = null
    // data-worker.ts owns a separate request counter that starts at zero for
    // every Worker instance. Re-sync the caller-side counter with that new
    // worker or its first response will be ignored as stale until timeout.
    _semanticThreadRequestId = 0
    // Explicitly clear the circuit breaker so a teardown/worker-reset does not
    // leave the breaker stuck open (replaces the old untracked reset timer).
    _workerFailureCount = 0
    _circuitBreakerResetAt = null
}

function _handleBeforeUnload(): void {
    resetSemanticThreadWorker()
}

// Stable window key for the unload handler.  Used to make the module-scope
// registration idempotent across Vite HMR re-evaluations: a hot reload re-runs
// this module, producing a NEW `_handleBeforeUnload` closure (which closes over
// the NEW module scope's `_dataWorker`).  Without removing the previously
// registered closure first, each re-eval leaks a stale `beforeunload`/`pagehide`
// listener that can never be reached for removal — so the worker is never
// terminated on page unload after the first hot reload.
const _SEMANTIC_THREADS_UNLOAD_KEY = '__semanticThreadsUnloadHandler'

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    // Remove the PREVIOUS module-eval's closure (HMR), then register the new one.
    const store = window as unknown as Record<string, unknown>
    const prev = store[_SEMANTIC_THREADS_UNLOAD_KEY] as (() => void) | undefined
    if (typeof prev === 'function') {
        window.removeEventListener('beforeunload', prev)
        window.removeEventListener('pagehide', prev)
    }
    store[_SEMANTIC_THREADS_UNLOAD_KEY] = _handleBeforeUnload
    window.addEventListener('beforeunload', _handleBeforeUnload)
    window.addEventListener('pagehide', _handleBeforeUnload)
}

// ── Layout manifest loading ───────────────────────────────────────────────────

async function _loadSemanticSpaceLayoutManifest(cacheBust: number): Promise<Record<string, unknown>> {
    const manifestUrl = buildAssetUrl(`data/semantic_space_layout_manifest.json?v=${cacheBust}`)
    const response = await fetch(manifestUrl, { cache: 'no-store' })
    if (!response.ok) {
        throw new Error(`semantic space manifest unavailable (${response.status})`)
    }
    const manifest: unknown = await response.json()
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('semantic space manifest is not an object')
    }
    return manifest as Record<string, unknown>
}

function _validateSemanticSpaceLayoutManifest(
    manifest: LayoutManifest,
    bundle: SemanticThreadBundle,
    artifactName: string | null
): LayoutValidationSummary {
    const nodes = bundle?.nodes && typeof bundle.nodes === 'object' ? bundle.nodes : {}
    const nodeCount = Object.keys(nodes).length
    const edgeCount = countThreadEdgesUtil(bundle)
    const state = getState()
    const pointCount = Array.isArray(state?.points) ? state.points.length : 0
    const rows = Number(manifest.rows)
    const edges = Number(manifest.edges)
    const manifestThreadName = basenameUtil(manifest.thread_path)
    const loadedThreadName = artifactName ? basenameUtil(artifactName) : ''

    const failures: string[] = []
    if (!Number.isFinite(rows) || rows <= 0) failures.push('rows must be a positive number')
    if (!Number.isFinite(edges) || edges <= 0) failures.push('edges must be a positive number')
    if (rows !== nodeCount) failures.push(`rows ${rows} != semantic nodes ${nodeCount}`)
    if (pointCount > 0 && rows !== pointCount) failures.push(`rows ${rows} != loaded points ${pointCount}`)
    if (edges !== edgeCount) failures.push(`edges ${edges} != semantic edges ${edgeCount}`)
    if (manifestThreadName && loadedThreadName && manifestThreadName !== loadedThreadName) {
        failures.push(`thread_path ${manifestThreadName} != loaded artifact ${loadedThreadName}`)
    }
    if (basenameUtil(manifest.data_path) && basenameUtil(manifest.data_path) !== 'data.dat') {
        failures.push(`data_path must reference data.dat, got ${basenameUtil(manifest.data_path)}`)
    }

    if (failures.length) {
        throw new Error(`semantic space manifest mismatch: ${failures.join('; ')}`)
    }

    return {
        generatedAt: (manifest.generated_at as string) || null,
        method: (manifest.method as string) || null,
        rows,
        edges,
        threadArtifact: loadedThreadName || manifestThreadName || null
    }
}

async function _guardSemanticSpaceLayout(
    bundle: SemanticThreadBundle,
    artifactName: string | null,
    cacheBust: number
): Promise<{ summary: LayoutValidationSummary; manifest: LayoutManifest }> {
    const rawManifest = await _loadSemanticSpaceLayoutManifest(cacheBust)
    if (!isLayoutManifestPort(rawManifest)) {
        throw new Error('semantic space manifest is missing numeric rows/edges')
    }
    const manifest = rawManifest
    const summary = _validateSemanticSpaceLayoutManifest(manifest, bundle, artifactName)
    const state = getState()
    {
        state.semanticSpaceLayoutManifest = manifest
        state.semanticSpaceLayoutStatus = 'ready'
        state.semanticSpaceLayoutError = null
    }
    _recordSemanticLaneSnapshot({
        semantic_space_layout_status: 'ready',
        semantic_space_layout_rows: summary.rows,
        semantic_space_layout_edges: summary.edges,
        semantic_space_layout_thread_artifact: summary.threadArtifact,
        semantic_space_layout_generated_at: summary.generatedAt
    })
    return { summary, manifest }
}

// ── Worker communication ──────────────────────────────────────────────────────

interface WorkerResponse {
    type: string
    payload: unknown
    requestId?: number
}

interface WorkerThreadResult {
    neighborEntries: Array<[string, NeighborEntry]>
    artifactName: string
    bundle: SemanticThreadBundle
}

async function callWorker(type: string, payload: unknown): Promise<WorkerThreadResult> {
    const worker = await getWorker()
    if (!worker) {
        throw new Error('Worker unavailable')
    }

    return new Promise((resolve, reject) => {
        const requestId = ++_semanticThreadRequestId
        let settled = false
        let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null

        const cleanup = (): void => {
            if (timeoutId !== null) globalThis.clearTimeout(timeoutId)
            worker.removeEventListener('message', handler)
            worker.removeEventListener('error', errorHandler)
        }
        // (timeoutId set below; cleanup() handles disposal via clearTimeout)

        const settleReject = (err: Error): void => {
            if (settled) return
            settled = true
            cleanup()
            resetSemanticThreadWorker()
            reject(err)
        }

        const handler = (event: MessageEvent<WorkerResponse>): void => {
            const { type: resType, payload: resPayload, requestId: resRequestId } = event.data
            if (resRequestId !== requestId) return
            if (resType === `${type}_SUCCESS`) {
                settled = true
                cleanup()
                if (type === 'LOAD_THREADS') {
                    resetSemanticThreadWorker()
                }
                resolve(resPayload as WorkerThreadResult)
            } else if (resType === 'ERROR') {
                settleReject(new Error((resPayload as { message?: string })?.message || 'Worker failed'))
            }
        }

        const errorHandler = (): void => {
            settleReject(new Error('Semantic thread worker crashed'))
        }

        timeoutId = globalThis.setTimeout(() => {
            settleReject(new Error(`Semantic thread worker timed out after ${SEMANTIC_THREAD_WORKER_TIMEOUT_MS}ms`))
        }, SEMANTIC_THREAD_WORKER_TIMEOUT_MS)

        worker.addEventListener('message', handler)
        worker.addEventListener('error', errorHandler)
        worker.postMessage({ type, payload, requestId })
    })
}

// ── Neighbor normalization helpers ────────────────────────────────────────────

// ── Semantic lane snapshot ────────────────────────────────────────────────────

function _recordSemanticLaneSnapshot(partial: Record<string, unknown> = {}): void {
    // In the TS port, semantic lane snapshots are recorded via the
    // lifecycle orchestration module.  This is a no-op during direct
    // port — the actual recording happens when the lifecycle bridge
    // adapter calls into the legacy semantic-lane module.
    void partial
}

// ── Focused state refresh ─────────────────────────────────────────────────────

function _refreshFocusedSemanticState(): void {
    // No-op in the direct port.  Focused state refresh is handled by
    // the Svelte store subscriptions in the UI layer.
}

function _syncSemanticThreadDataToStores(
    bundle: SemanticThreadBundle,
    artifactName: string,
    neighborMap: Map<string, SemanticNeighborEntry>,
    layoutManifestValue: LayoutManifest | null
): void {
    setSemanticThreadData({
        bundle,
        artifactName,
        neighborMap,
        layoutManifest: layoutManifestValue
    })
}

function _syncSemanticThreadFailureToStores(errMessage: string): void {
    setSemanticThreadFailure(errMessage)
}

// ── Retry timer management ────────────────────────────────────────────────────

function _clearSemanticThreadsRetryTimer(): void {
    const state = getState()
    {
        if (state.semanticThreadsRetryTimer) {
            globalThis.clearTimeout(state.semanticThreadsRetryTimer)
            state.semanticThreadsRetryTimer = null
        }
    }
}

function _scheduleSemanticThreadsRetry(reason = 'artifact-retry'): void {
    const state = getState()
    if (state.semanticThreadsStatus === 'ready' || state.semanticThreadsLoadPromise || state.semanticThreadsRetryTimer)
        return

    if (typeof state.semanticThreadsRetryAttempt !== 'number') {
        {
            state.semanticThreadsRetryAttempt = 0
        }
    }

    if (state.semanticThreadsRetryAttempt >= SEMANTIC_THREAD_MAX_RETRIES) {
        debugWarn(`loadSemanticThreads: max retries (${SEMANTIC_THREAD_MAX_RETRIES}) reached, giving up`)
        _updateSemanticThreadsStatus('failed')
        return
    }

    const delayMs =
        SEMANTIC_THREAD_RETRY_DELAYS_MS[
            Math.min(
                Number.isFinite(state.semanticThreadsRetryAttempt) ? state.semanticThreadsRetryAttempt : 0,
                SEMANTIC_THREAD_RETRY_DELAYS_MS.length - 1
            )
        ] || 15000

    _recordSemanticLaneSnapshot({
        thread_retry_source: reason,
        thread_retry_count: state.semanticThreadsRetryAttempt + 1,
        thread_retry_wait_until: new Date(Date.now() + delayMs).toISOString()
    })

    {
        state.semanticThreadsRetryAttempt += 1
        state.semanticThreadsRetryTimer = globalThis.setTimeout(() => {
            {
                state.semanticThreadsRetryTimer = null
            }
            // Mark this invocation as retry-driven so loadSemanticThreads keeps the
            // exhausted retry budget intact (prevents the W73 reset from re-arming
            // the retry loop once the counter has reached MAX_RETRIES).
            _retryTimerArmed = true
            loadSemanticThreads({ reason }).catch((err: unknown) => {
                debugWarn('loadSemanticThreads retry failed:', err)
            })
        }, delayMs)
    }
}

// ── Status mutator ────────────────────────────────────────────────────────────

function _updateSemanticThreadsStatus(status: 'idle' | 'loading' | 'ready' | 'failed'): void {
    const state = getState()
    {
        state.semanticThreadsStatus = status
    }
}

// ── Finalize ──────────────────────────────────────────────────────────────────

function finalizeThreadLoad(): void {
    const state = getState()

    if (new URLSearchParams(window.location.search).has('debug')) {
        debugWarn('[semantic-threads] artifact loaded', {
            artifact: state.semanticThreadArtifactName,
            records: state.semanticNeighborMapByLeadId.size
        })
    }

    _updateSemanticThreadsStatus(state.semanticNeighborMapByLeadId.size > 0 ? 'ready' : 'failed')

    _recordSemanticLaneSnapshot({
        thread_artifact_status: state.semanticThreadsStatus,
        thread_artifact_name: state.semanticThreadArtifactName,
        semantic_space_layout_status: state.semanticSpaceLayoutStatus,
        thread_retry_source: null,
        thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : state.semanticThreadsRetryAttempt,
        thread_retry_wait_until: null
    })

    if (state.semanticThreadsStatus !== 'ready') {
        {
            state.semanticThreadsLoadPromise = null
        }
        _scheduleSemanticThreadsRetry('empty-artifact')
    } else {
        {
            state.semanticThreadsRetryAttempt = 0
        }
    }

    _refreshFocusedSemanticState()
}

// ── Public Getters ────────────────────────────────────────────────────────────

/**
 * Get the loaded semantic thread bundle after loadSemanticThreads() succeeds.
 * Returns null if not yet loaded or if attachLegacyState() was never called.
 */
export function getSemanticThreadBundle(): SemanticThreadBundle | null {
    return _state?.semanticThreadBundle ?? null
}

/**
 * Get the loaded artifact filename after loadSemanticThreads() succeeds.
 * Returns null if not yet loaded.
 */
export function getSemanticThreadArtifactName(): string | null {
    return _state?.semanticThreadArtifactName ?? null
}

/**
 * Get the populated neighbor map after loadSemanticThreads() succeeds.
 * Returns an empty map if not yet loaded.
 */
export function getSemanticNeighborMapByLeadId(): Map<string, SemanticNeighborEntry> {
    return (
        (_state?.semanticNeighborMapByLeadId as Map<string, SemanticNeighborEntry>) ??
        new Map<string, SemanticNeighborEntry>()
    )
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadSemanticThreadsOptions {
    reason?: string
}

/**
 * Load the semantic thread neighbor artifact, populating
 * state.semanticNeighborMapByLeadId.
 *
 * Attempts Web Worker parsing first; falls back to main-thread
 * fetch + JSON parse on failure.
 */
export async function loadSemanticThreads(options: LoadSemanticThreadsOptions = {}): Promise<boolean> {
    // Guard: if attachLegacyState() hasn't been called yet, await the promise
    // gate with a 500ms timeout, then degrade gracefully instead of throwing.
    if (_state === null) {
        await Promise.race([_stateReady, new Promise<void>((resolve) => setTimeout(resolve, 500))]) // eslint-disable-line no-restricted-syntax -- local race timeout
        if (_state === null) {
            debugWarn('[semantic-threads] loadSemanticThreads called before attachLegacyState(); degrading gracefully')
            return false
        }
    }

    const state = getState()
    if (state.semanticThreadsLoadPromise) return state.semanticThreadsLoadPromise as Promise<boolean>
    // Re-entry guard: a retry timer is already scheduled (failure path) while
    // `semanticThreadsLoadPromise` has been cleared.  A duplicate caller during
    // this window would start a second concurrent load.  Return a resolved
    // false so the caller does not double-load (every path still yields a
    // Promise<boolean>, which the `async` wrapper guarantees anyway).
    if (state.semanticThreadsRetryTimer) return Promise.resolve(false)

    // W73-H1: when the retry budget is exhausted (attempt >= MAX) a genuine
    // external fresh load (not driven by this module's retry timer) should
    // start a new budget instead of permanently disabling thread loading for
    // the session. Retry-timer-driven loads are marked via _retryTimerArmed,
    // so they keep the budget intact — otherwise the reset would fire once the
    // counter reaches MAX (mid retry-chain) and re-arm the retry loop forever.
    const isRetryTimerLoad = _retryTimerArmed
    _retryTimerArmed = false
    if (!isRetryTimerLoad && state.semanticThreadsRetryAttempt >= SEMANTIC_THREAD_MAX_RETRIES) {
        state.semanticThreadsRetryAttempt = 0
    }

    const cacheBust = Math.floor(Date.now() / (1000 * 60 * 60))
    const requestUrls = [
        buildAssetUrl(`data/semantic_threads.dat.bin?v=${cacheBust}`),
        buildAssetUrl(`data/semantic_threads_ui.dat.bin?v=${cacheBust}`),
        buildAssetUrl(`data/semantic_threads_ui.dat?v=${cacheBust}`),
        buildAssetUrl(`data/semantic_threads.dat?v=${cacheBust}`)
    ]
    const attemptConfigs: RequestCache[] = ['default', 'force-cache', 'reload', 'no-store']

    _updateSemanticThreadsStatus('loading')

    const loadPromise = (async (): Promise<boolean> => {
        try {
            _clearSemanticThreadsRetryTimer()

            // Worker is mandatory — .dat files are >40 MB; main-thread JSON.parse
            // blocks the UI for 500-750 ms. We rely on the Worker for all parsing.
            const worker = await getWorker()
            if (!worker) {
                throw new Error('Web Worker unavailable and semantic thread artifacts exceed main-thread budget.')
            }

            try {
                const { neighborEntries, artifactName, bundle } = await callWorker('LOAD_THREADS', {
                    urls: requestUrls,
                    attemptConfigs
                })
                const { manifest } = await _guardSemanticSpaceLayout(bundle, artifactName, cacheBust)
                const neighborMap = new Map(
                    normalizeSemanticNeighborEntriesCached(neighborEntries, artifactName, bundle)
                )
                {
                    state.semanticThreadBundle = bundle
                    state.semanticThreadArtifactName = artifactName
                    state.semanticNeighborMapByLeadId = neighborMap
                }
                _syncSemanticThreadDataToStores(bundle, artifactName, neighborMap, manifest)
                finalizeThreadLoad()
                return true
            } catch (err) {
                // Worker failed — do not fall back to main thread for >40 MB files.
                resetSemanticThreadWorker()
                throw new Error('Worker-based thread loading failed (artifacts exceed main-thread budget).', {
                    cause: err
                })
            }
        } catch (error) {
            debugWarn('Failed to load semantic thread artifact; using geometric fallback.', error)
            const errMessage = error instanceof Error ? error.message : String(error)
            {
                state.semanticThreadBundle = null
                state.semanticThreadArtifactName = null
                state.semanticSpaceLayoutManifest = null
                state.semanticSpaceLayoutStatus = 'failed'
                state.semanticSpaceLayoutError = errMessage
                state.semanticNeighborMapByLeadId = new Map()
            }
            _updateSemanticThreadsStatus('failed')
            state.semanticThreadsLoadPromise = null
            _recordSemanticLaneSnapshot({
                thread_artifact_status: 'failed',
                thread_artifact_name: null,
                semantic_space_layout_status: state.semanticSpaceLayoutStatus,
                semantic_space_layout_error: state.semanticSpaceLayoutError,
                thread_retry_source: options.reason || 'artifact-load',
                thread_retry_count: state.semanticThreadsRetryAttempt
            })
            _syncSemanticThreadFailureToStores(errMessage)
            _scheduleSemanticThreadsRetry(options.reason || 'artifact-load')
            _refreshFocusedSemanticState()
            return false
        }
    })()

    {
        state.semanticThreadsLoadPromise = loadPromise
    }

    return loadPromise
}

export default loadSemanticThreads
// ── Re-export: normalization (group-1, semantic-threads-normalize.ts) ──
export { normalizeSemanticNeighborEntriesCached } from './semantic-threads-normalize'
