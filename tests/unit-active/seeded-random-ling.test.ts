/**
 * seeded-random-ling.test.ts — Vitest coverage for src/lib/utils/seeded-random.ts
 *
 * seededUnit is the canonical deterministic pseudo-random hash used across the
 * 8,406-point mycelium data (state.rawPositionsBuffer as [0,1]^3 positions).
 * This file covers every exported symbol with at least 1 positive + 1 edge case.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore
import { seededUnit } from '@lib/utils/seeded-random'

describe('seededUnit — deterministic pseudo-random hash', () => {
  // ── Positive: deterministic reproducibility ──────────────────────────────

  it('returns the same value for the same (index, salt) pair across repeated calls', () => {
    const a = seededUnit(5, 42)
    const b = seededUnit(5, 42)
    expect(a).toBe(b)
  })

  // ── Positive: unit-cube invariant [0, 1) ───────────────────────────────

  it('returns a value in [0, 1) for typical index + salt', () => {
    const v = seededUnit(100, 7)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  // ── Positive: distinct (index, salt) → distinct values ─────────────────

  it('produces distinct outputs for different index values with the same salt', () => {
    const a = seededUnit(0, 0)
    const b = seededUnit(1, 0)
    expect(a).not.toBe(b)
  })

  it('produces distinct outputs for different salt values with the same index', () => {
    const a = seededUnit(10, 0)
    const b = seededUnit(10, 1)
    expect(a).not.toBe(b)
  })

  // ── Edge case: default salt (salt omitted → 0) ─────────────────────────

  it('defaults salt to 0 when omitted', () => {
    const withDefault = seededUnit(3)
    const explicit = seededUnit(3, 0)
    expect(withDefault).toBe(explicit)
  })

  // ── Edge case: index = 0 (lowest valid index) ─────────────────────────

  it('returns a valid [0, 1) value for index 0 with salt 0', () => {
    const v = seededUnit(0, 0)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  // ── Edge case: large index and salt ────────────────────────────────────

  it('stays bounded in [0, 1) for large index and salt values', () => {
    const v = seededUnit(999999, 999999)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  // ── Edge case: negative salt ───────────────────────────────────────────

  it('stays bounded in [0, 1) for negative salt', () => {
    const v = seededUnit(5, -100)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  // ── Edge case: float salt ──────────────────────────────────────────────

  it('stays bounded in [0, 1) for non-integer salt', () => {
    const v = seededUnit(7, 1.5)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
})
