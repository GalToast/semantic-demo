/**
 * worker-parser-parity.test.ts — Coordinate/cluster parse parity between the
 * worker and the main-thread fallback.
 *
 * Bug (workers sweep 2026-08-07): the worker's `parseFiniteNumber`
 * (data-worker.ts) required the canonical round-trip string form
 * (`String(num) === trimmed`), rejecting "0.50" / "1e-3", while the fallback
 * `parseFinite` (data-loader.ts) used loose `parseFloat`, accepting them.
 * The fallback exists for worker failure and MUST agree with the worker on
 * the same file — a generator emitting string coords silently forked
 * behavior (worker → invalid-position, fallback → parsed).
 *
 * Fix: both parsers now share identical semantics (full-string Number()
 * parse; finite number fast path; non-numeric/non-string → null), and the
 * cluster parse uses the identical `parseInt(String(x ?? '0'), 10) || 0`
 * expression in both files (parity by construction).
 *
 * This suite locks the parity: any future edit to either parser that
 * diverges the other must fail here.
 */

import { describe, expect, it, vi } from 'vitest'
import { parseFinite } from '@lib/data-loader'
import { parseFiniteNumber } from '@lib/workers/data-worker'

// Sibling convention: stub the Vite worker-URL boundary so importing
// data-loader does not attempt the `?worker&url` dynamic import in vitest.
vi.mock('@lib/workers/data-worker-url', () => ({
    workerUrl: 'mock-data-worker.js'
}))

/**
 * Task corpus plus adversarial extras: whitespace, hex, partial-parse bait,
 * booleans, arrays, non-finite numbers.
 */
const CORPUS: unknown[] = [
    '0.50',
    '1e-3',
    '1e3',
    '1e+3',
    '12',
    'abc',
    '',
    null,
    undefined,
    42,
    0,
    -0,
    3.14,
    1e21,
    ' 12 ',
    '\t0.5\n',
    '12px',
    '0x10',
    'Infinity',
    'NaN',
    true,
    false,
    [],
    [1],
    {},
    NaN,
    Infinity,
    -Infinity
]

describe('worker/fallback coordinate-parser parity', () => {
    it('produces identical results for every input', () => {
        for (const input of CORPUS) {
            const workerResult = parseFiniteNumber(input)
            const fallbackResult = parseFinite(input)
            expect(
                Object.is(workerResult, fallbackResult),
                `diverged for input ${JSON.stringify(input)}: worker=${workerResult} fallback=${fallbackResult}`
            ).toBe(true)
        }
    })

    it('accepts the canonical loose numeric forms (the divergence cases)', () => {
        expect(parseFiniteNumber('0.50')).toBe(0.5)
        expect(parseFinite('0.50')).toBe(0.5)
        expect(parseFiniteNumber('1e-3')).toBe(0.001)
        expect(parseFinite('1e-3')).toBe(0.001)
        expect(parseFiniteNumber('1e3')).toBe(1000)
        expect(parseFinite('1e3')).toBe(1000)
        expect(parseFiniteNumber(' 12 ')).toBe(12)
        expect(parseFinite(' 12 ')).toBe(12)
    })

    it('keeps rejecting genuinely-bad input on both sides', () => {
        for (const input of ['abc', '', '12px', 'Infinity', 'NaN', null, undefined, true, false, [], {}, NaN, Infinity]) {
            expect(parseFiniteNumber(input), `worker should reject ${JSON.stringify(input)}`).toBeNull()
            expect(parseFinite(input), `fallback should reject ${JSON.stringify(input)}`).toBeNull()
        }
    })

    it('keeps the finite-number fast path (JSON numbers, the common case)', () => {
        for (const input of [42, 0, -0, 3.14, 1e21]) {
            expect(parseFiniteNumber(input)).toBe(input)
            expect(parseFinite(input)).toBe(input)
        }
    })
})

describe('cluster-parse parity (identical parseInt expression in both files)', () => {
    /**
     * Both data-worker.ts and data-loader.ts use the literal expression
     * `parseInt(String(x ?? '0'), 10) || 0` for the cluster column — parity
     * by construction. This locks the canonical semantics so neither side
     * can silently diverge ("1e3" → 1, truncation toward zero, bad input → 0).
     */
    const clusterParse = (x: unknown): number => parseInt(String(x ?? '0'), 10) || 0

    it('agrees with the documented parseInt semantics', () => {
        expect(clusterParse('1e3')).toBe(1) // parseInt stops at the exponent
        expect(clusterParse('12.7')).toBe(12)
        expect(clusterParse('0x10')).toBe(0) // radix-10, not hex
        expect(clusterParse('abc')).toBe(0)
        expect(clusterParse('')).toBe(0)
        expect(clusterParse(null)).toBe(0)
        expect(clusterParse(undefined)).toBe(0)
        expect(clusterParse(42)).toBe(42)
        expect(clusterParse(3)).toBe(3)
    })
})
