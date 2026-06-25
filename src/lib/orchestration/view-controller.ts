/**
 * @lib/orchestration/view-controller.ts — Galaxy ↔ Map view switching
 *
 * Port of: js/modules/view-controller.js
 *
 * Handles view transitions between galaxy (3D mycelium) and map (Leaflet terrain),
 * including terrain preludes, handoff overlays, button state sync, and camera choreography.
 * Uses navStore from @lib/stores/navigation for all state mutations.
 */

import { get } from 'svelte/store';
import { navStore, updateNavState } from '@lib/stores/navigation.svelte.ts';
import { animateCameraToTerrainPrelude } from '@lib/engine/camera-controls';
import { applyMapFlatteningLayout } from '@lib/utils/map-flattening-layout';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewName = 'galaxy' | 'map';

export interface SwitchViewOptions {
  /** Skip terrain prelude animation when transitioning to map. */
  skipTerrainPrelude?: boolean;
  /** Skip URL synchronization after view switch. */
  skipUrlSync?: boolean;
  /** Silent handoff — suppresses the handoff overlay. */
  silentHandoff?: boolean;
  /** Origin view for route layer handoff. */
  handoffFrom?: string;
  /** History mode for URL sync: 'push' or 'replace'. */
  historyMode?: 'push' | 'replace';
  /** Skip the view handoff overlay entirely. */
  skipHandoff?: boolean;
}

// ── Configuration ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAP_HANDOFF_PRELUDE_MS: 430,
  VIEW_HANDOFF_OUT_MS: 1200,
  SHOW_VIEW_HANDOFF_DISMISS_MS: 2200,
  TERRAIN_LANDING_SETTLE_MS: 1200,
  TERRAIN_LANDING_SETTLE_LONG_MS: 1800,
} as const;

// ── Internal State ────────────────────────────────────────────────────────────

let _viewSwitchPreludeTimer: ReturnType<typeof setTimeout> | null = null;
let _viewHandoffTimer: ReturnType<typeof setTimeout> | null = null;
let _refreshCompositionState: () => void = () => {};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the view controller adapter with external dependencies.
 */
export function initViewControllerAdapter(opts: { refreshCompositionState?: () => void } = {}): void {
  if (typeof opts.refreshCompositionState === 'function') {
    _refreshCompositionState = opts.refreshCompositionState;
  }
}

/**
 * Hide the view handoff overlay immediately.
 */
export function hideViewHandoff(): void {
  const handoff = document.getElementById('view-handoff');
  if (_viewHandoffTimer !== null) {
    clearTimeout(_viewHandoffTimer);
    _viewHandoffTimer = null;
  }
  // body.dataset.viewHandoffActive is owned by parity-attrs.svelte.ts.
  if (!handoff) return;
  handoff.classList.remove('active');
  handoff.setAttribute('aria-hidden', 'true');
}

/**
 * Show the view handoff overlay with icon/kicker/title/note from the handoff model.
 */
export function showViewHandoff(view: ViewName): void {
  const handoff = document.getElementById('view-handoff');
  if (!handoff) return;

  const model = getViewHandoffModel(view);
  const runeEl = document.getElementById('view-handoff-rune');
  const kickerEl = document.getElementById('view-handoff-kicker');
  const titleEl = document.getElementById('view-handoff-title');
  const noteEl = document.getElementById('view-handoff-note');

  if (runeEl) {
    // Build the SVG rune via DOM API to avoid innerHTML. semanticGuideIcon
    // returns a <svg> string with escaped label/icon; we replicate the same
    // output via createElementNS to keep the DOM API invariant.
    const iconId = model.icon
    const label = view === 'map' ? 'Map view' : 'Mycelium view'
    runeEl.replaceChildren()
    if (iconId) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.classList.add('ui-icon')
      svg.setAttribute('aria-hidden', label ? 'false' : 'true')
      if (label) svg.setAttribute('aria-label', label)
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
      use.setAttribute('href', `#icon-${iconId}`)
      svg.appendChild(use)
      runeEl.appendChild(svg)
    }
  }
  if (kickerEl) kickerEl.textContent = model.kicker;
  if (titleEl) titleEl.textContent = model.title;
  if (noteEl) noteEl.textContent = model.note;

  if (_viewHandoffTimer !== null) {
    clearTimeout(_viewHandoffTimer);
    _viewHandoffTimer = null;
  }

  handoff.setAttribute('aria-hidden', 'false');
  handoff.classList.add('active');
  // body.dataset.viewHandoffActive is owned by parity-attrs.svelte.ts.

  _viewHandoffTimer = setTimeout(() => {
    handoff.classList.remove('active');
    handoff.setAttribute('aria-hidden', 'true');
    // body.dataset.viewHandoffActive is owned by parity-attrs.svelte.ts.
    _viewHandoffTimer = null;
  }, CONFIG.SHOW_VIEW_HANDOFF_DISMISS_MS);
}

/**
 * Switch between galaxy and map view.
 *
 * Orchestrates:
 * - Terrain prelude animation (galaxy → map)
 * - Button active state sync
 * - Canvas/map container visibility
 * - Camera choreography
 * - URL sync
 * - Composition state refresh
 */
export function switchView(view: ViewName, options: SwitchViewOptions = {}): void {
  const $nav = get(navStore);
  const previousView = $nav.currentView;

  if (_viewSwitchPreludeTimer !== null) {
    clearTimeout(_viewSwitchPreludeTimer);
    _viewSwitchPreludeTimer = null;
    // Counter-switch detected: the in-flight handoff overlay from the
    // previous prelude is now stale — cancel it immediately so the
    // wrong "switching to map" overlay doesn't linger during a
    // galaxy→galaxy or map→galaxy reverse switch.
    hideViewHandoff();
  }

  // Terrain prelude: galaxy → map with animated flattening
  const shouldPreludeToMap =
    view === 'map' &&
    previousView === 'galaxy' &&
    !options.skipTerrainPrelude &&
    !options.skipUrlSync &&
    !options.silentHandoff;

  if (shouldPreludeToMap) {
    _startTerrainPrelude(view, options, $nav);
    return;
  }

  // Commit the view switch to the store
  updateNavState({ currentView: view });
  // body.dataset.viewMode / .activeView are owned by parity-attrs.ts.

  // Transition choreography class
  document.body.classList.add('view-transitioning');

  // Auto-remove transitioning class after animation
  setTimeout(() => {
    const current = get(navStore).currentView;
    if (current !== view) return; // Guard against rapid switching
    document.body.classList.remove('view-transitioning');
  }, CONFIG.VIEW_HANDOFF_OUT_MS);

  // Map-specific setup
  if (view === 'map') {
    hideViewHandoff();
  }

  // Leaving galaxy: clean up orphaned timers
  if (view !== 'galaxy') {
    _clearGalaxyTimers();
    applyMapFlatteningLayout(true);
  } else {
    applyMapFlatteningLayout(false);
  }

  // Button state sync
  _syncButtonState(view);

  // Container visibility
  _syncContainerVisibility(view);

  // URL sync
  if (!options.skipUrlSync) {
    _requestUrlSync('view');
  }

  // Composition + handoff
  _refreshCompositionState();
  if (!options.silentHandoff) {
    showViewHandoff(view);
  } else if (view === 'map') {
    hideViewHandoff();
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _startTerrainPrelude(
  _view: ViewName,
  options: SwitchViewOptions,
  _nav: ReturnType<typeof get>
): void {
  // Show the handoff overlay
  showViewHandoff('map');
  animateCameraToTerrainPrelude({ duration: CONFIG.MAP_HANDOFF_PRELUDE_MS });

  _viewSwitchPreludeTimer = setTimeout(() => {
    _viewSwitchPreludeTimer = null;
    const current = get(navStore).currentView;
    if (current !== 'galaxy') return;
    switchView('map', {
      ...options,
      skipTerrainPrelude: true,
      handoffFrom: options.handoffFrom,
    });
  }, CONFIG.MAP_HANDOFF_PRELUDE_MS);
}

function _clearGalaxyTimers(): void {
  // Legacy: clears clockTimer, weatherRefreshTimer, semanticLaneMonitorTimer, etc.
  // These are managed by their respective modules in the new architecture.
}

function _syncButtonState(view: ViewName): void {
  const btnGalaxy = document.getElementById('btn-galaxy');
  const btnMap = document.getElementById('btn-map');
  if (btnGalaxy) {
    btnGalaxy.classList.toggle('active', view === 'galaxy');
    btnGalaxy.setAttribute('aria-pressed', String(view === 'galaxy'));
  }
  if (btnMap) {
    btnMap.classList.toggle('active', view === 'map');
    btnMap.setAttribute('aria-pressed', String(view === 'map'));
  }
}

function _syncContainerVisibility(view: ViewName): void {
  const canvasContainer = document.getElementById('canvas-container');
  const mapContainer = document.getElementById('map-container');

  if (view === 'galaxy') {
    if (canvasContainer) canvasContainer.classList.remove('hidden');
    if (mapContainer) {
      mapContainer.classList.remove('active', 'arriving');
    }
  } else {
    if (canvasContainer) canvasContainer.classList.add('hidden');
    if (mapContainer) mapContainer.classList.add('active');
  }
}

function _requestUrlSync(reason: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('semantic:url-sync-requested', {
      detail: { params: {}, mode: 'push', reason },
    })
  );
}



// ── Handoff Model ─────────────────────────────────────────────────────────────

interface HandoffModel {
  icon: string;
  kicker: string;
  title: string;
  note: string;
}

/**
 * Returns the handoff overlay content model for the target view.
 */
export function getViewHandoffModel(view: ViewName): HandoffModel {
  if (view === 'map') {
    return {
      icon: 'map',
      kicker: 'Switching views',
      title: 'Entering map view',
      note: 'Geographic terrain is loading.',
    };
  }
  return {
    icon: 'mycelium',
    kicker: 'Switching views',
    title: 'Returning to mycelium',
    note: 'Semantic network is restoring.',
  };
}

// semanticGuideIcon is imported from @lib/journey/semantic-guide (uses SVG sprite <use href>)
