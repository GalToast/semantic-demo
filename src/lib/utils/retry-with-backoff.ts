/**
 * @lib/utils/retry-with-backoff.ts — Hardened retry + provider failover
 *
 * Shared utility for transient-failure retry with exponential backoff + jitter
 * and automated failover across provider configs.
 *
 * Does NOT retry permanent failures: 400, 401, 402, 403, 404, 422.
 * Retries transient failures: 429, 502, 503, 504, ECONNREFUSED, ETIMEDOUT,
 * ESOCKETTIMEDOUT, and generic network errors (TypeError, AbortError).
 *
 * Exported as pure functions — no state mutation, no Svelte store access.
 */

import { debugWarn } from '@lib/utils/debug'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default max retries per provider (first attempt + N retries = N+1 total) */
const DEFAULT_MAX_RETRIES = 3

/** Default base delay (ms) for exponential backoff */
const DEFAULT_BASE_DELAY_MS = 400

/** Default max delay (ms) cap so retries don't exceed ~8s per provider */
const DEFAULT_MAX_DELAY_MS = 8_000

/** Default max total time per provider (ms) before giving up */
const DEFAULT_PER_PROVIDER_TIMEOUT_MS = 30_000

/**
 * HTTP status codes we consider transient.
 * 429 = rate limited; 502/503/504 = gateway / upstream errors.
 */
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504])

/**
 * Error message substrings that indicate transient network failures.
 * These are checked case-insensitively against the error message.
 */
const TRANSIENT_MESSAGE_PATTERNS = [
    'econnrefused',
    'etimedout',
    'esockettimedout',
    'econnreset',
    'enetunreach',
    'ehostunreach',
    'fetch failed',
    'networkerror',
    'network error',
    'socket hang up',
    'socket hangup',
    'connection reset',
    'connection refused',
    'connection timeout',
    'timeout of',
    'timed out',
    'read econnreset',
    'write econnreset',
    'the server responded with a status of 4',
    'the server responded with a status of 5'
]

/**
 * HTTP status codes we consider permanent (not worth retrying).
 */
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 402, 403, 404, 405, 410, 422])

// ── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- fire-and-forget Promise resolution
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Exponential backoff delay with equal jitter.
 * Returns an equal-jittered delay in `[0.5, 1.5) × min(base * 2^attempt, maxDelay)]`,
 * then clamped to `maxDelay` so the result never exceeds the configured ceiling.
 * This gives mean delay = `base * 2^attempt` (capped) but varies to spread
 * retries across concurrent clients.
 *
 * Note: the second `min(jittered, maxDelay)` clamp is load-bearing — without it
 * the [0.5, 1.5) multiplier alone could return up to 1.5x maxDelay whenever
 * exponential >= maxDelay, violating the maxDelay contract.
 *
 * @param attempt - zero-based retry attempt number (0 = first retry)
 * @param baseDelay - base delay in ms (default 400)
 * @param maxDelay - max delay in ms (default 8000)
 */
export function computeBackoffDelay(
    attempt: number,
    baseDelay = DEFAULT_BASE_DELAY_MS,
    maxDelay = DEFAULT_MAX_DELAY_MS
): number {
    const exponential = baseDelay * Math.pow(2, attempt)
    const capped = Math.min(exponential, maxDelay)
    // Equal jitter: random between 50% and 150% of the capped exponential delay,
    // then clamp again so the result never exceeds maxDelay.
    const jittered = capped * (0.5 + Math.random())
    return Math.round(Math.min(jittered, maxDelay))
}

// ── Error Classification ──────────────────────────────────────────────────────

/**
 * Extract an HTTP status code from an error, if present.
 * Supports errors thrown by fetch (contain `response.status`) or plain HTTP
 * error messages like "HTTP 429", "Failed to fetch records: 502", etc.
 */
function extractStatusCode(err: unknown): number | null {
    if (!err) return null

    // DOMException or TypeError from fetch network errors
    if (err instanceof TypeError || err instanceof DOMException) {
        return null
    }

    // Errors created elsewhere with a status or statusCode property
    const e = err as Record<string, unknown>
    if (typeof e.status === 'number') return e.status
    if (typeof e.statusCode === 'number') return e.statusCode

    // Parse status from error message patterns
    const msg = typeof e.message === 'string' ? e.message : String(err)
    const httpMatch = msg.match(/\b(?:HTTP\s*)?(4\d\d|5\d\d)\b/)
    if (httpMatch) return parseInt(httpMatch[1]!, 10)

    return null
}

/**
 * Returns true if the error represents a transient failure that should be retried.
 * Transient: 429, 502, 503, 504, connection errors, timeouts, network failures.
 */
export function isTransientError(err: unknown): boolean {
    const status = extractStatusCode(err)
    if (status !== null && TRANSIENT_HTTP_STATUSES.has(status)) return true
    if (status !== null && PERMANENT_HTTP_STATUSES.has(status)) return false

    // Check the error message for transient patterns.
    const message = err instanceof Error ? err.message : String(err ?? '')
    const lower = message.toLowerCase()
    for (const pattern of TRANSIENT_MESSAGE_PATTERNS) {
        if (lower.includes(pattern)) return true
    }

    // TypeErrors from fetch failing to connect are transient.
    if (err instanceof TypeError) return true

    // DOMException TimeoutError is transient (rare in fetch context — timeout
    // aborts usually surface as AbortError, which the generic Error message-match
    // check below already classifies; this catch keeps the rare TimeoutError name).
    if (err instanceof DOMException && err.name === 'TimeoutError') return true

    // Generic Error with a timeout-related message
    if (err instanceof Error && (lower.includes('timeout') || lower.includes('timed out'))) return true

    return false
}

/**
 * Returns true if the error represents a permanent failure that should NOT be retried.
 * Permanent: 400, 401, 402, 403, 404, 422, 405, 410.
 */
export function isPermanentError(err: unknown): boolean {
    const status = extractStatusCode(err)
    if (status !== null) return PERMANENT_HTTP_STATUSES.has(status)

    const message = err instanceof Error ? err.message : String(err ?? '')
    const lower = message.toLowerCase()

    // 4xx client errors not already caught by TRANSIENT patterns
    const fourxxMatch = lower.match(/\b(4\d\d)\b/)
    if (fourxxMatch) {
        const code = parseInt(fourxxMatch[1]!, 10)
        // 429 is transient; all other 4xx we treat as permanent
        if (code >= 400 && code < 500 && code !== 429) return true
    }

    return false
}

// ── Retry Configuration ──────────────────────────────────────────────────────

export interface RetryOptions {
    /** Maximum number of retry attempts per provider (default 3) */
    maxRetries?: number
    /** Base delay in ms for exponential backoff (default 400) */
    baseDelayMs?: number
    /** Maximum delay in ms (default 8000) */
    maxDelayMs?: number
    /** Maximum total time in ms for retries (default 30000) */
    timeoutMs?: number
    /** Label for logging (default "unnamed") */
    label?: string
    /** Signal to abort the entire retry loop */
    signal?: AbortSignal
}

export interface RetryState {
    attempt: number
    lastError: Error | null
    elapsedMs: number
}

// ── Core Retry ───────────────────────────────────────────────────────────────

/**
 * Retry an async function with exponential backoff + full jitter.
 * Retries on transient/retryable errors only. Permanent errors are
 * immediately re-thrown. Returns the first successful result.
 *
 * @param fn - Async function to retry. Receives the RetryState.
 * @param options - RetryOptions
 * @throws The last error encountered (permanent errors are re-thrown immediately)
 */
export async function retryWithBackoff<T>(
    fn: (state: RetryState) => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = DEFAULT_MAX_RETRIES,
        baseDelayMs = DEFAULT_BASE_DELAY_MS,
        maxDelayMs = DEFAULT_MAX_DELAY_MS,
        timeoutMs = DEFAULT_PER_PROVIDER_TIMEOUT_MS,
        label = 'unnamed',
        signal
    } = options

    const startTime = performance.now()
    let lastError: Error | null = null
    let attempt = 0

    while (true) {
        const elapsedMs = performance.now() - startTime

        // Check for timeout
        if (elapsedMs >= timeoutMs) {
            const timeoutErr = lastError ?? new Error(`${label} timed out after ${timeoutMs}ms and ${attempt} attempts`)
            debugWarn(
                `[retry] ${label} timeout after ${attempt} attempts (${Math.round(elapsedMs)}ms):`,
                timeoutErr.message
            )
            throw timeoutErr
        }

        // Check for abort
        if (signal?.aborted) {
            throw new DOMException(`Retry aborted: ${label}`, 'AbortError')
        }

        try {
            const result = await fn({ attempt, lastError, elapsedMs })
            return result
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            lastError = error

            // Permanent failures are immediately re-thrown — no retry.
            if (isPermanentError(err)) {
                debugWarn(`[retry] ${label} attempt ${attempt + 1}: permanent error, not retrying:`, error.message)
                throw error
            }

            // Transient / unknown: log and schedule a retry if attempts remain.
            if (attempt >= maxRetries) {
                debugWarn(
                    `[retry] ${label} exhausted ${maxRetries} retries (${attempt + 1} total attempts):`,
                    error.message
                )
                throw error
            }

            const backoffMs = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs)
            debugWarn(
                `[retry] ${label} attempt ${attempt + 1}/${maxRetries + 1} failed, ` +
                    `retrying in ${backoffMs}ms: ${error.message}`
            )
            attempt++

            // Wait for backoff period, with abort support.
            if (signal) {
                await delayWithSignal(backoffMs, signal)
            } else {
                await delay(backoffMs)
            }
        }
    }
}

/**
 * Like delay() but also responds to abort signals early.
 */
async function delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException('Aborted during retry backoff', 'AbortError')
    return new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort)
            resolve()
        }, ms)

        function onAbort(): void {
            clearTimeout(timer)
            signal.removeEventListener('abort', onAbort)
            reject(new DOMException('Aborted during retry backoff', 'AbortError'))
        }

        signal.addEventListener('abort', onAbort, { once: true })
    })
}

