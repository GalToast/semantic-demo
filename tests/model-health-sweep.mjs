#!/usr/bin/env node
/**
 * model-health-sweep.mjs
 *
 * Consolidated model-health subsystem sweep — replaces 6 near-identical
 * *-model-health-*-contract.mjs files with one manifest-driven scanner.
 *
 * Merged from:
 *   model-health-capability-ledger-contract.mjs   (153 LOC)
 *   model-health-check-safety-contract.mjs       (27 LOC)
 *   model-health-circuit-state-contract.mjs      (513 LOC)
 *   model-health-ledger-adapter-contract.mjs     (112 LOC)
 *   model-health-ledger-contract.mjs             (274 LOC)
 *   model-health-passive-events-contract.mjs     (255 LOC)
 *
 * Run: node tests/model-health-sweep.mjs
 */

'use strict'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

let failures = 0
let passed = 0

function section(label) {
    console.log(`\n=== ${label} ===`)
}

function pass(msg) {
    passed++
    console.log(`  ✓ ${msg}`)
}

function fail(msg) {
    failures++
    console.error(`  ✗ ${msg}`)
}

function assertNotEqual(actual, expected, msg) {
    if (actual === expected) {
        fail(`${msg}: expected not ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    } else {
        pass(msg)
    }
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        fail(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    } else {
        pass(msg)
    }
}

function assertDeepEqual(actual, expected, msg) {
    try {
        assert.deepEqual(actual, expected)
        pass(msg)
    } catch (e) {
        fail(`${msg}: ${e.message}`)
    }
}

function assertThrows(fn, msg) {
    try {
        fn()
        fail(`${msg}: expected throw, none happened`)
    } catch {
        pass(msg)
    }
}

// ── Sweep 1: model-health-capability-ledger-contract.mjs ──────────────────────
section('capability-ledger')

import { buildCapabilityStatus } from '../scripts/build-model-capability-status.mjs'

const catalog = {
    schemaVersion: 2,
    generatedAt: '2026-08-16T12:00:00.000Z',
    models: [
        { id: 'alpha', provider: 'openai', path: '/kilo/v1', metadata: { name: 'Alpha', supportsTools: true, supportsVision: false } },
        { id: 'beta', provider: 'openai', path: '/kilo/v1', metadata: { name: 'Beta', supportsTools: true } },
        { id: 'delta', provider: 'openai', path: '/kilo/v1', metadata: { name: 'Delta' } },
        { id: 'gamma', provider: 'openai', path: '/other/v1', metadata: { name: 'Gamma' } },
        { id: 'theta', provider: 'openai', path: '/other/v1', metadata: { name: 'Theta' } },
        { id: 'zeta', provider: 'openai', path: '/nomatch/v1', metadata: { name: 'Zeta' } }
    ]
}

const health = {
    schemaVersion: 1,
    generatedAt: '2026-08-16T12:01:00.000Z',
    routers: [
        {
            name: 'laptop',
            routes: [
                { provider: 'kilo', route: '/kilo/v1', status: 'catalog_visible', statusCode: 200, modelIds: ['alpha', 'beta'] },
                { provider: 'other', route: '/other/v1', status: 'catalog_visible', statusCode: 200, modelIds: ['gamma'] },
                { provider: 'nomatch', route: '/nomatch/v1', status: 'catalog_visible', statusCode: 200, modelIds: ['zeta'] }
            ]
        }
    ]
}

const ledger = {
    schemaVersion: 1,
    generatedAt: '2026-08-16T12:02:00.000Z',
    entries: {
        'laptop\u0000/kilo/v1\u0000alpha': { target: 'laptop', route: '/kilo/v1', modelId: 'alpha', deployability: 'deployable', deployabilityReason: 'fresh-chat-proven' },
        'laptop\u0000/kilo/v1\u0000beta': { target: 'laptop', route: '/kilo/v1', modelId: 'beta', deployability: 'stale', deployabilityReason: 'stale-evidence' },
        'laptop\u0000/kilo/v1\u0000delta': { target: 'laptop', route: '/kilo/v1', modelId: 'delta', deployability: 'blocked', deployabilityReason: 'route-blocked' },
        'laptop\u0000/other/v1\u0000gamma': { target: 'laptop', route: '/other/v1', modelId: 'gamma', deployability: 'cooldown', deployabilityReason: 'route-cooldown' },
        'laptop\u0000/other/v1\u0000theta': { target: 'laptop', route: '/other/v1', modelId: 'theta', deployability: 'ready-unverified', deployabilityReason: 'no-recent-chat-or-worker-proof' }
    }
}

function targetFor(status, modelId) {
    const entry = status.entries.find((candidate) => candidate.modelId === modelId)
    assert.ok(entry, `entry present for ${modelId}`)
    assert.equal(entry.targets.length, 1, `exactly one target for ${modelId}`)
    return entry.targets[0]
}

const status = buildCapabilityStatus({ catalog, health, ledger })

const alpha = targetFor(status, 'alpha')
const beta = targetFor(status, 'beta')
const delta = targetFor(status, 'delta')
const gamma = targetFor(status, 'gamma')
const theta = targetFor(status, 'theta')
const zeta = targetFor(status, 'zeta')

assertEqual(alpha.deployability, 'deployable', 'alpha deployability')
assertEqual(alpha.deployabilityReason, 'fresh-chat-proven', 'alpha reason')
assertEqual(beta.deployability, 'stale', 'beta deployability')
assertEqual(beta.deployabilityReason, 'stale-evidence', 'beta reason')
assertEqual(delta.deployability, 'blocked', 'delta deployability')
assertEqual(gamma.deployability, 'cooldown', 'gamma deployability')
assertEqual(theta.deployability, 'ready-unverified', 'theta deployability')
for (const subject of [beta, delta, gamma, theta]) {
    assertNotEqual(subject.deployability, 'deployable', `${subject.modelId} not promoted`)
}
assertEqual(zeta.deployability, 'unknown', 'zeta unknown')
assertEqual(zeta.deployabilityReason, 'ledger-entry-missing', 'zeta reason')

for (const subject of [alpha, beta, delta, gamma, theta, zeta]) {
    assert.ok('deployability' in subject, `deployability on ${subject.target}`)
    assert.ok(!('deployability' in subject.capabilities), `deployability not in capabilities for ${subject.target}`)
    assert.ok(!('deployabilityReason' in subject.capabilities), `deployabilityReason not in capabilities for ${subject.target}`)
}

assertEqual(alpha.capabilities.tool.status, 'not-tested', 'alpha tool not-tested')
assertEqual(alpha.capabilities.catalog.status, 'catalog-visible', 'alpha catalog visible')
assertEqual(status.policy.declaredCapabilityNeverPromotesProof, true, 'policy declaredCapabilityNeverPromotesProof')
assertEqual(status.policy.ledgerDeployabilityProjectedNotPromoted, true, 'policy ledgerDeployabilityProjectedNotPromoted')
assertEqual(status.sources.ledgerProvided, true, 'sources ledgerProvided')
assertEqual(status.sources.externalEvidenceProvided, false, 'sources externalEvidenceProvided')
assertEqual(status.policy.secretFree, true, 'policy secretFree')
assertEqual(JSON.stringify(status).includes('sk-'), false, 'status no sk-')
for (const entry of status.entries) {
    for (const subject of entry.targets) {
        assert.ok(!('apiKey' in subject) && !('token' in subject) && !('secret' in subject), `no secrets on ${subject.target}`)
        assert.ok(typeof subject.deployability === 'string', `deployability is string on ${subject.target}`)
        if (subject.deployabilityReason !== null) assert.ok(typeof subject.deployabilityReason === 'string', `reason is string on ${subject.target}`)
    }
}

const noLedger = buildCapabilityStatus({ catalog, health })
for (const entry of noLedger.entries) {
    for (const subject of entry.targets) {
        assert.ok(!('deployability' in subject), 'deployability absent when no ledger')
    }
}
assertEqual(noLedger.sources.ledgerProvided, false, 'noLedger sources')

const invalidVerdict = buildCapabilityStatus({
    catalog: { ...catalog, models: [catalog.models[0]] },
    health,
    ledger: {
        schemaVersion: 1,
        entries: {
            'laptop\u0000/kilo/v1\u0000alpha': {
                target: 'laptop', route: '/kilo/v1', modelId: 'alpha', deployability: 'not-a-verdict'
            }
        }
    }
})
assertEqual(invalidVerdict.entries[0].targets[0].deployability, 'unknown', 'invalid verdict → unknown')
assertEqual(invalidVerdict.entries[0].targets[0].deployabilityReason, 'ledger-deployability-invalid', 'invalid verdict reason')

const wrongVersion = buildCapabilityStatus({ catalog, health, ledger: { schemaVersion: 2, entries: ledger.entries } })
for (const entry of wrongVersion.entries) {
    for (const subject of entry.targets) {
        assert.ok(!('deployability' in subject), 'non-schemaVersion-1 ledger ignored')
    }
}

// ── Sweep 2: model-health-check-safety-contract.mjs ──────────────────────────
section('check-safety')

const scriptPath = path.join(ROOT, 'scripts', 'model-health-check.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')

const defaultMatch = source.match(/smokeDelayMs\s*=\s*smokeDelayArg[\s\S]*?:\s*250\b/)
if (defaultMatch) pass('default smokeDelayMs is 250')
else fail('default smokeDelayMs must be 250')

if (!/Math\.(max|min)\s*\([^)]*smokeDelay[^)]*\)/.test(source)) pass('no floor on smokeDelayMs')
else fail('explicit --smoke-delay=0 must not be floored')

const smokeSection = source.slice(source.indexOf('if (smoke) {'))
const throttleMatch = smokeSection.match(/if\s*\(\s*smokeDelayMs\s*>\s*0\s*&&[\s\S]*?await\s+sleep\s*\(\s*smokeDelayMs\s*\)/)
if (throttleMatch) pass('throttle inside smoke mode gated by smokeDelayMs')
else fail('throttle must be inside smoke mode')

// ── Sweep 3: model-health-circuit-state-contract.mjs ─────────────────────────
section('circuit-state')

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

// 1. initial state
{
    const state = createCircuitState({ now: T0 })
    assertEqual(state.schemaVersion, SCHEMA_VERSION, 'state schemaVersion')
    assertDeepEqual(state.routes, {}, 'state routes empty')
    assertDeepEqual(clone(state), state, 'state serializable')

    const route = initialRouteState(KEY_A)
    assertEqual(route.routeKey, KEY_A, 'routeKey')
    assertEqual(route.phase, PHASE.CLOSED, 'phase closed')
    assertEqual(route.consecutiveFailures, 0, 'consecutiveFailures 0')
    assertEqual(route.openUntil, null, 'openUntil null')
    assertDeepEqual(clone(route), route, 'route serializable')
    assertDeepEqual(parseRouteKey(KEY_A), { target: 'laptop', route: '/kilo/v1', modelId: 'alpha' }, 'parseRouteKey')
}

// 2. unseen route is closed and probe-able
{
    const state = createCircuitState({ now: T0 })
    const decision = canProbe(state, { routeKey: KEY_A, now: T0 })
    assertEqual(decision.allowed, true, 'canProbe allowed')
    assertEqual(decision.phase, PHASE.CLOSED, 'canProbe phase closed')
    assertEqual(decision.reason, 'closed', 'canProbe reason')
    assertEqual(decision.nextReadyAt, null, 'nextReadyAt null')
    assertEqual(decision.waitMs, 0, 'waitMs 0')
    assertEqual(nextReadyAt(state, KEY_A), null, 'nextReadyAt function null')
    assertEqual(nextReady(state, { routeKey: KEY_A, now: T0 }).readyAt, T0, 'nextReady readyAt')
    assertEqual(getRouteState(state, KEY_A).phase, PHASE.CLOSED, 'getRouteState phase')
}

// 3. 429 honors retryAfterMs
{
    const state = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, outcome: 'cooldown', statusCode: 429, retryAfterMs: 90_000
    })
    const route = getRouteState(state, KEY_A)
    assertEqual(route.phase, PHASE.OPEN, '429 phase open')
    assertEqual(route.lastOutcome, OUTCOME.COOLDOWN, '429 outcome cooldown')
    assertEqual(route.lastRetryAfterMs, 90_000, '429 retryAfterMs')
    assertEqual(route.openUntil, T0 + 90_000, '429 openUntil')

    const during = canProbe(state, { routeKey: KEY_A, now: T0 + 89_999 })
    assertEqual(during.allowed, false, 'during cooldown not allowed')
    assertEqual(during.reason, 'circuit-open', 'during reason')
    assertEqual(during.nextReadyAt, T0 + 90_000, 'during nextReadyAt')
    assertEqual(during.waitMs, 1, 'during waitMs')

    const shortRetry = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 1_000
    })
    assertEqual(getRouteState(shortRetry, KEY_A).openUntil, T0 + DEFAULT_CIRCUIT_POLICY.baseBackoffMs, 'short retry bounded')
}

// 4. retryAfterMs bounded
{
    const huge = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 10 * 24 * 60 * 60 * 1000
    })
    assertEqual(getRouteState(huge, KEY_A).lastRetryAfterMs, DEFAULT_CIRCUIT_POLICY.maxRetryAfterMs, 'huge retryAfterMs capped')
    assertEqual(getRouteState(huge, KEY_A).openUntil, T0 + DEFAULT_CIRCUIT_POLICY.maxOpenMs, 'huge openUntil capped')

    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, '600000', null]) {
        const next = recordProbeResult(createCircuitState({ now: T0 }), {
            routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: bad
        })
        const r = getRouteState(next, KEY_A)
        assertEqual(r.lastRetryAfterMs, null, `bad retryAfterMs ${JSON.stringify(bad)} → null`)
        assertEqual(r.openUntil, T0 + DEFAULT_CIRCUIT_POLICY.baseBackoffMs, `bad retryAfterMs ${JSON.stringify(bad)} → base`)
        assertEqual(Number.isFinite(r.openUntil), true, `bad retryAfterMs ${JSON.stringify(bad)} finite`)
    }
}

// 5. exponential backoff
{
    const expected = [30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000]
    let state = createCircuitState({ now: T0 })
    let now = T0
    const observed = []
    for (let i = 0; i < expected.length; i++) {
        state = recordProbeResult(state, { routeKey: KEY_A, now, outcome: 'error', statusCode: 503 })
        const route = getRouteState(state, KEY_A)
        observed.push(route.openUntil - now)
        now = route.openUntil
    }
    assertDeepEqual(observed, expected, 'backoff sequence')
    assertEqual(backoffForFailures(1), 30_000, 'backoffForFailures(1)')
    assertEqual(backoffForFailures(6), 900_000, 'backoffForFailures(6)')
    assertEqual(backoffForFailures(500), DEFAULT_CIRCUIT_POLICY.maxBackoffMs, 'backoffForFailures(500)')
    assertEqual(backoffForFailures(0), 0, 'backoffForFailures(0)')
    assertEqual(Number.isFinite(backoffForFailures(1e6)), true, 'backoffForFailures(1e6) finite')
}

// 6. half-open trial probe
{
    const state = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, statusCode: 503
    })
    const openUntil = getRouteState(state, KEY_A).openUntil
    assertEqual(circuitPhase(state, { routeKey: KEY_A, now: openUntil - 1 }), PHASE.OPEN, 'phase open before window')
    assertEqual(circuitPhase(state, { routeKey: KEY_A, now: openUntil }), PHASE.HALF_OPEN, 'phase half-open at window')

    const trial = canProbe(state, { routeKey: KEY_A, now: openUntil })
    assertEqual(trial.allowed, true, 'trial allowed')
    assertEqual(trial.phase, PHASE.HALF_OPEN, 'trial phase')
    assertEqual(trial.reason, 'half-open-trial', 'trial reason')

    const inFlight = recordProbeAttempt(state, { routeKey: KEY_A, now: openUntil })
    const blocked = canProbe(inFlight, { routeKey: KEY_A, now: openUntil + 5 })
    assertEqual(blocked.allowed, false, 'in-flight blocked')
    assertEqual(blocked.reason, 'half-open-probe-in-flight', 'in-flight reason')
    assertEqual(blocked.nextReadyAt, openUntil + DEFAULT_CIRCUIT_POLICY.halfOpenProbeTimeoutMs, 'in-flight nextReadyAt')

    const afterTimeout = canProbe(inFlight, { routeKey: KEY_A, now: openUntil + DEFAULT_CIRCUIT_POLICY.halfOpenProbeTimeoutMs })
    assertEqual(afterTimeout.allowed, true, 'after timeout allowed')
    assertEqual(afterTimeout.reason, 'half-open-trial', 'after timeout reason')
}

// 7. successful half-open closes circuit
{
    const opened = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, statusCode: 503
    })
    const openUntil = getRouteState(opened, KEY_A).openUntil
    const attempted = recordProbeAttempt(opened, { routeKey: KEY_A, now: openUntil })
    const closed = recordProbeResult(attempted, {
        routeKey: KEY_A, now: openUntil + 10, outcome: 'success', statusCode: 200
    })

    const route = getRouteState(closed, KEY_A)
    assertEqual(route.phase, PHASE.CLOSED, 'success closes phase')
    assertEqual(route.lastOutcome, OUTCOME.SUCCESS, 'success outcome')
    assertEqual(route.consecutiveFailures, 0, 'success consecutiveFailures 0')
    assertEqual(route.consecutiveSuccesses, 1, 'success consecutiveSuccesses 1')
    assertEqual(route.backoffMs, 0, 'success backoffMs 0')
    assertEqual(route.openUntil, null, 'success openUntil null')
    assertEqual(route.openedAt, null, 'success openedAt null')
    assertEqual(route.halfOpenProbesInFlight, 0, 'success halfOpenProbesInFlight 0')
    assertEqual(canProbe(closed, { routeKey: KEY_A, now: openUntil + 10 }).allowed, true, 'success probe allowed')

    const reopened = recordProbeResult(closed, { routeKey: KEY_A, now: openUntil + 20, statusCode: 503 })
    assertEqual(getRouteState(reopened, KEY_A).openUntil, openUntil + 20 + DEFAULT_CIRCUIT_POLICY.baseBackoffMs, 'reopened backoff')
}

// 8. failed half-open reopens
{
    const opened = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, statusCode: 503
    })
    const openUntil = getRouteState(opened, KEY_A).openUntil
    const reopened = recordProbeResult(opened, { routeKey: KEY_A, now: openUntil, statusCode: 503 })

    const route = getRouteState(reopened, KEY_A)
    assertEqual(route.phase, PHASE.OPEN, 'failed half-open phase')
    assertEqual(route.consecutiveFailures, 2, 'failed half-open consecutiveFailures')
    assertEqual(route.openUntil, openUntil + 60_000, 'failed half-open openUntil')
    assertEqual(canProbe(reopened, { routeKey: KEY_A, now: openUntil + 1 }).allowed, false, 'failed half-open blocked')
}

// 9. openAfterFailures
{
    const policy = { openAfterFailures: 2 }
    const first = recordProbeResult(createCircuitState({ now: T0, policy }), {
        routeKey: KEY_A, now: T0, statusCode: 503
    })
    assertEqual(getRouteState(first, KEY_A).phase, PHASE.CLOSED, 'openAfterFailures 1st 5xx closed')
    assertEqual(getRouteState(first, KEY_A).consecutiveFailures, 1, 'openAfterFailures 1st failures')
    assertEqual(canProbe(first, { routeKey: KEY_A, now: T0 }).allowed, true, 'openAfterFailures 1st allowed')

    const second = recordProbeResult(first, { routeKey: KEY_A, now: T0 + 1, statusCode: 503 })
    assertEqual(getRouteState(second, KEY_A).phase, PHASE.OPEN, 'openAfterFailures 2nd 5xx open')
    assertEqual(canProbe(second, { routeKey: KEY_A, now: T0 + 1 }).allowed, false, 'openAfterFailures 2nd blocked')

    const rateLimited = recordProbeResult(createCircuitState({ now: T0, policy }), {
        routeKey: KEY_A, now: T0, statusCode: 429
    })
    assertEqual(getRouteState(rateLimited, KEY_A).phase, PHASE.OPEN, '429 opens immediately')

    const hardBlocked = recordProbeResult(createCircuitState({ now: T0, policy }), {
        routeKey: KEY_A, now: T0, statusCode: 403
    })
    const blockedRoute = getRouteState(hardBlocked, KEY_A)
    assertEqual(blockedRoute.phase, PHASE.OPEN, '403 opens immediately')
    assertEqual(blockedRoute.lastOutcome, OUTCOME.BLOCKED, '403 outcome blocked')
    assertEqual(blockedRoute.openUntil, T0 + DEFAULT_CIRCUIT_POLICY.blockedOpenMs, '403 openUntil')
}

// 10. outcome classification
{
    assertEqual(classifyOutcome({ statusCode: 200 }), OUTCOME.SUCCESS, '200 success')
    assertEqual(classifyOutcome({ outcome: 'chat_ok', statusCode: 200 }), OUTCOME.SUCCESS, 'chat_ok success')
    assertEqual(classifyOutcome({ outcome: 'vision-proven' }), OUTCOME.SUCCESS, 'vision-proven success')
    assertEqual(classifyOutcome({ outcome: 'success', statusCode: 429 }), OUTCOME.COOLDOWN, 'success+429 cooldown')
    assertEqual(classifyOutcome({ outcome: 'rate_limited' }), OUTCOME.COOLDOWN, 'rate_limited cooldown')
    assertEqual(classifyOutcome({ outcome: 'timeout' }), OUTCOME.SERVER_ERROR, 'timeout server_error')
    assertEqual(classifyOutcome({ outcome: 'empty-200', statusCode: 200 }), OUTCOME.SERVER_ERROR, 'empty-200 server_error')
    assertEqual(classifyOutcome({ statusCode: 404 }), OUTCOME.BLOCKED, '404 blocked')
    assertEqual(classifyOutcome({ outcome: 'mystery' }), OUTCOME.UNKNOWN_FAILURE, 'mystery unknown')
    assertEqual(classifyOutcome({}), OUTCOME.UNKNOWN_FAILURE, 'empty unknown')

    const unknown = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, outcome: 'mystery'
    })
    assertEqual(getRouteState(unknown, KEY_A).phase, PHASE.OPEN, 'mystery phase open')
    assertEqual(getRouteState(unknown, KEY_A).lastOutcome, OUTCOME.UNKNOWN_FAILURE, 'mystery outcome')
}

// 11. route-scoped state
{
    const state = recordProbeResult(createCircuitState({ now: T0 }), {
        routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 60_000
    })
    assertEqual(canProbe(state, { routeKey: KEY_A, now: T0 }).allowed, false, 'route A blocked')
    assertEqual(canProbe(state, { routeKey: KEY_B, now: T0 }).allowed, true, 'route B allowed')
    assertDeepEqual(Object.keys(state.routes), [KEY_A], 'only route A in state')
}

// 12. purity
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

    assertDeepEqual(state, before, 'state pure / not mutated')
}

// 13. determinism
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
    assertDeepEqual(first, second, 'deterministic build')
    assertDeepEqual(clone(first), first, 'first serializable')
    assertEqual(JSON.stringify(first).includes('undefined'), false, 'no undefined in JSON')
    assertDeepEqual(
        canProbe(first, { routeKey: KEY_A, now: T0 + 10 }),
        canProbe(second, { routeKey: KEY_A, now: T0 + 10 }),
        'canProbe deterministic'
    )

    const roundTripped = clone(first)
    assertDeepEqual(
        canProbe(roundTripped, { routeKey: KEY_A, now: T0 + 10 }),
        canProbe(first, { routeKey: KEY_A, now: T0 + 10 }),
        'round-trip deterministic'
    )
}

// 14. secret-free
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
    assertEqual(serialized.includes('sk-secret-token'), false, 'no sk-secret-token in serialized')
    assertEqual(serialized.includes('abc123def456ghi789'), false, 'no abc123 in serialized')
    assertEqual(serialized.includes('apiKey'), false, 'no apiKey in serialized')
    assertEqual(serialized.includes('authorization'), false, 'no authorization in serialized')
    assertDeepEqual(
        Object.keys(getRouteState(next, KEY_A)).sort(),
        Object.keys(initialRouteState(KEY_A)).sort(),
        'keys match initialRouteState'
    )

    const bogus = { schemaVersion: SCHEMA_VERSION, routes: { [KEY_A]: { phase: PHASE.OPEN, openUntil: null } } }
    assertEqual(canProbe(bogus, { routeKey: KEY_A, now: T0 }).allowed, true, 'bogus open without window allows')
}

// 15. invalid args
{
    const state = createCircuitState({ now: T0 })
    assertThrows(() => canProbe(state, { routeKey: KEY_A }), 'canProbe missing now throws')
    assertThrows(() => canProbe(state, { routeKey: KEY_A, now: Number.NaN }), 'canProbe NaN now throws')
    assertThrows(() => canProbe(state, { routeKey: '', now: T0 }), 'canProbe empty key throws')
    assertThrows(() => canProbe(state, { now: T0 }), 'canProbe missing key throws')
    assertThrows(() => recordProbeResult(state, { routeKey: KEY_A, statusCode: 200 }), 'recordProbeResult missing now throws')
    assertThrows(() => recordProbeAttempt(state, { routeKey: KEY_A }), 'recordProbeAttempt missing now throws')
    assertThrows(() => summarizeCircuitState(state, {}), 'summarizeCircuitState empty throws')
    assertThrows(() => makeRouteKey({ target: 'laptop', route: '/kilo/v1' }), 'makeRouteKey missing modelId throws')
    assertEqual(parseRouteKey('not-a-composite-key'), null, 'parseRouteKey invalid returns null')
}

// 16. planProbes
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 120_000 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0 + 10, outcome: 'success', statusCode: 200 })

    const plan = planProbes(state, { routeKeys: [KEY_B, KEY_A, KEY_B, '', null], now: T0 + 20 })
    assertEqual(plan.now, T0 + 20, 'plan now')
    assertDeepEqual(plan.ready.map((row) => row.routeKey), [KEY_B], 'plan ready')
    assertDeepEqual(plan.suppressed.map((row) => row.routeKey), [KEY_A], 'plan suppressed')
    assertEqual(plan.suppressed[0].nextReadyAt, T0 + 120_000, 'plan suppressed nextReadyAt')
    assertEqual(plan.suppressed[0].reason, 'circuit-open', 'plan suppressed reason')
    assertDeepEqual(clone(plan), plan, 'plan serializable')

    let two = createCircuitState({ now: T0 })
    two = recordProbeResult(two, { routeKey: KEY_B, now: T0 + 1, statusCode: 200 })
    two = recordProbeResult(two, { routeKey: KEY_A, now: T0 + 2, statusCode: 200 })
    assertDeepEqual(
        planProbes(two, { routeKeys: [KEY_A, KEY_B], now: T0 + 3 }).ready.map((row) => row.routeKey),
        [KEY_B, KEY_A],
        'planProbes LRP ordering'
    )
}

// 17. pruning
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 600_000 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0, outcome: 'success', statusCode: 200 })

    const laterIdle = T0 + 48 * 60 * 60 * 1000
    const pruned = pruneCircuitState(state, { now: laterIdle, idleMs: 24 * 60 * 60 * 1000 })
    assertDeepEqual(Object.keys(pruned.routes), [KEY_A], 'prune keeps suppressed')

    const kept = pruneCircuitState(state, { now: T0 + 1, idleMs: 24 * 60 * 60 * 1000 })
    assertDeepEqual(Object.keys(kept.routes).sort(), [KEY_A, KEY_B].sort(), 'prune keeps recent')

    const capped = pruneCircuitState(state, { now: T0 + 1, maxRouteEntries: 1, idleMs: 24 * 60 * 60 * 1000 })
    assertDeepEqual(Object.keys(capped.routes), [KEY_A], 'prune respects maxRouteEntries')
    assertDeepEqual(clone(pruned), pruned, 'pruned serializable')
}

// 18. summary
{
    let state = createCircuitState({ now: T0 })
    state = recordProbeResult(state, { routeKey: KEY_A, now: T0, statusCode: 429, retryAfterMs: 300_000 })
    state = recordProbeResult(state, { routeKey: KEY_B, now: T0, outcome: 'success', statusCode: 200 })

    const summary = summarizeCircuitState(state, { now: T0 + 1 })
    assertEqual(summary.routeCount, 2, 'summary routeCount')
    assertEqual(summary.phases.open, 1, 'summary phases open')
    assertEqual(summary.phases.closed, 1, 'summary phases closed')
    assertEqual(summary.phases['half-open'], 0, 'summary phases half-open')
    assertEqual(summary.soonestReadyAt, T0 + 300_000, 'summary soonestReadyAt')
    assertEqual(summary.soonestReadyRouteKey, KEY_A, 'summary soonestReadyRouteKey')
    assertDeepEqual(clone(summary), summary, 'summary serializable')

    const afterWindow = summarizeCircuitState(state, { now: T0 + 300_000 })
    assertEqual(afterWindow.phases['half-open'], 1, 'after window half-open')
    assertEqual(afterWindow.soonestReadyAt, null, 'after window no soonest')
}

// 19. policy resolution
{
    const resolved = resolvePolicy({ baseBackoffMs: 1_000, backoffFactor: 0, maxBackoffSteps: 9_999, openAfterFailures: 0 })
    assertEqual(resolved.baseBackoffMs, 1_000, 'policy baseBackoffMs')
    assertEqual(resolved.backoffFactor, 1, 'policy backoffFactor')
    assertEqual(resolved.maxBackoffSteps, 64, 'policy maxBackoffSteps')
    assertEqual(resolved.openAfterFailures, 1, 'policy openAfterFailures')
    assert.ok(resolved.maxOpenMs >= resolved.maxBackoffMs, 'policy maxOpenMs >= maxBackoffMs')

    const ignored = resolvePolicy({ baseBackoffMs: 'lots', maxBackoffMs: Number.NaN, junk: 1 })
    assertEqual(ignored.baseBackoffMs, DEFAULT_CIRCUIT_POLICY.baseBackoffMs, 'hostile baseBackoffMs falls back')
    assertEqual(ignored.maxBackoffMs, DEFAULT_CIRCUIT_POLICY.maxBackoffMs, 'hostile maxBackoffMs falls back')
    assertEqual(ignored.junk, undefined, 'junk field ignored')

    const state = recordProbeResult(createCircuitState({ now: T0, policy: { baseBackoffMs: 5_000 } }), {
        routeKey: KEY_A, now: T0, statusCode: 503
    })
    assertEqual(getRouteState(state, KEY_A).openUntil, T0 + 5_000, 'stored policy used')
    assertEqual(getRouteState(clone(state), KEY_A).openUntil, T0 + 5_000, 'stored policy after clone')
}

// 20. no side channels
{
    const circuitStatePath = path.join(ROOT, 'scripts', 'model-health-circuit-state.mjs')
    const csSource = fs.readFileSync(circuitStatePath, 'utf8')
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
        /from\s+['"]node:(?:http|https|net|fs|child_process|dns|tls)['"]/ ,
        /\bMath\s*\.\s*random\b/
    ]

    for (const pattern of forbidden) {
        assertEqual(pattern.test(csSource), false, `no forbidden: ${pattern}`)
    }
    assertEqual(/^import\b/m.test(csSource), false, 'circuit-state zero imports')
}

// ── Sweep 4: model-health-ledger-adapter-contract.mjs ─────────────────────────
section('ledger-adapter')

import { healthMatrixToLedgerInputs } from '../scripts/model-health-ledger-adapter.mjs'
import { buildLedger as buildLedgerAdapter } from '../scripts/model-health-ledger.mjs'

const NOW = new Date('2026-08-16T12:00:00.000Z').getTime()
const observedAt = '2026-08-16T11:59:00.000Z'

const matrix = {
    schemaVersion: 1,
    generatedAt: observedAt,
    routers: [
        {
            name: 'laptop',
            routes: [
                {
                    provider: 'kilo',
                    route: '/kilo/v1',
                    status: 'catalog_visible',
                    statusCode: 200,
                    modelIds: ['alpha', 'beta', 'alpha'],
                    retryAfterMs: null,
                    error: null,
                    smoke: [
                        { model: 'alpha', status: 'chat_ok', statusCode: 200, reasoningSeen: true, toolEvidence: false, contentPreview: 'ok' },
                        { model: 'beta', status: 'cooldown', statusCode: 429, retryAfterMs: 5000, error: 'cooldown' }
                    ]
                },
                {
                    route: '/broken/v1',
                    status: 'transport_error',
                    statusCode: null,
                    modelIds: ['gamma'],
                    smoke: []
                }
            ]
        },
        { name: 'missing-routes' },
        { routes: [{ route: '/ignored/v1', modelIds: ['ignored'] }] }
    ]
}

{
    const inputs = healthMatrixToLedgerInputs(matrix)
    assertEqual(inputs.catalog.length, 3, 'catalog length 3')
    assertEqual(inputs.routeHealth.length, 3, 'routeHealth length 3')
    assertEqual(inputs.dataPlaneChat.length, 2, 'dataPlaneChat length 2')
    assertDeepEqual(
        inputs.catalog.map(({ target, route, modelId }) => `${target}\u0000${route}\u0000${modelId}`),
        ['laptop\u0000/kilo/v1\u0000alpha', 'laptop\u0000/kilo/v1\u0000beta', 'laptop\u0000/broken/v1\u0000gamma'],
        'catalog keys'
    )
    assertDeepEqual(inputs.catalog[0].modelIds, ['alpha', 'beta'], 'catalog[0] modelIds deduped')
}

{
    const inputs = healthMatrixToLedgerInputs(matrix)
    assertEqual(inputs.catalog[0].status, 'catalog-visible', 'catalog status normalized')
    assertEqual(inputs.routeHealth[0].status, 'catalog-visible', 'routeHealth status normalized')
    assertEqual(inputs.dataPlaneChat[0].status, 'chat-proven', 'dataPlaneChat chat-proven')
    assertEqual(inputs.dataPlaneChat[1].status, 'cooldown', 'dataPlaneChat cooldown')
    assertEqual(inputs.dataPlaneChat[1].retryAfterMs, 5000, 'dataPlaneChat retryAfterMs')
    assertEqual(inputs.dataPlaneChat[0].reasoningSeen, true, 'dataPlaneChat reasoningSeen')
    assertEqual(inputs.dataPlaneChat[0].toolEvidence, false, 'dataPlaneChat toolEvidence')
}

{
    const ledger = buildLedgerAdapter({ ...healthMatrixToLedgerInputs(matrix), now: NOW })
    const alphaKey = 'laptop\u0000/kilo/v1\u0000alpha'
    const betaKey = 'laptop\u0000/kilo/v1\u0000beta'
    const gammaKey = 'laptop\u0000/broken/v1\u0000gamma'
    assertEqual(ledger.entries[alphaKey].deployability, 'deployable', 'adapter alpha deployable')
    assertEqual(ledger.entries[betaKey].deployability, 'cooldown', 'adapter beta cooldown')
    assertEqual(ledger.entries[gammaKey].deployability, 'unknown', 'adapter gamma unknown')
    assertEqual(ledger.entries[gammaKey].rails.routeHealth.error, 'transport_error', 'adapter gamma routeHealth error')
}

{
    const inputs = healthMatrixToLedgerInputs({
        generatedAt: observedAt,
        routers: [{
            name: 'laptop',
            routes: [{ route: '/kilo/v1', status: 'catalog_visible', modelIds: [], smoke: [{ model: 'explicit', status: 'chat_ok' }] }]
        }]
    })
    assertEqual(inputs.catalog.length, 0, 'no route modelIds → no catalog')
    assertEqual(inputs.routeHealth.length, 0, 'no route modelIds → no routeHealth')
    assertEqual(inputs.dataPlaneChat.length, 1, 'smoke model explicit → 1 dataPlaneChat')
    assertEqual(inputs.dataPlaneChat[0].modelId, 'explicit', 'dataPlaneChat modelId explicit')
}

{
    assertDeepEqual(healthMatrixToLedgerInputs(null), { catalog: [], routeHealth: [], dataPlaneChat: [] }, 'null input')
    assertDeepEqual(
        healthMatrixToLedgerInputs({ routers: [{ name: '', routes: [{ route: '/x', modelIds: ['x'] }] }] }),
        { catalog: [], routeHealth: [], dataPlaneChat: [] },
        'malformed input'
    )
}

{
    const snapshot = JSON.parse(JSON.stringify(matrix))
    healthMatrixToLedgerInputs(matrix)
    assertDeepEqual(matrix, snapshot, 'input not mutated')
}

// ── Sweep 5: model-health-ledger-contract.mjs ─────────────────────────────────
section('ledger')

import { buildLedger } from '../scripts/model-health-ledger.mjs'

function makeCatalog(target, route, modelId, status = 'catalog-visible', observedAt = '2026-08-16T11:59:00.000Z', extra = {}) {
    return { target, route, modelId, status, observedAt, ...extra }
}
function makeRouteHealth(target, route, modelId, status = 'catalog_visible', statusCode = 200, observedAt = '2026-08-16T11:59:00.000Z', extra = {}) {
    return { target, route, modelId, status, statusCode, observedAt, ...extra }
}
function makeChatProof(target, route, modelId, status = 'chat-proven', statusCode = 200, observedAt = '2026-08-16T11:50:00.000Z', extra = {}) {
    return { target, route, modelId, status, statusCode, observedAt, ...extra }
}
function makeWorkerProof(target, route, modelId, status = 'proven', observedAt = '2026-08-16T11:50:00.000Z', extra = {}) {
    return { target, route, modelId, status, observedAt, ...extra }
}
function makeCapabilityProof(target, route, modelId, status = 'vision-proven', observedAt = '2026-08-16T11:50:00.000Z', extra = {}) {
    return { target, route, modelId, status, observedAt, ...extra }
}

// 1. exact model matching
{
    const ledger = buildLedger({
        catalog: [
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:59:00.000Z', { modelIds: ['alpha', 'beta'] }),
            makeCatalog('laptop', '/kilo/v1', 'beta', 'catalog-visible', '2026-08-16T11:59:00.000Z', { modelIds: ['alpha', 'beta'] })
        ],
        routeHealth: [
            makeRouteHealth('laptop', '/kilo/v1', 'alpha'),
            makeRouteHealth('laptop', '/kilo/v1', 'beta')
        ],
        dataPlaneChat: [
            makeChatProof('laptop', '/kilo/v1', 'alpha')
        ],
        now: NOW
    })

    const alphaKey = 'laptop\u0000/kilo/v1\u0000alpha'
    const betaKey = 'laptop\u0000/kilo/v1\u0000beta'
    assertEqual(ledger.entries[alphaKey].modelId, 'alpha', 'ledger alpha modelId')
    assertEqual(ledger.entries[alphaKey].rails.controlPlane.status, 'catalog-visible', 'ledger alpha controlPlane')
    assertEqual(ledger.entries[alphaKey].rails.dataPlaneChat.status, 'chat-proven', 'ledger alpha dataPlaneChat')
    assertEqual(ledger.entries[alphaKey].deployability, 'deployable', 'ledger alpha deployable')
    assertEqual(ledger.entries[betaKey].deployability, 'ready-unverified', 'ledger beta ready-unverified')
}

// 2. newest evidence wins
{
    const ledger = buildLedger({
        catalog: [
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:59:00.000Z'),
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:00:00.000Z')
        ],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].rails.controlPlane.observedAt, '2026-08-16T11:59:00.000Z', 'newest evidence wins')
}

// 3. unknown route status cannot promote
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'mystery', 200)],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'unknown', 'unknown route status')
}

// 4. HTTP 429 is cooldown
{
    const ledger = buildLedger({
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'error', 429)],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'cooldown', '429 is cooldown')
}

// 5. manual overrides may suppress but never promote
{
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        manualOverrides: { [key]: { deployability: 'deployable' } },
        now: NOW
    })
    assertEqual(ledger.entries[key].deployability, 'ready-unverified', 'manual override cannot promote')
}

// 6. stale cooldown evidence
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'cooldown', 429, '2026-08-16T10:00:00.000Z')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'stale', 'stale cooldown')
}

// 7. future-dated evidence
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T13:00:00.000Z')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'catalog_visible', 200, '2026-08-16T13:00:00.000Z')],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha', 'chat-proven', 200, '2026-08-16T13:00:00.000Z')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'stale', 'future-dated evidence is stale')
}

// 8. malformed evidence
{
    const ledger = buildLedger({
        catalog: [null, { target: 'laptop', route: '/kilo/v1' }],
        now: NOW
    })
    assertDeepEqual(Object.keys(ledger.entries), [], 'malformed evidence creates no keys')
}

// 9. catalog-only not deployable
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'ready-unverified', 'catalog-only ready-unverified')
}

// 10. fresh chat proof deployable
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'deployable', 'fresh chat deployable')
}

// 11. TTL expiry to stale
{
    const oldObserved = '2026-08-16T10:00:00.000Z'
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', oldObserved)],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'catalog_visible', 200, oldObserved)],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha', 'chat-proven', 200, oldObserved)],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'stale', 'TTL expiry stale')
}

// 12. cooldown suppression/status
{
    const ledger = buildLedger({
        routeHealth: [
            makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'cooldown', 429, '2026-08-16T11:59:00.000Z', { retryAfterMs: 1234 })
        ],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'cooldown', 'cooldown deployability')
    assertEqual(ledger.entries[key].rails.routeHealth.retryAfterMs, 1234, 'cooldown retryAfterMs')
}

// 13. blocked errors
{
    const ledger = buildLedger({
        routeHealth: [
            makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'not_visible', 404, '2026-08-16T11:59:00.000Z')
        ],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'blocked', '404 blocked')
}

// 14. empty-200
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'empty-200', 200, '2026-08-16T11:59:00.000Z')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'degraded', 'empty-200 degraded')
}

// 15. worker proof
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        workerProof: [makeWorkerProof('laptop', '/kilo/v1', 'alpha', 'proven', '2026-08-16T11:50:00.000Z')],
        now: NOW
    })
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].deployability, 'deployable', 'worker proof deployable')
}

// 16. secret-free output
{
    const ledger = buildLedger({
        catalog: [
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:59:00.000Z', {
                apiKey: 'sk-secret-token',
                authorization: 'Bearer abc123'
            })
        ],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })
    assertEqual(JSON.stringify(ledger).includes('sk-secret-token'), false, 'no sk-secret-token')
    assertEqual(JSON.stringify(ledger).includes('abc123'), false, 'no abc123')
    assertEqual(ledger.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.apiKey, undefined, 'no apiKey field')
    assertEqual(ledger.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.authorization, undefined, 'no authorization field')
}

// 17. input immutability
{
    const catalogInput = [makeCatalog('laptop', '/kilo/v1', 'alpha')]
    const routeInput = [makeRouteHealth('laptop', '/kilo/v1', 'alpha')]
    const chatInput = [makeChatProof('laptop', '/kilo/v1', 'alpha')]
    const workerInput = [makeWorkerProof('laptop', '/kilo/v1', 'alpha')]
    const capabilityInput = [makeCapabilityProof('laptop', '/kilo/v1', 'alpha')]

    buildLedger({
        catalog: catalogInput,
        routeHealth: routeInput,
        dataPlaneChat: chatInput,
        workerProof: workerInput,
        capabilityProof: capabilityInput,
        now: NOW
    })

    assertDeepEqual(catalogInput, [makeCatalog('laptop', '/kilo/v1', 'alpha')], 'catalog input immutable')
    assertDeepEqual(routeInput, [makeRouteHealth('laptop', '/kilo/v1', 'alpha')], 'routeHealth input immutable')
    assertDeepEqual(chatInput, [makeChatProof('laptop', '/kilo/v1', 'alpha')], 'chat input immutable')
    assertDeepEqual(workerInput, [makeWorkerProof('laptop', '/kilo/v1', 'alpha')], 'worker input immutable')
    assertDeepEqual(capabilityInput, [makeCapabilityProof('laptop', '/kilo/v1', 'alpha')], 'capability input immutable')
}

// ── Sweep 6: model-health-passive-events-contract.mjs ─────────────────────────
section('passive-events')

import { normalizeWorkerEvents } from '../scripts/model-health-passive-events.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = fs.readFileSync(path.join(HERE, '..', 'scripts', 'model-health-passive-events.mjs'), 'utf8')

// 1. module exports
{
    assert.equal(typeof normalizeWorkerEvents, 'function', 'normalizeWorkerEvents is function')
    const mod = await import('../scripts/model-health-passive-events.mjs')
    assert.equal(typeof mod.normalizeWorkerEvents, 'function', 'named export is function')
    assert.equal(typeof mod.default, 'function', 'default export is function')
    assert.equal(mod.default, mod.normalizeWorkerEvents, 'default === named')
}

// 2. pure module
{
    assert.equal(SRC.includes('setTimeout'), false, 'no setTimeout')
    assert.equal(SRC.includes('setInterval'), false, 'no setInterval')
    assert.equal(SRC.includes('setImmediate'), false, 'no setImmediate')
    assert.equal(SRC.includes('fetch('), false, 'no fetch(')
    assert.equal(SRC.includes('fetch ('), false, 'no fetch (')
    assert.equal(SRC.includes('XMLHttpRequest'), false, 'no XMLHttpRequest')
    assert.equal(SRC.includes('writeFile'), false, 'no writeFile')
    assert.equal(SRC.includes('appendFile'), false, 'no appendFile')
    assert.equal(/require\(['"]node:fs['"]\)/.test(SRC), false, 'no require node:fs')
    assert.equal(SRC.includes('fs'), false, 'no fs reference')
}

// 3. settled worker → one proof record
{
    const out = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
        observedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent',
        harness: 'external_subagent', workerId: 'w-1'
    })
    assert.equal(out.length, 1, 'one record')
    const p = out[0]
    assertEqual(p.target, 'laptop', 'target')
    assertEqual(p.route, '/kilo/v1', 'route')
    assertEqual(p.modelId, 'alpha', 'modelId')
    assertEqual(p.observedAt, '2026-08-16T11:50:00.000Z', 'observedAt')
    assertEqual(p.status, 'worker-proven', 'status worker-proven')
    assertEqual(p.source, 'external_subagent', 'source')
    assertEqual(p.harness, 'external_subagent', 'harness')
    assertEqual(p.directChatProof, false, 'directChatProof false')
    assertEqual(p.workerId, 'w-1', 'workerId')
}

// 4. variadic + nested arrays
{
    const a = { target: 'laptop', route: '/kilo/v1', modelId: 'a', status: 'success', observedAt: '2026-08-16T11:50:00.000Z' }
    const b = { target: 'phone', route: '/agnes/v1', model: 'b', status: 'completed', observedAt: '2026-08-16T11:51:00.000Z' }
    const c = { target: 'laptop', route: '/kilo/v1', requested_model: 'c', status: 'done', observedAt: '2026-08-16T11:52:00.000Z' }

    const out = normalizeWorkerEvents(a, [b, [c]])
    assert.equal(out.length, 3, 'variadic length 3')
    assertDeepEqual(out.map((p) => p.modelId).sort(), ['a', 'b', 'c'], 'variadic modelIds')
    assertEqual(out.find((p) => p.modelId === 'b').route, '/agnes/v1', 'nested route preserved')
    assertEqual(out.find((p) => p.modelId === 'c').modelId, 'c', 'requested_model normalized')
}

// 5-7. missing identity fields dropped
{
    assert.equal(normalizeWorkerEvents({ target: 'laptop', route: '/kilo/v1', status: 'settled', observedAt: '2026-08-16T11:50:00.000Z' }).length, 0, 'no modelId → 0')
    assert.equal(normalizeWorkerEvents({ target: 'laptop', modelId: 'alpha', status: 'settled', observedAt: '2026-08-16T11:50:00.000Z' }).length, 0, 'no route → 0')
    assert.equal(normalizeWorkerEvents({ route: '/kilo/v1', modelId: 'alpha', status: 'settled', observedAt: '2026-08-16T11:50:00.000Z' }).length, 0, 'no target → 0')
}

// 8. malformed records ignored
{
    const out = normalizeWorkerEvents(null, undefined, 42, 'worker', [1, 2, 3], { not: 'an object but is' })
    assert.equal(out.length, 0, 'malformed records ignored')
}

// 9-10. sensitive data dropped
{
    const out9 = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
        observedAt: '2026-08-16T11:50:00.000Z', headers: { authorization: 'Bearer x' }
    })
    assert.equal(out9.length, 0, 'headers with authorization dropped')

    const out10 = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
        observedAt: '2026-08-16T11:50:00.000Z', note: 'sk-abcdefghijklmnop'
    })
    assert.equal(out10.length, 0, 'secret-like string dropped')
}

// 11-14. non-proven statuses rejected
{
    assert.equal(normalizeWorkerEvents({ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'running', observedAt: '2026-08-16T11:50:00.000Z' }).length, 0, 'running not proven')
    assert.equal(normalizeWorkerEvents({ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog_visible', observedAt: '2026-08-16T11:50:00.000Z' }).length, 0, 'catalog_visible not proven')
    assert.equal(normalizeWorkerEvents({ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'self-identified', observedAt: '2026-08-16T11:50:00.000Z' }).length, 0, 'self-identified not proven')
    assert.equal(normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
        observedAt: '2026-08-16T11:50:00.000Z', source: 'chat', directChatProof: true
    }).length, 0, 'direct chat proof rejected')
}

// 15-16. non-2xx and unparseable date
{
    assert.equal(normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'success', statusCode: 500, observedAt: '2026-08-16T11:50:00.000Z'
    }).length, 0, 'non-2xx status rejected')
    assert.equal(normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled', observedAt: 'not-a-date'
    }).length, 0, 'unparseable date dropped')
}

// 17. secret-free output
{
    const out = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
        observedAt: '2026-08-16T11:50:00.000Z', token: 'sk-abcdefghijklmnop', password: 'hunter2'
    })
    assert.equal(out.length, 0, 'secret-like fields drop whole record')
}

// 18. normalized status maps to worker-proven
{
    const out = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha',
        status: 'completed', completedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent'
    })
    assert.equal(out.length, 1, 'completed → 1 record')
    assertEqual(out[0].status, 'worker-proven', 'completed maps to worker-proven')
}

// 19. source/harness preserved
{
    const out = normalizeWorkerEvents({
        target: 'phone', route: '/agnes/v1', modelId: 'beta',
        status: 'success', observedAt: '2026-08-16T11:50:00.000Z',
        source: 'worker-health', harness: 'worker-health', sessionId: 's-9'
    })
    assertEqual(out[0].source, 'worker-health', 'source preserved')
    assertEqual(out[0].harness, 'worker-health', 'harness preserved')
    assertEqual(out[0].sessionId, 's-9', 'sessionId preserved')
}

// 20. input not mutated
{
    const input = {
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
        observedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent'
    }
    const snapshot = JSON.parse(JSON.stringify(input))
    normalizeWorkerEvents(input)
    assertDeepEqual(input, snapshot, 'input not mutated')
}

// 21-22. integration with ledger
{
    const workerProof = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha',
        status: 'settled', observedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent'
    })

    const ledger = buildLedger({
        catalog: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog-visible', observedAt: '2026-08-16T11:59:00.000Z' }],
        routeHealth: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog_visible', statusCode: 200, observedAt: '2026-08-16T11:59:00.000Z' }],
        workerProof,
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assertEqual(ledger.entries[key].rails.workerProof.status, 'worker-proven', 'integration worker-proof status')
    assertEqual(ledger.entries[key].deployability, 'deployable', 'integration deployable')

    const workerProof2 = normalizeWorkerEvents({
        target: 'laptop', route: '/kilo/v1', modelId: 'alpha',
        status: 'success', observedAt: '2026-08-16T11:50:00.000Z'
    })
    const ledger2 = buildLedger({
        catalog: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog-visible', observedAt: '2026-08-16T11:59:00.000Z' }],
        routeHealth: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog_visible', statusCode: 200, observedAt: '2026-08-16T11:59:00.000Z' }],
        workerProof: workerProof2,
        now: NOW
    })
    assertEqual(ledger2.entries[key].deployabilityReason, 'fresh-worker-proven', 'worker-only deployable reason')
}

// ── Final report ──────────────────────────────────────────────────────────────
console.log(`\n=== model-health-sweep COMPLETE ===`)
console.log(`Passed: ${passed}, Failed: ${failures}`)

if (failures === 0) {
    console.log('All model-health assertions verified.')
    process.exit(0)
} else {
    console.error(`${failures} failure(s) found`)
    process.exit(1)
}
