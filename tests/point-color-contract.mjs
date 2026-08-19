#!/usr/bin/env node
/**
 * tests/point-color-contract.mjs
 *
 * Node contract for src/lib/journey/point-color.ts — the per-frame point-color
 * resolver that writes brightness factors onto the point cloud's color buffer
 * from the global appState singleton (filter visibility, focus/trail pockets,
 * mycelium modes).
 *
 * IMPORTANT — signature discovered from the source:
 *     export function applyPointFilterColors(): void
 * The function takes NO arguments. It reads everything from the shared
 * `appState` singleton (imported in point-color.ts as `state`, aliased to
 * `_state`) and writes the computed brightness factors onto
 * `appState.pointsMesh.geometry.attributes.color.array`.
 *
 * Because the function reads the singleton, this contract drives it by writing
 * the relevant `appState` fields (the same proxy instance point-color.ts closes
 * over) and then inspecting the color buffer it produces. Three.js scene
 * objects are NOT constructed — the test supplies a minimal fake `pointsMesh`
 * (a plain object with `geometry.attributes.color.array`) and leaves
 * `nodeSporeMesh` / `searchState` in their inert (null / inactive) states, so
 * the Three.js-only branches are exercised as far as pure logic allows and
 * noted where they cannot be reached.
 *
 * Covers (derived against the source, which is never wrong):
 *   1. No throw with empty state (n = 0).
 *   2. No throw with null/undefined inputs (early-return paths).
 *   3. Deterministic — same observable output across recomputations.
 *   4. Filter passthrough — an active status filter dims non-matching points
 *      to 0.08 brightness while matching points keep full brightness (1).
 *   5. Unfiltered default — with no active filter every visible point keeps
 *      its base color (factor 1).
 *   6. Idempotent read — the function never mutates the input `points` array's
 *      non-color fields.
 *
 * DROPPED assertion (with reason): "cluster-aware" — the source calls
 * `isPointVisible(i, _state.points, null, _state.activeFilters)` and hardcodes
 * `null` as the activeClusterFilter argument, so a cluster filter NEVER affects
 * the colors written here. There is no cluster-aware branch to assert; the
 * cluster filter is applied elsewhere, not in applyPointFilterColors.
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

const { appState } = await import('../src/lib/state/app.svelte.ts')
const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertClose(a, b, eps, msg) {
    if (Math.abs(a - b) > eps) throw new Error(`ASSERTION FAILED: ${msg} (got ${a}, expected ~${b}, eps ${eps})`)
}

// Minimal fake pointsMesh with a real Float32Array color buffer, mirroring the
// shape applyPointFilterColors reads/writes (geometry.attributes.color.array +
// a needsUpdate flag it flips at the end of the pass).
function makePointsMesh(n) {
    return {
        geometry: {
            attributes: {
                color: { array: new Float32Array(n * 3), needsUpdate: false }
            }
        }
    }
}

// Configure the shared appState singleton the way the live app would before a
// color pass. `opts` overrides individual fields. Everything not overridden is
// pinned to a neutral, focus-free, filter-free baseline so each test isolates
// exactly one behavior.
function setupState(n, opts = {}) {
    const base = new Float32Array(n * 3)
    for (let i = 0; i < n * 3; i++) base[i] = (i % 10) * 0.05 + 0.1 // 0.10 .. 0.55

    // Reset the color-pass cache so every call recomputes (no early-return).
    appState.filterColorStateKey = null

    appState.pointsMesh = opts.pointsMesh !== undefined ? opts.pointsMesh : makePointsMesh(n)
    appState.pointBaseColors = opts.pointBaseColors !== undefined ? opts.pointBaseColors : base
    appState.points = opts.points !== undefined ? opts.points : Array.from({ length: n }, (_, i) => ({
        cluster: i % 3,
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    }))

    // NavState — nested writes bypass the appState proxy set trap, so they land
    // on the exact object point-color.ts reads through `_state.navState`.
    appState.navState.trailNeighborIndices = []
    appState.navState.focusPocketIndices = []
    appState.navState.walkHistoryIndices = []
    appState.navState.focusedIndex = null
    appState.navState.mode = 'overview'
    appState.navState.threadSource = 'geometric-fallback'
    appState.navState.focusPocketRoleByIndex = new Map()

    appState.focusedNode = null
    appState.trailDepth = 0
    appState.myceliumMode = 'dormant'
    appState.filterVersion = 1
    appState.trailIndices = new Set()
    appState.nodeSporeMesh = null
    appState.searchState = { searchGlowActive: false, searchGlowIndices: null, searchGlowTopIndex: null }
    appState.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false }

    appState.pointColorStateVersion = 0
    appState.filterColorVersion = 0

    return { base, n }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testNoThrowEmptyState() {
    console.log('\n[TEST] no throw with empty state (n = 0)')

    const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')
    const { appState } = await import('../src/lib/state/app.svelte')

    setupState(0)

    // Drive it through the color-state cache so a prior call can't mask a throw.
    appState.filterColorStateKey = null
    let threw = false
    try {
        applyPointFilterColors()
    } catch (err) {
        threw = true
        console.error('  unexpected throw:', err.message)
    }
    assert(threw === false, 'applyPointFilterColors must not throw on empty state')
    // The pass actually ran (did not early-return) — versions were bumped.
    assert(appState.pointColorStateVersion === 1, 'empty-state pass should increment pointColorStateVersion')
    assert(appState.filterColorStateKey !== null, 'empty-state pass should stamp filterColorStateKey')

    console.log('  OK empty state handled without throw and runs to completion')
}

async function testNoThrowNullInput() {
    console.log('\n[TEST] no throw with null/undefined inputs (early-return paths)')

    const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')
    const { appState } = await import('../src/lib/state/app.svelte')

    // Case A: both pointsMesh and pointBaseColors null → first-line early return.
    setupState(3)
    appState.pointsMesh = null
    appState.pointBaseColors = null
    let threw = false
    try {
        applyPointFilterColors()
    } catch (err) {
        threw = true
        console.error('  case A unexpected throw:', err.message)
    }
    assert(threw === false, 'null pointsMesh/pointBaseColors must early-return, not throw')

    // Case B: mesh + base colors present but the points array itself is null →
    // the `!_state.points` guard returns before the color loop.
    setupState(3)
    appState.points = null
    threw = false
    try {
        applyPointFilterColors()
    } catch (err) {
        threw = true
        console.error('  case B unexpected throw:', err.message)
    }
    assert(threw === false, 'null points array must early-return, not throw')

    console.log('  OK null/undefined inputs are handled via early-return (no throw)')
}

async function testDeterministic() {
    console.log('\n[TEST] deterministic — same output across recomputations')

    const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')
    const { appState } = await import('../src/lib/state/app.svelte')

    setupState(5)

    applyPointFilterColors()
    const first = Float32Array.from(appState.pointsMesh.geometry.attributes.color.array)

    // Force a recompute (clear the short-circuit cache key) and run again.
    appState.filterColorStateKey = null
    applyPointFilterColors()
    const second = Float32Array.from(appState.pointsMesh.geometry.attributes.color.array)

    assert(first.length === second.length, 'output length must be stable')
    for (let i = 0; i < first.length; i++) {
        assertClose(first[i], second[i], 1e-12, `output[${i}] must be identical across calls`)
    }

    console.log('  OK recomputed colors are bit-identical (no randomness)')
}

async function testUnfilteredDefault() {
    console.log('\n[TEST] unfiltered default — visible points keep base color (factor 1)')

    const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')
    const { appState } = await import('../src/lib/state/app.svelte')

    const { base, n } = setupState(4)

    applyPointFilterColors()
    const out = appState.pointsMesh.geometry.attributes.color.array

    for (let i = 0; i < n * 3; i++) {
        assertClose(out[i], base[i], 1e-9, `unfiltered point buffer[${i}] must equal base color (factor 1)`)
    }
    // The pass also flags the buffer dirty and bumps the color version.
    assert(appState.pointsMesh.geometry.attributes.color.needsUpdate === true, 'color buffer must be flagged needsUpdate')
    assert(appState.pointColorStateVersion === 1, 'color version must increment on a real pass')

    console.log('  OK unfiltered points resolve to their base colors (factor 1.0)')
}

async function testFilterPassthrough() {
    console.log('\n[TEST] filter passthrough — active status filter dims non-matching points')

    const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')
    const { appState } = await import('../src/lib/state/app.svelte')

    const { base, n } = setupState(3)
    // Only point index 1 matches the active filter; 0 and 2 do not.
    appState.points[0].status = 'inactive'
    appState.points[1].status = 'active'
    appState.points[2].status = 'inactive'
    appState.activeFilters = { status: 'active', city: 'all', website: false, email: false, geocoded: false }

    applyPointFilterColors()
    const out = appState.pointsMesh.geometry.attributes.color.array

    // Matching point (index 1): visible → full brightness (factor 1).
    for (let c = 0; c < 3; c++) {
        assertClose(out[1 * 3 + c], base[1 * 3 + c] * 1, 1e-9, `matching point channel ${c} must keep base color (factor 1)`)
    }
    // Non-matching points (indices 0, 2): filtered out → dimmed to 0.08.
    for (const idx of [0, 2]) {
        for (let c = 0; c < 3; c++) {
            assertClose(
                out[idx * 3 + c],
                base[idx * 3 + c] * 0.08,
                1e-6, // Float32Array round-trip: base * 0.08 stored as float32, read back as float64
                `filtered point ${idx} channel ${c} must dim to 0.08 brightness`
            )
        }
    }

    console.log('  OK active filter keeps matching points bright and dims the rest to 0.08')
}

async function testIdempotentRead() {
    console.log('\n[TEST] idempotent read — input points non-color fields are not mutated')

    const { applyPointFilterColors } = await import('../src/lib/journey/point-color.ts')
    const { appState } = await import('../src/lib/state/app.svelte')

    const { base, n } = setupState(3)

    // Snapshot the points array identity + its non-color fields.
    const pointsRef = appState.points
    const snapshot = appState.points.map((p) => ({
        cluster: p.cluster,
        status: p.status,
        city: p.city,
        website: p.website,
        email: p.email,
        geocoded: p.geocoded
    }))

    applyPointFilterColors()

    // Same array reference, same length, identical non-color field values.
    assert(appState.points === pointsRef, 'points array reference must be unchanged')
    assert(appState.points.length === n, 'points array length must be unchanged')
    for (let i = 0; i < n; i++) {
        const p = appState.points[i]
        assert(p.cluster === snapshot[i].cluster, `point ${i} cluster must be unchanged`)
        assert(p.status === snapshot[i].status, `point ${i} status must be unchanged`)
        assert(p.city === snapshot[i].city, `point ${i} city must be unchanged`)
        assert(p.website === snapshot[i].website, `point ${i} website must be unchanged`)
        assert(p.email === snapshot[i].email, `point ${i} email must be unchanged`)
        assert(p.geocoded === snapshot[i].geocoded, `point ${i} geocoded must be unchanged`)
    }
    // pointBaseColors (read-only source) is also left untouched.
    for (let i = 0; i < base.length; i++) {
        assertClose(appState.pointBaseColors[i], base[i], 1e-12, `pointBaseColors[${i}] must be unchanged`)
    }

    console.log('  OK points array and base colors are read-only inputs to the pass')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testNoThrowEmptyState,
        testNoThrowNullInput,
        testDeterministic,
        testUnfilteredDefault,
        testFilterPassthrough,
        testIdempotentRead
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
