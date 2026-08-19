#!/usr/bin/env node
/**
 * tests/camera-choreography-routes-contract.mjs
 *
 * Node contract test for src/lib/engine/camera-choreography/routes.ts
 * Covers: animateCameraToSearchCorridor, zoomCamera, cancelRouteAnimations,
 *         clearInsideCentroid, applySemanticCentroidCamera, animateCameraToTerrainPrelude.
 *
 * Runs with: node --loader ./tests/helpers/ts-resolve-loader.mjs tests/camera-choreography-routes-contract.mjs
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Vector3 } from 'three'

const __filename = fileURLToPath(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims ────────────────────────────────────────────────────────────────────

class FakeElement {
    constructor() {
        this.dataset = {}
        this.classList = {
            _items: new Set(),
            add(cls) { this._items.add(cls) },
            remove(cls) { this._items.delete(cls) },
            contains(cls) { return this._items.has(cls) },
            toggle(cls, force) {
                const has = this._items.has(cls)
                if (force === undefined ? !has : force) { this._items.add(cls); return true }
                this._items.delete(cls); return false
            },
            *[Symbol.iterator]() { yield* this._items }
        }
    }
}

const timers = new Map()
let timerId = 0
globalThis.window = {
    setTimeout(fn, delay) {
        const id = ++timerId
        timers.set(id, { fn, delay, start: performance.now() })
        return id
    },
    clearTimeout(id) { timers.delete(id) },
    cancelAnimationFrame: () => {},
    requestAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
}
globalThis.document = { body: new FakeElement(), getElementById() { return null } }
globalThis.performance = globalThis.performance || { now: () => Date.now() }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

// isMobile checks window.innerWidth <= 768; in Node window.innerWidth is
// undefined so isMobile returns false (desktop branch).
Object.defineProperty(globalThis.window, 'innerWidth', { value: undefined, writable: false, configurable: true })

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertClose(a, b, epsilon, msg) {
    if (Math.abs(a - b) > epsilon) throw new Error(`${msg} — expected ~${b}, got ${a}`)
}

// ── Test State Setup Helpers ─────────────────────────────────────────────────

async function makeAppState() {
    const { appState } = await import('../src/lib/state/app.svelte.ts')
    appState.camera = null
    appState.controls = null
    appState.currentView = 'galaxy'
    appState.navState.focusedIndex = null
    appState.navState.currentPersonality = undefined
    appState.navState.focusPocketIndices = []
    appState.semanticDiveMode = false
    appState.activeClusterFilter = null
    appState.points = []
    appState.nodePositions = []
    appState.targetPositions = []
    appState.originalPositions = []
    appState.routeCameraAnimationToken = 0
    appState.focusCameraAnimationToken = 0
    appState.trailDepth = 0
    appState.MAP_HANDOFF_PRELUDE_MS = 430
    appState.ORBIT_MIN_DISTANCE_DEFAULT = 0.5
    appState.ORBIT_MAX_DISTANCE_DEFAULT = 5.5
    return appState
}

function makeCameraAndControls(opts = {}) {
    const pos = opts.position || { x: 0, y: 0, z: 4 }
    const target = opts.target || { x: 0, y: 0, z: 0 }
    const minDist = opts.minDistance ?? 0.5
    const maxDist = opts.maxDistance ?? 8
    return {
        position: new Vector3(pos.x, pos.y, pos.z),
        controls: {
            target: new Vector3(target.x, target.y, target.z),
            enabled: true,
            minDistance: minDist,
            maxDistance: maxDist,
            update() { /* no-op */ }
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testSearchCorridorValid() {
    console.log('\n[TEST] animateCameraToSearchCorridor — valid path')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToSearchCorridor } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { runFrameTasks, clearScheduledFrameTasks, hasScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')
    const { subscribe, EVENTS } = await import('../src/lib/orchestration/event-bus.ts')

    await makeAppState()
    const { position: startPos, controls: ctrl } = makeCameraAndControls({ position: { x: 2, y: 2, z: 4 }, target: { x: 0, y: 0, z: 0 } })
    appState.camera = { position: startPos }
    appState.controls = ctrl
    appState.currentView = 'galaxy'
    appState.navState.focusedIndex = null
    appState.semanticDiveMode = false

    const positions = [
        { x: 0, y: 0, z: 0, cluster: 0 },
        { x: 1, y: 0, z: 0, cluster: 0 },
        { x: 0, y: 1, z: 0, cluster: 0 }
    ]
    appState.points = positions.map((p, i) => ({ cluster: p.cluster, lead_id: i }))
    appState.nodePositions = positions
    appState.targetPositions = positions
    appState.originalPositions = positions

    const events = []
    const unsub = subscribe(EVENTS.TRANSITION_PHASE_CHANGED, (p) => events.push(p))

    const tokenBefore = appState.routeCameraAnimationToken
    const capturedStartPos = appState.camera.position.clone()
    const capturedStartTarget = appState.controls.target.clone()

    const result = animateCameraToSearchCorridor(0, [1, 2])
    assert(result === true, 'valid call should return true')
    assert(appState.routeCameraAnimationToken === tokenBefore + 1, 'token should increment')
    assert(hasScheduledFrameTasks() === true, 'frame task should be scheduled')

    const corridorEvents = events.filter((e) => e.phase === 'search-corridor')
    assert(corridorEvents.length === 1, 'should publish exactly one search-corridor event')

    // Drive frames past duration (~1320ms desktop).
    const startNow = performance.now()
    const duration = 1400
    const endTime = startNow + duration
    for (let t = startNow; t <= endTime; t += 16) {
        runFrameTasks(t)
    }
    runFrameTasks(endTime)

    assert(!appState.camera.position.equals(capturedStartPos), 'camera.position should have moved')
    assert(!appState.controls.target.equals(capturedStartTarget), 'controls.target should have moved')

    const idleEvents = events.filter((e) => e.phase === 'idle')
    assert(idleEvents.length === 0, 'search-corridor must NOT publish idle during run')

    unsub && unsub()
    clearScheduledFrameTasks()

    console.log('  OK valid path: returns true, token increments, camera/target move, one search-corridor event, no idle')
}

async function testSearchCorridorEarlyReturns() {
    console.log('\n[TEST] animateCameraToSearchCorridor — early-return cases')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToSearchCorridor } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    async function resetAndSet(finder) {
        await makeAppState()
        finder(appState)
    }

    const cases = [
        { name: 'camera=null', fn: async () => { await resetAndSet((s) => { s.camera = null }) } },
        { name: 'controls=null', fn: async () => { await resetAndSet((s) => { s.camera = { position: new Vector3(0,0,4) }; s.controls = null }) } },
        { name: 'currentView=map', fn: async () => { await resetAndSet((s) => { s.currentView = 'map' }) } },
        { name: 'focusedIndex=5', fn: async () => { await resetAndSet((s) => { s.navState.focusedIndex = 5 }) } },
        { name: 'semanticDiveMode=true', fn: async () => { await resetAndSet((s) => { s.semanticDiveMode = true }) } },
        { name: 'anchorIndex=NaN', fn: async () => { await resetAndSet((s) => { s.camera = { position: new Vector3(0,0,4) }; s.controls = { target: new Vector3(0,0,0), enabled: true, minDistance: 0.5, maxDistance: 8, update(){} } }) } },
        { name: 'points empty', fn: async () => { await resetAndSet((s) => { s.camera = { position: new Vector3(0,0,4) }; s.controls = { target: new Vector3(0,0,0), enabled: true, minDistance: 0.5, maxDistance: 8, update(){} }; s.points = [] }) } },
        { name: 'anchor position missing', fn: async () => { await resetAndSet((s) => { s.camera = { position: new Vector3(0,0,4) }; s.controls = { target: new Vector3(0,0,0), enabled: true, minDistance: 0.5, maxDistance: 8, update(){} }; s.points = [{ cluster: 0, lead_id: 0 }]; s.nodePositions = [undefined] }) } },
    ]

    for (const c of cases) {
        await c.fn()
        try {
            const result = animateCameraToSearchCorridor(
                c.name === 'anchorIndex=NaN' ? NaN : 0,
                []
            )
            assert(result === false, `${c.name}: should return false`)
        } catch (err) {
            throw new Error(`${c.name}: threw instead of returning false — ${err.message}`)
        }
        clearScheduledFrameTasks()
    }

    console.log('  OK all 8 early-return cases return false without throwing')
}

async function testZoomCamera() {
    console.log('\n[TEST] zoomCamera')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { zoomCamera } = await import('../src/lib/engine/camera-choreography/routes.ts')

    await makeAppState()
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = {
        target: new Vector3(0, 0, 0),
        enabled: true,
        minDistance: 0.5,
        maxDistance: 8,
        update() {}
    }

    zoomCamera(0.5)
    assertClose(appState.camera.position.distanceTo(appState.controls.target), 2, 1e-3, 'zoom 0.5 should give distance 2')

    zoomCamera(0.01)
    assertClose(appState.camera.position.distanceTo(appState.controls.target), 0.5, 1e-3, 'zoom 0.01 should clamp to minDistance 0.5')

    appState.camera.position.set(0, 0, 4)
    zoomCamera(100)
    assertClose(appState.camera.position.distanceTo(appState.controls.target), 8, 1e-3, 'zoom 100 should clamp to maxDistance 8')

    // No-op cases.
    appState.camera = null
    zoomCamera(2)
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = null
    zoomCamera(2)
    appState.controls = { target: new Vector3(0, 0, 0), enabled: true, minDistance: 0.5, maxDistance: 8, update() {} }
    appState.camera.position.set(NaN, 0, 0)
    zoomCamera(2)

    console.log('  OK zoom valid + clamped + no-op cases')
}

async function testCancelRouteAnimations() {
    console.log('\n[TEST] cancelRouteAnimations')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { cancelRouteAnimations, animateCameraToSearchCorridor } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { hasScheduledFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    cancelRouteAnimations()
    assert(hasScheduledFrameTasks() === false, 'should have no tasks after cancel with nothing running')

    await makeAppState()
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = { target: new Vector3(0, 0, 0), enabled: true, minDistance: 0.5, maxDistance: 8, update() {} }
    appState.points = [{ cluster: 0, lead_id: 0 }]
    appState.nodePositions = [{ x: 0, y: 0, z: 0 }]
    appState.targetPositions = [{ x: 0, y: 0, z: 0 }]
    appState.originalPositions = [{ x: 0, y: 0, z: 0 }]

    animateCameraToSearchCorridor(0)
    assert(hasScheduledFrameTasks() === true, 'should have tasks after starting animation')
    cancelRouteAnimations()
    assert(hasScheduledFrameTasks() === false, 'should have no tasks after cancel')

    clearScheduledFrameTasks()
    console.log('  OK safe to call with no animation and after starting one')
}

async function testClearInsideCentroid() {
    console.log('\n[TEST] clearInsideCentroid')

    const { clearInsideCentroid, applySemanticCentroidCamera } = await import('../src/lib/engine/camera-choreography/routes.ts')

    clearInsideCentroid()

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    await makeAppState()
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = { target: new Vector3(0, 0, 0), enabled: true, minDistance: 0.5, maxDistance: 8, update() {} }
    appState.trailDepth = 2
    appState.navState.focusedIndex = 0
    appState.navState.focusPocketIndices = [1]
    appState.nodePositions = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]
    appState.originalPositions = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]
    appState.navState.currentPersonality = { type: 'TIGHT_CLUSTER' }

    applySemanticCentroidCamera()
    clearInsideCentroid()

    console.log('  OK no-throw standalone and after applySemanticCentroidCamera')
}

async function testApplySemanticCentroidEarlyReturns() {
    console.log('\n[TEST] applySemanticCentroidCamera — early-return cases')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { applySemanticCentroidCamera } = await import('../src/lib/engine/camera-choreography/routes.ts')

    async function reset() {
        await makeAppState()
    }

    const cases = [
        { name: 'no camera/controls', fn: async () => { await reset() } },
        { name: 'trailDepth≠2', fn: async () => { await reset(); appState.trailDepth = 1 } },
        { name: 'focusPocketIndices empty', fn: async () => { await reset(); appState.trailDepth = 2; appState.navState.focusPocketIndices = [] } },
        { name: 'no anchorPos', fn: async () => { await reset(); appState.trailDepth = 2; appState.navState.focusPocketIndices = [1]; appState.navState.focusedIndex = 0; appState.nodePositions = [undefined, { x: 1, y: 0, z: 0 }] } },
    ]

    for (const c of cases) {
        await c.fn()
        if (c.name !== 'no camera/controls') {
            appState.camera = { position: new Vector3(0, 0, 4) }
            appState.controls = { target: new Vector3(0, 0, 0), enabled: true, minDistance: 0.5, maxDistance: 8, update() {} }
        }
        try {
            applySemanticCentroidCamera()
        } catch (err) {
            throw new Error(`${c.name}: threw — ${err.message}`)
        }
    }

    console.log('  OK all early-return cases handled without throw')
}

async function testApplySemanticCentroidValid() {
    console.log('\n[TEST] applySemanticCentroidCamera — valid path with centroid weight')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { applySemanticCentroidCamera, clearInsideCentroid } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { runFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    await makeAppState()
    appState.trailDepth = 2
    appState.navState.focusedIndex = 0
    appState.navState.focusPocketIndices = [1, 2]
    appState.nodePositions = [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 }
    ]
    appState.originalPositions = [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 }
    ]
    appState.navState.currentPersonality = { type: 'TIGHT_CLUSTER' }
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = {
        target: new Vector3(0, 0, 0),
        enabled: true,
        minDistance: 0.5,
        maxDistance: 8,
        update() {}
    }

    // pocketIndices = [anchorIdx, ...focusPocketIndices] = [0, 1, 2]
    // pocketCentroid = avg of nodes 0,1,2 = (0.667, 0.667, 0)
    // lookAtTarget = anchorVec.lerp(pocketCentroid, 0.12) = (0.08, 0.08, 0)
    const expectedLookAt = new Vector3(0.08, 0.08, 0)

    const startTarget = appState.controls.target.clone()
    applySemanticCentroidCamera()

    const startNow = performance.now()
    for (let t = startNow; t <= startNow + 1700; t += 16) {
        runFrameTasks(t)
    }
    runFrameTasks(startNow + 1700)

    const finalTarget = appState.controls.target.clone()
    assert(!finalTarget.equals(startTarget), 'controls.target should have moved')
    assertClose(finalTarget.x, expectedLookAt.x, 1e-2, 'final target x')
    assertClose(finalTarget.y, expectedLookAt.y, 1e-2, 'final target y')
    assertClose(finalTarget.z, expectedLookAt.z, 1e-2, 'final target z')

    clearInsideCentroid()
    clearScheduledFrameTasks()
    console.log('  OK valid path: target moves toward centroid-weighted lookAtTarget')
}

async function testApplySemanticCentroidReArmGuard() {
    console.log('\n[TEST] applySemanticCentroidCamera — P1 re-arm guard')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { applySemanticCentroidCamera, clearInsideCentroid } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { runFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    async function setupBase() {
        await makeAppState()
        appState.trailDepth = 2
        appState.navState.focusedIndex = 0
        appState.nodePositions = [
            { x: 0, y: 0, z: 0 },
            { x: 2, y: 0, z: 0 },
            { x: 0, y: 2, z: 0 }
        ]
        appState.originalPositions = [
            { x: 0, y: 0, z: 0 },
            { x: 2, y: 0, z: 0 },
            { x: 0, y: 2, z: 0 }
        ]
        appState.camera = { position: new Vector3(0, 0, 4) }
        appState.controls = {
            target: new Vector3(0, 0, 0),
            enabled: true,
            minDistance: 0.5,
            maxDistance: 8,
            update() {}
        }
    }

    const anchorVec = new Vector3(0, 0, 0)

    // --- Case A: same target re-arm should be no-op, completion reaches full target ---
    await setupBase()
    appState.navState.focusPocketIndices = [1, 2]
    appState.navState.currentPersonality = { type: 'TIGHT_CLUSTER' }

    // pocketIndices = [0, 1, 2], centroid = (0.667, 0.667, 0), lookAt = lerp(0, centroid, 0.12) = (0.08, 0.08, 0)
    const expectedA = anchorVec.clone().lerp(new Vector3(2 / 3, 2 / 3, 0), 0.12)

    applySemanticCentroidCamera()
    const startNow = performance.now()
    // Drive PARTIALLY (~800ms, half of 1600ms duration).
    for (let t = startNow; t <= startNow + 800; t += 16) {
        runFrameTasks(t)
    }
    const midwayTarget = appState.controls.target.clone()
    assert(!midwayTarget.equals(expectedA), 'at half-duration target should NOT yet be at final')

    // Re-arm with SAME state — should be no-op due to guard.
    applySemanticCentroidCamera()
    // Drive remaining 900ms to complete original 1600ms tween.
    for (let t = startNow + 800; t <= startNow + 1700; t += 16) {
        runFrameTasks(t)
    }
    runFrameTasks(startNow + 1700)

    const finalAfterSameTarget = appState.controls.target.clone()
    assertClose(finalAfterSameTarget.x, expectedA.x, 1e-2, 're-arm same target: final x')
    assertClose(finalAfterSameTarget.y, expectedA.y, 1e-2, 're-arm same target: final y')
    assertClose(finalAfterSameTarget.z, expectedA.z, 1e-2, 're-arm same target: final z')

    clearInsideCentroid()
    clearScheduledFrameTasks()

    // --- Case B: change pocketIndices (different target) then re-arm -> re-arms to new target ---
    await setupBase()
    appState.navState.focusPocketIndices = [1]
    appState.navState.currentPersonality = { type: 'TIGHT_CLUSTER' }

    applySemanticCentroidCamera()
    const startNow2 = performance.now()
    // Drive partially.
    for (let t = startNow2; t <= startNow2 + 800; t += 16) {
        runFrameTasks(t)
    }

    // Change pocket indices to a different set (target C).
    // pocketIndices = [anchor=0, pocket=2], centroid = avg(node0, node2) = (0, 1, 0)
    // lookAtC = anchorVec.lerp((0,1,0), 0.12) = (0, 0.12, 0)
    appState.navState.focusPocketIndices = [2]
    const expectedC = anchorVec.clone().lerp(new Vector3(0, 1, 0), 0.12)

    applySemanticCentroidCamera() // should re-arm with target C
    // Drive FULL 1600ms after re-arm to reach new target.
    const reArmStart = performance.now()
    for (let t = reArmStart; t <= reArmStart + 1700; t += 16) {
        runFrameTasks(t)
    }
    runFrameTasks(reArmStart + 1700)

    const finalAfterChange = appState.controls.target.clone()
    assertClose(finalAfterChange.x, expectedC.x, 1e-2, 're-arm changed target: final x')
    assertClose(finalAfterChange.y, expectedC.y, 1e-2, 're-arm changed target: final y')
    assertClose(finalAfterChange.z, expectedC.z, 1e-2, 're-arm changed target: final z')

    clearInsideCentroid()
    clearScheduledFrameTasks()
    console.log('  OK P1 re-arm guard: same target no-ops, changed target re-arms')
}

async function testTerrainPreludeValid() {
    console.log('\n[TEST] animateCameraToTerrainPrelude — valid path with events')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToTerrainPrelude } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { runFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')
    const { subscribe, EVENTS } = await import('../src/lib/orchestration/event-bus.ts')

    await makeAppState()
    appState.camera = { position: new Vector3(0, 0, 4) }
    appState.controls = {
        target: new Vector3(0, 0, 0),
        enabled: true,
        minDistance: 0.5,
        maxDistance: 8,
        update() {}
    }

    const events = []
    const unsub = subscribe(EVENTS.TRANSITION_PHASE_CHANGED, (p) => events.push(p))

    animateCameraToTerrainPrelude()

    const preludeEvents = events.filter((e) => e.phase === 'map-prelude')
    assert(preludeEvents.length === 1, 'should publish one map-prelude event')

    // Drive frames past default duration (MAP_HANDOFF_PRELUDE_MS = 430ms).
    const startNow = performance.now()
    for (let t = startNow; t <= startNow + 1300; t += 16) {
        runFrameTasks(t)
    }
    runFrameTasks(startNow + 1300)

    const idleEvents = events.filter((e) => e.phase === 'idle')
    assert(idleEvents.length === 1, 'should publish one idle event on completion')

    // Camera should have moved from start.
    const startPos = new Vector3(0, 0, 4)
    assert(!appState.camera.position.equals(startPos), 'camera.position should have moved')

    // controls.enabled should be restored to prior value (true).
    assert(appState.controls.enabled === true, 'controls.enabled should be restored after completion')

    unsub && unsub()
    clearScheduledFrameTasks()
    console.log('  OK valid path: map-prelude + idle events, camera moved, controls enabled restored')
}

async function testTerrainPreludeNoCameraControls() {
    console.log('\n[TEST] animateCameraToTerrainPrelude — no camera/controls')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToTerrainPrelude } = await import('../src/lib/engine/camera-choreography/routes.ts')
    const { subscribe, EVENTS } = await import('../src/lib/orchestration/event-bus.ts')

    await makeAppState()
    // camera and controls are null by default from makeAppState.

    const events = []
    const unsub = subscribe(EVENTS.TRANSITION_PHASE_CHANGED, (p) => events.push(p))

    animateCameraToTerrainPrelude()

    const preludeEvents = events.filter((e) => e.phase === 'map-prelude')
    const idleEvents = events.filter((e) => e.phase === 'idle')
    assert(preludeEvents.length === 1, 'should publish map-prelude even without camera')
    assert(idleEvents.length === 1, 'should publish idle immediately when no camera/controls')

    unsub && unsub()
    console.log('  OK no camera/controls: publishes map-prelude then immediately idle, no throw')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testSearchCorridorValid,
        testSearchCorridorEarlyReturns,
        testZoomCamera,
        testCancelRouteAnimations,
        testClearInsideCentroid,
        testApplySemanticCentroidEarlyReturns,
        testApplySemanticCentroidValid,
        testApplySemanticCentroidReArmGuard,
        testTerrainPreludeValid,
        testTerrainPreludeNoCameraControls,
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
