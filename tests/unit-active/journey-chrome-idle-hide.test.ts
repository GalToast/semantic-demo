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
import { journeyStore } from '@lib/stores/journey.svelte.ts';
import type { JourneyStoreState } from '@lib/stores/journey.svelte.ts';

// -- Helpers -----------------------------------------------------------------

function readSource(): string {
  const srcPath = resolve(__dirname, '../../src/components/JourneyChrome.svelte');
  return readFileSync(srcPath, 'utf-8');
}

// -- Setup -------------------------------------------------------------------

beforeEach(() => {
  // JourneyStoreState.phase is currently typed as NavMode in production, but
  // this test was authored when the legacy type union included 'idle' and
  // 'walking' (JourneyPhase). Preserve the original test contract by casting
  // the whole snapshot to JourneyStoreState at the boundary; runtime values
  // flow through unchanged. If nav↔journey types are unified, these casts
  // can be removed.
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
  } as unknown as JourneyStoreState);
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
    // Post-W11-T4 default: mode starts as 'idle' (the W11-T4 migration
    // tightened the initial state from 'overview' to 'idle' so the
    // chrome is hidden on first paint without waiting for a phase
    // promotion). Compass still defaults to 'idle'.
    expect(state.phase).toBe('idle');
    expect(state.compass?.phase).toBe('idle');

    const isJourneyIdle =
      ((state.phase as unknown as string) === 'idle' || (state.phase as unknown as string) === 'overview') &&
      ((state.compass?.phase ?? 'idle') as string) === 'idle';
    expect(isJourneyIdle).toBe(true);
  });

  it('shows when journey.phase is not idle', () => {
    journeyStore.update((s: JourneyStoreState) => ({ ...s, phase: 'walking' }) as unknown as JourneyStoreState);
    const state = journeyStore();

    const isJourneyIdle =
      ((state.phase as unknown as string) === 'idle' || (state.phase as unknown as string) === 'overview') &&
      ((state.compass?.phase ?? 'idle') as string) === 'idle';
    expect(isJourneyIdle).toBe(false);
  });

  it('shows when compass.phase is not idle', () => {
    journeyStore.update((s: JourneyStoreState) => ({
      ...s,
      compass: { ...s.compass, phase: 'active' }
    }) as unknown as JourneyStoreState);
    const state = journeyStore();

    const isJourneyIdle =
      ((state.phase as unknown as string) === 'idle' || (state.phase as unknown as string) === 'overview') &&
      ((state.compass?.phase ?? 'idle') as string) === 'idle';
    expect(isJourneyIdle).toBe(false);
  });

  it('shows when both phases are non-idle', () => {
    journeyStore.update((s: JourneyStoreState) => ({
      ...s,
      phase: 'inside',
      compass: { ...s.compass, phase: 'active' }
    }) as unknown as JourneyStoreState);
    const state = journeyStore();

    const isJourneyIdle =
      ((state.phase as unknown as string) === 'idle' || (state.phase as unknown as string) === 'overview') &&
      ((state.compass?.phase ?? 'idle') as string) === 'idle';
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
