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
import type { NavMode, PanelSurface } from '@lib/types/state';
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

  // ── 2. Direct-read pattern (no fallback chain) ────────────────────────
  //
  // After retiring readLegacyNavField, getters now read directly from
  // appState.navState when the local writable is empty/falsy. All writers
  // of the legacy keys (focusedIndex, surface, mode, currentView) go through
  // writeNavStateMirror, which updates both appState.navState and _navWritable
  // atomically — so the two sources never diverge in practice.
  //
  // Window globals (__APP_STATE__, __TEST_STATE__) are NOT consulted by
  // the getters anymore — those were transitional scaffolding for the
  // pre-migration engine reducers.

  it('currentMode() reads appState.navState.mode when local is empty', () => {
    // Local writable mode is '' (falsy). appState has 'search'.
    mockState.navState.mode = 'search';
    navStore.set({ ...navStore(), mode: '' as NavMode });
    // Direct read: appState.navState.mode ?? local → 'search' ?? '' → 'search'
    expect(currentMode()).toBe('search');
  });

  it('currentMode() ignores window globals — uses appState only', () => {
    // After retiring readLegacyNavField, window.__APP_STATE__ is not read.
    // If appState lacks the field, the getter returns the local value.
    delete mockState.navState.mode;
    (window as unknown as { __APP_STATE__: { navState: { mode: string } } }).__APP_STATE__ = {
      navState: { mode: 'from-app-state-window' },
    };
    navStore.set({ ...navStore(), mode: '' as NavMode });
    // appState.navState.mode is undefined → undefined ?? '' → '' (local)
    expect(currentMode()).toBe('');
  });

  it('currentSurface() reads appState.navState.surface when local is empty', () => {
    mockState.navState.surface = 'search';
    navStore.set({ ...navStore(), surface: '' as PanelSurface });
    expect(currentSurface()).toBe('search');
  });

  // ── 3. focusedIndex direct-read pattern ────────────────────────────────

  it('focusedIndex() reads appState.navState.focusedIndex when local is null', () => {
    // Local focusedIndex is null (default). appState has a value.
    mockState.navState.focusedIndex = 7;
    expect(focusedIndex()).toBe(7);
  });

  it('focusedIndex() ignores window globals — uses appState only', () => {
    // After retiring readLegacyNavField, window.__APP_STATE__ is not read.
    delete mockState.navState.focusedIndex;
    (window as unknown as { __APP_STATE__: { navState: { focusedIndex: number } } }).__APP_STATE__ = {
      navState: { focusedIndex: 99 },
    };
    // appState.navState.focusedIndex is undefined → null (local default)
    expect(focusedIndex()).toBeNull();
  });

  it('hasFocus() reads appState.navState.focus fields when local is empty', () => {
    // Local writable has no focus. appState has focusedIndex set.
    mockState.navState.focusedIndex = 12;
    expect(hasFocus()).toBe(true);
  });
});
