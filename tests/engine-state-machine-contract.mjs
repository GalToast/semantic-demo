#!/usr/bin/env node
/**
 * tests/engine-state-machine-contract.mjs
 *
 * Fast Node contract for the Three.js engine state machine.
 * Runs in Node with a tiny DOM/window/performance shim — no browser needed.
 *
 * Covers:
 *   - engineState shape: all required lazy-module slots and render-loop
 *     bookkeeping fields are present at module load
 *   - animate() export: the render-loop entry point is a function
 *   - ensureModules() export: the lazy-module loader is a function
 *   - markEngineInitPhase() export: the init-phase tracker is a function
 *   - requestRenderLoopStart() / startRenderLoop() exports (three-engine-core)
 *   - No zombie state at init: rafId is null, circuitBreakerTripped is false,
 *     webglContextLost is false, loaded is false
 *   - applyMapFlatteningLayout() export: map-flattening toggle is a function
 *
 * This is the "does the engine boot?" gate. If the render loop, state machine,
 * or init phase tracker breaks, the app renders nothing — and there is no
 * other contract that catches it because the engine has zero runtime tests.
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims ────────────────────────────────────────────────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => 0
globalThis.performance = globalThis.performance || { now: () => Date.now() }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertIsFunction(fn, label) {
    assert(typeof fn === 'function', `${label} should be a function, got ${typeof fn}`)
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testEngineStateShape() {
    console.log('\n[TEST] Engine state shape')

    const { engineState } = await import('../src/lib/engine/three-engine-state.ts')

    // Lazy-module slots — must all be present (null at init)
    const lazySlots = [
        'ppModule',
        'ppLoading',
        'withStateMutation',
        'clusterLabels',
        'focusPocket',
        'sceneReveal',
        'cameraControls',
        'mapState',
        'uiFeedback',
        'mapFlattening',
        'webglRestore',
        'inspectedStrand',
        'focusAnchor',
        'threeSearchAnimations',
        'audioScape',
        'loadingUi',
        'threeInteractionVisuals',
        'state'
    ]

    for (const slot of lazySlots) {
        assert(slot in engineState, `engineState should have lazy slot "${slot}"`)
        assert(
            engineState[slot] === null,
            `engineState.${slot} should be null at init, got ${typeof engineState[slot]}`
        )
    }

    // Boolean render-loop flags — must be present and false at init
    const boolFlags = [
        'renderLoopStartPending',
        'webglContextLost',
        'webglNeedsRestoreReinit',
        'circuitBreakerTripped',
        'loaded'
    ]

    for (const flag of boolFlags) {
        assert(flag in engineState, `engineState should have flag "${flag}"`)
        assert(engineState[flag] === false, `engineState.${flag} should be false at init, got ${engineState[flag]}`)
    }

    // Render-loop IDs — must be null at init
    assert(engineState.rafId === null, `engineState.rafId should be null at init, got ${engineState.rafId}`)
    assert(engineState.idleFrameTimerId === null, `engineState.idleFrameTimerId should be null at init`)
    assert(engineState.webglRestoreTimer === null, `engineState.webglRestoreTimer should be null at init`)

    console.log('  OK all 18 lazy slots null, all 5 bool flags false, both IDs null')
}

async function testRenderLoopExports() {
    console.log('\n[TEST] Render loop exports')

    const renderLoop = await import('../src/lib/engine/three-engine-render-loop.ts')

    assertIsFunction(renderLoop.animate, 'animate')

    console.log('  OK animate exported from render-loop')
}

async function testEngineCoreExports() {
    console.log('\n[TEST] Engine core exports')

    const core = await import('../src/lib/engine/three-engine-core.ts')

    assertIsFunction(core.updateCameraViewportOffset, 'updateCameraViewportOffset')
    assertIsFunction(core.onWindowResize, 'onWindowResize')
    assertIsFunction(core.requestRenderLoopStart, 'requestRenderLoopStart')
    assertIsFunction(core.startRenderLoop, 'startRenderLoop')
    assertIsFunction(core.markEngineInitPhase, 'markEngineInitPhase')
    assertIsFunction(core.applyMapFlatteningLayout, 'applyMapFlatteningLayout')

    console.log(
        '  OK updateCameraViewportOffset, onWindowResize, requestRenderLoopStart, startRenderLoop, markEngineInitPhase, applyMapFlatteningLayout exported'
    )
}

async function testStateModuleExports() {
    console.log('\n[TEST] State module exports')

    const state = await import('../src/lib/engine/three-engine-state.ts')

    assertIsFunction(state.ensureModules, 'ensureModules')
    assert(typeof state.engineState === 'object', 'engineState should be an object')

    console.log('  OK ensureModules exported, engineState is an object')
}

async function testNoZombieState() {
    console.log('\n[TEST] No zombie state at module load')

    const { engineState } = await import('../src/lib/engine/three-engine-state.ts')

    // A zombie state would mean the render loop is running without being
    // started, or the circuit breaker is tripped at init.
    assert(engineState.rafId === null, 'rafId must be null at init (no zombie RAF)')
    assert(engineState.circuitBreakerTripped === false, 'circuitBreaker must be false at init')
    assert(engineState.webglContextLost === false, 'webglContextLost must be false at init')
    assert(engineState.loaded === false, 'loaded must be false at init')

    console.log('  OK no zombie state detected')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testEngineStateShape,
        testRenderLoopExports,
        testEngineCoreExports,
        testStateModuleExports,
        testNoZombieState
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
