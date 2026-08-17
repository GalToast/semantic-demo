import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
    DEFAULT_CIRCUIT_POLICY,
    OUTCOME,
    PHASE,
    SCHEMA_VERSION,
    backoffForFailures,
    canProbe,
    circuitPhase,
    classifyOutcome,
    createCircuitState,
    getRouteState,
    initialRouteState,
    makeRouteKey,
    nextReady,
    nextReadyAt,
    parseRouteKey,
    planProbes,
    pruneCircuitState,
    recordProbeAttempt,
    recordProbeResult,
    resolvePolicy,
    summarizeCircuitState
} from '../scripts/model-health-circuit-state.mjs'

const T0 = new Date('2026-08-16T12:00:00.000Z').getTime()
const KEY_A = makeRouteKey({ target: 'laptop', route: '/kilo/v1', modelId: 'alpha' })
const KEY_B = makeRouteKey({ target: 'laptop', route: '/kilo/v1', modelId: 'beta' })

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

// 1. initial state is JSON-serializable, route-scoped, and versioned
{
    const state = createCircuitState({ now: T0 })
    assert.equal(state.schemaVersion, SCHEMA_VERSION)
    assert.deepEqual(state.routes, {})
    assert.deepEqual(clone(state), state)

    const route = initialRouteState(KEY_A)
    assert.equal(route.routeKey, KEY_A)
    assert.equal(route.phase, PHASE.CLOSED)
    assert.equal(route.consecutiveFailures, 0)
    assert.equal(route.openUntil, null)
    assert.deepEqual(clone(route), route)
    assert.deepEqual(parseRouteKey(KEY_A), { target: 'laptop', route: '/kilo/v1', modelId: 'alpha' })
}

// 2. an unseen route is closed and immediately probe-able; nextReadyAt is null
{
    const state = createCircuitState({ now: T0 })
    const decision = canProbe(state, { routeKey: KEY_A, now: T0 })
    assert.equal(decision.allowed, true)
    assert.equal(decision.phase, PHASE.CLOSED)
    assert.equal(decision.reason, 'closed')
    assert.equal(decision.nextReadyAt, null)
    assert.equal(decision.waitMs, 0)
    assert.equal(nextReadyAt(state, KEY_A), null)
    assert.equal(nextReady(state, { routeKey: KEY_A, now: T0 }).readyAt, T0)
    assert.equal(getRouteState(state, KEY_A).phase, PHASE.CLOSED)
}

// 3. 429 honors retryAfterMs and suppresses probes for the whole window
{
    const state = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        outcome: 'cooldown',
        statusCode: 429,
        retryAfterMs: 90_000
    })

    const route = getRouteState(state, KEY_A)
    assert.equal(route.phase, PHASE.OPEN)
    assert.equal(route.lastOutcome, OUTCOME.COOLDOWN)
    assert.equal(route.lastRetryAfterMs, 90_000)
    assert.equal(route.openUntil, T0 + 90_000)

    const during = canProbe(state, { routeKey: KEY_A, now: T0 + 89_999 })
    assert.equal(during.allowed, false)
    assert.equal(during.phase, PHASE.OPEN)
    assert.equal(during.reason, 'circuit-open')
    assert.equal(during.nextReadyAt, T0 + 90_000)
    assert.equal(during.waitMs, 1)

    // retryAfter shorter than the backoff floor must not shorten the window
    const shortRetry = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 429,
        retryAfterMs: 1_000
    })
    assert.equal(getRouteState(shortRetry, KEY_A).openUntil, T0 + DEFAULT_CIRCUIT_POLICY.baseBackoffMs)
}

// 4. retryAfterMs is bounded and hostile values are ignored
{
    const huge = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 429,
        retryAfterMs: 10 * 24 * 60 * 60 * 1000
    })
    assert.equal(getRouteState(huge, KEY_A).lastRetryAfterMs, DEFAULT_CIRCUIT_POLICY.maxRetryAfterMs)
    assert.equal(getRouteState(huge, KEY_A).openUntil, T0 + DEFAULT_CIRCUIT_POLICY.maxOpenMs)

    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, '600000', null]) {
        const next = recordProbeResult(createCircuitState({ now: T0 }), {
            routeKey: KEY_A,
            now: T0,
            statusCode: 429,
            retryAfterMs: bad
        })
        const route = getRouteState(next, KEY_A)
        assert.equal(route.lastRetryAfterMs, null)
        assert.equal(route.openUntil, T0 + DEFAULT_CIRCUIT_POLICY.baseBackoffMs)
        assert.equal(Number.isFinite(route.openUntil), true)
    }
}

// 5. repeated 5xx uses bounded exponential backoff with a deterministic maximum
{
    const expected = [30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000]
    let state = createCircuitState({ now: T0 })
    let now = T0
    const observed = []

    for (let i = 0; i < expected.length; i += 1) {
        state = recordProbeResult(state, { routeKey: KEY_A, now, outcome: 'error', statusCode: 503 })
        const route = getRouteState(state, KEY_A)
        observed.push(route.openUntil - now)
        now = route.openUntil
    }

    assert.deepEqual(observed, expected)
    assert.equal(backoffForFailures(1), 30_000)
    assert.equal(backoffForFailures(6), 900_000)
    assert.equal(backoffForFailures(500), DEFAULT_CIRCUIT_POLICY.maxBackoffMs)
    assert.equal(backoffForFailures(0), 0)
    assert.equal(Number.isFinite(backoffForFailures(1e6)), true)
}

// 6. the window expires into half-open, which permits exactly one trial probe
{
    const state = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 503
    })
    const openUntil = getRouteState(state, KEY_A).openUntil

    assert.equal(circuitPhase(state, { routeKey: KEY_A, now: openUntil - 1 }), PHASE.OPEN)
    assert.equal(circuitPhase(state, { routeKey: KEY_A, now: openUntil }), PHASE.HALF_OPEN)

    const trial = canProbe(state, { routeKey: KEY_A, now: openUntil })
    assert.equal(trial.allowed, true)
    assert.equal(trial.phase, PHASE.HALF_OPEN)
    assert.equal(trial.reason, 'half-open-trial')

    const inFlight = recordProbeAttempt(state, { routeKey: KEY_A, now: openUntil })
    const blocked = canProbe(inFlight, { routeKey: KEY_A, now: openUntil + 5 })
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.reason, 'half-open-probe-in-flight')
    assert.equal(blocked.nextReadyAt, openUntil + DEFAULT_CIRCUIT_POLICY.halfOpenProbeTimeoutMs)

    // an abandoned trial probe cannot wedge the route forever
    const afterTimeout = canProbe(inFlight, {
        routeKey: KEY_A,
        now: openUntil + DEFAULT_CIRCUIT_POLICY.halfOpenProbeTimeoutMs
    })
    assert.equal(afterTimeout.allowed, true)
    assert.equal(afterTimeout.reason, 'half-open-trial')
}

// 7. a successful half-open probe closes and fully resets the circuit
{
    const opened = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 503
    })
    const openUntil = getRouteState(opened, KEY_A).openUntil
    const attempted = recordProbeAttempt(opened, { routeKey: KEY_A, now: openUntil })
    const closed = recordProbeResult(attempted, {
        routeKey: KEY_A,
        now: openUntil + 10,
        outcome: 'success',
        statusCode: 200
    })

    const route = getRouteState(closed, KEY_A)
    assert.equal(route.phase, PHASE.CLOSED)
    assert.equal(route.lastOutcome, OUTCOME.SUCCESS)
    assert.equal(route.consecutiveFailures, 0)
    assert.equal(route.consecutiveSuccesses, 1)
    assert.equal(route.backoffMs, 0)
    assert.equal(route.openUntil, null)
    assert.equal(route.openedAt, null)
    assert.equal(route.halfOpenProbesInFlight, 0)
    assert.equal(canProbe(closed, { routeKey: KEY_A, now: openUntil + 10 }).allowed, true)

    // backoff restarts from the base step after a clean close
    const reopened = recordProbeResult(closed, { routeKey: KEY_A, now: openUntil + 20, statusCode: 503 })
    assert.equal(getRouteState(reopened, KEY_A).openUntil, openUntil + 20 + DEFAULT_CIRCUIT_POLICY.baseBackoffMs)
}

// 8. a failed half-open probe reopens the circuit with an escalated window
{
    const opened = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 503
    })
    const openUntil = getRouteState(opened, KEY_A).openUntil
    const reopened = recordProbeResult(opened, { routeKey: KEY_A, now: openUntil, statusCode: 503 })

    const route = getRouteState(reopened, KEY_A)
    assert.equal(route.phase, PHASE.OPEN)
    assert.equal(route.consecutiveFailures, 2)
    assert.equal(route.openUntil, openUntil + 60_000)
    assert.equal(canProbe(reopened, { routeKey: KEY_A, now: openUntil + 1 }).allowed, false)
}

// 9. openAfterFailures relaxes 5xx only; 429 and hard blocks suppress immediately
{
    const policy = { openAfterFailures: 2 }
    const first = recordProbeResult(createCircuitState({ now: T0, policy }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 503
    })
    assert.equal(getRouteState(first, KEY_A).phase, PHASE.CLOSED)
    assert.equal(getRouteState(first, KEY_A).consecutiveFailures, 1)
    assert.equal(canProbe(first, { routeKey: KEY_A, now: T0 }).allowed, true)

    const second = recordProbeResult(first, { routeKey: KEY_A, now: T0 + 1, statusCode: 503 })
    assert.equal(getRouteState(second, KEY_A).phase, PHASE.OPEN)
    assert.equal(canProbe(second, { routeKey: KEY_A, now: T0 + 1 }).allowed, false)

    const rateLimited = recordProbeResult(createCircuitState({ now: T0, policy }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 429
    })
    assert.equal(getRouteState(rateLimited, KEY_A).phase, PHASE.OPEN)

    const hardBlocked = recordProbeResult(createCircuitState({ now: T0, policy }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 403
    })
    const blockedRoute = getRouteState(hardBlocked, KEY_A)
    assert.equal(blockedRoute.phase, PHASE.OPEN)
    assert.equal(blockedRoute.lastOutcome, OUTCOME.BLOCKED)
    assert.equal(blockedRoute.openUntil, T0 + DEFAULT_CIRCUIT_POLICY.blockedOpenMs)
}

// 10. outcome classification is fail-closed
{
    assert.equal(classifyOutcome({ statusCode: 200 }), OUTCOME.SUCCESS)
    assert.equal(classifyOutcome({ outcome: 'chat_ok', statusCode: 200 }), OUTCOME.SUCCESS)
    assert.equal(classifyOutcome({ outcome: 'vision-proven' }), OUTCOME.SUCCESS)
    assert.equal(classifyOutcome({ outcome: 'success', statusCode: 429 }), OUTCOME.COOLDOWN)
    assert.equal(classifyOutcome({ outcome: 'rate_limited' }), OUTCOME.COOLDOWN)
    assert.equal(classifyOutcome({ outcome: 'timeout' }), OUTCOME.SERVER_ERROR)
    assert.equal(classifyOutcome({ outcome: 'empty-200', statusCode: 200 }), OUTCOME.SERVER_ERROR)
    assert.equal(classifyOutcome({ statusCode: 404 }), OUTCOME.BLOCKED)
    assert.equal(classifyOutcome({ outcome: 'mystery' }), OUTCOME.UNKNOWN_FAILURE)
    assert.equal(classifyOutcome({}), OUTCOME.UNKNOWN_FAILURE)

    // an unrecognized label with no status code still backs off
    const unknown = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        outcome: 'mystery'
    })
    assert.equal(getRouteState(unknown, KEY_A).phase, PHASE.OPEN)
    assert.equal(getRouteState(unknown, KEY_A).lastOutcome, OUTCOME.UNKNOWN_FAILURE)
}

// 11. state is route-scoped: one route's cooldown never leaks into another
{
    const state = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 429,
        retryAfterMs: 60_000
    })
    assert.equal(canProbe(state, { routeKey: KEY_A, now: T0 }).allowed, false)
    assert.equal(canProbe(state, { routeKey: KEY_B, now: T0 }).allowed, true)
    assert.deepEqual(Object.keys(state.routes), [KEY_A])
}

// 12. every entry point is pure: inputs are never mutated
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 503 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0, statusCode: 200 })
    const before = clone(state)

    canProbe(state, { routeKey: KEY_A, now: T0 + 1 })
    nextReady(state, { routeKey: KEY_A, now: T0 + 1 })
    nextReadyAt(state, KEY_A)
    circuitPhase(state, { routeKey: KEY_A, now: T0 + 1 })
    getRouteState(state, KEY_A)
    summarizeCircuitState(state, { now: T0 + 1 })
    planProbes(state, { routeKeys: [KEY_A, KEY_B], now: T0 + 1 })
    pruneCircuitState(state, { now: T0 + 1 })
    recordProbeAttempt(state, { routeKey: KEY_A, now: T0 + 1 })
    recordProbeResult(state, { routeKey: KEY_A, now: T0 + 1, statusCode: 200 })

    assert.deepEqual(state, before)
}

// 13. output stays JSON-serializable and identical inputs give identical outputs
{
    const build = () => {
        let state = createCircuitState({ now: T0 })
        state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 45_000 })
        state = recordProbeAttempt(state, { routeKey: KEY_B, now: T0 + 5 })
        state = recordProbeResult(state, { routeKey: KEY_B, now: T0 + 5, outcome: 'success', statusCode: 200 })
        return state
    }

    const first = build()
    const second = build()
    assert.deepEqual(first, second)
    assert.deepEqual(clone(first), first)
    assert.equal(JSON.stringify(first).includes('undefined'), false)
    assert.deepEqual(
        canProbe(first, { routeKey: KEY_A, now: T0 + 10 }),
        canProbe(second, { routeKey: KEY_A, now: T0 + 10 })
    )

    // survives a JSON round-trip without changing decisions
    const roundTripped = clone(first)
    assert.deepEqual(
        canProbe(roundTripped, { routeKey: KEY_A, now: T0 + 10 }),
        canProbe(first, { routeKey: KEY_A, now: T0 + 10 })
    )
}

// 14. state is secret-free: caller extras and hostile stored fields are dropped
{
    const hostile = {
        schemaVersion: SCHEMA_VERSION,
        routes: {
            [KEY_A]: {
                phase: PHASE.OPEN,
                openUntil: T0 + 60_000,
                apiKey: 'sk-secret-token-1234567890',
                authorization: 'Bearer abc123def456ghi789',
                headers: { cookie: 'session=abc123def456ghi789' }
            }
        }
    }

    const next = recordProbeResult(hostile, {
        routeKey: KEY_A,
        now: T0 + 60_000,
        outcome: 'success',
        statusCode: 200,
        apiKey: 'sk-secret-token-1234567890',
        authorization: 'Bearer abc123def456ghi789',
        body: { token: 'sk-secret-token-1234567890' }
    })

    const serialized = JSON.stringify(next)
    assert.equal(serialized.includes('sk-secret-token'), false)
    assert.equal(serialized.includes('abc123def456ghi789'), false)
    assert.equal(serialized.includes('apiKey'), false)
    assert.equal(serialized.includes('authorization'), false)
    assert.deepEqual(Object.keys(getRouteState(next, KEY_A)).sort(), Object.keys(initialRouteState(KEY_A)).sort())

    // an "open" record with no window cannot suppress forever
    const bogus = { schemaVersion: SCHEMA_VERSION, routes: { [KEY_A]: { phase: PHASE.OPEN, openUntil: null } } }
    assert.equal(canProbe(bogus, { routeKey: KEY_A, now: T0 }).allowed, true)
}

// 15. invalid arguments fail loudly instead of guessing a clock
{
    const state = createCircuitState({ now: T0 })
    assert.throws(() => canProbe(state, { routeKey: KEY_A }), TypeError)
    assert.throws(() => canProbe(state, { routeKey: KEY_A, now: Number.NaN }), TypeError)
    assert.throws(() => canProbe(state, { routeKey: '', now: T0 }), TypeError)
    assert.throws(() => canProbe(state, { now: T0 }), TypeError)
    assert.throws(() => recordProbeResult(state, { routeKey: KEY_A, statusCode: 200 }), TypeError)
    assert.throws(() => recordProbeAttempt(state, { routeKey: KEY_A }), TypeError)
    assert.throws(() => summarizeCircuitState(state, {}), TypeError)
    assert.throws(() => makeRouteKey({ target: 'laptop', route: '/kilo/v1' }), TypeError)
    assert.equal(parseRouteKey('not-a-composite-key'), null)
}

// 16. planProbes only computes ordered decisions (no probing, no queueing, no mutation)
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 120_000 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0 + 10, outcome: 'success', statusCode: 200 })

    const plan = planProbes(state, { routeKeys: [KEY_B, KEY_A, KEY_B, '', null], now: T0 + 20 })
    assert.equal(plan.now, T0 + 20)
    assert.deepEqual(plan.ready.map((row) => row.routeKey), [KEY_B])
    assert.deepEqual(plan.suppressed.map((row) => row.routeKey), [KEY_A])
    assert.equal(plan.suppressed[0].nextReadyAt, T0 + 120_000)
    assert.equal(plan.suppressed[0].reason, 'circuit-open')
    assert.deepEqual(clone(plan), plan)

    // deterministic ordering: least-recently-probed route first
    let two = createCircuitState({ now: T0 })
    two = recordProbeResult(two, { routeKey: KEY_B, now: T0 + 1, statusCode: 200 })
    two = recordProbeResult(two, { routeKey: KEY_A, now: T0 + 2, statusCode: 200 })
    assert.deepEqual(
        planProbes(two, { routeKeys: [KEY_A, KEY_B], now: T0 + 3 }).ready.map((row) => row.routeKey),
        [KEY_B, KEY_A]
    )
}

// 17. pruning keeps state bounded but never drops a suppressed route
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 600_000 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0, outcome: 'success', statusCode: 200 })

    const laterIdle = T0 + 48 * 60 * 60 * 1000
    const pruned = pruneCircuitState(state, { now: laterIdle, idleMs: 24 * 60 * 60 * 1000 })
    assert.deepEqual(Object.keys(pruned.routes), [KEY_A])

    const kept = pruneCircuitState(state, { now: T0 + 1, idleMs: 24 * 60 * 60 * 1000 })
    assert.deepEqual(Object.keys(kept.routes).sort(), [KEY_A, KEY_B].sort())

    const capped = pruneCircuitState(state, { now: T0 + 1, maxRouteEntries: 1, idleMs: 24 * 60 * 60 * 1000 })
    assert.deepEqual(Object.keys(capped.routes), [KEY_A])
    assert.deepEqual(clone(pruned), pruned)
}

// 18. summary is a compact, secret-free scheduling view
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 300_000 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0, outcome: 'success', statusCode: 200 })

    const summary = summarizeCircuitState(state, { now: T0 + 1 })
    assert.equal(summary.routeCount, 2)
    assert.equal(summary.phases.open, 1)
    assert.equal(summary.phases.closed, 1)
    assert.equal(summary.phases['half-open'], 0)
    assert.equal(summary.soonestReadyAt, T0 + 300_000)
    assert.equal(summary.soonestReadyRouteKey, KEY_A)
    assert.deepEqual(clone(summary), summary)

    const afterWindow = summarizeCircuitState(state, { now: T0 + 300_000 })
    assert.equal(afterWindow.phases['half-open'], 1)
    assert.equal(afterWindow.soonestReadyAt, null)
}

// 19. policy resolution is deterministic and bounded
{
    const resolved = resolvePolicy({ baseBackoffMs: 1_000, backoffFactor: 0, maxBackoffSteps: 9_999, openAfterFailures: 0 })
    assert.equal(resolved.baseBackoffMs, 1_000)
    assert.equal(resolved.backoffFactor, 1)
    assert.equal(resolved.maxBackoffSteps, 64)
    assert.equal(resolved.openAfterFailures, 1)
    assert.ok(resolved.maxOpenMs >= resolved.maxBackoffMs)

    // hostile / non-numeric overrides fall back to defaults
    const ignored = resolvePolicy({ baseBackoffMs: 'lots', maxBackoffMs: Number.NaN, junk: 1 })
    assert.equal(ignored.baseBackoffMs, DEFAULT_CIRCUIT_POLICY.baseBackoffMs)
    assert.equal(ignored.maxBackoffMs, DEFAULT_CIRCUIT_POLICY.maxBackoffMs)
    assert.equal(ignored.junk, undefined)

    // a stored policy keeps schedules reproducible from serialized state alone
    const state = recordProbeResult(createCircuitState({ now: T0, policy: { baseBackoffMs: 5_000 } }), {
        routeKey: KEY_A,
        now: T0,
        statusCode: 503
    })
    assert.equal(getRouteState(state, KEY_A).openUntil, T0 + 5_000)
    assert.equal(getRouteState(clone(state), KEY_A).openUntil, T0 + 5_000)
}

// 20. static guarantee: no clock reads, no sleeping, no network, no side channels
{
    const scriptPath = path.join('scripts', 'model-health-circuit-state.mjs')
    const source = fs.readFileSync(scriptPath, 'utf8')
    const forbidden = [
        /\bDate\s*\.\s*now\b/,
        /\bnew\s+Date\b/,
        /\bperformance\s*\.\s*now\b/,
        /\bsetTimeout\b/,
        /\bsetInterval\b/,
        /\bsetImmediate\b/,
        /\bqueueMicrotask\b/,
        /\bfetch\s*\(/,
        /\bXMLHttpRequest\b/,
        /\brequire\s*\(/,
        /\bprocess\s*\.\s*env\b/,
        /\bawait\b/,
        /\basync\b/,
        /from\s+['"]node:(?:http|https|net|fs|child_process|dns|tls)['"]/,
        /\bMath\s*\.\s*random\b/
    ]

    for (const pattern of forbidden) {
        assert.equal(pattern.test(source), false, `forbidden construct in circuit-state helper: ${pattern}`)
    }
    assert.equal(/^import\b/m.test(source), false, 'circuit-state helper must have zero imports')
}

console.log('model-health-circuit-state-contract: ok')
