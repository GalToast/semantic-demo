#!/usr/bin/env node

/**
 * Pure, deterministic per-route cooldown / circuit-breaker state for probe scheduling.
 *
 * Design contract (enforced by tests/model-health-circuit-state-contract.mjs):
 * - No sleeping, no scheduling, no i/o, no ambient clock reads. Every entry point takes
 *   an explicit `now` (epoch ms); wall-clock, sleep-scheduler and request primitives are
 *   statically forbidden in this file and asserted by the contract test.
 * - Every exported function is pure: inputs are never mutated, outputs are fresh
 *   JSON-serializable values, and identical inputs always produce identical outputs.
 * - State is route-scoped and secret-free by construction: only whitelisted numeric /
 *   enum fields are ever copied into state, so caller payloads (headers, keys, bodies)
 *   cannot leak in.
 * - This module only computes state and decisions. It never probes, retries, sleeps,
 *   or queues work. The caller owns execution.
 */

export const SCHEMA_VERSION = 1

export const DEFAULT_CIRCUIT_POLICY = Object.freeze({
    // Exponential backoff ladder for repeated 429 / 5xx / unknown failures.
    baseBackoffMs: 30_000,
    backoffFactor: 2,
    maxBackoffSteps: 16,
    maxBackoffMs: 15 * 60 * 1000,
    // Provider-supplied Retry-After is honored, but never unbounded.
    maxRetryAfterMs: 60 * 60 * 1000,
    // Hard ceiling for any single suppression window.
    maxOpenMs: 60 * 60 * 1000,
    // Hard-blocked routes (401/403/404/...) get a long, fixed floor.
    blockedOpenMs: 30 * 60 * 1000,
    // Consecutive 5xx/unknown failures required before probes are suppressed.
    // Cooldown (429) and hard-blocked results always suppress immediately, whatever
    // this knob says: an explicit provider rate-limit signal is never re-probed.
    openAfterFailures: 1,
    // Half-open trial probes allowed concurrently, and how long an unreported
    // in-flight trial probe blocks the route before it is considered abandoned.
    halfOpenMaxProbes: 1,
    halfOpenProbeTimeoutMs: 2 * 60 * 1000,
    // Pruning defaults (see pruneCircuitState).
    maxRouteEntries: 512,
    pruneIdleMs: 24 * 60 * 60 * 1000
})

export const PHASE = Object.freeze({
    CLOSED: 'closed',
    OPEN: 'open',
    HALF_OPEN: 'half-open'
})

export const OUTCOME = Object.freeze({
    SUCCESS: 'success',
    COOLDOWN: 'cooldown',
    SERVER_ERROR: 'server-error',
    BLOCKED: 'blocked',
    UNKNOWN_FAILURE: 'unknown-failure'
})

export const DECISION_REASON = Object.freeze({
    CLOSED: 'closed',
    CIRCUIT_OPEN: 'circuit-open',
    HALF_OPEN_TRIAL: 'half-open-trial',
    HALF_OPEN_PROBE_IN_FLIGHT: 'half-open-probe-in-flight'
})

const COUNTER_CAP = 1_000_000_000

const COOLDOWN_OUTCOMES = new Set(['cooldown', 'rate-limit', 'rate-limited', 'ratelimited', 'throttled', 'too-many-requests'])
const BLOCKED_OUTCOMES = new Set(['blocked', 'unauthorized', 'forbidden', 'not-found', 'not-visible', 'payment-required', 'gone', 'unlaunchable'])
const SERVER_ERROR_OUTCOMES = new Set(['server-error', 'timeout', 'transport-error', 'degraded', 'empty-200', 'bad-gateway', 'unavailable'])
const SUCCESS_OUTCOMES = new Set(['success', 'ok', 'healthy', 'proven', 'chat-ok', 'catalog-visible', 'catalog-visible-exact'])
const BLOCKED_STATUS_CODES = new Set([400, 401, 402, 403, 404, 405, 410, 451])

function assertNow(now, label = 'now') {
    if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new TypeError(`model-health-circuit-state: \`${label}\` must be a finite epoch-ms number`)
    }
    return now
}

function assertRouteKey(routeKey) {
    if (typeof routeKey !== 'string' || routeKey.trim() === '') {
        throw new TypeError('model-health-circuit-state: `routeKey` must be a non-empty string')
    }
    return routeKey
}

function finiteOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveIntOrNull(value) {
    const n = finiteOrNull(value)
    if (n == null || n < 0) return null
    return Math.round(n)
}

function capCounter(value) {
    const n = positiveIntOrNull(value) ?? 0
    return n > COUNTER_CAP ? COUNTER_CAP : n
}

/** Route key shared with the evidence ledger: target \0 route \0 modelId. */
export function makeRouteKey({ target, route, modelId } = {}) {
    for (const [name, value] of [['target', target], ['route', route], ['modelId', modelId]]) {
        if (typeof value !== 'string' || value.trim() === '') {
            throw new TypeError(`model-health-circuit-state: \`${name}\` must be a non-empty string`)
        }
    }
    return `${target}\u0000${route}\u0000${modelId}`
}

/** Inverse of makeRouteKey; returns null when the key is not the 3-part form. */
export function parseRouteKey(routeKey) {
    assertRouteKey(routeKey)
    const parts = routeKey.split('\u0000')
    if (parts.length !== 3 || parts.some((part) => part === '')) return null
    return { target: parts[0], route: parts[1], modelId: parts[2] }
}

export function resolvePolicy(...overrides) {
    const merged = { ...DEFAULT_CIRCUIT_POLICY }
    for (const override of overrides) {
        if (!override || typeof override !== 'object') continue
        for (const key of Object.keys(DEFAULT_CIRCUIT_POLICY)) {
            const value = finiteOrNull(override[key])
            if (value == null || value < 0) continue
            merged[key] = value
        }
    }
    // Deterministic guard rails: keep the ladder finite and monotone.
    merged.backoffFactor = merged.backoffFactor < 1 ? 1 : merged.backoffFactor
    merged.maxBackoffSteps = Math.min(Math.round(merged.maxBackoffSteps), 64)
    merged.openAfterFailures = Math.max(1, Math.round(merged.openAfterFailures))
    merged.halfOpenMaxProbes = Math.max(1, Math.round(merged.halfOpenMaxProbes))
    merged.maxRouteEntries = Math.max(1, Math.round(merged.maxRouteEntries))
    merged.maxOpenMs = Math.max(merged.maxOpenMs, merged.maxBackoffMs)
    return merged
}

/** Fresh, whitelisted per-route record. Never carries caller payload fields. */
export function initialRouteState(routeKey) {
    return {
        routeKey: assertRouteKey(routeKey),
        phase: PHASE.CLOSED,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalProbes: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        lastOutcome: null,
        lastStatusCode: null,
        lastProbeAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastRetryAfterMs: null,
        backoffMs: 0,
        openedAt: null,
        openUntil: null,
        halfOpenProbeStartedAt: null,
        halfOpenProbesInFlight: 0
    }
}

/** Fresh container state. `policy` overrides are stored so schedules stay reproducible. */
export function createCircuitState({ now = null, policy = null } = {}) {
    const state = {
        schemaVersion: SCHEMA_VERSION,
        createdAt: finiteOrNull(now),
        updatedAt: finiteOrNull(now),
        routes: {}
    }
    if (policy && typeof policy === 'object') {
        state.policy = resolvePolicy(policy)
    }
    return state
}

function normalizeRouteState(raw, routeKey) {
    const base = initialRouteState(routeKey)
    if (!raw || typeof raw !== 'object') return base

    const phase = raw.phase === PHASE.OPEN ? PHASE.OPEN : PHASE.CLOSED
    const openUntil = positiveIntOrNull(raw.openUntil)
    const lastOutcome = typeof raw.lastOutcome === 'string' && Object.values(OUTCOME).includes(raw.lastOutcome)
        ? raw.lastOutcome
        : null

    return {
        ...base,
        phase: phase === PHASE.OPEN && openUntil == null ? PHASE.CLOSED : phase,
        consecutiveFailures: capCounter(raw.consecutiveFailures),
        consecutiveSuccesses: capCounter(raw.consecutiveSuccesses),
        totalProbes: capCounter(raw.totalProbes),
        totalFailures: capCounter(raw.totalFailures),
        totalSuccesses: capCounter(raw.totalSuccesses),
        lastOutcome,
        lastStatusCode: positiveIntOrNull(raw.lastStatusCode),
        lastProbeAt: positiveIntOrNull(raw.lastProbeAt),
        lastSuccessAt: positiveIntOrNull(raw.lastSuccessAt),
        lastFailureAt: positiveIntOrNull(raw.lastFailureAt),
        lastRetryAfterMs: positiveIntOrNull(raw.lastRetryAfterMs),
        backoffMs: positiveIntOrNull(raw.backoffMs) ?? 0,
        openedAt: positiveIntOrNull(raw.openedAt),
        openUntil,
        halfOpenProbeStartedAt: positiveIntOrNull(raw.halfOpenProbeStartedAt),
        halfOpenProbesInFlight: capCounter(raw.halfOpenProbesInFlight)
    }
}

function normalizeContainer(state) {
    const routes = {}
    const rawRoutes = state && typeof state === 'object' && state.routes && typeof state.routes === 'object'
        ? state.routes
        : {}
    for (const key of Object.keys(rawRoutes).sort()) {
        if (typeof key !== 'string' || key.trim() === '') continue
        routes[key] = normalizeRouteState(rawRoutes[key], key)
    }

    const next = {
        schemaVersion: SCHEMA_VERSION,
        createdAt: finiteOrNull(state?.createdAt),
        updatedAt: finiteOrNull(state?.updatedAt),
        routes
    }
    if (state && typeof state === 'object' && state.policy && typeof state.policy === 'object') {
        next.policy = resolvePolicy(state.policy)
    }
    return next
}

/** Normalized (never undefined) route record for a key, without mutating `state`. */
export function getRouteState(state, routeKey) {
    assertRouteKey(routeKey)
    return normalizeRouteState(state?.routes?.[routeKey], routeKey)
}

export function classifyOutcome({ outcome = null, statusCode = null } = {}) {
    const normalized = typeof outcome === 'string'
        ? outcome.trim().toLowerCase().replaceAll('_', '-')
        : null
    const code = positiveIntOrNull(statusCode)

    // Fail-closed ordering: rate limits and hard blocks win over an optimistic label.
    if (code === 429 || (normalized && COOLDOWN_OUTCOMES.has(normalized))) return OUTCOME.COOLDOWN
    if ((code != null && BLOCKED_STATUS_CODES.has(code)) || (normalized && BLOCKED_OUTCOMES.has(normalized))) return OUTCOME.BLOCKED
    if ((code != null && code >= 500 && code < 600) || (normalized && SERVER_ERROR_OUTCOMES.has(normalized))) return OUTCOME.SERVER_ERROR
    if (normalized && (SUCCESS_OUTCOMES.has(normalized) || normalized.endsWith('-proven'))) return OUTCOME.SUCCESS
    if (normalized == null && code != null && code >= 200 && code < 300) return OUTCOME.SUCCESS
    if (normalized != null && code != null && code >= 200 && code < 300 && !normalized.startsWith('error')) return OUTCOME.SUCCESS
    // Unknown label with no usable status code: treat as a failure so we back off.
    return OUTCOME.UNKNOWN_FAILURE
}

export function isFailureOutcome(outcome) {
    return outcome !== OUTCOME.SUCCESS
}

/** Bounded exponential backoff: base * factor^(failures-1), capped by maxBackoffMs. */
export function backoffForFailures(failures, policy = DEFAULT_CIRCUIT_POLICY) {
    const resolved = resolvePolicy(policy)
    const n = positiveIntOrNull(failures) ?? 0
    if (n <= 0) return 0
    const exponent = Math.min(n - 1, resolved.maxBackoffSteps)
    const raw = resolved.baseBackoffMs * Math.pow(resolved.backoffFactor, exponent)
    const bounded = Math.min(Math.round(raw), Math.round(resolved.maxBackoffMs))
    return bounded < 0 ? 0 : bounded
}

function sanitizeRetryAfter(retryAfterMs, policy) {
    const value = positiveIntOrNull(retryAfterMs)
    if (value == null) return null
    return Math.min(value, Math.round(policy.maxRetryAfterMs))
}

function suppressionWindowMs({ outcome, failures, retryAfterMs, policy }) {
    const backoff = backoffForFailures(failures, policy)
    const floor = outcome === OUTCOME.BLOCKED ? Math.round(policy.blockedOpenMs) : 0
    const candidate = Math.max(backoff, floor, retryAfterMs ?? 0)
    return Math.min(candidate, Math.round(policy.maxOpenMs))
}

/** Derived phase for a route at `now`: closed | open | half-open. */
export function circuitPhase(state, { routeKey, now } = {}) {
    assertRouteKey(routeKey)
    assertNow(now)
    const route = getRouteState(state, routeKey)
    if (route.phase !== PHASE.OPEN || route.openUntil == null) return PHASE.CLOSED
    return now < route.openUntil ? PHASE.OPEN : PHASE.HALF_OPEN
}

/**
 * Earliest timestamp at which a probe is permitted, independent of `now`.
 * `null` means "no suppression recorded" (ready whenever the caller asks).
 */
export function nextReadyAt(state, routeKeyOrOptions) {
    const routeKey = typeof routeKeyOrOptions === 'string' ? routeKeyOrOptions : routeKeyOrOptions?.routeKey
    assertRouteKey(routeKey)
    const route = getRouteState(state, routeKey)
    if (route.phase !== PHASE.OPEN || route.openUntil == null) return null
    return route.openUntil
}

/** Pure decision: may this route be probed at `now`? Never mutates, never probes. */
export function canProbe(state, { routeKey, now, policy = null } = {}) {
    assertRouteKey(routeKey)
    assertNow(now)
    const resolved = resolvePolicy(state?.policy, policy)
    const route = getRouteState(state, routeKey)
    const phase = circuitPhase(state, { routeKey, now })

    if (phase === PHASE.OPEN) {
        const readyAt = route.openUntil
        return {
            routeKey,
            now,
            allowed: false,
            phase,
            reason: DECISION_REASON.CIRCUIT_OPEN,
            nextReadyAt: readyAt,
            waitMs: Math.max(0, readyAt - now),
            consecutiveFailures: route.consecutiveFailures,
            lastOutcome: route.lastOutcome
        }
    }

    if (phase === PHASE.HALF_OPEN) {
        const startedAt = route.halfOpenProbeStartedAt
        const inFlight = route.halfOpenProbesInFlight
        const timeoutAt = startedAt == null ? null : startedAt + Math.round(resolved.halfOpenProbeTimeoutMs)
        const stale = timeoutAt == null ? true : now >= timeoutAt
        if (inFlight >= resolved.halfOpenMaxProbes && !stale) {
            return {
                routeKey,
                now,
                allowed: false,
                phase,
                reason: DECISION_REASON.HALF_OPEN_PROBE_IN_FLIGHT,
                nextReadyAt: timeoutAt,
                waitMs: Math.max(0, timeoutAt - now),
                consecutiveFailures: route.consecutiveFailures,
                lastOutcome: route.lastOutcome
            }
        }
        return {
            routeKey,
            now,
            allowed: true,
            phase,
            reason: DECISION_REASON.HALF_OPEN_TRIAL,
            nextReadyAt: route.openUntil,
            waitMs: 0,
            consecutiveFailures: route.consecutiveFailures,
            lastOutcome: route.lastOutcome
        }
    }

    return {
        routeKey,
        now,
        allowed: true,
        phase: PHASE.CLOSED,
        reason: DECISION_REASON.CLOSED,
        nextReadyAt: null,
        waitMs: 0,
        consecutiveFailures: route.consecutiveFailures,
        lastOutcome: route.lastOutcome
    }
}

/** Scheduling view of canProbe: when is this route next probe-able? */
export function nextReady(state, { routeKey, now, policy = null } = {}) {
    const decision = canProbe(state, { routeKey, now, policy })
    return {
        routeKey: decision.routeKey,
        now: decision.now,
        phase: decision.phase,
        allowed: decision.allowed,
        reason: decision.reason,
        readyAt: decision.allowed ? now : decision.nextReadyAt,
        waitMs: decision.waitMs
    }
}

function touch(container, now) {
    return { ...container, updatedAt: now, createdAt: container.createdAt ?? now }
}

/**
 * Record that the caller is about to run a probe. Optional, but required for
 * half-open single-flight accounting. Does not start anything itself.
 */
export function recordProbeAttempt(state, { routeKey, now, policy = null } = {}) {
    assertRouteKey(routeKey)
    assertNow(now)
    const container = normalizeContainer(state)
    resolvePolicy(container.policy, policy)
    const route = { ...getRouteState(container, routeKey) }
    const phase = circuitPhase(container, { routeKey, now })

    route.lastProbeAt = now
    route.totalProbes = capCounter(route.totalProbes + 1)
    if (phase === PHASE.HALF_OPEN) {
        route.halfOpenProbeStartedAt = now
        route.halfOpenProbesInFlight = capCounter(route.halfOpenProbesInFlight + 1)
    }

    return touch({ ...container, routes: { ...container.routes, [routeKey]: route } }, now)
}

/**
 * Record a completed probe result and return the next state.
 * Only whitelisted values (`outcome` enum, `statusCode`, `retryAfterMs`) are stored,
 * so caller payloads/headers/keys can never reach the serialized state.
 */
export function recordProbeResult(state, { routeKey, now, outcome = null, statusCode = null, retryAfterMs = null, policy = null } = {}) {
    assertRouteKey(routeKey)
    assertNow(now)
    const container = normalizeContainer(state)
    const resolved = resolvePolicy(container.policy, policy)
    const previous = getRouteState(container, routeKey)
    const classified = classifyOutcome({ outcome, statusCode })
    const code = positiveIntOrNull(statusCode)
    const retryAfter = sanitizeRetryAfter(retryAfterMs, resolved)

    const next = {
        ...previous,
        lastOutcome: classified,
        lastStatusCode: code,
        lastProbeAt: now,
        lastRetryAfterMs: retryAfter,
        halfOpenProbeStartedAt: null,
        halfOpenProbesInFlight: 0
    }
    // A probe result always counts as a probe, even if recordProbeAttempt was skipped.
    if (previous.lastProbeAt !== now) {
        next.totalProbes = capCounter(previous.totalProbes + 1)
    }

    if (classified === OUTCOME.SUCCESS) {
        // Success (including a half-open trial) closes and resets the circuit.
        next.phase = PHASE.CLOSED
        next.consecutiveFailures = 0
        next.consecutiveSuccesses = capCounter(previous.consecutiveSuccesses + 1)
        next.totalSuccesses = capCounter(previous.totalSuccesses + 1)
        next.lastSuccessAt = now
        next.backoffMs = 0
        next.openedAt = null
        next.openUntil = null
        return touch({ ...container, routes: { ...container.routes, [routeKey]: next } }, now)
    }

    const failures = capCounter(previous.consecutiveFailures + 1)
    const windowMs = suppressionWindowMs({ outcome: classified, failures, retryAfterMs: retryAfter, policy: resolved })
    const mustSuppressNow = failures >= resolved.openAfterFailures
        || classified === OUTCOME.COOLDOWN
        || classified === OUTCOME.BLOCKED

    next.consecutiveFailures = failures
    next.consecutiveSuccesses = 0
    next.totalFailures = capCounter(previous.totalFailures + 1)
    next.lastFailureAt = now
    next.backoffMs = windowMs

    if (mustSuppressNow && windowMs > 0) {
        next.phase = PHASE.OPEN
        next.openedAt = now
        next.openUntil = now + windowMs
    } else {
        next.phase = PHASE.CLOSED
        next.openedAt = null
        next.openUntil = null
    }

    return touch({ ...container, routes: { ...container.routes, [routeKey]: next } }, now)
}

/**
 * Pure computation of which of `routeKeys` are probe-able at `now`.
 * Returns ordered lists only — it does not probe, retry, or queue anything.
 * Ready order: least-recently-probed first, then routeKey ascending.
 * Suppressed order: soonest readyAt first, then routeKey ascending.
 */
export function planProbes(state, { routeKeys = [], now, policy = null } = {}) {
    assertNow(now)
    const container = normalizeContainer(state)
    const seen = new Set()
    const keys = []
    for (const key of Array.isArray(routeKeys) ? routeKeys : []) {
        if (typeof key !== 'string' || key.trim() === '' || seen.has(key)) continue
        seen.add(key)
        keys.push(key)
    }

    const ready = []
    const suppressed = []
    for (const key of keys) {
        const decision = canProbe(container, { routeKey: key, now, policy })
        const route = getRouteState(container, key)
        const row = { ...decision, lastProbeAt: route.lastProbeAt }
        if (decision.allowed) ready.push(row)
        else suppressed.push(row)
    }

    ready.sort((a, b) => (a.lastProbeAt ?? 0) - (b.lastProbeAt ?? 0) || a.routeKey.localeCompare(b.routeKey))
    suppressed.sort((a, b) => (a.nextReadyAt ?? 0) - (b.nextReadyAt ?? 0) || a.routeKey.localeCompare(b.routeKey))

    return { now, ready, suppressed }
}

/**
 * Drop only fully-closed, long-idle routes so state stays bounded.
 * Suppressed (open/half-open) routes are never pruned — pruning them would
 * silently re-enable probes against a cooling-down provider.
 */
export function pruneCircuitState(state, { now, maxRouteEntries = null, idleMs = null, policy = null } = {}) {
    assertNow(now)
    const container = normalizeContainer(state)
    const resolved = resolvePolicy(container.policy, policy)
    const limit = positiveIntOrNull(maxRouteEntries) ?? resolved.maxRouteEntries
    const idleLimit = positiveIntOrNull(idleMs) ?? resolved.pruneIdleMs

    const keys = Object.keys(container.routes).sort()
    const prunable = keys.filter((key) => {
        const route = container.routes[key]
        if (route.phase === PHASE.OPEN && route.openUntil != null) return false
        const lastProbeAt = route.lastProbeAt
        return lastProbeAt == null || (now - lastProbeAt) >= idleLimit
    })

    const dropped = new Set(prunable)
    if (keys.length - dropped.size > limit) {
        const remaining = keys
            .filter((key) => !dropped.has(key))
            .filter((key) => {
                const route = container.routes[key]
                return !(route.phase === PHASE.OPEN && route.openUntil != null)
            })
            .sort((a, b) => (container.routes[a].lastProbeAt ?? 0) - (container.routes[b].lastProbeAt ?? 0) || a.localeCompare(b))
        for (const key of remaining) {
            if (keys.length - dropped.size <= limit) break
            dropped.add(key)
        }
    }

    const routes = {}
    for (const key of keys) {
        if (dropped.has(key)) continue
        routes[key] = container.routes[key]
    }

    return touch({ ...container, routes }, now)
}

/** Compact, secret-free summary for dashboards / reports. */
export function summarizeCircuitState(state, { now, policy = null } = {}) {
    assertNow(now)
    const container = normalizeContainer(state)
    const counts = { closed: 0, open: 0, 'half-open': 0 }
    let soonestReadyAt = null
    let soonestRouteKey = null

    for (const key of Object.keys(container.routes).sort()) {
        const phase = circuitPhase(container, { routeKey: key, now })
        counts[phase] += 1
        if (phase !== PHASE.OPEN) continue
        const readyAt = container.routes[key].openUntil
        if (soonestReadyAt == null || readyAt < soonestReadyAt) {
            soonestReadyAt = readyAt
            soonestRouteKey = key
        }
    }

    return {
        schemaVersion: SCHEMA_VERSION,
        now,
        policy: resolvePolicy(container.policy, policy),
        routeCount: Object.keys(container.routes).length,
        phases: counts,
        soonestReadyAt,
        soonestReadyRouteKey: soonestRouteKey
    }
}
