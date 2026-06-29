/**
 * tests/unit-active/demo-phase-timing.test.ts
 *
 * Verifies that the demo phase timing targets match the 10-phase showcase spec:
 * - OVERVIEW: 4000ms
 * - SEARCH: 5000ms
 * - FOCUS: 4000ms
 * - THREADS: 3000ms
 * - NEIGHBORS: 4000ms
 * - TRAIL: 5000ms
 * - DIVE: 4000ms
 * - FILTER: 4000ms
 * - MAP: 5000ms
 * - RETURN: 3000ms
 * - Total: 41000ms
 *
 * Tolerance: ±100ms per phase.
 */
import { describe, it, expect } from 'vitest';
import { DEMO_TIMING as STORE_DEMO_TIMING } from '../../src/lib/stores/demo.svelte.ts';

// ── Store timing constants (source of truth) ──────────────────────────────────
// These are imported from the Svelte store which defines DEMO_TIMING.

const DEMO_TIMING = {
  OVERVIEW_MS: STORE_DEMO_TIMING.OVERVIEW_MS,
  SEARCH_MS: STORE_DEMO_TIMING.SEARCH_MS,
  FOCUS_MS: STORE_DEMO_TIMING.FOCUS_MS,
  THREADS_MS: STORE_DEMO_TIMING.THREADS_MS,
  NEIGHBORS_MS: STORE_DEMO_TIMING.NEIGHBORS_MS,
  TRAIL_MS: STORE_DEMO_TIMING.TRAIL_MS,
  DIVE_MS: STORE_DEMO_TIMING.DIVE_MS,
  FILTER_MS: STORE_DEMO_TIMING.FILTER_MS,
  MAP_MS: STORE_DEMO_TIMING.MAP_MS,
  RETURN_MS: STORE_DEMO_TIMING.RETURN_MS,
} as const;

const TOTAL_DURATION_MS =
  DEMO_TIMING.OVERVIEW_MS +
  DEMO_TIMING.SEARCH_MS +
  DEMO_TIMING.FOCUS_MS +
  DEMO_TIMING.THREADS_MS +
  DEMO_TIMING.NEIGHBORS_MS +
  DEMO_TIMING.TRAIL_MS +
  DEMO_TIMING.DIVE_MS +
  DEMO_TIMING.FILTER_MS +
  DEMO_TIMING.MAP_MS +
  DEMO_TIMING.RETURN_MS;

const TOLERANCE_MS = 100;

describe('Demo Phase Timing', () => {
  describe('DEMO_TIMING constants', () => {
    it('OVERVIEW_MS matches spec target (4000ms)', () => {
      expect(DEMO_TIMING.OVERVIEW_MS).toBeCloseTo(4000, -2);
    });

    it('SEARCH_MS matches spec target (5000ms)', () => {
      expect(DEMO_TIMING.SEARCH_MS).toBeCloseTo(5000, -2);
    });

    it('FOCUS_MS matches spec target (4000ms)', () => {
      expect(DEMO_TIMING.FOCUS_MS).toBeCloseTo(4000, -2);
    });

    it('THREADS_MS matches spec target (3000ms)', () => {
      expect(DEMO_TIMING.THREADS_MS).toBeCloseTo(3000, -2);
    });

    it('NEIGHBORS_MS matches spec target (4000ms)', () => {
      expect(DEMO_TIMING.NEIGHBORS_MS).toBeCloseTo(4000, -2);
    });

    it('TRAIL_MS matches spec target (5000ms)', () => {
      expect(DEMO_TIMING.TRAIL_MS).toBeCloseTo(5000, -2);
    });

    it('DIVE_MS matches spec target (4000ms)', () => {
      expect(DEMO_TIMING.DIVE_MS).toBeCloseTo(4000, -2);
    });

    it('FILTER_MS matches spec target (4000ms)', () => {
      expect(DEMO_TIMING.FILTER_MS).toBeCloseTo(4000, -2);
    });

    it('MAP_MS matches spec target (5000ms)', () => {
      expect(DEMO_TIMING.MAP_MS).toBeCloseTo(5000, -2);
    });

    it('RETURN_MS matches spec target (3000ms)', () => {
      expect(DEMO_TIMING.RETURN_MS).toBeCloseTo(3000, -2);
    });
  });

  describe('Total duration', () => {
    it('total duration is 41000ms (10-phase showcase)', () => {
      expect(TOTAL_DURATION_MS).toBe(41000);
    });

    it('total duration is at least 40000ms', () => {
      expect(TOTAL_DURATION_MS).toBeGreaterThanOrEqual(40000);
    });

    it('total duration is at most 45000ms', () => {
      expect(TOTAL_DURATION_MS).toBeLessThanOrEqual(45000);
    });
  });

  describe('Phase durations are all positive', () => {
    it('every phase duration is > 0', () => {
      const durations = Object.values(DEMO_TIMING) as number[];
      for (const d of durations) {
        expect(d).toBeGreaterThan(0);
      }
    });
  });
});
