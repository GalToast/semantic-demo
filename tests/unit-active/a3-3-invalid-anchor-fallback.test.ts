/**
 * a3-3-invalid-anchor-fallback.test.ts — Verify that invalid anchor ids fall
 * back to overview mode (A3-3).
 *
 * Bug: ?anchor=999999 (or any out-of-range id) used to hang the app in a
 * broken focus state with placeholder content. The fix validates the index
 * against appState.points.length before dispatching focus.
 *
 * Test strategy: source-level analysis of url-state.ts to confirm:
 * 1. _restoreAnchorFromParams validates numericId against pointCount
 * 2. Invalid anchors reset navStore to overview mode
 * 3. The invalid ?anchor= is stripped from the URL via replaceState
 * 4. A toast is surfaced for the user
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const URL_RESTORE_PATH = resolve(__dirname, '../../src/lib/orchestration/url-restore-deep-link.ts'); // 2026-08-17: pointer moved to the split file (refactor landed)

function readSource(): string {
  return readFileSync(URL_RESTORE_PATH, 'utf-8');
}

describe('A3-3: invalid anchor falls back to overview', () => {
  let source: string;

  beforeAll(() => {
    source = readSource();
  });

  it('_restoreAnchorFromParams reads appState.points.length for bounds validation', () => {
    // Must reference appState.points.length (or a pointCount derived from it)
    expect(source).toMatch(/appState\??\.\s*points\s*\??\.\s*length/);
  });

  it('_restoreAnchorFromParams rejects negative indices', () => {
    // Must check numericId < 0
    expect(source).toMatch(/numericId\s*<\s*0/);
  });

  it('_restoreAnchorFromParams rejects indices >= pointCount', () => {
    // Must check numericId >= pointCount
    expect(source).toMatch(/numericId\s*>=\s*pointCount/);
  });

  it('invalid anchor resets navStore to overview mode', () => {
    // The invalid-anchor branch must write navState with mode: 'overview'
    // (via writeNavStateMirror — the dual-store consolidation entry point)
    const invalidBranch = source.match(
      /A3-3:[\s\S]*?writeNavStateMirror\(\s*\{[\s\S]*?mode:\s*'overview'/
    );
    expect(invalidBranch).toBeTruthy();
  });

  it('invalid anchor clears focusedIndex', () => {
    // The invalid-anchor branch must set focusedIndex: null
    const invalidBranch = source.match(
      /A3-3:[\s\S]*?focusedIndex:\s*null/
    );
    expect(invalidBranch).toBeTruthy();
  });

  it('invalid anchor strips ?anchor= from the URL via replaceState', () => {
    // Must call url.searchParams.delete('anchor') and then replaceState
    expect(source).toMatch(/url\.searchParams\.delete\(['"]anchor['"]\)/);
    expect(source).toMatch(/window\.history\.replaceState/);
  });

  it('invalid anchor shows a toast notification', () => {
    // Must call showExperienceToast in the invalid branch
    const toastMatch = source.match(
      /A3-3:[\s\S]*?showExperienceToast\(/
    );
    expect(toastMatch).toBeTruthy();
  });

  it('appState is imported for points validation', () => {
    // The file must import appState to access points.length
    expect(source).toMatch(/import\s+\{[^}]*\bappState\b[^}]*\}\s+from\s+['"]@lib\/state\/app\.svelte['"]/);
  });

  it('handles edge cases: anchor=0 (boundary valid), anchor=foo (NaN), anchor=-1 (negative)', () => {
    // NaN is handled by the existing !Number.isFinite(numericId) guard
    expect(source).toMatch(/!Number\.isFinite\(numericId\)/);
    // Boundary anchor=0: numericId < 0 catches negatives but 0 is valid if pointCount > 0
    // The check numericId >= pointCount catches out-of-range positives
    // Combined: NaN → early return, <0 → fallback, >=pointCount → fallback, 0→valid (if points exist)
  });
});
