#!/usr/bin/env node
/**
 * tests/orbit-slack-contract.mjs
 *
 * Node contract for src/lib/engine/camera-choreography/orbit-slack.ts
 * Focus orbit slack: pivot adjustment, control widening/clearing, state bookkeeping.
 *
 * Pure math + appState + CONFIG — no DOM, no WebGL. Runs in plain Node.
 * Covers: isSearchRouteFocusActive, getFocusOrbitSlackPivot, applyFocusOrbitSlack,
 *         clearFocusOrbitSlack.
 *
 * Verified recipe: the REAL appState (Svelte reactive proxy) is configurable from
 * Node. currentView is a getter/setter proxying navState.currentView — mutate
 * navState fields, do NOT replace navState wholesale. isMobile() returns false in
 * Node (window.innerWidth undefined), so the desktop branch is taken.
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Vector3 } from 'three'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims ────────────────────────────────────────────────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => 0
// isMobile() checks window.innerWidth <= 768; undefined <= 768 is false → desktop.
Object.defineProperty(globalThis.window, 'innerWidth', { value: undefined, writable: false, configurable: true })
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertClose(a, b, eps, msg) {
    if (Math.abs(a - b) > eps) throw new Error(`${msg} — expected ~${b}, got ${a}`)
}

// Canonical ORBIT constants (mirror src/lib/engine/config.ts CONFIG.ORBIT_*).
const ORBIT = {
    MIN_DISTANCE_DEFAULT: 0.5,
    MAX_DISTANCE_DEFAULT: 5.5,
    MAX_DISTANCE_FREE: 6.8,
    ROTATE_SPEED_DEFAULT: 0.6,
    ROTATE_SPEED_FREE: 0.82,
    PAN_SPEED_DEFAULT: 0.5,
    PAN_SPEED_FREE: 0.68
}

let _updateCalls = 0

function makeControls(opts = {}) {
    return {
        target: new Vector3(opts.targetX ?? 1, opts.targetY ?? 0, opts.targetZ ?? 0),
        enabled: true,
        minDistance: opts.minDistance ?? ORBIT.MIN_DISTANCE_DEFAULT,
        maxDistance: opts.maxDistance ?? ORBIT.MAX_DISTANCE_DEFAULT,
        update() {
            _updateCalls++
        }
    }
}

function makeCamera(opts = {}) {
    return { position: new Vector3(opts.x ?? 1, opts.y ?? 0, opts.z ?? 4) }
}

// Configure the slack-ACTIVE condition on the real appState.
// Mutates navState fields individually — currentView is a getter/setter proxy
// over navState.currentView, so setting appState.currentView writes through.
async function setupActive(appState, overrides = {}) {
    appState.currentView = 'galaxy'
    appState.semanticDiveMode = false
    appState.focusedNode = overrides.focusedNode !== undefined ? overrides.focusedNode : 0
    appState.searchState = { currentSearchSummary: overrides.searchSummary ?? { q: 'test' } }
    appState.navState.walkHistoryIndices = overrides.walkHistoryIndices ?? []
    appState.navState.trailNeighborIndices = overrides.trailNeighborIndices ?? [1, 2]
    appState.navState.trailSeedIndex = overrides.trailSeedIndex ?? null
    appState.nodePositions = overrides.nodePositions ?? [
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 }
    ]
    appState.originalPositions = overrides.originalPositions ?? appState.nodePositions
    appState.camera = overrides.camera !== undefined ? overrides.camera : makeCamera({ x: 1, y: 0, z: 4 })
    appState.controls =
        overrides.controls !== undefined
            ? overrides.controls
            : makeControls({ targetX: 1, targetY: 0, targetZ: 0, maxDistance: ORBIT.MAX_DISTANCE_DEFAULT })
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testIsSearchRouteFocusActive() {
    console.log('\n[TEST] isSearchRouteFocusActive')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { isSearchRouteFocusActive } = await import('../src/lib/engine/camera-choreography/orbit-slack.ts')

    // Active.
    await setupActive(appState)
    assert(isSearchRouteFocusActive() === true, 'should be active in galaxy view with focus + summary + walkDepth 0')

    // Each condition independently breaks it.
    appState.currentView = 'map'
    assert(isSearchRouteFocusActive() === false, 'not galaxy view')
    await setupActive(appState)
    appState.semanticDiveMode = true
    assert(isSearchRouteFocusActive() === false, 'semantic dive mode')
    await setupActive(appState)
    appState.focusedNode = null
    assert(isSearchRouteFocusActive() === false, 'no focused node')
    await setupActive(appState)
    appState.searchState = { currentSearchSummary: null }
    assert(isSearchRouteFocusActive() === false, 'no search summary')
    await setupActive(appState)
    appState.navState.walkHistoryIndices = [1, 2] // length 2 -> walkDepth 1
    assert(isSearchRouteFocusActive() === false, 'walkDepth != 0')

    console.log('  OK active + 5 independent break conditions')
}

async function testGetFocusOrbitSlackPivot() {
    console.log('\n[TEST] getFocusOrbitSlackPivot')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { getFocusOrbitSlackPivot } = await import('../src/lib/engine/camera-choreography/orbit-slack.ts')

    // Null when no camera.
    await setupActive(appState, { camera: null })
    assert(getFocusOrbitSlackPivot() === null, 'null when no camera')

    // Null when no focused node.
    await setupActive(appState, { focusedNode: null })
    assert(getFocusOrbitSlackPivot() === null, 'null when no focused node')

    // Null when focus position missing.
    await setupActive(appState, { nodePositions: [undefined, { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }] })
    assert(getFocusOrbitSlackPivot() === null, 'null when focus position missing')

    // Valid pivot (desktop branch, isMobile() false):
    //   focusVector = (1,0,0); routeCenter = centroid of (2,0,0),(3,0,0) = (2.5,0,0)
    //   pivot = focusVector.lerp(routeCenter, 0.38) = (1.57, 0, 0)
    //   cameraOffset = (0,0,4), length 4 -> add (0,0,1)*min(0.22, 0.72) = (0,0,0.22)
    //   pivot.y += 0.026
    //   => (1.57, 0.026, 0.22)
    await setupActive(appState)
    const pivot = getFocusOrbitSlackPivot()
    assert(pivot instanceof Vector3, 'pivot should be a Vector3')
    assertClose(pivot.x, 1.57, 1e-3, 'pivot.x')
    assertClose(pivot.y, 0.026, 1e-3, 'pivot.y')
    assertClose(pivot.z, 0.22, 1e-3, 'pivot.z')

    console.log('  OK null guards + desktop pivot (1.57, 0.026, 0.22)')
}

async function testApplyFocusOrbitSlack() {
    console.log('\n[TEST] applyFocusOrbitSlack')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { applyFocusOrbitSlack } = await import('../src/lib/engine/camera-choreography/orbit-slack.ts')

    // False when not galaxy view.
    await setupActive(appState)
    appState.currentView = 'map'
    assert(applyFocusOrbitSlack() === false, 'false when not galaxy view')

    // False when semantic dive mode.
    await setupActive(appState)
    appState.semanticDiveMode = true
    assert(applyFocusOrbitSlack() === false, 'false when semantic dive mode')

    // False when no camera.
    await setupActive(appState, { camera: null })
    assert(applyFocusOrbitSlack() === false, 'false when no camera')

    // False when no controls.
    await setupActive(appState, { controls: null })
    assert(applyFocusOrbitSlack() === false, 'false when no controls')

    // True + structural invariants (desktop: maxShift 0.2).
    // nextTarget = (1.57, 0.026, 0.22); currentTarget = (1,0,0)
    // targetDelta = (0.57, 0.026, 0.22) len 0.6115 -> clamped to 0.2
    //   normalized * 0.2 = (0.18642, 0.008504, 0.071954)
    // cameraDelta = targetDelta * 0.72 = (0.13422, 0.006123, 0.051807)
    _updateCalls = 0
    await setupActive(appState)
    const startTarget = appState.controls.target.clone()
    const startCamPos = appState.camera.position.clone()
    const result = applyFocusOrbitSlack('test-reason')

    assert(result === true, 'should return true when slack applied')
    assert(_updateCalls === 1, 'controls.update() should be called once')
    assert(
        appState.controls.target.x !== startTarget.x ||
            appState.controls.target.y !== startTarget.y ||
            appState.controls.target.z !== startTarget.z,
        'controls.target should move'
    )
    assert(appState.camera.position.distanceTo(startCamPos) > 0.001, 'camera.position should move')

    // Free-config widening.
    assert(appState.controls.maxDistance === ORBIT.MAX_DISTANCE_FREE, 'maxDistance should widen to FREE')
    assert(appState.controls.rotateSpeed === ORBIT.ROTATE_SPEED_FREE, 'rotateSpeed should widen to FREE')
    assert(appState.controls.panSpeed === ORBIT.PAN_SPEED_FREE, 'panSpeed should widen to FREE')

    // State bookkeeping — exact values from clean inputs.
    const st = appState.focusOrbitSlackState
    assert(st.phase === 'free-pivot', 'state phase should be free-pivot')
    assert(st.reason === 'test-reason', 'state reason should pass through')
    assert(st.targetShift === 0.2, `targetShift should be 0.2 (clamped), got ${st.targetShift}`)
    assert(st.cameraShift === 0.144, `cameraShift should be 0.144 (0.2*0.72), got ${st.cameraShift}`)
    assert(st.distanceBefore === 4, `distanceBefore should be 4, got ${st.distanceBefore}`)
    assertClose(st.distanceAfter, 3.98, 1e-2, 'distanceAfter')
    assert(st.maxDistance === 6.8, `state maxDistance should be 6.8, got ${st.maxDistance}`)
    assert(st.rotateSpeed === 0.82, `state rotateSpeed should be 0.82, got ${st.rotateSpeed}`)
    assert(st.panSpeed === 0.68, `state panSpeed should be 0.68, got ${st.panSpeed}`)

    console.log('  OK returns true; target/camera move; maxDistance/speeds widen; state bookkeeping exact')
}

async function testClearFocusOrbitSlack() {
    console.log('\n[TEST] clearFocusOrbitSlack')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { applyFocusOrbitSlack, clearFocusOrbitSlack } =
        await import('../src/lib/engine/camera-choreography/orbit-slack.ts')

    // Apply then clear — state should go idle and controls reset to defaults.
    _updateCalls = 0
    await setupActive(appState)
    applyFocusOrbitSlack('x')
    assert(appState.focusOrbitSlackState.phase === 'free-pivot', 'precondition: slack active')

    clearFocusOrbitSlack('clear-reason')
    const st = appState.focusOrbitSlackState
    assert(st.phase === 'idle', 'phase should be idle after clear')
    assert(st.reason === 'clear-reason', 'reason should pass through')
    assert(st.targetShift === 0, 'targetShift should be 0 after clear')
    assert(st.cameraShift === 0, 'cameraShift should be 0 after clear')
    assert(st.distanceBefore === st.distanceAfter, 'distanceBefore should equal distanceAfter after clear')
    assert(appState.controls.maxDistance === ORBIT.MAX_DISTANCE_DEFAULT, 'maxDistance should reset to DEFAULT')
    assert(appState.controls.rotateSpeed === ORBIT.ROTATE_SPEED_DEFAULT, 'rotateSpeed should reset to DEFAULT')
    assert(appState.controls.panSpeed === ORBIT.PAN_SPEED_DEFAULT, 'panSpeed should reset to DEFAULT')

    // No camera/controls — safe, no throw, state idle.
    appState.camera = null
    appState.controls = null
    clearFocusOrbitSlack()
    assert(appState.focusOrbitSlackState.phase === 'idle', 'phase idle when no camera/controls')

    console.log('  OK idle state + defaults restored; null-safe')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testIsSearchRouteFocusActive,
        testGetFocusOrbitSlackPivot,
        testApplyFocusOrbitSlack,
        testClearFocusOrbitSlack
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
