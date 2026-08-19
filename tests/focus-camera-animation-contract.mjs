#!/usr/bin/env node
/**
 * tests/focus-camera-animation-contract.mjs
 *
 * Node contract for src/lib/engine/camera-choreography/focus.ts
 * Focus camera animation — animateCameraToNode, cancelFocusCameraAnimation.
 *
 * Node-safe: the import graph is three + appState + camera-controls-core.svelte
 * (proven loadable by routes.ts) + camera-math-utils (pure math) +
 * framing-utils (DOM only INSIDE getCanvasUnobstructedRegion, which is gated
 * behind the semantic-pocket branch — avoided here). The only browser primitive
 * actually exercised is window.matchMedia (for prefersReducedMotion), shimmed
 * by swapping the mock function reference so the module's MQL cache rebuilds.
 *
 * Covers: cancelFocusCameraAnimation, animateCameraToNode early-returns,
 *         reduced-motion path, normal path (token increment, offset bookkeeping,
 *         frame-task scheduling, eased lerp to focusTarget/desiredCamPos,
 *         completion nulls the assist offset).
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
globalThis.window.setTimeout = setTimeout
globalThis.window.clearTimeout = clearTimeout
// isMobile() checks window.innerWidth <= 768; undefined <= 768 is false → desktop.
Object.defineProperty(globalThis.window, 'innerWidth', { value: undefined, writable: false, configurable: true })
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }

// camera-controls-core.svelte touches document.body.classList (Array.from,
// add, remove) and document.body.dataset. Minimal DOM shim.
globalThis.document = globalThis.document || {}
const _classList = []
const fakeClassList = {
    _items: _classList,
    add(...names) {
        for (const n of names) if (!_classList.includes(n)) _classList.push(n)
    },
    remove(...names) {
        for (const n of names) {
            const i = _classList.indexOf(n)
            if (i >= 0) _classList.splice(i, 1)
        }
    },
    contains(n) {
        return _classList.includes(n)
    },
    toggle(n) {
        const i = _classList.indexOf(n)
        if (i >= 0) _classList.splice(i, 1)
        else _classList.push(n)
    },
    item(i) {
        return _classList[i] ?? null
    },
    get length() {
        return _classList.length
    },
    [Symbol.iterator]() {
        return _classList[Symbol.iterator]()
    }
}
globalThis.document.body = globalThis.document.body || { classList: fakeClassList, dataset: {} }

// prefersReducedMotion() routes through window.matchMedia and caches the MQL.
// Each swap of the function reference forces the module's cache to rebuild, so
// toggling reduced motion on/off is just re-pointing the mock.
function makeMql(matches) {
    return {
        matches,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
            return false
        },
        onchange: null
    }
}
globalThis.window.matchMedia = () => makeMql(false)
function setReducedMotion(on) {
    // New function reference each call → getReducedMotionMQL() identity check
    // rebuilds the cache and re-reads matches.
    globalThis.window.matchMedia = () => makeMql(on)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}
function assertClose(a, b, eps, msg) {
    if (Math.abs(a - b) > eps) throw new Error(`${msg} — expected ~${b}, got ${a}`)
}

// Canonical ORBIT/focus constants mirrored from src/lib/engine/config.ts.
const DEFAULT_DISTANCE = 0.88
const VERTICAL_LIFT = 0.045
const FRAMING_DROP = 0.02

function makeControls(opts = {}) {
    return {
        target: new Vector3(opts.targetX ?? 0, opts.targetY ?? 0, opts.targetZ ?? 0),
        enabled: true,
        minDistance: opts.minDistance ?? 0.5,
        maxDistance: opts.maxDistance ?? 8,
        update() {}
    }
}
function makeCamera(opts = {}) {
    return { position: new Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 4) }
}

// Standard focus setup (transitionStyle 'focus', no pocket, no framing options):
//   nodePos = (1,0,0); focusTarget = (1,-0.02,0); heading = (0,0,1);
//   desiredCamPos = (1,0.025,0.88); focusCameraTargetOffset = (0,-0.02,0)
async function setupFocus(appState, overrides = {}) {
    appState.camera = overrides.camera !== undefined ? overrides.camera : makeCamera({ x: 0, y: 0, z: 4 })
    appState.controls =
        overrides.controls !== undefined ? overrides.controls : makeControls({ targetX: 0, targetY: 0, targetZ: 0 })
    appState.currentView = 'galaxy'
    appState.focusedNode = overrides.focusedNode ?? 0
    appState.focusCameraAnimationToken = overrides.focusCameraAnimationToken ?? 0
    appState.focusCameraTargetOffset = null
    appState.nodePositions = overrides.nodePositions ?? [{ x: 1, y: 0, z: 0 }]
    appState.originalPositions = overrides.originalPositions ?? appState.nodePositions
    appState.navState = {
        currentPersonality: overrides.currentPersonality ?? undefined,
        focusFramingMeta: overrides.focusFramingMeta ?? undefined,
        focusPocketIndices: overrides.focusPocketIndices ?? [],
        focusedIndex: overrides.focusedIndex ?? null
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testCancelFocusCameraAnimation() {
    console.log('\n[TEST] cancelFocusCameraAnimation')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { cancelFocusCameraAnimation, animateCameraToNode } =
        await import('../src/lib/engine/camera-choreography/focus.ts')
    const { hasScheduledFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    // Standalone — no throw, no tasks.
    cancelFocusCameraAnimation()
    assert(hasScheduledFrameTasks() === false, 'no tasks before any animation')

    // After scheduling one — cancels it.
    await setupFocus(appState)
    animateCameraToNode(0)
    assert(hasScheduledFrameTasks() === true, 'task scheduled after animateCameraToNode')
    cancelFocusCameraAnimation()
    assert(hasScheduledFrameTasks() === false, 'task cancelled after cancelFocusCameraAnimation')

    clearScheduledFrameTasks()
    console.log('  OK standalone safe; cancels a scheduled task')
}

async function testAnimateCameraToNodeEarlyReturns() {
    console.log('\n[TEST] animateCameraToNode — early returns')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToNode } = await import('../src/lib/engine/camera-choreography/focus.ts')
    const { clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    // No camera.
    await setupFocus(appState, { camera: null })
    const tokenBefore = appState.focusCameraAnimationToken
    animateCameraToNode(0)
    assert(appState.focusCameraAnimationToken === tokenBefore, 'token unchanged when no camera')
    clearScheduledFrameTasks()

    // No controls.
    await setupFocus(appState, { controls: null })
    animateCameraToNode(0)
    clearScheduledFrameTasks()

    // No target position (index out of range).
    await setupFocus(appState, { nodePositions: [{ x: 1, y: 0, z: 0 }] })
    animateCameraToNode(5) // 5 >= length 1
    clearScheduledFrameTasks()

    // Non-finite node position.
    await setupFocus(appState, { nodePositions: [{ x: NaN, y: 0, z: 0 }] })
    animateCameraToNode(0)
    clearScheduledFrameTasks()

    console.log('  OK no camera / no controls / no target / non-finite all return without throwing')
}

async function testReducedMotionPath() {
    console.log('\n[TEST] animateCameraToNode — reduced-motion path')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToNode } = await import('../src/lib/engine/camera-choreography/focus.ts')
    const { hasScheduledFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    setReducedMotion(true)
    await setupFocus(appState)

    const startTarget = appState.controls.target.clone()
    const startPos = appState.camera.position.clone()
    const tokenBefore = appState.focusCameraAnimationToken

    animateCameraToNode(0)

    // Reduced motion: instant copy, no frame task.
    assert(appState.focusCameraAnimationToken === tokenBefore + 1, 'token should increment')
    assert(hasScheduledFrameTasks() === false, 'no frame task in reduced-motion path')

    // focusTarget = (1, -0.02, 0); desiredCamPos = (1, 0.025, 0.88)
    assertClose(appState.controls.target.x, 1, 1e-3, 'reduced target.x')
    assertClose(appState.controls.target.y, -0.02, 1e-3, 'reduced target.y')
    assertClose(appState.controls.target.z, 0, 1e-3, 'reduced target.z')
    assertClose(appState.camera.position.x, 1, 1e-3, 'reduced cam.x')
    assertClose(appState.camera.position.y, 0.025, 1e-3, 'reduced cam.y')
    assertClose(appState.camera.position.z, 0.88, 1e-3, 'reduced cam.z')
    assert(!appState.controls.target.equals(startTarget), 'target should have moved')
    assert(!appState.camera.position.equals(startPos), 'camera should have moved')

    // focusCameraTargetOffset = focusTarget - nodePos = (0, -0.02, 0)
    assertClose(appState.focusCameraTargetOffset.x, 0, 1e-3, 'reduced offset.x')
    assertClose(appState.focusCameraTargetOffset.y, -0.02, 1e-3, 'reduced offset.y')
    assertClose(appState.focusCameraTargetOffset.z, 0, 1e-3, 'reduced offset.z')

    setReducedMotion(false)
    clearScheduledFrameTasks()
    console.log('  OK reduced motion: instant copy, no task, exact target/camera/offset')
}

async function testNormalPath() {
    console.log('\n[TEST] animateCameraToNode — normal path')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToNode } = await import('../src/lib/engine/camera-choreography/focus.ts')
    const { runFrameTasks, hasScheduledFrameTasks, clearScheduledFrameTasks } =
        await import('../src/lib/engine/frame-scheduler.ts')

    setReducedMotion(false)
    await setupFocus(appState)

    const startTarget = appState.controls.target.clone()
    const startPos = appState.camera.position.clone()
    const tokenBefore = appState.focusCameraAnimationToken

    const t0 = performance.now()
    animateCameraToNode(0)

    // Token incremented, task scheduled, offset bookkeeping.
    assert(appState.focusCameraAnimationToken === tokenBefore + 1, 'token should increment')
    assert(hasScheduledFrameTasks() === true, 'frame task should be scheduled')
    assertClose(appState.focusCameraTargetOffset.x, 0, 1e-3, 'offset.x')
    assertClose(appState.focusCameraTargetOffset.y, -0.02, 1e-3, 'offset.y')
    assertClose(appState.focusCameraTargetOffset.z, 0, 1e-3, 'offset.z')

    // Drive past duration (980ms). startTime ≈ t0, so t0+1200 → t>1.
    for (let t = t0; t <= t0 + 1200; t += 16) runFrameTasks(t)
    runFrameTasks(t0 + 1200)

    // Completion: target ≈ focusTarget (1,-0.02,0), camera ≈ desiredCamPos (1,0.025,0.88).
    assertClose(appState.controls.target.x, 1, 1e-2, 'final target.x')
    assertClose(appState.controls.target.y, -0.02, 1e-2, 'final target.y')
    assertClose(appState.controls.target.z, 0, 1e-2, 'final target.z')
    assertClose(appState.camera.position.x, 1, 1e-2, 'final cam.x')
    assertClose(appState.camera.position.y, 0.025, 1e-2, 'final cam.y')
    assertClose(appState.camera.position.z, 0.88, 1e-2, 'final cam.z')
    assert(!appState.controls.target.equals(startTarget), 'target moved from start')
    assert(!appState.camera.position.equals(startPos), 'camera moved from start')
    assert(hasScheduledFrameTasks() === false, 'task completed and removed')

    clearScheduledFrameTasks()
    console.log('  OK token + task + offset; eased lerp reaches focusTarget/desiredCamPos; task completes')
}

async function testSecondCallCancelsFirst() {
    console.log('\n[TEST] animateCameraToNode — second call cancels the first task')

    const { appState } = await import('../src/lib/state/app.svelte.ts')
    const { animateCameraToNode } = await import('../src/lib/engine/camera-choreography/focus.ts')
    const { hasScheduledFrameTasks, clearScheduledFrameTasks } = await import('../src/lib/engine/frame-scheduler.ts')

    setReducedMotion(false)
    await setupFocus(appState)

    const tokenBefore = appState.focusCameraAnimationToken
    animateCameraToNode(0) // token 1
    animateCameraToNode(0) // token 2 — cancels task 1, schedules task 2

    assert(appState.focusCameraAnimationToken === tokenBefore + 2, 'token should increment twice')
    assert(hasScheduledFrameTasks() === true, 'only the second task should remain active')

    clearScheduledFrameTasks()
    console.log('  OK second call cancels first task, token increments twice')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testCancelFocusCameraAnimation,
        testAnimateCameraToNodeEarlyReturns,
        testReducedMotionPath,
        testNormalPath,
        testSecondCallCancelsFirst
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
