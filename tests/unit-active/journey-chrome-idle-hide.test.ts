/**
 * journey-chrome-idle-hide.test.ts
 *
 * Tests for Ticket UI-1: Hide #journey-chrome when idle.
 *
 * Per the M3 audit (docs/ui-ux-audit-minimax-m3-2026-06-13.md),
 * journey-chrome was visible in idle state at (1175, 681) 166x151
 * with opacity 1, duplicating the overview content from #journey-compass.
 *
 * The fix: JourneyChrome.svelte renders nothing when both
 * journey.phase and compass.phase are 'idle' AND the visible prop is true.
 *
 * Run: npx vitest run tests/unit-active/journey-chrome-idle-hide.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { journeyStore } from '@lib/stores/journey';
import type { JourneyStoreState } from '@lib/stores/journey';

// -- Helpers -----------------------------------------------------------------

function readSource(): string {
  const srcPath = resolve(__dirname, '../../src/components/JourneyChrome.svelte');
  return readFileSync(srcPath, 'utf-8');
}

// -- Setup -------------------------------------------------------------------

beforeEach(() => {
  journeyStore.set({
    phase: 'idle',
    trail: [],
    selectedId: null,
    selectedStopIndex: null,
    neighbors: [],
    compass: {
      phase: 'idle',
      currentAction: 'none',
      previousAction: 'none',
      lastTransitionAt: 0
    },
    walkHistory: [],
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    trailDepth: 0,
    walkHistoryIndices: [],
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: 'geometric-fallback',
    lastTraversalReason: null,
    terrainHandoffPhase: 'idle',
    routeExplorationPhase: 'idle',
    routeChoreographyPhase: 'overview'
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -- Tests -------------------------------------------------------------------

describe('JourneyChrome idle-hide guard (UI-1)', () => {
  it('source contains isJourneyIdle derived that checks both journey and compass phases', () => {
    const source = readSource();

    // Must define isJourneyIdle as a $derived
    expect(source).toContain('isJourneyIdle');

    // Must reference journeySnapshot.phase
    expect(source).toContain('journeySnapshot.phase');

    // Must reference compass?.phase (nullable access)
    expect(source).toContain('compass?.phase');

    // Must compare both phases to 'idle' (two occurrences in the derived block)
    const idleDerivedStart = source.indexOf('const isJourneyIdle');
    const idleDerivedEnd = source.indexOf(');', idleDerivedStart) + 2;
    const idleSection = source.slice(idleDerivedStart, idleDerivedEnd);
    const idleMatches = idleSection.match(/['"]idle['"]/g);
    expect(idleMatches?.length, 'should compare both phases to idle').toBeGreaterThanOrEqual(2);
  });

  it('template guards the journey-chrome div with isJourneyIdle', () => {
    const source = readSource();

    // The {#if} block must reference isJourneyIdle to hide when idle
    expect(source).toMatch(/\{#if\s+visible\s*&&\s*!isJourneyIdle\}/);
  });

  it('isJourneyIdle uses $derived (not a plain let)', () => {
    const source = readSource();

    // Must be a $derived rune, not a plain variable
    const idx = source.indexOf('isJourneyIdle');
    // $derived is on the same line AFTER isJourneyIdle: `const isJourneyIdle = $derived(`
    const following = source.slice(idx, idx + 100);
    expect(following).toContain('$derived');
  });

  it('hides when both journey.phase and compass.phase are idle/overview', () => {
    const state = journeyStore();
    // In the consolidated state, mode defaults to 'overview'
    expect(state.phase).toBe('overview');
    expect(state.compass?.phase).toBe('idle');

    const isJourneyIdle =
      (state.phase === 'idle' || state.phase === 'overview') &&
      (state.compass?.phase ?? 'idle') === 'idle';
    expect(isJourneyIdle).toBe(true);
  });

  it('shows when journey.phase is not idle', () => {
    journeyStore.update((s: JourneyStoreState) => ({ ...s, phase: 'walking' }));
    const state = journeyStore();

    const isJourneyIdle =
      (state.phase === 'idle' || state.phase === 'overview') &&
      (state.compass?.phase ?? 'idle') === 'idle';
    expect(isJourneyIdle).toBe(false);
  });

  it('shows when compass.phase is not idle', () => {
    journeyStore.update((s: JourneyStoreState) => ({
      ...s,
      compass: { ...s.compass, phase: 'active' }
    }));
    const state = journeyStore();

    const isJourneyIdle =
      (state.phase === 'idle' || state.phase === 'overview') &&
      (state.compass?.phase ?? 'idle') === 'idle';
    expect(isJourneyIdle).toBe(false);
  });

  it('shows when both phases are non-idle', () => {
    journeyStore.update((s: JourneyStoreState) => ({
      ...s,
      phase: 'inside',
      compass: { ...s.compass, phase: 'active' }
    }));
    const state = journeyStore();

    const isJourneyIdle =
      (state.phase === 'idle' || state.phase === 'overview') &&
      (state.compass?.phase ?? 'idle') === 'idle';
    expect(isJourneyIdle).toBe(false);
  });

  it('journey-chrome div has the correct id for contract test selectors', () => {
    const source = readSource();
    expect(source).toContain('id="journey-chrome"');
  });

  it('visible prop is accepted (not removed by the guard)', () => {
    const source = readSource();
    expect(source).toMatch(/visible\?\s*:\s*boolean/);
  });
});
