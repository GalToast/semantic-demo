#!/usr/bin/env node
/**
 * tests/framing-utils-contract.mjs
 *
 * Node contract for src/lib/engine/camera-choreography/framing-utils.ts
 * Focus pocket safe-area camera framing utilities.
 *
 * Node-safe: imports three + framing-utils (DOM only inside
 * getCanvasUnobstructedRegion; the two math-heavy functions are pure).
 * Shims cover window, requestAnimationFrame, document.body.classList, and
 * dataset so getCanvasUnobstructedRegion can run without a real DOM.
 *
 * Covers:
 *   - computeSafeAreaCameraTargetOffset — pure math, sign-bug fix verified
 *   - computeFocusPocketScreenBounds — screen projection through real camera
 *   - getCanvasUnobstructedRegion — light DOM coverage
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Vector3, PerspectiveCamera } from 'three'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims ────────────────────────────────────────────────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => 0
globalThis.window.setTimeout = setTimeout
globalThis.window.clearTimeout = clearTimeout
// isMobile() checks window.innerWidth <= 768; 1280 > 768 → desktop.
Object.defineProperty(globalThis.window, 'innerWidth', { value: 1280, writable: false, configurable: true })
Object.defineProperty(globalThis.window, 'innerHeight', { value: 800, writable: false, configurable: true })
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }

// getCanvasUnobstructedRegion touches document.body.classList and dataset.
globalThis.document = globalThis.document || {}
const _cl = []
const fakeClassList = {
    _items: _cl,
    add(...n) { for (const x of n) if (!_cl.includes(x)) _cl.push(x) },
    remove(...n) { for (const x of n) { const i = _cl.indexOf(x); if (i >= 0) _cl.splice(i, 1) } },
    contains(x) { return _cl.includes(x) },
    toggle(x) { const i = _cl.indexOf(x); if (i >= 0) _cl.splice(i, 1); else _cl.push(x) },
    item(i) { return _cl[i] ?? null },
    get length() { return _cl.length },
    [Symbol.iterator]() { return _cl[Symbol.iterator]() }
}
globalThis.document.body = globalThis.document.body || { classList: fakeClassList, dataset: {} }
// getComputedStyle is used by getCanvasUnobstructedRegion's panel loop.
globalThis.window.getComputedStyle = () => ({ display: 'none', visibility: 'visible', opacity: '1' })

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}
function assertClose(a, b, eps, msg) {
    if (Math.abs(a - b) > eps) throw new Error(`${msg} — expected ~${b}, got ${a}`)
}

// Shared camera / controls / canvas region for all safe-area tests.
// Camera at (0,0,4) looking at origin → viewDir=(0,0,1), rightVec=(1,0,0), upVec=(0,1,0).
const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100)
camera.position.set(0, 0, 4)
camera.lookAt(new Vector3(0, 0, 0))
const controls = { target: new Vector3(0, 0, 0) }
const canvasRegion = { x: 0, y: 0, width: 800, height: 600 }
const focusDistance = 4

// ── Tests ────────────────────────────────────────────────────────────────────

async function testComputeSafeAreaCameraTargetOffsetXSign() {
    console.log('\n[TEST] computeSafeAreaCameraTargetOffset — X sign (pocket right, constrained)')

    const { computeSafeAreaCameraTargetOffset } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    // Pocket to the right of center, spanning most of the width so it's constrained.
    // centerX=800 → normX = (800-400)/400 = 1.0; excessFraction = 0.18.
    const pocketBounds = { minX: 400, maxX: 1200, minY: 0, maxY: 600, centerX: 800, centerY: 300 }
    const offset = computeSafeAreaCameraTargetOffset(pocketBounds, canvasRegion, focusDistance, camera, controls)

    assert(offset !== null, 'offset should not be null when constrained and offset large enough')
    assertClose(offset.x, 0.52416, 1e-3, 'X offset sign + magnitude')
    assert(offset.y === 0, 'Y offset should be 0 (no Y constraint trigger)')
    assert(offset.z === 0, 'Z offset should be 0')
    console.log('  OK +X offset (frame moves right toward pocket)')
}

async function testComputeSafeAreaCameraTargetOffsetYSign() {
    console.log('\n[TEST] computeSafeAreaCameraTargetOffset — Y sign (pocket below center, constrained)')

    const { computeSafeAreaCameraTargetOffset } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    // Pocket below center (centerY=800 > regionCenterY=300), constrained height.
    // normY = (800-300)/300 = 1.6667; -sign(normY) = -1 → offset points down.
    const pocketBounds = { minX: 0, maxX: 800, minY: 400, maxY: 1200, centerX: 400, centerY: 800 }
    const offset = computeSafeAreaCameraTargetOffset(pocketBounds, canvasRegion, focusDistance, camera, controls)

    assert(offset !== null, 'offset should not be null when constrained and offset large enough')
    assertClose(offset.y, -0.624, 1e-3, 'Y offset sign + magnitude (clamped)')
    assertClose(offset.x, 0, 1e-3, 'X offset should be 0 (no X constraint trigger)')
    assert(offset.z === 0, 'Z offset should be 0')
    console.log('  OK -Y offset (frame moves down toward pocket)')
}

async function testComputeSafeAreaCameraTargetOffsetNoConstraint() {
    console.log('\n[TEST] computeSafeAreaCameraTargetOffset — no constraint → null')

    const { computeSafeAreaCameraTargetOffset } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    // Narrow centered pocket — well within safe area, no constraint.
    const pocketBounds = { minX: 390, maxX: 410, minY: 290, maxY: 310, centerX: 400, centerY: 300 }
    const offset = computeSafeAreaCameraTargetOffset(pocketBounds, canvasRegion, focusDistance, camera, controls)

    assert(offset === null, 'offset should be null when pocket is well within safe area')
    console.log('  OK narrow centered pocket returns null')
}

async function testComputeSafeAreaCameraTargetOffsetClamp() {
    console.log('\n[TEST] computeSafeAreaCameraTargetOffset — clamp to maxCorrectionX')

    const { computeSafeAreaCameraTargetOffset } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    // Push normX very high so correction exceeds maxCorrectionX=0.832.
    // centerX=-100 → normX = (-100-400)/400 = -1.25; excessFraction = 0.43;
    // correction = 0.43 * 400 * 0.0052 * 1.4 ≈ 1.249 > maxCorrectionX=0.832.
    const pocketBounds = { minX: -600, maxX: 400, minY: 0, maxY: 600, centerX: -100, centerY: 300 }
    const offset = computeSafeAreaCameraTargetOffset(pocketBounds, canvasRegion, focusDistance, camera, controls)

    assert(offset !== null, 'offset should not be null')
    assertClose(offset.x, -0.832, 1e-3, 'X offset clamped to maxCorrectionX')
    assert(offset.y === 0, 'Y offset should be 0')
    assert(offset.z === 0, 'Z offset should be 0')
    console.log('  OK correction clamped to maxCorrectionX')
}

async function testComputeSafeAreaCameraTargetOffsetNullInputs() {
    console.log('\n[TEST] computeSafeAreaCameraTargetOffset — null inputs')

    const { computeSafeAreaCameraTargetOffset } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')
    const pocketBounds = { minX: 0, maxX: 800, minY: 0, maxY: 600, centerX: 400, centerY: 300 }

    assert(computeSafeAreaCameraTargetOffset(null, canvasRegion, focusDistance, camera, controls) === null,
        'null pocketBounds → null')
    assert(computeSafeAreaCameraTargetOffset(pocketBounds, null, focusDistance, camera, controls) === null,
        'null canvasRegion → null')
    assert(computeSafeAreaCameraTargetOffset(pocketBounds, canvasRegion, focusDistance, null, controls) === null,
        'null camera → null')
    assert(computeSafeAreaCameraTargetOffset(pocketBounds, canvasRegion, focusDistance, camera, null) === null,
        'null controls → null')
    console.log('  OK all null-input paths return null')
}

async function testComputeFocusPocketScreenBounds() {
    console.log('\n[TEST] computeFocusPocketScreenBounds — basic projection')

    const { computeFocusPocketScreenBounds } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    const renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } }
    const appState = {
        camera,
        renderer,
        pointsMesh: null,
        nodePositions: [{ x: 1, y: 0, z: 0 }],
        originalPositions: [{ x: 1, y: 0, z: 0 }]
    }

    const bounds = computeFocusPocketScreenBounds(0, [], appState)
    assert(bounds !== null, 'should return bounds for node in front of camera')
    assert(isFinite(bounds.centerX), 'centerX should be finite')
    assert(isFinite(bounds.centerY), 'centerY should be finite')
    assertClose(bounds.centerX, 560.84, 1, 'centerX near projected screen X')
    assertClose(bounds.centerY, 300, 1, 'centerY near projected screen Y (node at y=0)')
    console.log('  OK node at (1,0,0) projects to finite bounds near (560.84, 300)')
}

async function testComputeFocusPocketScreenBoundsBehindCamera() {
    console.log('\n[TEST] computeFocusPocketScreenBounds — behind camera → null')

    const { computeFocusPocketScreenBounds } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    const renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } }
    const appState = {
        camera,
        renderer,
        pointsMesh: null,
        nodePositions: [{ x: 0, y: 0, z: -100 }],
        originalPositions: [{ x: 0, y: 0, z: -100 }]
    }

    const bounds = computeFocusPocketScreenBounds(0, [], appState)
    assert(bounds === null, 'node behind camera should return null')
    console.log('  OK behind-camera node returns null')
}

async function testComputeFocusPocketScreenBoundsNoCamera() {
    console.log('\n[TEST] computeFocusPocketScreenBounds — no camera → null')

    const { computeFocusPocketScreenBounds } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    const renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } }
    const appState = {
        camera: null,
        renderer,
        pointsMesh: null,
        nodePositions: [{ x: 1, y: 0, z: 0 }],
        originalPositions: [{ x: 1, y: 0, z: 0 }]
    }

    const bounds = computeFocusPocketScreenBounds(0, [], appState)
    assert(bounds === null, 'null camera should return null')
    console.log('  OK no camera returns null')
}

async function testGetCanvasUnobstructedRegion() {
    console.log('\n[TEST] getCanvasUnobstructedRegion — returns viewport-sized region with no panels')

    const { getCanvasUnobstructedRegion } = await import('../src/lib/engine/camera-choreography/framing-utils.ts')

    const region = getCanvasUnobstructedRegion()
    assert(region.x === 0, 'region.x should be 0')
    assert(region.y === 0, 'region.y should be 0')
    assert(region.width === 1280, `region.width should be 1280, got ${region.width}`)
    assert(region.height === 800, `region.height should be 800, got ${region.height}`)
    console.log('  OK empty body → full viewport region (1280×800)')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testComputeSafeAreaCameraTargetOffsetXSign,
        testComputeSafeAreaCameraTargetOffsetYSign,
        testComputeSafeAreaCameraTargetOffsetNoConstraint,
        testComputeSafeAreaCameraTargetOffsetClamp,
        testComputeSafeAreaCameraTargetOffsetNullInputs,
        testComputeFocusPocketScreenBounds,
        testComputeFocusPocketScreenBoundsBehindCamera,
        testComputeFocusPocketScreenBoundsNoCamera,
        testGetCanvasUnobstructedRegion
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
