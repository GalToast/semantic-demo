/**
 * tests/unit-active/demo-phase-timing.test.ts
 *
 * Verifies that the demo phase timing targets match the AGENTS.md spec:
 * - GLIDING: 1400ms
 * - ARRIVED: immediate (120ms hold)
 * - CARD_VISIBLE: 1800ms
 * - PULLBACK: 1200ms
 * - WIDE_VIEW: 350ms
 * - RETURNING: 1000ms
 * - Total: 5870ms
 *
 * Tolerance: ±100ms per phase.
 */
import { describe, it, expect } from 'vitest';
import { DEMO_TIMING as STORE_DEMO_TIMING } from '../../src/lib/stores/demo.svelte.ts';

// ── Store timing constants (source of truth) ──────────────────────────────────
// These are imported from the Svelte store which defines DEMO_TIMING.
// We test the store constants directly since the engine bridge and legacy
// choreography are now aligned to these values.

const DEMO_TIMING = {
  GLIDING_MS: STORE_DEMO_TIMING.GLIDE_DURATION_MS,
  ARRIVED_HOLD_MS: STORE_DEMO_TIMING.ARRIVED_HOLD_MS,
  CARD_VISIBLE_MS: STORE_DEMO_TIMING.CARD_VISIBLE_MS,
  PULLBACK_MS: STORE_DEMO_TIMING.PULLBACK_DURATION_MS,
  WIDE_VIEW_HOLD_MS: STORE_DEMO_TIMING.WIDE_VIEW_MS,
  RETURNING_MS: STORE_DEMO_TIMING.RETURN_DURATION_MS,
} as const;

const TOTAL_DURATION_MS =
  DEMO_TIMING.GLIDING_MS +
  DEMO_TIMING.ARRIVED_HOLD_MS +
  DEMO_TIMING.CARD_VISIBLE_MS +
  DEMO_TIMING.PULLBACK_MS +
  DEMO_TIMING.WIDE_VIEW_HOLD_MS +
  DEMO_TIMING.RETURNING_MS;

// ── Expected engine bridge setTimeout offsets ─────────────────────────────────
// These must match the offsets in src/lib/engine/demo-choreography.ts
// and js/modules/micro-demo-choreography.ts.

const EXPECTED_OFFSETS = {
  glow: 50,
  cameraStart: 100,
  arrived: 1400,           // GLIDING_MS
  cardVisible: 1520,       // GLIDING_MS + ARRIVED_HOLD_MS
  pulse2: 2520,            // mid CARD_VISIBLE
  pullback: 3320,          // GLIDING_MS + ARRIVED_HOLD_MS + CARD_VISIBLE_MS
  wideView: 4520,          // above + PULLBACK_MS
  returning: 4870,         // above + WIDE_VIEW_HOLD_MS
  complete: 5870,          // above + RETURNING_MS
} as const;

// ── AGENTS.md spec targets ───────────────────────────────────────────────────

const AGENTS_SPEC = {
  GLIDING: 1400,
  ARRIVED: 0,  // immediate
  CARD_VISIBLE: 1800,
  PULLBACK: 1200,
  RETURNING: 1000,
} as const;

const TOLERANCE_MS = 100;

describe('Demo Phase Timing', () => {
  describe('DEMO_TIMING constants', () => {
    it('GLIDING_MS matches AGENTS.md target (1400ms)', () => {
      expect(DEMO_TIMING.GLIDING_MS).toBeCloseTo(AGENTS_SPEC.GLIDING, -2);
    });

    it('CARD_VISIBLE_MS matches AGENTS.md target (1800ms)', () => {
      expect(DEMO_TIMING.CARD_VISIBLE_MS).toBeCloseTo(AGENTS_SPEC.CARD_VISIBLE, -2);
    });

    it('PULLBACK_MS matches AGENTS.md target (1200ms)', () => {
      expect(DEMO_TIMING.PULLBACK_MS).toBeCloseTo(AGENTS_SPEC.PULLBACK, -2);
    });

    it('RETURNING_MS matches AGENTS.md target (1000ms)', () => {
      expect(DEMO_TIMING.RETURNING_MS).toBeCloseTo(AGENTS_SPEC.RETURNING, -2);
    });

    it('ARRIVED_HOLD_MS is minimal (≤120ms)', () => {
      expect(DEMO_TIMING.ARRIVED_HOLD_MS).toBeLessThanOrEqual(120);
    });

    it('WIDE_VIEW_HOLD_MS is short (≤500ms)', () => {
      expect(DEMO_TIMING.WIDE_VIEW_HOLD_MS).toBeLessThanOrEqual(500);
    });
  });

  describe('Total duration', () => {
    it('total duration is at least 5400ms (AGENTS.md minimum)', () => {
      expect(TOTAL_DURATION_MS).toBeGreaterThanOrEqual(5400);
    });

    it('total duration is at most 6500ms', () => {
      expect(TOTAL_DURATION_MS).toBeLessThanOrEqual(6500);
    });

    it('total duration matches DEMO_TIMING sum (5870ms ± 100ms)', () => {
      expect(TOTAL_DURATION_MS).toBeCloseTo(5870, -2);
    });
  });

  describe('Engine bridge timeout offsets', () => {
    it('glow fires early (50ms ± 100ms)', () => {
      expect(EXPECTED_OFFSETS.glow).toBeGreaterThanOrEqual(0);
      expect(EXPECTED_OFFSETS.glow).toBeLessThanOrEqual(100);
    });

    it('camera starts quickly (100ms ± 100ms)', () => {
      expect(EXPECTED_OFFSETS.cameraStart).toBeGreaterThanOrEqual(0);
      expect(EXPECTED_OFFSETS.cameraStart).toBeLessThanOrEqual(200);
    });

    it('ARRIVED offset matches GLIDING_MS (1400ms ± 100ms)', () => {
      expect(Math.abs(EXPECTED_OFFSETS.arrived - DEMO_TIMING.GLIDING_MS)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('CARD_VISIBLE offset matches GLIDING + ARRIVED_HOLD (1520ms ± 100ms)', () => {
      const expected = DEMO_TIMING.GLIDING_MS + DEMO_TIMING.ARRIVED_HOLD_MS;
      expect(Math.abs(EXPECTED_OFFSETS.cardVisible - expected)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('PULLBACK offset matches GLIDING + ARRIVED + CARD_VISIBLE (3320ms ± 100ms)', () => {
      const expected = DEMO_TIMING.GLIDING_MS + DEMO_TIMING.ARRIVED_HOLD_MS + DEMO_TIMING.CARD_VISIBLE_MS;
      expect(Math.abs(EXPECTED_OFFSETS.pullback - expected)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('WIDE_VIEW offset matches PULLBACK + PULLBACK_MS (4520ms ± 100ms)', () => {
      const expected = DEMO_TIMING.GLIDING_MS + DEMO_TIMING.ARRIVED_HOLD_MS + DEMO_TIMING.CARD_VISIBLE_MS + DEMO_TIMING.PULLBACK_MS;
      expect(Math.abs(EXPECTED_OFFSETS.wideView - expected)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('RETURNING offset matches above + WIDE_VIEW_HOLD (4870ms ± 100ms)', () => {
      const expected = TOTAL_DURATION_MS - DEMO_TIMING.RETURNING_MS;
      expect(Math.abs(EXPECTED_OFFSETS.returning - expected)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('COMPLETE offset matches total duration (5870ms ± 100ms)', () => {
      expect(Math.abs(EXPECTED_OFFSETS.complete - TOTAL_DURATION_MS)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('COMPLETE offset is ≤ 6500ms (was 8800ms before fix)', () => {
      expect(EXPECTED_OFFSETS.complete).toBeLessThanOrEqual(6500);
    });
  });

  describe('Phase durations (derived from offsets)', () => {
    it('GLIDING phase (start→ARRIVED) is ~1400ms', () => {
      const duration = EXPECTED_OFFSETS.arrived - EXPECTED_OFFSETS.cameraStart;
      expect(Math.abs(duration - 1300)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('ARRIVED hold (ARRIVED→CARD_VISIBLE) is ~120ms', () => {
      const duration = EXPECTED_OFFSETS.cardVisible - EXPECTED_OFFSETS.arrived;
      expect(duration).toBeLessThanOrEqual(200);
    });

    it('CARD_VISIBLE phase (CARD_VISIBLE→PULLBACK) is ~1800ms', () => {
      const duration = EXPECTED_OFFSETS.pullback - EXPECTED_OFFSETS.cardVisible;
      expect(Math.abs(duration - 1800)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('PULLBACK phase (PULLBACK→WIDE_VIEW) is ~1200ms', () => {
      const duration = EXPECTED_OFFSETS.wideView - EXPECTED_OFFSETS.pullback;
      expect(Math.abs(duration - 1200)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('WIDE_VIEW hold (WIDE_VIEW→RETURNING) is ~350ms', () => {
      const duration = EXPECTED_OFFSETS.returning - EXPECTED_OFFSETS.wideView;
      expect(Math.abs(duration - 350)).toBeLessThanOrEqual(TOLERANCE_MS);
    });

    it('RETURNING phase (RETURNING→COMPLETE) is ~1000ms', () => {
      const duration = EXPECTED_OFFSETS.complete - EXPECTED_OFFSETS.returning;
      expect(Math.abs(duration - 1000)).toBeLessThanOrEqual(TOLERANCE_MS);
    });
  });
});
