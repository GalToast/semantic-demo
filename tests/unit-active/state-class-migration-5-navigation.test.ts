/**
 * navigation-state-class-migration.test.ts
 *
 * Verified T4-template test for the navigation store's read paths.
 * Validates the canonical migration shape:
 *   1. Local Svelte store (writable) is the write-path target
 *   2. `readLegacyNavField` reads appState first, then falls back to
 *      window.__APP_STATE__ → window.__TEST_STATE__ → window.__semanticState
 *      → window.state (in priority order)
 *   3. Public getters prefer the local store; if local is empty/falsy,
 *      they fall through to readLegacyNavField
 *
 * This test DOES NOT use Svelte 5 `$state` runes (test files end in .ts,
 * not .svelte.ts). The appState mock is a plain object that the test
 * mutates to simulate state-class transitions.
 *
 * Pattern contract:
 *   - vi.hoisted() exposes a plain object the test can mutate
 *   - vi.mock() provides a stub for `@lib/state/app.svelte.ts` that
 *     exposes a getter returning the hoisted object
 *   - Tests verify getter behavior under various appState/window state combos
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mock factory for appState (plain JS, no runes) ────────────────────────────
//
// The hoisted factory runs before vi.mock is hoisted, so the mock state
// is available inside the vi.mock factory. The hoisted object is mutated
// in tests to simulate state-class transitions; the mock returns it as
// the `navState` field, so the production read path sees the changes.

const mockState = vi.hoisted(() => ({
  navState: {
    mode: 'overview',
    surface: 'idle',
    previousSurface: 'idle',
    focusedIndex: null as number | null,
    trailDepth: 0,
    currentView: 'galaxy',
    myceliumMode: 'default',
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: null,
  } as Record<string, unknown>,
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get navState() { return mockState.navState; },
    set navState(value: Record<string, unknown>) { mockState.navState = value; },
    withMutation: (fn: () => unknown) => fn(),
    selectedPoint: null,
    inspectedThreadIndex: null,
    pinnedThreadIndex: null,
    nodesAreSettling: false,
    pocketMotionByIndex: null,
    pocketTransitionStartedAt: 0,
    infoPanelOpen: false,
    pocketListVisible: false,
    focusTransitionMode: 'none',
    focusTransitionStartedAt: 0,
    focusOrbitSlackState: {},
    inspectedStrandDiagnostics: { active: false, source: 'none', segmentCount: 0, braidCount: 0, endpointCount: 0 },
    threadInspectorPointerInside: false,
  },
}));

// Import the store AFTER the mock is set up so it sees the stubbed appState.
import {
  currentMode,
  currentSurface,
  currentView,
  hasFocus,
  focusedIndex,
  resetNavState,
  setNavMode,
  navStore,
} from '@lib/stores/navigation.svelte.ts';

describe('Navigation store — T4 migration to Svelte 5 state class', () => {
  beforeEach(() => {
    // Reset store to initial state (clears the local writable).
    resetNavState();
    // Clear legacy fallback paths.
    delete (window as unknown as Record<string, unknown>).__APP_STATE__;
    delete (window as unknown as Record<string, unknown>).__TEST_STATE__;
    delete (window as unknown as Record<string, unknown>).__semanticState;
    delete (window as unknown as Record<string, unknown>).state;
    // Reset mock appState to defaults.
    mockState.navState = {
      mode: 'overview',
      surface: 'idle',
      previousSurface: 'idle',
      focusedIndex: null,
      trailDepth: 0,
      currentView: 'galaxy',
      myceliumMode: 'default',
      focusPocketIndices: [],
      focusPocketMeta: null,
      focusPocketRoleByIndex: null,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Local store drives getters when set ─────────────────────────────

  it('currentMode() reads from local store after setNavMode', () => {
    setNavMode('search');
    expect(currentMode()).toBe('search');
  });

  it('currentSurface() reads from local store after setNavMode', () => {
    setNavMode('focus');
    expect(currentSurface()).not.toBe('');
  });

  it('focusedIndex() returns null when local is null', () => {
    expect(focusedIndex()).toBeNull();
  });

  it('currentView() reads from local store default', () => {
    expect(currentView()).toBe('galaxy');
  });

  it('hasFocus() returns false when local mode is overview and focusedIndex is null', () => {
    expect(hasFocus()).toBe(false);
  });

  it('hasFocus() returns true when local focusedIndex is set', () => {
    navStore.update((s) => ({ ...s, focusedIndex: 42 }));
    expect(hasFocus()).toBe(true);
  });

  // ── 2. readLegacyNavField priority chain (appState first) ──────────────

  it('readLegacyNavField prefers appState over window globals (mode)', () => {
    // Set both: appState has 'search', window.__APP_STATE__ has 'overview'.
    mockState.navState.mode = 'search';
    (window as unknown as { __APP_STATE__: { navState: { mode: string } } }).__APP_STATE__ = {
      navState: { mode: 'overview' },
    };
    // Setting local to empty triggers fallback through readLegacyNavField.
    // currentMode returns local || readLegacyNavField('mode') || local.
    // With local set to 'overview' (default), currentMode returns 'overview'.
    // To test the fallback path, we mutate the local store to clear mode.
    navStore.set({ ...navStore(), mode: '' });
    // Now local mode is '' (falsy), so fallback runs. appState wins.
    expect(currentMode()).toBe('search');
  });

  it('readLegacyNavField falls back to window.__APP_STATE__ when appState lacks field', () => {
    // appState has no 'mode' field; legacy window has it.
    delete mockState.navState.mode;
    (window as unknown as { __APP_STATE__: { navState: { mode: string } } }).__APP_STATE__ = {
      navState: { mode: 'from-app-state-window' },
    };
    navStore.set({ ...navStore(), mode: '' });
    expect(currentMode()).toBe('from-app-state-window');
  });

  it('readLegacyNavField falls back to window.__TEST_STATE__ when __APP_STATE__ is empty', () => {
    delete mockState.navState.mode;
    (window as unknown as { __TEST_STATE__: { navState: { mode: string } } }).__TEST_STATE__ = {
      navState: { mode: 'from-test-state-window' },
    };
    navStore.set({ ...navStore(), mode: '' });
    expect(currentMode()).toBe('from-test-state-window');
  });

  // ── 3. focusedIndex fallback path ──────────────────────────────────────

  it('focusedIndex() falls back to appState when local is null', () => {
    // Local focusedIndex is null (default). appState has a value.
    mockState.navState.focusedIndex = 7;
    expect(focusedIndex()).toBe(7);
  });

  it('focusedIndex() falls back to window.__APP_STATE__ when appState lacks it', () => {
    delete mockState.navState.focusedIndex;
    (window as unknown as { __APP_STATE__: { navState: { focusedIndex: number } } }).__APP_STATE__ = {
      navState: { focusedIndex: 99 },
    };
    expect(focusedIndex()).toBe(99);
  });
});
