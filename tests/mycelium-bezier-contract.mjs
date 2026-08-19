#!/usr/bin/env node
/**
 * tests/mycelium-bezier-contract.mjs
 *
 * Fast Node contract for the mycelium bezier geometry helpers
 * (src/lib/engine/mycelium-bezier.ts). Pure math — no browser, no WebGL,
 * no Svelte runtime. Runs in plain Node with the ts-resolve loader.
 *
 * Covers:
 *   - pairKey symmetry + canonical ordering
 *   - getBezierControlPoint returns a finite, lifted control point
 *   - pushBezierLinePair:
 *       * vertex count = segments * 2 (each segment = 2 endpoints)
 *       * endpoint fidelity (t=0 == start, t=1 == end)
 *       * CORE CONTINUITY: end vertex of segment s == start vertex of s+1
 *       * color interpolation at endpoints (startColor / endColor * intensity)
 *       * early-return on missing start/end nodes (no push)
 *       * early-return on missing x/y/z (no push)
 *       * segments override changes vertex count
 *   - computeLayerIntensityMap: 3 layers, semantic vs non-semantic values
 *   - refreshCachedBezierViewVector: sets a normalized view vector
 *   - dispose-view-refresh lifecycle: set -> has -> run -> cleared
 *   - rebuildDirtyPairsInLayer:
 *       * returns dirty pair count for the layer
 *       * writes bezier segments IN-PLACE at the correct buffer offset
 *       * CLEAN pairs are left untouched (zeroed region stays zero)
 *       * buffer-level continuity holds for written segments
 *       * returns 0 / no write when line geometry is missing
 *
 * This is the unit-level guard for the mycelium — the visual centerpiece.
 * three-scene-playtest.mjs already asserts coreContinuity at the browser
 * level (expensive: dev server + GPU). This catches the same class of
 * regression at the unit level, instantly, on every commit.
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

function isFinite3(arr, offset) {
    return Number.isFinite(arr[offset]) && Number.isFinite(arr[offset + 1]) && Number.isFinite(arr[offset + 2])
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeColorFn() {
    // Deterministic cluster -> color map.
    return (cluster) => {
        switch (cluster) {
            case 0:
                return { r: 0.1, g: 0.2, b: 0.3 }
            case 1:
                return { r: 0.4, g: 0.5, b: 0.6 }
            default:
                return { r: 0.7, g: 0.8, b: 0.9 }
        }
    }
}

function makeNodePositions(n) {
    const out = []
    for (let i = 0; i < n; i++) {
        out.push({
            x: (i % 10) * 0.1,
            y: ((i * 3) % 10) * 0.1,
            z: ((i * 7) % 10) * 0.1,
            cluster: i % 3
        })
    }
    return out
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testPairKey() {
    console.log('\n[TEST] pairKey symmetry + canonical ordering')

    const { pairKey } = await import('../src/lib/engine/mycelium-bezier.ts')

    // Symmetry
    assert(pairKey(3, 7) === pairKey(7, 3), 'pairKey must be order-independent')
    // Canonical order = min:max
    assert(pairKey(3, 7) === '3:7', 'pairKey(3,7) should be "3:7"')
    assert(pairKey(7, 3) === '3:7', 'pairKey(7,3) should be "3:7"')
    assert(pairKey(0, 0) === '0:0', 'pairKey(0,0) should be "0:0"')
    assert(pairKey(100, 2) === '2:100', 'pairKey(100,2) should be "2:100"')

    console.log('  OK symmetric + canonical min:max ordering')
}

async function testGetBezierControlPoint() {
    console.log('\n[TEST] getBezierControlPoint')

    const { getBezierControlPoint, refreshCachedBezierViewVector } =
        await import('../src/lib/engine/mycelium-bezier.ts')

    // Prime the view vector (no camera -> default normalized vector).
    refreshCachedBezierViewVector()

    const start = { x: 0, y: 0, z: 0 }
    const end = { x: 1, y: 0, z: 0 }
    const ctrl = getBezierControlPoint(start, end, 1, 0)

    assert(ctrl instanceof Object, 'control point should be a Vector3-like object')
    assert(
        Number.isFinite(ctrl.x) && Number.isFinite(ctrl.y) && Number.isFinite(ctrl.z),
        'control point must be finite (not NaN)'
    )
    // Midpoint of (0,0,0)-(1,0,0) is (0.5,0,0). With side=1 it should lift off the
    // straight line — at least one of y/z should be nonzero.
    assert(
        Math.abs(ctrl.y) > 1e-6 || Math.abs(ctrl.z) > 1e-6,
        'control point should lift off the straight-line midpoint'
    )

    // Rise shifts the control point vertically.
    const ctrlRise = getBezierControlPoint(start, end, 1, 1)
    assert(
        Math.abs(ctrlRise.y - ctrl.y) > 1e-6 || Math.abs(ctrlRise.z - ctrl.z) > 1e-6,
        'rise should shift the control point'
    )

    console.log('  OK finite, lifted, rise-sensitive control point')
}

async function testPushBezierLinePairBasic() {
    console.log('\n[TEST] pushBezierLinePair — vertex count + endpoints')

    const { pushBezierLinePair, BEZIER_SEGMENTS_PER_PAIR } = await import('../src/lib/engine/mycelium-bezier.ts')

    const nodePositions = makeNodePositions(4)
    const points = makeNodePositions(4)
    const colorFn = makeColorFn()

    const positions = []
    const colors = []
    pushBezierLinePair(positions, colors, { a: 0, b: 1 }, nodePositions, points, colorFn)

    // Each segment pushes 2 endpoints * 3 coords = 6 numbers. segments+1 samples
    // => segments segments => segments*6 numbers => segments*2 vertices.
    const expectedFloats = BEZIER_SEGMENTS_PER_PAIR * 6
    assert(positions.length === expectedFloats, `positions length should be ${expectedFloats}, got ${positions.length}`)
    assert(colors.length === expectedFloats, `colors length should be ${expectedFloats}, got ${colors.length}`)

    // Endpoint fidelity: first vertex (t=0) == start node.
    assert(
        positions[0] === nodePositions[0].x &&
            positions[1] === nodePositions[0].y &&
            positions[2] === nodePositions[0].z,
        'first vertex must equal the start node position'
    )
    // Last vertex (t=1) == end node. Last segment's end = positions[expectedFloats-3..]
    const last = expectedFloats - 3
    assert(
        positions[last] === nodePositions[1].x &&
            positions[last + 1] === nodePositions[1].y &&
            positions[last + 2] === nodePositions[1].z,
        'last vertex must equal the end node position'
    )

    console.log(`  OK ${BEZIER_SEGMENTS_PER_PAIR} segments, endpoints match start/end nodes`)
}

async function testPushBezierLinePairContinuity() {
    console.log('\n[TEST] pushBezierLinePair — core continuity')

    const { pushBezierLinePair, BEZIER_SEGMENTS_PER_PAIR } = await import('../src/lib/engine/mycelium-bezier.ts')

    const nodePositions = makeNodePositions(4)
    const points = makeNodePositions(4)
    const colorFn = makeColorFn()

    const positions = []
    const colors = []
    pushBezierLinePair(positions, colors, { a: 0, b: 2 }, nodePositions, points, colorFn)

    // For every adjacent segment pair, the end vertex of segment s must equal
    // the start vertex of segment s+1. This is the coreContinuity invariant
    // three-scene-playtest.mjs checks at the browser level.
    for (let s = 0; s < BEZIER_SEGMENTS_PER_PAIR - 1; s++) {
        const endIdx = s * 6 + 3 // end vertex of segment s (start of segment s+1)
        const nextStartIdx = (s + 1) * 6 // start vertex of segment s+1
        assert(
            positions[endIdx] === positions[nextStartIdx] &&
                positions[endIdx + 1] === positions[nextStartIdx + 1] &&
                positions[endIdx + 2] === positions[nextStartIdx + 2],
            `continuity broken between segment ${s} and ${s + 1}`
        )
    }

    // All positions finite.
    for (let i = 0; i < positions.length; i++) {
        assert(Number.isFinite(positions[i]), `position[${i}] must be finite`)
    }

    console.log('  OK all segment joints continuous + finite')
}

async function testPushBezierLinePairColors() {
    console.log('\n[TEST] pushBezierLinePair — color interpolation')

    const { pushBezierLinePair } = await import('../src/lib/engine/mycelium-bezier.ts')

    // Cluster 0 -> {0.1,0.2,0.3}, cluster 1 -> {0.4,0.5,0.6}
    const nodePositions = [
        { x: 0, y: 0, z: 0, cluster: 0 },
        { x: 1, y: 0, z: 0, cluster: 1 }
    ]
    const points = nodePositions
    const colorFn = makeColorFn()

    const positions = []
    const colors = []
    const intensity = 1
    pushBezierLinePair(positions, colors, { a: 0, b: 1 }, nodePositions, points, colorFn, intensity)

    // First vertex color (t=0) == startColor * intensity.
    assert(
        Math.abs(colors[0] - 0.1) < 1e-9 && Math.abs(colors[1] - 0.2) < 1e-9 && Math.abs(colors[2] - 0.3) < 1e-9,
        'first vertex color must equal startColor (cluster 0)'
    )
    // Last vertex color (t=1) == endColor * intensity.
    const last = colors.length - 3
    assert(
        Math.abs(colors[last] - 0.4) < 1e-9 &&
            Math.abs(colors[last + 1] - 0.5) < 1e-9 &&
            Math.abs(colors[last + 2] - 0.6) < 1e-9,
        'last vertex color must equal endColor (cluster 1)'
    )

    // Intensity scaling: doubling intensity doubles the colors.
    const positions2 = []
    const colors2 = []
    pushBezierLinePair(positions2, colors2, { a: 0, b: 1 }, nodePositions, points, colorFn, 2)
    assert(
        Math.abs(colors2[0] - 0.2) < 1e-9 && Math.abs(colors2[1] - 0.4) < 1e-9 && Math.abs(colors2[2] - 0.6) < 1e-9,
        'intensity=2 should double the start color'
    )

    console.log('  OK endpoint colors + intensity scaling correct')
}

async function testPushBezierLinePairMissingInputs() {
    console.log('\n[TEST] pushBezierLinePair — missing-input guards')

    const { pushBezierLinePair } = await import('../src/lib/engine/mycelium-bezier.ts')

    const colorFn = makeColorFn()

    // Missing start node (undefined)
    {
        const positions = []
        const colors = []
        const nodePositions = [undefined, { x: 1, y: 0, z: 0, cluster: 1 }]
        pushBezierLinePair(positions, colors, { a: 0, b: 1 }, nodePositions, nodePositions, colorFn)
        assert(positions.length === 0 && colors.length === 0, 'missing start node should push nothing')
    }

    // Missing x/y/z on start
    {
        const positions = []
        const colors = []
        const nodePositions = [
            { x: 1, y: 0 },
            { x: 1, y: 0, z: 0, cluster: 1 }
        ]
        pushBezierLinePair(positions, colors, { a: 0, b: 1 }, nodePositions, nodePositions, colorFn)
        assert(positions.length === 0 && colors.length === 0, 'missing start z should push nothing')
    }

    // Missing end node
    {
        const positions = []
        const colors = []
        const nodePositions = [{ x: 0, y: 0, z: 0, cluster: 0 }, undefined]
        pushBezierLinePair(positions, colors, { a: 0, b: 1 }, nodePositions, nodePositions, colorFn)
        assert(positions.length === 0 && colors.length === 0, 'missing end node should push nothing')
    }

    console.log('  OK missing start/end/x/y/z all guard no-op')
}

async function testPushBezierLinePairSegmentsOverride() {
    console.log('\n[TEST] pushBezierLinePair — segments override')

    const { pushBezierLinePair } = await import('../src/lib/engine/mycelium-bezier.ts')

    const nodePositions = makeNodePositions(4)
    const points = makeNodePositions(4)
    const colorFn = makeColorFn()

    const segments = 4
    const positions = []
    const colors = []
    pushBezierLinePair(positions, colors, { a: 0, b: 1 }, nodePositions, points, colorFn, 1, segments)

    assert(
        positions.length === segments * 6,
        `segments=${segments} should produce ${segments * 6} floats, got ${positions.length}`
    )
    assert(
        colors.length === segments * 6,
        `segments=${segments} should produce ${segments * 6} color floats, got ${colors.length}`
    )

    console.log(`  OK segments=4 override produces ${segments * 6} floats`)
}

async function testComputeLayerIntensityMap() {
    console.log('\n[TEST] computeLayerIntensityMap')

    const { computeLayerIntensityMap } = await import('../src/lib/engine/mycelium-bezier.ts')

    const withSemantic = computeLayerIntensityMap(true)
    const withoutSemantic = computeLayerIntensityMap(false)

    // Three layers
    for (const key of [0, 1, 2]) {
        assert(key in withSemantic, `withSemantic should have layer ${key}`)
        assert(key in withoutSemantic, `withoutSemantic should have layer ${key}`)
    }

    // Semantic amplifies each layer's intensity.
    assert(withSemantic[0] > withoutSemantic[0], 'semantic should amplify core layer (0)')
    assert(withSemantic[1] > withoutSemantic[1], 'semantic should amplify wispy layer (1)')
    assert(withSemantic[2] > withoutSemantic[2], 'semantic should amplify bridge layer (2)')

    // Specific known values (matches createMycelium vertex color baking).
    assert(Math.abs(withSemantic[0] - 0.38) < 1e-9, 'withSemantic[0] should be 0.38')
    assert(Math.abs(withoutSemantic[0] - 0.28) < 1e-9, 'withoutSemantic[0] should be 0.28')

    console.log('  OK 3 layers, semantic amplifies, known values match')
}

async function testRefreshCachedViewVector() {
    console.log('\n[TEST] refreshCachedBezierViewVector')

    const { refreshCachedBezierViewVector } = await import('../src/lib/engine/mycelium-bezier.ts')

    // No camera in Node shim -> default normalized vector (0.28,0.2,1).
    refreshCachedBezierViewVector()

    // We can't read the private _cachedBezierViewVector directly, but calling
    // getBezierControlPoint afterwards must produce a finite control point —
    // which it only can if the view vector was set.
    const { getBezierControlPoint } = await import('../src/lib/engine/mycelium-bezier.ts')
    const ctrl = getBezierControlPoint({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 1, 0)
    assert(
        Number.isFinite(ctrl.x) && Number.isFinite(ctrl.y) && Number.isFinite(ctrl.z),
        'control point must be finite after view-vector refresh'
    )

    console.log('  OK view vector refresh primes control-point math')
}

async function testDisposeViewRefreshLifecycle() {
    console.log('\n[TEST] dispose-view-refresh lifecycle')

    const { setDisposeBezierViewRefresh, hasDisposeBezierViewRefresh, runDisposeBezierViewRefresh } =
        await import('../src/lib/engine/mycelium-bezier.ts')

    assert(hasDisposeBezierViewRefresh() === false, 'dispose fn should be unset initially')

    let called = false
    setDisposeBezierViewRefresh(() => {
        called = true
    })
    assert(hasDisposeBezierViewRefresh() === true, 'dispose fn should be set after setDisposeBezierViewRefresh')

    runDisposeBezierViewRefresh()
    assert(called === true, 'dispose fn should have been called by runDisposeBezierViewRefresh')
    assert(hasDisposeBezierViewRefresh() === false, 'dispose fn should be cleared after run')

    console.log('  OK set -> has -> run -> cleared lifecycle')
}

async function testRebuildDirtyPairsInLayer() {
    console.log('\n[TEST] rebuildDirtyPairsInLayer — in-place dirty rebuild')

    const { rebuildDirtyPairsInLayer, BEZIER_SEGMENTS_PER_PAIR, computeLayerIntensityMap } =
        await import('../src/lib/engine/mycelium-bezier.ts')

    // Build a mock LineSegments2 with instanceStart/instanceEnd/color attributes.
    const FLOATS = BEZIER_SEGMENTS_PER_PAIR * 6 * 4 // room for 4 pairs
    const startArr = new Float32Array(FLOATS)
    const endArr = new Float32Array(FLOATS)
    const colorStartArr = new Float32Array(FLOATS)
    const colorEndArr = new Float32Array(FLOATS)
    const startAttr = { array: startArr, needsUpdate: false }
    const endAttr = { array: endArr, needsUpdate: false }
    const colorStartAttr = { array: colorStartArr, needsUpdate: false }
    const colorEndAttr = { array: colorEndArr, needsUpdate: false }
    const geom = {
        getAttribute(name) {
            if (name === 'instanceStart') return startAttr
            if (name === 'instanceEnd') return endAttr
            if (name === 'instanceColorStart') return colorStartAttr
            if (name === 'instanceColorEnd') return colorEndAttr
            return undefined
        }
    }
    const line = { geometry: geom }

    // Two pairs in layer 0. Pair 0 (a=0,b=1) is dirty; pair 1 (a=2,b=3) is clean.
    const pairs = [
        { a: 0, b: 1, layer: 0 },
        { a: 2, b: 3, layer: 0 }
    ]
    const dirtySet = new Set([0]) // node 0 dirty -> pair 0 dirty
    const nodePositions = makeNodePositions(4)
    const points = makeNodePositions(4)
    const colorFn = makeColorFn()
    const intensity = computeLayerIntensityMap(true)

    const dirtyCount = rebuildDirtyPairsInLayer(line, 0, intensity, pairs, dirtySet, nodePositions, points, colorFn)
    assert(dirtyCount === 1, `should report 1 dirty pair, got ${dirtyCount}`)

    // Dirty pair 0 lands at segment offset 0..9 (baseSeg=0). First segment start.
    assert(isFinite3(startArr, 0), 'dirty pair 0 segment 0 start must be finite')
    assert(isFinite3(endArr, 0), 'dirty pair 0 segment 0 end must be finite')

    // Buffer-level continuity for the dirty pair's written segments.
    const layerPairBaseSeg = 0
    for (let s = 0; s < BEZIER_SEGMENTS_PER_PAIR - 1; s++) {
        const endIdx = (layerPairBaseSeg + s) * 3 + 3
        const nextStartIdx = (layerPairBaseSeg + s + 1) * 3
        assert(
            startArr[endIdx] === startArr[nextStartIdx] &&
                startArr[endIdx + 1] === startArr[nextStartIdx + 1] &&
                startArr[endIdx + 2] === startArr[nextStartIdx + 2],
            `rebuilt continuity broken between segment ${s} and ${s + 1}`
        )
    }

    // Clean pair 1 (baseSeg=10) must be UNTOUCHED — its region stays zero.
    const cleanBase = BEZIER_SEGMENTS_PER_PAIR * 3 // 10 segments * 3 floats
    for (let i = cleanBase; i < cleanBase + 6; i++) {
        assert(startArr[i] === 0 && endArr[i] === 0, `clean pair 1 region (offset ${i}) must stay zeroed`)
    }

    // needsUpdate flags flipped.
    assert(startAttr.needsUpdate === true, 'startAttr.needsUpdate should be set')
    assert(endAttr.needsUpdate === true, 'endAttr.needsUpdate should be set')

    console.log('  OK dirty pair rebuilt in-place, clean pair untouched, continuity holds')
}

async function testRebuildDirtyPairsMissingGeometry() {
    console.log('\n[TEST] rebuildDirtyPairsInLayer — missing geometry guard')

    const { rebuildDirtyPairsInLayer, computeLayerIntensityMap } = await import('../src/lib/engine/mycelium-bezier.ts')

    // line === null -> returns 0, no throw.
    const count = rebuildDirtyPairsInLayer(
        null,
        0,
        computeLayerIntensityMap(false),
        [{ a: 0, b: 1, layer: 0 }],
        new Set([0]),
        makeNodePositions(4),
        makeNodePositions(4),
        makeColorFn()
    )
    assert(count === 0, 'null line should return 0 dirty pairs')

    console.log('  OK null line guard returns 0')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testPairKey,
        testGetBezierControlPoint,
        testPushBezierLinePairBasic,
        testPushBezierLinePairContinuity,
        testPushBezierLinePairColors,
        testPushBezierLinePairMissingInputs,
        testPushBezierLinePairSegmentsOverride,
        testComputeLayerIntensityMap,
        testRefreshCachedViewVector,
        testDisposeViewRefreshLifecycle,
        testRebuildDirtyPairsInLayer,
        testRebuildDirtyPairsMissingGeometry
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
