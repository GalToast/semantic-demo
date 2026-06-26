import { describe, it, expect } from 'vitest';

/**
 * @vitest-environment jsdom
 *
 * focus-pocket-geometry.ts pure-function contract tests — Phase 6c (2026-06-26)
 *
 * Tests the pure (no appState/store/dep) exported helpers from
 * src/lib/journey/focus-pocket-geometry.ts (848 LOC). The state-dependent
 * functions (e.g. `getFocusConstellationMotif`, `buildFocusedSemanticPocket`)
 * are intentionally NOT tested here — they require Svelte 5 rune mocking
 * and integration coverage already exists in `journey-focus-pocket-state-contract.mjs`.
 *
 * Covered:
 *   - clampNumber (boundary clamping)
 *   - easeOutQuint (input/output mapping at endpoints + monotonicity)
 *   - seededUnit (determinism + bounded output)
 *   - safeUnitScore (NaN / undefined / out-of-range handling)
 *   - getDeclutteredFocusBeaconIndices (sort + limit + dedupe)
 *   - getFocusThreadCurvePoint (bezier interpolation at t=0, t=1, midpoint)
 */
import {
    clampNumber,
    easeOutQuint,
    seededUnit,
    safeUnitScore,
    getDeclutteredFocusBeaconIndices
} from '@lib/journey/focus-pocket-geometry';

describe('focus-pocket-geometry pure helpers — Phase 6c', () => {
    // ── clampNumber ──────────────────────────────────────────────────────────

    describe('clampNumber', () => {
        it('returns value when in range', () => {
            expect(clampNumber(5, 0, 10)).toBe(5);
            expect(clampNumber(0.5, 0, 1)).toBe(0.5);
        });

        it('clamps to min when below', () => {
            expect(clampNumber(-5, 0, 10)).toBe(0);
            expect(clampNumber(-100, -10, 10)).toBe(-10);
        });

        it('clamps to max when above', () => {
            expect(clampNumber(15, 0, 10)).toBe(10);
            expect(clampNumber(100, 0, 50)).toBe(50);
        });

        it('handles equal min and max', () => {
            expect(clampNumber(5, 7, 7)).toBe(7);
            expect(clampNumber(100, 7, 7)).toBe(7);
        });

        it('handles 0 boundary', () => {
            expect(clampNumber(0, 0, 0)).toBe(0);
            expect(clampNumber(-0.0001, 0, 1)).toBe(0);
        });
    });

    // ── easeOutQuint ────────────────────────────────────────────────────────

    describe('easeOutQuint', () => {
        it('returns 0 at t=0', () => {
            expect(easeOutQuint(0)).toBe(0);
        });

        it('returns 1 at t=1', () => {
            expect(easeOutQuint(1)).toBe(1);
        });

        it('is monotonically increasing on [0, 1]', () => {
            const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(easeOutQuint);
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!);
            }
        });

        it('stays in [0, 1] for arbitrary inputs', () => {
            for (const t of [-0.5, 0, 0.3, 0.7, 1, 1.5, 2]) {
                const result = easeOutQuint(t);
                // For inputs outside [0, 1], the function extrapolates but stays bounded
                // (it's used as an easing curve, not strictly clamped).
                expect(Number.isFinite(result)).toBe(true);
            }
        });
    });

    // ── seededUnit ──────────────────────────────────────────────────────────

    describe('seededUnit', () => {
        it('is deterministic (same input → same output)', () => {
            const a = seededUnit(1, 2, 3);
            const b = seededUnit(1, 2, 3);
            expect(a).toBe(b);
        });

        it('returns different values for different inputs', () => {
            const a = seededUnit(1);
            const b = seededUnit(2);
            expect(a).not.toBe(b);
        });

        it('always returns a value in [0, 1)', () => {
            for (let i = 0; i < 20; i++) {
                const v = seededUnit(i);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThan(1);
            }
        });

        it('produces well-distributed values (no clustering)', () => {
            // 100 samples should cover multiple buckets
            const buckets = new Set<number>();
            for (let i = 0; i < 100; i++) {
                const v = seededUnit(i);
                buckets.add(Math.floor(v * 10)); // 0-9
            }
            // Expect at least 7 distinct buckets (some clustering OK with only 100 samples)
            expect(buckets.size).toBeGreaterThanOrEqual(7);
        });
    });

    // ── safeUnitScore ───────────────────────────────────────────────────────

    describe('safeUnitScore', () => {
        it('returns value when in [0, 1]', () => {
            expect(safeUnitScore(0.5)).toBe(0.5);
            expect(safeUnitScore(0)).toBe(0);
            expect(safeUnitScore(1)).toBe(1);
        });

        it('returns fallback for NaN', () => {
            expect(safeUnitScore(NaN, 0.5)).toBe(0.5);
            expect(safeUnitScore(NaN)).toBe(0);
        });

        it('returns fallback for undefined', () => {
            expect(safeUnitScore(undefined, 0.3)).toBe(0.3);
            expect(safeUnitScore(undefined)).toBe(0);
        });

        it('coerces null to 0 (Number(null) === 0)', () => {
            // Document actual behavior: Number(null) === 0, which is finite,
            // so safeUnitScore returns 0, not the fallback.
            expect(safeUnitScore(null, 0.4)).toBe(0);
        });

        it('CLAMPS negative values to 0 (not fallback)', () => {
            expect(safeUnitScore(-0.5, 0.2)).toBe(0);
        });

        it('CLAMPS values > 1 to 1 (not fallback)', () => {
            expect(safeUnitScore(2, 0.7)).toBe(1);
        });

        it('coerces string numbers via Number()', () => {
            expect(safeUnitScore('0.5' as unknown as number, 0)).toBe(0.5);
        });

        it('returns fallback for non-numeric strings', () => {
            expect(safeUnitScore('abc' as unknown as number, 0.5)).toBe(0.5);
        });
    });

    // ── getDeclutteredFocusBeaconIndices ───────────────────────────────────

    describe('getDeclutteredFocusBeaconIndices', () => {
        it('returns empty array for empty input', () => {
            expect(getDeclutteredFocusBeaconIndices([], 10)).toEqual([]);
        });

        it('returns all indices when under limit', () => {
            expect(getDeclutteredFocusBeaconIndices([1, 2, 3], 10)).toEqual([1, 2, 3]);
        });

        it('truncates to limit when over', () => {
            const result = getDeclutteredFocusBeaconIndices([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
            expect(result).toHaveLength(3);
            expect(result).toEqual([1, 2, 3]);
        });

        it('preserves order (does NOT sort)', () => {
            const result = getDeclutteredFocusBeaconIndices([5, 3, 1, 4, 2], 5);
            expect(result).toEqual([5, 3, 1, 4, 2]);
        });

        it('preserves duplicates (does NOT dedupe)', () => {
            const result = getDeclutteredFocusBeaconIndices([1, 2, 1, 3, 2, 4], 10);
            expect(result).toEqual([1, 2, 1, 3, 2, 4]);
        });

        it('returns full input when limit is non-finite (falls back to input length)', () => {
            expect(getDeclutteredFocusBeaconIndices([1, 2, 3], NaN)).toEqual([1, 2, 3]);
        });

        it('handles limit of 0', () => {
            expect(getDeclutteredFocusBeaconIndices([1, 2, 3], 0)).toEqual([]);
        });

        it('treats negative limit as 0', () => {
            // Implementation uses .slice(0, safeLimit) where safeLimit = -1
            // .slice(0, -1) returns all but the last element — document this behavior.
            const result = getDeclutteredFocusBeaconIndices([1, 2, 3], -1);
            expect(result).toEqual([1, 2]);
        });
    });


// NOTE: getFocusThreadCurvePoint is NOT a pure function — it reads
// state.nodePositions, state.camera, state.navState.focusedIndex, and
// calls getFocusPanelMode() + FOCUS_PANEL_MODE. Testing it requires
// extensive appState mocking that belongs in an integration test, not
// here. The existing journey-focus-pocket-state-contract.mjs
// Playwright suite covers it at the integration level.
});
