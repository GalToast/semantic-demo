/**
 * @lib/ui/loading.ts — Loading overlay phases
 *
 * Port of: js/modules/loading-ui.js
 *
 * Manages the loading overlay lifecycle: phase transitions, progress updates,
 * deferred hydration, weather init, and error state display.
 * Keeps navStore and data-store loading phase state aligned.
 */

import { setLoadingPhase as setNavLoadingPhase } from '@lib/stores/navigation';
import { setLoadingPhase as setDataLoadingPhase } from '@lib/data-store';
import type { LoadingPhase, LoadingPhaseMeta } from '@lib/types/state';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoadingOverrides {
  note?: string;
  foot?: string;
  progress?: number;
}

// ── Configuration ─────────────────────────────────────────────────────────────

const LOADING_MIN_VISIBLE_MS = 1320;

const LOADING_PHASE_META: Record<string, LoadingPhaseMeta> = {
  records: { progress: 0.2, note: 'Gathering records...', foot: 'County records are arriving first.' },
  scene: { progress: 0.48, note: 'Raising the cloud...', foot: 'Shaping the scene.' },
  restore: { progress: 0.76, note: 'Restoring view...', foot: 'Restoring last known path.' },
  launch: { progress: 1, note: 'Awake.', foot: 'Threads are live.' },
};

const PHASE_ORDER: readonly string[] = ['records', 'scene', 'restore', 'launch'];

const SCENE_READY_EVENT = 'semantic:scene-ready';

// ── Internal State ────────────────────────────────────────────────────────────

let _hideToken = 0;
let _loadingOverlayStartedAt = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Set the loading overlay to a specific phase with optional text overrides.
 *
 * Updates:
 * - The navStore loadingPhaseKey
 * - Body data attributes for CSS state machine
 * - Overlay DOM (note, foot, progress bar)
 * - Phase chip active/complete states
 */
export function setLoadingPhase(phaseKey: string, overrides: LoadingOverrides = {}): void {
  _hideToken++;
  _loadingOverlayStartedAt = performance.now();

  // Update the store
  setNavLoadingPhase(phaseKey);
  setDataLoadingPhase((PHASE_ORDER.includes(phaseKey) ? phaseKey : 'records') as LoadingPhase);

  // Update body data attributes
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.loadingPhase = phaseKey;
    document.body.dataset.loadingOverlay = 'active';
    delete document.body.dataset.sceneReady;
  }

  // Get phase metadata
  const phase: LoadingPhaseMeta = LOADING_PHASE_META[phaseKey] ?? LOADING_PHASE_META.records!;

  // Update overlay DOM
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.hidden = false;
    overlay.inert = false;
    overlay.removeAttribute('aria-hidden');
    overlay.classList.remove('hidden', 'launching');
    overlay.dataset.loadingPhase = phaseKey;
    overlay.dataset.loadingState = 'active';
  }

  const noteEl = document.getElementById('loading-note');
  const footEl = document.getElementById('loading-foot');
  const progressBar = document.getElementById('loading-progress-bar');

  if (noteEl) noteEl.textContent = overrides.note || phase.note;
  if (footEl) footEl.textContent = overrides.foot || phase.foot;
  if (progressBar) {
    const progress = overrides.progress ?? phase.progress;
    progressBar.style.width = `${Math.round(progress * 100)}%`;
  }

  // Update phase chips
  _updatePhaseChips(phaseKey);
}

/**
 * Hide the loading overlay with a minimum visible duration gate
 * and a smooth launch transition.
 */
export async function hideLoadingOverlay(): Promise<void> {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;

  // Wait for minimum visible duration
  const elapsed = performance.now() - _loadingOverlayStartedAt;
  const remaining = Math.max(0, LOADING_MIN_VISIBLE_MS - elapsed);
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }

  // Transition: launching → hidden
  overlay.dataset.loadingState = 'launching';
  overlay.classList.add('launching');
  await new Promise<void>((resolve) => setTimeout(resolve, 180));

  overlay.classList.add('hidden');
  overlay.dataset.loadingState = 'hidden';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.inert = true;
  overlay.hidden = true;

  // Update body data attributes
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.loadingOverlay = 'hidden';
    document.body.dataset.sceneReady = 'true';
  }

  // Dispatch scene ready event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SCENE_READY_EVENT));
  }
}

/**
 * Start deferred hydration — runs non-critical initialization
 * (semantic threads, mycelium, filters, weather) during idle time.
 */
export function startDeferredHydration(): void {
  const run = async (): Promise<void> => {
    // TODO: Port loadSemanticThreads, applyFilters, createMycelium from legacy modules
    // These will be called via the engine bridge during phased migration.

    scheduleWeatherHydration();
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(run, { timeout: 250 });
  } else {
    setTimeout(run, 80);
  }
}

/**
 * Schedule weather initialization during idle time.
 */
export function scheduleWeatherHydration(): void {
  // TODO: Check weatherInitialized flag from legacy state
  const start = (): void => {
    // TODO: Port initWeather from js/modules/weather.js
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(start, { timeout: 500 });
  } else {
    setTimeout(start, 300);
  }
}

/**
 * Display the loading overlay in an error state with a user-facing message.
 */
export function applyLoadingErrorState(error: Error): void {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;

  const escapedMessage = _escapeHtml(error?.message || 'Initialization failed');

  overlay.innerHTML = `
    <div class="loading-shell" role="alert">
      <div class="loading-kicker">Graph unavailable</div>
      <div class="loading-title">Failed to load county records</div>
      <div class="loading-note">The Semantic Explorer is offline or blocked right now. Refresh after the connection recovers.</div>
      <div class="loading-foot">${escapedMessage}</div>
    </div>
  `;
  overlay.hidden = false;
  overlay.inert = false;
  overlay.removeAttribute('aria-hidden');
  overlay.classList.remove('hidden', 'launching');
  overlay.dataset.loadingState = 'error';
}

// ── Terrain Prelude ───────────────────────────────────────────────────────────

/**
 * Show the terrain prelude overlay (map-prelude transition phase).
 */
export function showTerrainPreludeOverlay(): void {
  setLoadingPhase('restore', {
    note: 'Preparing terrain...',
    foot: 'Synchronizing semantic space to geographic map.',
  });
}

/**
 * Hide the terrain prelude overlay.
 */
export function hideTerrainPreludeOverlay(): void {
  hideLoadingOverlay();
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _updatePhaseChips(activePhase: string): void {
  if (typeof document === 'undefined') return;

  document.querySelectorAll<HTMLElement>('.loading-phase-chip[data-loading-phase]').forEach((chip) => {
    const chipPhase = chip.getAttribute('data-loading-phase');
    if (!chipPhase) return;

    const activeIndex = PHASE_ORDER.indexOf(activePhase);
    const chipPhaseIndex = PHASE_ORDER.indexOf(chipPhase);

    chip.classList.toggle('is-active', chipPhase === activePhase);
    chip.classList.toggle('is-complete', chipPhaseIndex > -1 && activeIndex > chipPhaseIndex);
  });
}

function _escapeHtml(str: string): string {
  if (typeof document === 'undefined') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
