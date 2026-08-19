#!/usr/bin/env node
/**
 * tests/cursor-contract.mjs
 *
 * Node contract for src/lib/engine/camera/orchestration focusOnNode
 * (src/lib/engine/camera-choreography/cursor.ts — the focus-node orchestrator).
 *
 * Node-safe: the import graph is appState + three + the full focus-choreography
 * dependency tree (lifecycle, journey, event-bus, focus.ts, …), all proven
 * loadable by the VERIFIED recipe shim block below. The only browser primitives
 * exercised are window.cancelAnimationFrame / requestAnimationFrame (no-ops),
 * window.innerWidth (undefined → desktop), document.body.classList / dataset,
 * and document.querySelectorAll / querySelector / getElementById mocked.
 *
 * Covers focusOnNode(index, options): invalid-index guard, missing-point guard,
 *          valid focus + side effects (hoverHighlight reset, focusOrigin,
 *          camera-animation token increment), options-derived focusOrigin,
 *          hover-like debounce via suppressCanvasFocusUntil, and URL-sync
 *          event publishing (presence when not skipped, absence when skipped).
 */

import { register } from 'node:module'
import { Vector3 } from 'three'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims (VERIFIED recipe — do not reorder/replace) ─────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => {}
globalThis.window.setTimeout = setTimeout
globalThis.window.clearTimeout = clearTimeout
Object.defineProperty(globalThis.window, 'innerWidth', { value: undefined, writable: false, configurable: true })
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }
globalThis.document = globalThis.document || {}
const _cl = []
const fakeClassList = {
    _items: _cl,
    add(...n) {
        for (const x of n) if (!_cl.includes(x)) _cl.push(x)
    },
    remove(...n) {
        for (const x of n) {
            const i = _cl.indexOf(x)
            if (i >= 0) _cl.splice(i, 1)
        }
    },
    contains(x) {
        return _cl.includes(x)
    },
    toggle(x) {
        const i = _cl.indexOf(x)
        if (i >= 0) _cl.splice(i, 1)
        else _cl.push(x)
    },
    item(i) {
        return _cl[i] ?? null
    },
    get length() {
        return _cl.length
    },
    [Symbol.iterator]() {
        return _cl[Symbol.iterator]()
    }
}
globalThis.document.body = globalThis.document.body || { classList: fakeClassList, dataset: {} }
globalThis.document.querySelectorAll = () => []
globalThis.document.querySelector = () => null
globalThis.document.getElementById = () => null

// ── Module imports (after shims) ─────────────────────────────────────────────

const { appState } = await import('../src/lib/state/app.svelte.ts')
const { focusOnNode } = await import('../src/lib/engine/camera-choreography/cursor.ts')
const { subscribe, EVENTS } = await import('../src/lib/orchestration/event-bus.ts')

// ── Event-bus capture (real subscribe) ───────────────────────────────────────

let urlSyncCount = 0
let nodeFocusedCount = 0
let cameraMovedCount = 0
subscribe(EVENTS.URL_SYNC_REQUESTED, () => {
    urlSyncCount++
})
subscribe(EVENTS.CAMERA_NODE_FOCUSED, () => {
    nodeFocusedCount++
})
subscribe(EVENTS.CAMERA_MOVED, () => {
    cameraMovedCount++
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// Reset the fields we touch so tests don't contaminate each other. The
// "reactive proxy" (Svelte state) is a module singleton; we mutate navState
// fields rather than replacing navState wholesale.
function resetAll() {
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = { target: new Vector3(0, 0, 0), enabled: true, update() {} }
    appState.currentView = 'galaxy'
    appState.hoverHighlightIndex = 99
    appState.trailDepth = 0
    appState.suppressCanvasFocusUntil = 0
    appState.myceliumMode = 'dormant'
    appState.points = [{ cluster: 0, lead_id: 1 }, { cluster: 1, lead_id: 2 }]
    appState.nodePositions = [{ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]
    appState.originalPositions = appState.nodePositions
    appState.navState = {
        mode: 'overview',
        focusPocketIndices: [],
        focusedIndex: null,
        currentPersonality: undefined,
        focusFramingMeta: undefined,
        trailNeighborIndices: [],
        trailSeedIndex: null
    }
    appState.focusCameraAnimationToken = 0
    appState.focusCameraTargetOffset = null
    if (globalThis.document.body.dataset) globalThis.document.body.dataset.focusOrigin = undefined
    urlSyncCount = 0
    nodeFocusedCount = 0
    cameraMovedCount = 0
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testInvalidIndexReturnsFalse() {
    console.log('\n[TEST] invalid index → false (no throw)')
    resetAll()
    assert(focusOnNode(NaN) === false, 'NaN index should return false')
    resetAll()
    assert(focusOnNode(-1) === false, 'negative index should return false')
    resetAll()
    assert(focusOnNode(99) === false, 'out-of-range index (99 >= length 2) should return false')
    console.log('  OK NaN / -1 / 99 all return false without throwing')
}

async function testMissingPointReturnsFalse() {
    console.log('\n[TEST] missing point → false')
    resetAll()
    // points has length 1 but element 0 is undefined → passes bounds check,
    // then `const point = points[index]; if (!point) return false`.
    appState.points = [undefined]
    const tokenBefore = appState.focusCameraAnimationToken
    assert(focusOnNode(0) === false, 'focusOnNode(0) with undefined points[0] should return false')
    assert(
        appState.focusCameraAnimationToken === tokenBefore,
        'no camera animation should run when point is missing'
    )
    console.log('  OK undefined points[0] returns false, no animation')
}

async function testValidFocusSideEffects() {
    console.log('\n[TEST] valid focus → true + side effects')
    resetAll()
    const tokenBefore = appState.focusCameraAnimationToken
    const res = focusOnNode(0)
    assert(res === true, 'focusOnNode(0) should return true')
    assert(appState.hoverHighlightIndex === -1, 'hoverHighlightIndex should be reset to -1')
    assert(
        globalThis.document.body.dataset.focusOrigin === 'programmatic',
        `focusOrigin should be 'programmatic', got '${globalThis.document.body.dataset.focusOrigin}'`
    )
    // animateCameraToNode runs in non-reduced-motion path → token increments by 1.
    assert(
        appState.focusCameraAnimationToken === tokenBefore + 1,
        `focusCameraAnimationToken should increment by 1 (ran animateCameraToNode), got ${appState.focusCameraAnimationToken}`
    )
    // Event-bus side effects: CAMERA_MOVED + CAMERA_NODE_FOCUSED published.
    assert(cameraMovedCount >= 1, 'CAMERA_MOVED should be published')
    assert(nodeFocusedCount >= 1, 'CAMERA_NODE_FOCUSED should be published')
    console.log('  OK returns true; hoverHighlight=-1; focusOrigin=programmatic; token+1; events fired')
}

async function testFocusOriginFromOptions() {
    console.log('\n[TEST] focusOrigin derived from options')
    resetAll()
    focusOnNode(0, { fromSearchResult: true })
    assert(
        globalThis.document.body.dataset.focusOrigin === 'search-result',
        `fromSearchResult → 'search-result', got '${globalThis.document.body.dataset.focusOrigin}'`
    )

    resetAll()
    focusOnNode(0, { fromCanvasNode: true })
    assert(
        globalThis.document.body.dataset.focusOrigin === 'field-node',
        `fromCanvasNode → 'field-node', got '${globalThis.document.body.dataset.focusOrigin}'`
    )

    resetAll()
    focusOnNode(0, { fromTraversal: true })
    assert(
        globalThis.document.body.dataset.focusOrigin === 'trail-walk',
        `fromTraversal → 'trail-walk', got '${globalThis.document.body.dataset.focusOrigin}'`
    )
    console.log('  OK search-result / field-node / trail-walk per the source ternary')
}

async function testHoverLikeDebounce() {
    console.log('\n[TEST] hover-like debounce via suppressCanvasFocusUntil')
    resetAll()
    // Suppress for 5s into the future. A plain (hover-like) focus without any
    // from* option must be debounced.
    appState.suppressCanvasFocusUntil = performance.now() + 5000
    const tokenBefore = appState.focusCameraAnimationToken
    assert(
        focusOnNode(0) === false,
        'hover-like focus while suppressCanvasFocusUntil is in the future should return false'
    )
    assert(
        appState.focusCameraAnimationToken === tokenBefore,
        'no camera animation should run while hover-like focus is suppressed'
    )
    // Reset so subsequent tests are unaffected.
    appState.suppressCanvasFocusUntil = 0
    console.log('  OK hover-like focus suppressed; token unchanged')
}

async function testUrlSyncEvent() {
    console.log('\n[TEST] URL sync event publishing')
    // No skipUrlSync → URL_SYNC_REQUESTED published (plus CAMERA_* events).
    resetAll()
    const res = focusOnNode(0)
    assert(res === true, 'focusOnNode(0) without skipUrlSync should return true')
    assert(urlSyncCount >= 1, `URL_SYNC_REQUESTED should be published (count=${urlSyncCount})`)
    assert(nodeFocusedCount >= 1, 'at least one event (CAMERA_NODE_FOCUSED) should be published')

    // With skipUrlSync:true → NO URL_SYNC_REQUESTED event.
    resetAll()
    const res2 = focusOnNode(0, { skipUrlSync: true })
    assert(res2 === true, 'focusOnNode(0, {skipUrlSync:true}) should still return true')
    assert(
        urlSyncCount === 0,
        `URL_SYNC_REQUESTED should NOT be published when skipUrlSync:true (count=${urlSyncCount})`
    )
    assert(nodeFocusedCount >= 1, 'CAMERA_NODE_FOCUSED still published even when skipUrlSync:true')
    console.log('  OK URL_SYNC_REQUESTED published unless skipUrlSync:true')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testInvalidIndexReturnsFalse,
        testMissingPointReturnsFalse,
        testValidFocusSideEffects,
        testFocusOriginFromOptions,
        testHoverLikeDebounce,
        testUrlSyncEvent
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
