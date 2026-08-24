#!/usr/bin/env node
/**
 * tests/three-engine-frame-updates-contract.mjs
 *
 * Node contract for src/lib/engine/three-engine-frame-updates.ts
 * The per-frame update pipeline extracted from animate() (Phase 4 concerns
 * A4/A5/A6/A7/A8/A9/A10/A11/A12/A13/A14). Pure-math + thin webglContext /
 * engineState mutations, driven directly against the REAL singletons.
 *
 * Node-safe: imports are three + webgl-context (singleton) + three-engine-state
 * (singleton) + three-engine-frame-updates (which transitively pulls
 * config / node-manager / thread-manager / scene-reveal / math-easing /
 * environment). All browser primitives are shimmed (window RAF, matchMedia,
 * document.body classList/dataset) exactly as the proven focus-camera-animation
 * and framing-utils contracts do. The Svelte reactive proxy (appState) loads via
 * the loader's rune stubs.
 *
 * Every assertion is derived from reading the actual source function bodies —
 * the source is authoritative, not the prose summary of the contract.
 */

import { register } from 'node:module'
import { Vector3 } from 'three'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims ────────────────────────────────────────────────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => 0
globalThis.window.setTimeout = setTimeout
globalThis.window.clearTimeout = clearTimeout
// isMobileViewport() returns window.innerWidth <= 768; undefined <= 768 is
// false → desktop. Keep undefined so the dependency chain stays on desktop paths.
Object.defineProperty(globalThis.window, 'innerWidth', { value: undefined, writable: false, configurable: true })
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }

// prefersReducedMotion() routes through window.matchMedia and caches the MQL.
// Return matches:false so reduced-motion is OFF (normal-motion branch).
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

// camera-controls-core.svelte / scene-reveal touch document.body.classList /
// dataset. Minimal DOM shim.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}
function assertClose(a, b, eps, msg) {
    if (typeof a !== 'number' || !Number.isFinite(a)) throw new Error(`${msg} — expected number ~${b}, got ${a}`)
    if (Math.abs(a - b) > eps) throw new Error(`${msg} — expected ~${b}, got ${a}`)
}

// ── Singletons + module under test ───────────────────────────────────────────

const { webglContext } = await import('../src/lib/engine/webgl-context.ts')
const { engineState } = await import('../src/lib/engine/three-engine-state.ts')
const mod = await import('../src/lib/engine/three-engine-frame-updates.ts')

// Keep webglContext.nodeSporeMesh null: setNodeSporeInstanceMatrix() (called
// from lerpNodesForFrame) reads appState.nodePositions[i] before its null-guard,
// but short-circuits on a null targetMesh — so leaving nodeSporeMesh unset makes
// the per-node matrix write a safe no-op under Node.
function resetAll() {
    webglContext.scene = null
    webglContext.camera = null
    webglContext.controls = null
    webglContext.pointsMesh = null
    webglContext.nodeSporeMesh = null
    webglContext.pointsMaterial = null
    webglContext.nodeSporeMaterial = null
    webglContext.focusLens = null
    webglContext.myceliumGroup = null
    webglContext.myceliumCoreLines = null
    webglContext.myceliumWispyLines = null
    webglContext.myceliumBridgeLines = null

    engineState.state = null
    engineState.focusPocket = null
    engineState.lastHoveredNode = null
    engineState.hoverEmissiveFlash = 0
}

// ── Tests ────────────────────────────────────────────────────────────────────

// 1. lerpNodesForFrame — pure position lerp toward targets.
async function testLerpNodesForFrame() {
    console.log('\n[TEST] lerpNodesForFrame')

    // Happy path: both arrays present → returns false (frame should continue),
    // node positions move toward targets by lerpFactor 0.08, no overshoot.
    resetAll()
    engineState.state = {
        nodePositions: [{ x: 0, y: 0, z: 0 }],
        targetPositions: [{ x: 1, y: 2, z: 3 }]
    }
    const r = mod.lerpNodesForFrame(0)
    assert(r === false, 'returns false when state + both arrays present')
    const pos = engineState.state.nodePositions[0]
    assertClose(pos.x, 0.08, 1e-9, 'node x lerped toward target (0.08)')
    assertClose(pos.y, 0.16, 1e-9, 'node y lerped toward target (0.16)')
    assertClose(pos.z, 0.24, 1e-9, 'node z lerped toward target (0.24)')
    // No overshoot: every coordinate stays strictly between start and target.
    assert(pos.x > 0 && pos.x < 1, 'x within [start,target] (no overshoot)')
    assert(pos.y > 0 && pos.y < 2, 'y within [start,target] (no overshoot)')
    assert(pos.z > 0 && pos.z < 3, 'z within [start,target] (no overshoot)')

    // Missing state → false.
    resetAll()
    engineState.state = null
    assert(mod.lerpNodesForFrame(0) === false, 'returns false when engineState.state is null')

    // Missing nodePositions → false.
    resetAll()
    engineState.state = { targetPositions: [{ x: 1, y: 2, z: 3 }] }
    assert(mod.lerpNodesForFrame(0) === false, 'returns false when nodePositions missing')

    // Missing targetPositions → false.
    resetAll()
    engineState.state = { nodePositions: [{ x: 0, y: 0, z: 0 }] }
    assert(mod.lerpNodesForFrame(0) === false, 'returns false when targetPositions missing')

    console.log('  OK lerp factor 0.08; returns false when state/arrays missing; no overshoot')
}

// 2. updateFogDensity — scene.fog.density = SCENE_ATMOSPHERE.fogDensity * progress.
async function testUpdateFogDensity() {
    console.log('\n[TEST] updateFogDensity')

    resetAll()
    webglContext.scene = { fog: { density: 99 } }
    mod.updateFogDensity(1.0)
    // SCENE_ATMOSPHERE.fogDensity = 0.0034 (wave-9b PORT_SCENE_ATMOSPHERE alias; W60 re-tune 0.0028 -> 0.0034)
    assertClose(webglContext.scene.fog.density, 0.0034, 1e-12, 'fog density at progress=1 (0.0034)')
    assert(typeof webglContext.scene.fog.density === 'number', 'density is a number')

    mod.updateFogDensity(0)
    assertClose(webglContext.scene.fog.density, 0, 1e-12, 'fog density at progress=0 (0)')

    console.log('  OK density = fogDensity(0.0034) * progress')
}

// 3. updateReferenceSphereOpacity — the source sets the county-depth-reference
//    mesh material opacity = 0.03 + (active ? sin(rev*π)*0.05 : 0). NOT focusLens.
async function testUpdateReferenceSphereOpacity() {
    console.log('\n[TEST] updateReferenceSphereOpacity')

    resetAll()
    const refSphere = { material: { opacity: 0.5 } }
    webglContext.scene = {
        getObjectByName(name) {
            return name === 'county-depth-reference' ? refSphere : null
        }
    }
    // active → sin(0.5π) = 1 → 0.03 + 0.05 = 0.08
    mod.updateReferenceSphereOpacity(0.5, true)
    assertClose(refSphere.material.opacity, 0.08, 1e-12, 'active ref-sphere opacity (0.08)')
    assert(
        typeof refSphere.material.opacity === 'number' &&
            refSphere.material.opacity >= 0 &&
            refSphere.material.opacity <= 1,
        'active opacity is a number in [0,1]'
    )

    // inactive → no boost → 0.03
    mod.updateReferenceSphereOpacity(0.25, false)
    assertClose(refSphere.material.opacity, 0.03, 1e-12, 'inactive ref-sphere opacity (0.03)')

    // No scene → safe no-op (does not throw).
    resetAll()
    webglContext.scene = null
    mod.updateReferenceSphereOpacity(0.5, true)
    assert(true, 'no scene → no-op, no throw')

    console.log('  OK refSphere.material.opacity = 0.03 + sin(rev*π)*0.05 (active only)')
}

// 4. updateSporeOpacity — nodeSporeMaterial.opacity eased toward
//    sporeOpacity(0.58) * progress * focusBoost.
async function testUpdateSporeOpacity() {
    console.log('\n[TEST] updateSporeOpacity')

    // Null state → focusBoost 1.0. opacity = 0 + (0.58*1.0*1.0 - 0)*0.12 = 0.0696
    resetAll()
    webglContext.nodeSporeMaterial = { opacity: 0, emissiveIntensity: 0 }
    mod.updateSporeOpacity(1.0, null)
    assertClose(webglContext.nodeSporeMaterial.opacity, 0.0696, 1e-12, 'spore opacity at progress=1, no focus (0.0696)')
    assert(
        typeof webglContext.nodeSporeMaterial.opacity === 'number' &&
            webglContext.nodeSporeMaterial.opacity >= 0 &&
            webglContext.nodeSporeMaterial.opacity <= 1,
        'spore opacity is a number in [0,1]'
    )

    // Focused node → focusBoost 0.55. opacity = (0.58*1.0*0.55)*0.12 = 0.03828
    resetAll()
    webglContext.nodeSporeMaterial = { opacity: 0, emissiveIntensity: 0 }
    mod.updateSporeOpacity(1.0, { focusedNode: 0 })
    assertClose(
        webglContext.nodeSporeMaterial.opacity,
        0.03828,
        1e-12,
        'spore opacity at progress=1, focused (0.03828)'
    )

    console.log('  OK spore opacity eased toward 0.58*progress*focusBoost')
}

// 5. updateThreadLayerOpacities — sets the three mycelium line material opacities.
async function testUpdateThreadLayerOpacities() {
    console.log('\n[TEST] updateThreadLayerOpacities')

    // threadsVisible true → all three opacities become finite numbers.
    resetAll()
    webglContext.myceliumCoreLines = { material: { opacity: 0 } }
    webglContext.myceliumWispyLines = { material: { opacity: 0 } }
    webglContext.myceliumBridgeLines = { material: { opacity: 0 } }
    mod.updateThreadLayerOpacities(true, 0.5, null)
    for (const key of ['myceliumCoreLines', 'myceliumWispyLines', 'myceliumBridgeLines']) {
        const v = webglContext[key].material.opacity
        assert(typeof v === 'number' && Number.isFinite(v), `${key} opacity is a finite number`)
    }

    // threadsVisible false → all three zeroed (deterministic).
    resetAll()
    webglContext.myceliumCoreLines = { material: { opacity: 0.9 } }
    webglContext.myceliumWispyLines = { material: { opacity: 0.9 } }
    webglContext.myceliumBridgeLines = { material: { opacity: 0.9 } }
    mod.updateThreadLayerOpacities(false, 0.5, null)
    assert(webglContext.myceliumCoreLines.material.opacity === 0, 'core opacity zeroed when not visible')
    assert(webglContext.myceliumWispyLines.material.opacity === 0, 'wispy opacity zeroed when not visible')
    assert(webglContext.myceliumBridgeLines.material.opacity === 0, 'bridge opacity zeroed when not visible')

    console.log('  OK all three thread-layer opacities are numbers (0 when hidden)')
}

// 6. computeRevealProgress — returns {revealed, points, camera}, all numeric.
async function testComputeRevealProgress() {
    console.log('\n[TEST] computeRevealProgress')

    resetAll()
    const p = mod.computeRevealProgress(0)
    assert(typeof p === 'object' && p !== null, 'returns an object')
    assert(typeof p.revealed === 'number', 'revealed is a number')
    assert(typeof p.points === 'number', 'points is a number')
    assert(typeof p.camera === 'number', 'camera is a number')
    // All three are eased/clamped into [0,1].
    for (const k of ['revealed', 'points', 'camera']) {
        assert(p[k] >= 0 && p[k] <= 1, `${k} in [0,1]`)
    }

    console.log('  OK returns {revealed, points, camera} all numeric in [0,1]')
}

// 7. updatePointsMaterial — pointsMaterial.opacity = 0.32 * pointOpacityScale(1)
//    * progress * opacityScale. (No shader userData → uniform branch skipped.)
async function testUpdatePointsMaterial() {
    console.log('\n[TEST] updatePointsMaterial')

    resetAll()
    webglContext.pointsMaterial = { opacity: 1, size: 1, userData: {} }
    mod.updatePointsMaterial(1.0, null)
    // 0.32 * 0.78 (SCENE_ATMOSPHERE.pointOpacityScale) * 1.0 * 1.0 = 0.2496
    assertClose(webglContext.pointsMaterial.opacity, 0.2496, 1e-12, 'points opacity at progress=1, no focus (0.2496)')
    assert(
        typeof webglContext.pointsMaterial.opacity === 'number' &&
            webglContext.pointsMaterial.opacity >= 0 &&
            webglContext.pointsMaterial.opacity <= 1,
        'points opacity is a number in [0,1]'
    )
    assert(typeof webglContext.pointsMaterial.size === 'number', 'points size is a number')

    // Focused node → opacityScale 0.46 → 0.32 * 0.78 * 0.46 = 0.114816
    resetAll()
    webglContext.pointsMaterial = { opacity: 1, size: 1, userData: {} }
    mod.updatePointsMaterial(1.0, { focusedNode: 0 })
    assertClose(
        webglContext.pointsMaterial.opacity,
        0.114816,
        1e-12,
        'points opacity at progress=1, focused (0.114816)'
    )

    // Null state works (no throw).
    resetAll()
    webglContext.pointsMaterial = { opacity: 1, size: 1, userData: {} }
    mod.updatePointsMaterial(0.5, null)
    assert(true, 'null state → no throw')

    console.log('  OK points opacity = 0.32*0.78*progress*opacityScale; works with null state')
}

// 8. updateHoverEmissiveFlash — sets nodeSporeMaterial.emissiveIntensity on a
//    hover transition; null-safe otherwise.
async function testUpdateHoverEmissiveFlash() {
    console.log('\n[TEST] updateHoverEmissiveFlash')

    // Null state, no prior hover → no flash, no throw, emissive stays a number.
    resetAll()
    webglContext.nodeSporeMaterial = { opacity: 0, emissiveIntensity: 0 }
    engineState.lastHoveredNode = null
    engineState.hoverEmissiveFlash = 0
    mod.updateHoverEmissiveFlash(null)
    assert(typeof webglContext.nodeSporeMaterial.emissiveIntensity === 'number', 'emissive stays a number (null-safe)')

    // Hover transition (lastHovered null → hasHover true) → flash=1 →
    // emissiveIntensity = base(2.0) + (peak(2.5)-base)*1 = 2.5.
    resetAll()
    webglContext.nodeSporeMaterial = { opacity: 0, emissiveIntensity: 0 }
    engineState.lastHoveredNode = null
    engineState.hoverEmissiveFlash = 0
    mod.updateHoverEmissiveFlash({ hoverHighlightIndex: 0 })
    assertClose(
        webglContext.nodeSporeMaterial.emissiveIntensity,
        2.5,
        1e-12,
        'emissiveIntensity peaks at SPORE_EMISSIVE_FLASH_PEAK (2.5) on hover'
    )
    assert(typeof webglContext.nodeSporeMaterial.emissiveIntensity === 'number', 'emissive is a number')

    console.log('  OK emissive flashed to 2.5 on hover; null-safe otherwise')
}

// 9. updateMyceliumPulse — toggles myceliumGroup.visible from shouldRenderThreads,
//    advances pulsePhase; null-safe.
async function testUpdateMyceliumPulse() {
    console.log('\n[TEST] updateMyceliumPulse')

    // Null state → returns boolean, group visibility mirrors it, no throw.
    resetAll()
    webglContext.myceliumGroup = { visible: false }
    const vis = mod.updateMyceliumPulse(null)
    assert(typeof vis === 'boolean', 'returns a boolean')
    assert(webglContext.myceliumGroup.visible === vis, 'myceliumGroup.visible mirrors threadsVisible')
    assert(engineState.hoverEmissiveFlash === 0, 'no state mutation when state is null')

    // Non-null state → pulsePhase advances by a finite increment.
    resetAll()
    webglContext.myceliumGroup = { visible: false }
    const st = { pulsePhase: 0, weather: {} }
    const vis2 = mod.updateMyceliumPulse(st)
    assert(typeof vis2 === 'boolean', 'returns a boolean with state')
    assert(typeof st.pulsePhase === 'number' && st.pulsePhase !== 0, 'pulsePhase advanced to a finite non-zero value')

    console.log('  OK returns boolean; advances pulsePhase; null-safe')
}

// 10. updatePointsShaderHoverBoost — lerps uHoverBoost uniform; null-safe.
async function testUpdatePointsShaderHoverBoost() {
    console.log('\n[TEST] updatePointsShaderHoverBoost')

    // No shader userData → immediate safe return with null state.
    resetAll()
    webglContext.pointsMaterial = { userData: {} }
    mod.updatePointsShaderHoverBoost(-1, null)
    assert(true, 'null state + no shader → no throw')

    // Real shader stub → uHoverBoost lerps toward 1.5, uHoverNodePos.set called.
    resetAll()
    const uHoverNodePos = {
        x: 0,
        y: 0,
        z: 0,
        set(a, b, c) {
            this.x = a
            this.y = b
            this.z = c
        }
    }
    webglContext.pointsMaterial = {
        userData: { shader: { uniforms: { uHoverBoost: { value: 1 }, uHoverNodePos: { value: uHoverNodePos } } } }
    }
    mod.updatePointsShaderHoverBoost(0, { nodePositions: [{ x: 1, y: 2, z: 3 }] })
    // target 1.5 → value += (1.5 - 1) * 0.2 = 1.1
    assertClose(
        webglContext.pointsMaterial.userData.shader.uniforms.uHoverBoost.value,
        1.1,
        1e-12,
        'uHoverBoost lerps to 1.1'
    )
    assert(uHoverNodePos.x === 1 && uHoverNodePos.y === 2 && uHoverNodePos.z === 3, 'uHoverNodePos.set(1,2,3) called')

    console.log('  OK uHoverBoost lerps to 1.5 target; null-safe')
}

// 11. lerpCameraForReveal — lerps camera.position via lerpVectors(start,end,prog).
async function testLerpCameraForReveal() {
    console.log('\n[TEST] lerpCameraForReveal')

    resetAll()
    engineState.state = {
        sceneRevealActive: true,
        sceneRevealCameraStart: new Vector3(0, 0, 10),
        sceneRevealCameraEnd: new Vector3(0, 0, 0),
        focusedNode: null
    }
    webglContext.camera = { position: new Vector3(5, 5, 5) }
    webglContext.controls = { target: new Vector3(1, 1, 1) }

    const startPos = webglContext.camera.position.clone()
    // revealProgress 0.5 < 1 → skips the reveal-complete clear branch (so the
    // null `state` arg stays safe), camera lerps start→end at t=0.5.
    mod.lerpCameraForReveal(0.5, 0.5, null)
    // lerpVectors((0,0,10),(0,0,0),0.5) = (0,0,5)
    assertClose(webglContext.camera.position.x, 0, 1e-9, 'camera x lerped to 0')
    assertClose(webglContext.camera.position.y, 0, 1e-9, 'camera y lerped to 0')
    assertClose(webglContext.camera.position.z, 5, 1e-9, 'camera z lerped to 5')
    assertClose(webglContext.controls.target.x, 0, 1e-9, 'controls.target.x reset to 0')
    assertClose(webglContext.controls.target.y, 0, 1e-9, 'controls.target.y reset to 0')
    assertClose(webglContext.controls.target.z, 0, 1e-9, 'controls.target.z reset to 0')
    assert(!webglContext.camera.position.equals(startPos), 'camera position moved toward reveal end')

    console.log('  OK camera.position lerps toward reveal end; controls.target reset')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testLerpNodesForFrame,
        testUpdateFogDensity,
        testUpdateReferenceSphereOpacity,
        testUpdateSporeOpacity,
        testUpdateThreadLayerOpacities,
        testComputeRevealProgress,
        testUpdatePointsMaterial,
        testUpdateHoverEmissiveFlash,
        testUpdateMyceliumPulse,
        testUpdatePointsShaderHoverBoost,
        testLerpCameraForReveal
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
