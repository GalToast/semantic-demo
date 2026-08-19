#!/usr/bin/env node
/**
 * tests/event-bus-contract.mjs
 *
 * Node contract for src/lib/orchestration/event-bus.ts — the central
 * publish/subscribe event system. Pure JS, no DOM, no WebGL. Runs in plain Node.
 *
 * Covers: subscribe/unsubscribe lifecycle, payload delivery (reference +
 * nested-object passthrough), multi-subscriber fan-out, event scope isolation,
 * safe behavior on unknown events / no subscribers, the EVENTS manifest shape,
 * and handler-exception isolation.
 *
 * The event bus is a module singleton that keeps subscriber lists across calls,
 * so every test clears subscribers via clearAllSubscribers() before exercising
 * it.
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// `??` would treat explicit null as unset; use !== undefined to honor null.
function val(v, d) {
    return v !== undefined ? v : d
}

function deepEqual(a, b) {
    if (a === b) return true
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const k of ka) {
        if (!deepEqual(a[k], b[k])) return false
    }
    return true
}

function assertDeepEqual(a, b, msg) {
    if (!deepEqual(a, b)) {
        throw new Error(`ASSERTION FAILED: ${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`)
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testSubscribeReturnsUnsub() {
    console.log('\n[TEST] subscribe returns an unsubscribe function')
    const { subscribe, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    const unsub = subscribe('CAMERA_MOVED', () => {})
    assert(typeof unsub === 'function', 'subscribe should return an unsubscribe function')
    unsub()
    clearAllSubscribers()
    console.log('  OK subscribe() returns a callable unsubscribe fn')
}

async function testPublishDeliversPayload() {
    console.log('\n[TEST] publish delivers exact payload (reference equality)')
    const { subscribe, publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    const payload = { index: 3, reason: 'test' }
    let received = undefined
    subscribe('CAMERA_NODE_FOCUSED', (p) => {
        received = p
    })
    publish('CAMERA_NODE_FOCUSED', payload)
    assert(received === payload, 'handler must receive the exact payload object (reference equality)')
    assertDeepEqual(received, payload, 'handler payload must deep-equal the published payload')
    clearAllSubscribers()
    console.log('  OK handler received the exact payload reference')
}

async function testUnsubscribeStopsDelivery() {
    console.log('\n[TEST] unsubscribe stops delivery')
    const { subscribe, publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    let calls = 0
    const unsub = subscribe('FILTER_CHANGED', () => {
        calls += 1
    })
    publish('FILTER_CHANGED', { x: 1 })
    assert(calls === 1, 'handler called once before unsubscribe')

    unsub()
    publish('FILTER_CHANGED', { x: 2 })
    assert(calls === 1, 'handler must NOT be called after unsubscribe')
    clearAllSubscribers()
    console.log('  OK unsubscribe removes the handler from delivery')
}

async function testMultipleSubscribers() {
    console.log('\n[TEST] multiple subscribers all receive')
    const { subscribe, publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    const payload = { depth: 7 }
    let a = 0
    let b = 0
    subscribe('EXPLORATION_DEPTH_CHANGED', () => {
        a += 1
    })
    subscribe('EXPLORATION_DEPTH_CHANGED', () => {
        b += 1
    })
    publish('EXPLORATION_DEPTH_CHANGED', payload)
    assert(a === 1, 'first handler called once')
    assert(b === 1, 'second handler called once')
    clearAllSubscribers()
    console.log('  OK both subscribers receive the same payload')
}

async function testScopeIsolation() {
    console.log('\n[TEST] scope isolation — A does not fire on B')
    const { subscribe, publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    let aCalls = 0
    subscribe('VIEW_CHANGED', () => {
        aCalls += 1
    })
    publish('STATE_RESET', { reason: 'isolated' })
    assert(aCalls === 0, 'handler for VIEW_CHANGED must not fire on STATE_RESET')
    clearAllSubscribers()
    console.log('  OK handler scoped to its event is isolated from other events')
}

async function testNoThrowUnknownEvent() {
    console.log('\n[TEST] no throw on unknown event name')
    const { publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    let threw = false
    try {
        publish('never-defined-event', {})
    } catch (e) {
        threw = true
    }
    assert(threw === false, 'publish must not throw for an unknown event name')
    clearAllSubscribers()
    console.log('  OK publish() is safe for unknown event names')
}

async function testNoThrowNoSubscribers() {
    console.log('\n[TEST] no throw when no subscribers')
    const { publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    // Explicit null is a valid config value; the source default only applies to
    // undefined, so passing null exercises the no-subscriber early-return path.
    let threw = false
    try {
        publish('any-event', val(null, undefined))
    } catch (e) {
        threw = true
    }
    assert(threw === false, 'publish must not throw when there are no subscribers')
    clearAllSubscribers()
    console.log('  OK publish() is safe with no subscribers and a null payload')
}

async function testEventsConstant() {
    console.log('\n[TEST] EVENTS constant shape and documented keys')
    const { EVENTS, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    assert(EVENTS !== null && typeof EVENTS === 'object', 'EVENTS must be a non-null object')
    const keys = Object.keys(EVENTS)
    assert(keys.length > 0, 'EVENTS must contain keys')
    for (const k of keys) {
        const v = EVENTS[k]
        assert(typeof v === 'string' && v.length > 0, `EVENTS.${k} must be a non-empty string`)
    }

    // Documented semantic event names, verified against the source manifest.
    const expected = [
        'CAMERA_MOVED',
        'CAMERA_NODE_FOCUSED',
        'TRANSITION_PHASE_CHANGED',
        'EXPLORATION_FOCUS_SYNC',
        'DIVE_MODE_REQUESTED',
        'EXPLORATION_RESET_REQUESTED',
        'OVERVIEW_REQUESTED',
        'TRAIL_DEPTH_UPDATE_REQUESTED',
        'SEARCH_STARTED',
        'SEARCH_SUCCESS',
        'SEARCH_EMPTY',
        'SEARCH_DEGRADED',
        'SEARCH_MOCK_FALLBACK',
        'SEARCH_CANCELLED',
        'SEARCH_CLEARED',
        'SEARCH_FOCUS_TRANSITION_STARTED',
        'SEARCH_FOCUS_TRANSITION_SETTLED',
        'SEARCH_FOCUS_REQUESTED',
        'SEARCH_STATE_RESET_REQUESTED',
        'VIEW_CHANGED',
        'STATE_RESET',
        'FILTER_CHANGED',
        'COMPOSITION_UPDATED',
        'EXPLORATION_DEPTH_CHANGED',
        'URL_SYNC_REQUESTED',
        'SEARCH_UI_SYNC_REQUESTED',
        'SEARCH_STATUS_SYNC_REQUESTED',
        'SEMANTIC_LANE_STATE_REQUESTED',
        'SUMMARY_CARD_HIDE_REQUESTED',
        'TOOLTIP_HIDE_REQUESTED',
        'SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED',
        'VIEW_CHANGE_REQUESTED',
        'APP_ERROR_CAUGHT'
    ]
    assertDeepEqual(keys.sort(), [...expected].sort(), 'EVENTS keys must match the documented manifest')
    clearAllSubscribers()
    console.log(`  OK EVENTS has ${keys.length} documented semantic event names, all non-empty strings`)
}

async function testNestedPayloadPassthrough() {
    console.log('\n[TEST] nested-object payload passthrough (deep equality)')
    const { subscribe, publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    const payload = { a: { b: [1, 2], c: { d: 'x' } } }
    let received = undefined
    subscribe('COMPOSITION_UPDATED', (p) => {
        received = p
    })
    publish('COMPOSITION_UPDATED', payload)
    assertDeepEqual(received, payload, 'nested payload must deep-equal the published object')
    assert(received === payload, 'nested payload must also be the same reference')
    clearAllSubscribers()
    console.log('  OK nested object payload passes through intact')
}

async function testHandlerExceptionIsolation() {
    console.log('\n[TEST] handler exception isolation')
    const { subscribe, publish, clearAllSubscribers } = await import('../src/lib/orchestration/event-bus.ts')
    clearAllSubscribers()

    // The source wraps each callback in try/catch and logs via debugError, so a
    // throwing handler must NOT prevent sibling handlers and must NOT propagate.
    let firstCalls = 0
    let secondCalls = 0
    subscribe('APP_ERROR_CAUGHT', () => {
        firstCalls += 1
        throw new Error('boom from first handler')
    })
    subscribe('APP_ERROR_CAUGHT', () => {
        secondCalls += 1
    })

    let threw = false
    try {
        publish('APP_ERROR_CAUGHT', { source: 't', message: 'm', kind: 'error' })
    } catch (e) {
        threw = true
    }
    assert(threw === false, 'publish must NOT propagate a throwing handler exception')
    assert(firstCalls === 1, 'throwing handler still ran once')
    assert(secondCalls === 1, 'sibling handler must still run after a throwing handler')
    clearAllSubscribers()
    console.log('  OK one throwing handler does not break other subscribers or bubble up')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testSubscribeReturnsUnsub,
        testPublishDeliversPayload,
        testUnsubscribeStopsDelivery,
        testMultipleSubscribers,
        testScopeIsolation,
        testNoThrowUnknownEvent,
        testNoThrowNoSubscribers,
        testEventsConstant,
        testNestedPayloadPassthrough,
        testHandlerExceptionIsolation
    ]

    let passed = 0
    let failed = 0

    for (const test of tests) {
        try {
            await test()
            passed++
        } catch (err) {
            console.error(`  ${err.message}`)
            failed++
        }
    }

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
}

main().catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
})
