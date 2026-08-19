#!/usr/bin/env node
/**
 * tests/seeded-random-contract.mjs
 *
 * Node contract for src/lib/utils/seeded-random.ts — a tiny deterministic
 * pseudo-random hash (`seededUnit`). Pure JS math, no DOM, no WebGL.
 * Runs in plain Node via the ts-resolve loader.
 *
 * Signature (from source): seededUnit(index: number, salt: number = 0): number
 * Returns the fractional part of `Math.sin((index + 1) * 12.9898 + salt * 78.233)
 * * 43758.5453`, i.e. `x - Math.floor(x)`.
 *
 * Confirmed invariants (derived from the source — the source is never wrong):
 *   - Range is EXACTLY [0, 1): >= 0 inclusive, < 1 exclusive (fractional part).
 *   - String seeds are NOT int-coerced: ('42' + 1) === '421', then * 12.9898.
 *     So seededUnit('42') is a valid in-range number that DIFFERS from
 *     seededUnit(42); it is not null/undefined and not equal to the int case.
 */

import { register } from 'node:module'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertClose(a, b, eps, msg) {
    if (Math.abs(a - b) > eps) throw new Error(`ASSERTION FAILED: ${msg} (|${a} - ${b}| > ${eps})`)
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testRangeIsExactlyZeroToLessThanOne() {
    console.log('\n[TEST] range is exactly [0, 1)')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    // Sweep a wide, mixed set of seeds (small, negative, large, string) and
    // confirm every value lands in [0, 1). The source returns x - Math.floor(x),
    // which is mathematically >= 0 and < 1.
    const seeds = []
    for (let i = 0; i < 10000; i++) seeds.push(i)
    seeds.push(0, -1, -5, 2 ** 31, 2 ** 31 + 1, 1e12, '42', 999999)

    let min = 1
    let max = -1
    for (const s of seeds) {
        const v = seededUnit(s)
        assert(typeof v === 'number' && !Number.isNaN(v), `value for seed ${JSON.stringify(s)} must be a finite number`)
        assert(v >= 0, `value ${v} for seed ${JSON.stringify(s)} must be >= 0`)
        assert(v < 1, `value ${v} for seed ${JSON.stringify(s)} must be < 1`)
        if (v < min) min = v
        if (v > max) max = v
    }

    // Bounds are inclusive-lower / exclusive-upper; confirm we actually touch
    // both extremes across the sweep (not just stay in the middle).
    assert(min >= 0 && min < 0.01, `observed min ${min} should sit near the 0 floor`)
    assert(max < 1 && max > 0.99, `observed max ${max} should sit near the <1 ceiling`)
    console.log(`  OK all values in [0,1); observed min=${min.toFixed(6)} max=${max.toFixed(6)}`)
}

async function testDeterminism() {
    console.log('\n[TEST] determinism — same seed → same value')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    assertClose(seededUnit(42), seededUnit(42), 0, 'seededUnit(42) must be deterministic')
    assert(seededUnit(42) === seededUnit(42), 'identical calls must be strictly equal')
    // A handful of other seeds, including negative/large, also stable.
    for (const s of [1, -3, 2 ** 31, '7']) {
        assert(seededUnit(s) === seededUnit(s), `seededUnit(${JSON.stringify(s)}) must be deterministic`)
    }
    console.log('  OK identical seeds produce identical values')
}

async function testDifferentSeedsDiffer() {
    console.log('\n[TEST] different seeds differ (seed 1 vs seed 2)')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    const a = seededUnit(1)
    const b = seededUnit(2)
    assert(a !== b, `seededUnit(1) (${a}) must differ from seededUnit(2) (${b})`)

    // Generalize: across a block of consecutive seeds, collisions are effectively
    // impossible for this hash; assert the consecutive pair 100/101 also differs.
    assert(seededUnit(100) !== seededUnit(101), 'seededUnit(100) must differ from seededUnit(101)')
    console.log('  OK seed 1 !== seed 2 (no collision)')
}

async function testDistributionSpread() {
    console.log('\n[TEST] distribution — spread across the range, not clustered')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    const N = 10000
    let min = 1
    let max = -1
    let sum = 0
    const vals = new Array(N)
    for (let i = 0; i < N; i++) {
        const v = seededUnit(i)
        vals[i] = v
        sum += v
        if (v < min) min = v
        if (v > max) max = v
    }
    const mean = sum / N
    let variance = 0
    for (const v of vals) variance += (v - mean) ** 2
    const std = Math.sqrt(variance / N)

    // Spread: values reach both extremes of [0,1).
    assert(min < 0.1, `distribution min ${min} should be < 0.1`)
    assert(max > 0.9, `distribution max ${max} should be > 0.9`)
    // Non-trivial standard deviation (a uniform [0,1) would be ~0.2887).
    assert(std > 0.1, `distribution std ${std} should be non-trivial (> 0.1)`)
    console.log(`  OK min=${min.toFixed(4)} max=${max.toFixed(4)} std=${std.toFixed(4)}`)
}

async function testStringSeedCoercion() {
    console.log('\n[TEST] string seed coercion — NOT int-coerced, differs from int case')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    const num = seededUnit(42)
    const str = seededUnit('42')

    // Actual behavior: '42' + 1 === '421', then * 12.9898 → a different but
    // perfectly valid in-range number. It is NOT coerced to int 42, so it
    // differs from the numeric-seed result.
    assert(typeof str === 'number' && !Number.isNaN(str), 'string seed must yield a finite number')
    assert(str >= 0 && str < 1, `string-seed value ${str} must be in [0,1)`)
    assert(str !== num, `seededUnit('42') (${str}) must NOT equal seededUnit(42) (${num}) — no int coercion`)
    console.log(`  OK '42' (${str.toFixed(4)}) valid in range, differs from 42 (${num.toFixed(4)})`)
}

async function testZeroSeed() {
    console.log('\n[TEST] zero seed — valid in-range, no throw')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    const v = seededUnit(0)
    assert(typeof v === 'number' && !Number.isNaN(v), 'seededUnit(0) must be a finite number')
    assert(v >= 0 && v < 1, `seededUnit(0) (${v}) must be in [0,1)`)
    console.log(`  OK seededUnit(0) = ${v.toFixed(6)}`)
}

async function testNegativeSeed() {
    console.log('\n[TEST] negative seed — valid in-range, no throw')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    for (const s of [-1, -5, -999]) {
        const v = seededUnit(s)
        assert(typeof v === 'number' && !Number.isNaN(v), `seededUnit(${s}) must be a finite number`)
        assert(v >= 0 && v < 1, `seededUnit(${s}) (${v}) must be in [0,1)`)
    }
    console.log('  OK negative seeds yield in-range values')
}

async function testLargeSeed() {
    console.log('\n[TEST] large seed — no throw, in range')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    for (const s of [2 ** 31, 2 ** 31 + 1, 1e12]) {
        const v = seededUnit(s)
        assert(typeof v === 'number' && !Number.isNaN(v), `seededUnit(${s}) must be a finite number`)
        assert(v >= 0 && v < 1, `seededUnit(${s}) (${v}) must be in [0,1)`)
    }
    console.log('  OK large seeds yield in-range values')
}

async function testSequenceProperty() {
    console.log('\n[TEST] sequence property — seed and seed+1 not trivially related')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    // The hash must not produce a simple linear/sequential relationship such as
    // v ≈ n/1000. Assert adjacent seeds differ by more than a small epsilon.
    for (const s of [0, 1, 41, 1000, 2 ** 31, -5]) {
        const a = seededUnit(s)
        const b = seededUnit(s + 1)
        assert(Math.abs(a - b) > 1e-9, `seededUnit(${s}) and seededUnit(${s + 1}) differ trivially (|Δ| <= 1e-9)`)
    }
    console.log('  OK adjacent seeds are not trivially adjacent')
}

async function testSaltParameter() {
    console.log('\n[TEST] salt parameter — changes output, default equals 0')

    const { seededUnit } = await import('../src/lib/utils/seeded-random.ts')

    // Default salt (0) equals explicit salt 0 — determinism of the signature.
    assertClose(seededUnit(42), seededUnit(42, 0), 0, 'default salt must equal explicit salt 0')
    // A different salt must change the value (high probability for this hash).
    const base = seededUnit(42, 0)
    const salted = seededUnit(42, 1)
    assert(salted !== base, `salt must change output: base ${base} vs salted ${salted}`)
    assert(salted >= 0 && salted < 1, `salted value ${salted} must be in [0,1)`)
    console.log(`  OK salt changes output (base=${base.toFixed(4)} salted=${salted.toFixed(4)})`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testRangeIsExactlyZeroToLessThanOne,
        testDeterminism,
        testDifferentSeedsDiffer,
        testDistributionSpread,
        testStringSeedCoercion,
        testZeroSeed,
        testNegativeSeed,
        testLargeSeed,
        testSequenceProperty,
        testSaltParameter
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
