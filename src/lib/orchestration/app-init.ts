/**
 * @lib/orchestration/app-init.ts — Svelte-first app initialization orchestration
 *
 * Replaces the init() from js/modules/app.ts for the Svelte shell.
 *
 * Coordinates the startup sequence:
 *   1. Safety valve timers (detect stuck loading overlay)
 *   2. Data loading (delegates to initData from data-store)
 *   3. URL state application (after data loads)
 *   4. Window globals for Playwright test compat (__APP_STATE__, __APP_ACTIONS__)
 *   5. WebGL context restore handler
 *   6. First-paint coordination (scene reveal, hide overlay, deferred hydration, demo)
 *
 * The engine bridge (Canvas.svelte) handles WebGL/Three.js initialization.
 * The LoadingOverlay and DemoChoreography components handle their own
 * visibility reactively from stores. This module provides the top-level
 * orchestration glue.
 */

import { get } from 'svelte/store';
import { initData, setLoadingPhase } from '@lib/data-store.svelte';
import { navStore } from '@lib/stores/navigation.svelte';
import { focusStore } from '@lib/stores/focus.svelte';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

interface SafetyTimers {
  slowProgress: ReturnType<typeof setTimeout>;
  safetyValve: ReturnType<typeof setTimeout>;
}

interface AppInitOptions {
  /** Force demo to run regardless of eligibility */
  forceDemo?: boolean;
  /** Suppress demo entirely */
  noDemo?: boolean;
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * After the lazy-load fix, blocking init is well under 4s on a healthy
 * network. The slow-progress threshold drops from 8s to 4s so the
 * "still preparing" UI surfaces earlier.
 */
const SLOW_PROGRESS_MS = 4000;

/**
 * The 15s safety valve is a last-resort fallback for genuinely broken
 * networks. Shows error state if the overlay is still visible.
 */
const SAFETY_VALVE_MS = 15_000;

// ── Internal State ───────────────────────────────────────────────────────────

let _initCalled = false;
let _safetyTimers: SafetyTimers | null = null;
let _unsubWindowGlobals: (() => void) | null = null;

// ── Safety Valves ────────────────────────────────────────────────────────────

function setupSafetyValves(): SafetyTimers {
  const slowProgress = setTimeout(() => {
    if (typeof document === 'undefined') return;
    const overlay = document.getElementById('loading-overlay');
    if (overlay?.classList.contains('hidden')) return;

    setLoadingPhase('restore');
    // Push overrides via DOM (matches legacy setLoadingPhase override pattern)
    const noteEl = document.getElementById('loading-note');
    const footEl = document.getElementById('loading-foot');
    if (noteEl) noteEl.textContent = 'Still preparing the scene…';
    if (footEl) footEl.textContent = 'Taking longer than usual. Hold on a moment longer.';
  }, SLOW_PROGRESS_MS);

  const safetyValve = setTimeout(() => {
    if (typeof document === 'undefined') return;
    const overlay = document.getElementById('loading-overlay');
    if (overlay?.classList.contains('hidden')) return;

    if (!overlay) return;
    console.error(
      '[app-init] Safety valve: loading overlay stuck after 15s. Showing error state.'
    );

    // Apply error state to the overlay (matches legacy applyLoadingErrorState)
    overlay.innerHTML = `
      <div class="loading-shell" role="alert">
        <div class="loading-kicker">Graph unavailable</div>
        <div class="loading-title">Failed to load</div>
        <div class="loading-note">Initialization timed out after 15 seconds. Refresh after the connection recovers.</div>
        <div class="loading-foot">Safety valve triggered.</div>
      </div>
    `;
    overlay.hidden = false;
    overlay.inert = false;
    overlay.removeAttribute('aria-hidden');
    overlay.classList.remove('hidden', 'launching');
    overlay.dataset.loadingState = 'error';
  }, SAFETY_VALVE_MS);

  return { slowProgress, safetyValve };
}

function clearSafetyTimers(timers: SafetyTimers | null): void {
  if (timers?.slowProgress) clearTimeout(timers.slowProgress);
  if (timers?.safetyValve) clearTimeout(timers.safetyValve);
}

// ── Window Globals for Test Compat ───────────────────────────────────────────

/**
 * Install window globals expected by Playwright surface tests and
 * visual audit harnesses. The testState derived store is the Svelte-native
 * source of truth; __TEST_STATE__ is synced via subscription in main.ts.
 *
 * __APP_STATE__ exposes the legacy state shape for backward compat with
 * contract tests that read window.__APP_STATE__.state.*.
 *
 * __APP_ACTIONS__ provides action handles for Playwright test automation.
 * Each action is a thin wrapper that delegates to the store or orchestration layer.
 */
function installWindowGlobals(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Expose a read-only snapshot of the current nav state for tests that
  // read window.__APP_STATE__ for mode/view/focus state.
  (window as any).__APP_STATE__ = {
    get state() {
      return {
        currentView: get(navStore).currentView,
        navState: get(navStore),
        activeFilters: focusStore(),
      };
    },
  };

  // __APP_ACTIONS__: action handles for Playwright test automation.
  // Lazy imports avoid pulling the full orchestration layer into the
  // top-level bundle.
  (window as any).__APP_ACTIONS__ = {
    switchView: async (view: string) => {
      const mod = await import('@lib/orchestration/view-controller');
      mod.switchView(view as any);
    },
    returnToOverview: async () => {
      const mod = await import('@lib/stores/lifecycle');
      mod.returnToOverview();
    },
  };

  // No cleanup needed — window globals persist for the page lifetime.
  return () => {
    delete (window as any).__APP_STATE__;
    delete (window as any).__APP_ACTIONS__;
  };
}

// ── URL State Application ────────────────────────────────────────────────────

/**
 * Apply URL state after data is loaded. The URL may contain navigation
 * params (view, focusedIndex, filters, search query) that need the data
 * layer to be ready before they can be resolved.
 */
async function applyUrlStateAfterData(): Promise<void> {
  try {
    const { applyUrlState } = await import('@lib/orchestration/url-state');
    await applyUrlState();
  } catch (err) {
    console.error('[app-init] applyUrlState failed during init:', err);
  }
}

// ── Main Init ────────────────────────────────────────────────────────────────

/**
 * Initialize the Svelte-first application.
 *
 * This is the single entry point for app initialization, called from main.ts.
 * It orchestrates the startup sequence:
 *   1. Safety valve timers
 *   2. Data loading (business records + semantic threads)
 *   3. URL state application
 *   4. Window globals for test compat
 *   5. First-paint coordination
 *
 * The engine bridge (Canvas.svelte) and UI components handle their own
 * initialization reactively. This module coordinates timing and error recovery.
 *
 * @returns A cleanup function that tears down listeners and timers.
 */
export async function appInit(options: AppInitOptions = {}): Promise<() => void> {
  if (_initCalled) {
    debugWarn('[app-init] init() called more than once; skipping.');
    return () => {};
  }
  _initCalled = true;

  const { forceDemo: _forceDemo = false, noDemo: _noDemo = false } = options;

  debugWarn('[app-init] Starting Svelte-first initialization…');

  // ── Phase 1: Safety valves ────────────────────────────────────────────────
  _safetyTimers = setupSafetyValves();

  // ── Phase 2: Window globals (immediate, before async work) ────────────────
  _unsubWindowGlobals = installWindowGlobals();

  // ── Phase 3: Data loading ─────────────────────────────────────────────────
  //
  // initData() is async and loads business records + semantic threads.
  // LoadingOverlay.svelte reads loadingPhaseStore reactively, so phase
  // transitions (records → scene → restore → launch) appear immediately.
  //
  // We don't await here — the data loads in the background while the engine
  // bridge initializes WebGL via Canvas.svelte. The URL state application
  // (Phase 4) awaits data readiness before running.
  const dataReadyPromise = initData().catch((err) => {
    console.error('[app-init] initData failed:', err);
    // Non-fatal: data-store sets error state; UI shows error overlay
  });

  // ── Phase 4: URL state (after data is ready) ──────────────────────────────
  //
  // URL state may reference focusedIndex, view, filters, or search query —
  // all of which need business data to be loaded. Awaiting dataReadyPromise
  // ensures the URL state can resolve against loaded records.
  await dataReadyPromise;
  await applyUrlStateAfterData();

  // ── Phase 5: First-paint coordination ─────────────────────────────────────
  //
  // The LoadingOverlay component hides itself when loadingPhaseStore = 'launch'.
  // The Canvas bridge fires onLoadingPhase('launch') once WebGL is ready.
  // DemoChoreography.svelte handles demo eligibility and choreography.
  //
  // The safety valve timer (Phase 1) is cleared once we reach this point.
  if (_safetyTimers) {
    clearSafetyTimers(_safetyTimers);
    _safetyTimers = null;
  }

  debugWarn('[app-init] Initialization orchestration complete.');

  // ── Return cleanup function ───────────────────────────────────────────────
  return () => {
    clearSafetyTimers(_safetyTimers);
    _safetyTimers = null;
    _unsubWindowGlobals?.();
    _initCalled = false;
  };
}

/**
 * Check whether the app initialization has been called.
 */
export function isAppInitComplete(): boolean {
  return _initCalled;
}
