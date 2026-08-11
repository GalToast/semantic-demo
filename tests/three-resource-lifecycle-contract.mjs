/**
 * three-resource-lifecycle-contract.mjs
 *
 * Fast Node contract test for the Three.js resource lifecycle and diagnostics.
 */

import fs from 'node:fs'
import path from 'node:path'

const SEMDEMO_ROOT = path.resolve(process.cwd())
const WEBGL_CONTEXT_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/webgl-context.ts')
const THREE_ENGINE_CORE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/three-engine-core.ts')
const THREE_ENGINE_TEARDOWN_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/three-engine-teardown.ts')
const RENDERER_DIAGNOSTICS_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/renderer/renderer-diagnostics.ts')
const THREE_ENGINE_SEARCH_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/three-engine-search.ts')
const NODE_MANAGER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/node-manager.ts')
const THREAD_MANAGER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/thread-manager.ts')
const VISUALS_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/three-interaction-visuals.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`)
}

// ---------------------------------------------------------------------------
// TEST 1: Lifecycle Helpers Exist
// ---------------------------------------------------------------------------

function testLifecycleHelpersExist() {
    console.log('\n[TEST] Lifecycle Helpers Exist')

    const contextSrc = fs.readFileSync(WEBGL_CONTEXT_PATH, 'utf-8')
    const engineSearchSrc = fs.readFileSync(THREE_ENGINE_SEARCH_PATH, 'utf-8')
    const nodeSrc = fs.readFileSync(NODE_MANAGER_PATH, 'utf-8')
    const threadSrc = fs.readFileSync(THREAD_MANAGER_PATH, 'utf-8')
    const visualsSrc = fs.readFileSync(VISUALS_PATH, 'utf-8')

    assertContains(contextSrc, 'export function getLiveResourceCounts', 'getLiveResourceCounts exported')
    assertContains(nodeSrc, 'export function disposeNodeVisuals', 'disposeNodeVisuals exported')
    assertContains(threadSrc, 'export function disposeMycelium', 'disposeMycelium exported')
    assertContains(visualsSrc, 'export function disposeInteractionVisuals', 'disposeInteractionVisuals exported')
    assertContains(visualsSrc, 'export function disposeSemanticLens', 'disposeSemanticLens exported')
    assertContains(
        engineSearchSrc,
        'export function disposeSearchCorridorAnimation',
        'disposeSearchCorridorAnimation exported'
    )

    console.log('  OK all required disposal helpers are exported')
}

// ---------------------------------------------------------------------------
// TEST 2: Engine Teardown Path
// ---------------------------------------------------------------------------

function testEngineTeardownPath() {
    console.log('\n[TEST] Engine Teardown Path')

    // W-split follow-up: the teardown sequence moved out of three-engine-core
    // into three-engine-teardown.ts after the teardown extraction. Assert
    // against the live owner; core re-exports cancelAnimate/deinit from it.
    const engineCoreSrc = fs.readFileSync(THREE_ENGINE_TEARDOWN_PATH, 'utf-8')

    assertContains(engineCoreSrc, 'disposeNodeVisualsPort()', 'Teardown calls disposeNodeVisuals')
    assertContains(engineCoreSrc, 'disposeMyceliumPort()', 'Teardown calls disposeMycelium')
    assertContains(engineCoreSrc, 'disposeInteractionVisuals()', 'Teardown calls disposeInteractionVisuals')
    assertContains(engineCoreSrc, 'disposeHeroAnimation()', 'Teardown calls disposeHeroAnimation')

    console.log('  OK engine teardown path is wired with disposal helpers')
}

// ---------------------------------------------------------------------------
// TEST 3: Resource Diagnostics
// ---------------------------------------------------------------------------

function testResourceDiagnostics() {
    console.log('\n[TEST] Resource Diagnostics')

    const diagnosticsSrc = fs.readFileSync(RENDERER_DIAGNOSTICS_PATH, 'utf-8')

    assertContains(
        diagnosticsSrc,
        'const resources = getLiveResourceCounts()',
        'Diagnostics calls getLiveResourceCounts'
    )
    assertContains(diagnosticsSrc, 'memory: resources', 'Diagnostics includes memory stats')

    console.log('  OK resource diagnostics are wired')
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('============================================================')
    console.log('three-resource-lifecycle-contract.mjs')
    console.log('Contract test: Three.js resource lifecycle and diagnostics')
    console.log('============================================================')

    try {
        testLifecycleHelpersExist()
        testEngineTeardownPath()
        testResourceDiagnostics()

        console.log('\n============================================================')
        console.log('ALL TESTS PASSED')
        console.log('============================================================')
        process.exit(0)
    } catch (err) {
        console.error('\nTEST FAILED:', err.message)
        process.exit(1)
    }
}

main()
