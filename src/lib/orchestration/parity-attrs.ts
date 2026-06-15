/**
 * @lib/orchestration/parity-attrs.ts
 *
 * Single source of truth for the body data-* attributes that the legacy
 * production shell (vector-explorer-polished.html) requires for focus-search,
 * journey-compass, semantic-dive, navigation, viewport, and filter parity.
 *
 * The legacy app writes these attributes in many different modules:
 *   - js/modules/journey-compass-controller.js (updateJourneyCompass)
 *   - js/modules/semantic-dive-ui.js (syncSemanticDiveUi)
 *   - js/modules/composition-state.js (composeSemanticDive)
 *   - js/modules/lifecycle.js (setTrailDepth, setSemanticDiveMode)
 *   - js/modules/navigation-state.js (dispatchNavTransition)
 *   - js/modules/filter-state.js (toggleFilter, overwriteActiveFilters)
 *
 * The Svelte migration scatters the same writes across many stores via
 * inline `document.body.dataset.*` calls. That works in isolation, but
 *   1) it makes the legacy contract hard to audit (which attr is owned where)
 *   2) it leaves parity for the most-critical focus-search DOM hooks
 *      (#journey-compass, #btn-focus-dive) fragile and easy to drift.
 *
 * This module is the Svelte side's authoritative parity layer:
 *   - installParityAttributeSync() subscribes to all relevant stores once
 *   - On every relevant change, it writes the complete set of parity attrs
 *   - It also exposes getParityAttributeSnapshot() for tests
 *   - It does not own any state, it only mirrors existing store state to DOM
 *
 * Use this as the "parity contract" — if a body data-* attr is read by a
 * surface test, contract test, or visual QA, it should be listed here.
 *
 * This module is intentionally SSR-safe: every DOM write is guarded.
 */

// ── Store Imports (re-exported for consumers) ─────────────────────────────────

import { get } from 'svelte/store';
import { navStore } from '@lib/stores/navigation';
import type { NavState } from '@lib/types/state';
import { journeyStore } from '@lib/stores/journey';
import { focusStore } from '@lib/stores/focus';
import { searchStore } from '@lib/stores/search';
import { filterState } from '@lib/stores/filter';
import { viewport } from '@lib/stores/viewport';
import { cameraStore } from '@lib/stores/camera';
import { demoStore as demoPhaseStore } from '@lib/stores/demo';
import {
  loadingPhaseStore,
  graphicsModeStore
} from '@lib/data-store';
import {
  getJourneyCompassState
} from './compass-state';
import {
  getJourneyCompassPresentationState,
  type CompassPresentationState
} from './compass-controller';
import type { LoadingPhase } from '@lib/types/state';

// ── Attribute Manifest ──────────────────────────────────────────────────────
//
// Each entry maps a body data-attr key to its current desired value and a
// short description of who reads it. The manifest is exported so the focused
// test can assert that the parity layer covers everything the legacy shell
// expects.

export interface ParityAttributeDescriptor {
  /** Body data-attr key (without the `data-` prefix). */
  readonly key: string;
  /** What the value means / who reads it. */
  readonly description: string;
  /** Which store slice is the source of truth. */
  readonly source: string;
}

export const PARITY_ATTRIBUTES: readonly ParityAttributeDescriptor[] = [
  // Journey compass (legacy #journey-compass + .journey-compass CSS hooks)
  { key: 'journeyCompass', description: 'Legacy alias for journey compass lifecycle phase', source: 'compass.phase' },
  { key: 'journeyCompassPhase', description: 'Journey compass lifecycle phase (idle|checking|synthesizing|active|interrupted)', source: 'compass.phase' },
  { key: 'journeyCompassDensity', description: 'Compass density (hidden|compact|expanded)', source: 'compass.presentationState' },
  { key: 'journeyCompassCopy', description: 'Compass copy mode (quiet|full)', source: 'compass.presentationState' },
  { key: 'journeyNavigationOwner', description: 'Who owns navigation chrome (journey-compass|map-trail-strip|map-controls|scene|inside-walk)', source: 'compass.presentationState' },

  // Navigation (legacy navigation-state.js)
  { key: 'navMode', description: 'Navigation mode (overview|search|trail|focus|inside)', source: 'navStore.mode' },
  { key: 'navSurface', description: 'Navigation surface (idle|search|focus|focus-search|map|map-trail|map-focus|map-focus-search|inside|thread-inspect|semantic-dive)', source: 'navStore.surface' },
  { key: 'panelSurface', description: 'Mirrors navSurface; some legacy code reads this name', source: 'navStore.surface' },
  { key: 'panelSurfaceMode', description: 'Mode of the panel surface (focus-search|semantic-dive|...)', source: 'derived' },
  { key: 'activeView', description: 'Current view (galaxy|map)', source: 'navStore.currentView' },
  { key: 'viewMode', description: 'Mirrors activeView for legacy code', source: 'navStore.currentView' },
  { key: 'focusedNode', description: 'Currently focused node index, or removed when null', source: 'navStore.focusedIndex' },
  { key: 'graphContext', description: 'Graph context label (overview|counties|corridor|focus|inside|map)', source: 'derived' },
  { key: 'routeExploration', description: 'Route exploration phase', source: 'journeyStore.routeExplorationPhase' },

  // Trail (legacy lifecycle.js + setTrailDepth)
  { key: 'trailDepth', description: 'Current trail depth (0|1|2+)', source: 'journeyStore.depth' },
  { key: 'trailState', description: 'Trail state (inactive|active)', source: 'derived' },

  // Semantic dive (legacy semantic-dive-ui.js)
  { key: 'semanticDive', description: 'Semantic dive state (inactive|transitioning|active)', source: 'focusStore.semanticDiveMode' },
  { key: 'insideWalkState', description: 'Inside walk state (idle|walking|exploring|...)', source: 'focusStore.strandContinuityPhase' },

  // Focus transition (legacy camera-controls.js / focus.ts)
  { key: 'focusTransition', description: 'Focus transition mode (idle|entering|settling|inside|exiting)', source: 'focusStore.transitionMode' },

  // Search status (legacy lifecycle-modes.js / search-state.js)
  { key: 'searchStatus', description: 'Search lifecycle status (idle|searching|focusing|results|empty|error)', source: 'searchStore.status' },

  // Strand journey (legacy strand-continuity.js — CSS journey_steps.css reads data-strand-journey)
  { key: 'strandJourney', description: 'Strand journey phase (idle|preview|pinned|exploring|arrived|returning)', source: 'focusStore.strandContinuityPhase' },
  { key: 'threadInspect', description: 'Whether the thread inspector is active', source: 'focusStore.threadInspector' },
  { key: 'threadInspectSurface', description: 'Thread inspector surface owner (idle|rail|canvas|pinned|inside-cue)', source: 'focusStore.threadInspector' },
  { key: 'inspectedThreadIndex', description: 'Currently inspected thread index, or removed when inactive', source: 'focusStore.threadInspector' },

  // Journey phase
  { key: 'journeyPhase', description: 'Journey phase lifecycle (idle|overview|search|focus|inside|map|thread-inspect|walking|arriving|settling)', source: 'journeyStore.phase' },
  { key: 'terrainHandoff', description: 'Terrain handoff phase (idle|prelude|transition|settle)', source: 'journeyStore.terrainHandoffPhase' },
  { key: 'demoPhase', description: 'Demo choreography phase', source: 'demoStore.phase' },

  // Filters (legacy filter-state.js)
  { key: 'filtersActive', description: 'Whether any filter is active', source: 'filterState' },

  // Viewport
  { key: 'reducedMotion', description: 'OS-level reduced motion preference', source: 'viewport.reducedMotion' },
  { key: 'compact', description: 'Whether viewport is at or below the mobile breakpoint', source: 'viewport.isCompact' },
  { key: 'mobile', description: 'Whether viewport is mobile (alias of compact)', source: 'viewport.isMobile' },
  { key: 'mode', description: 'Current visual mode (overview|focus|inside|map)', source: 'navStore.mode' },

  // Loading / scene readiness (all derived from loadingPhaseStore + graphicsModeStore)
  { key: 'loadingOverlay', description: 'Loading overlay visibility (hidden|visible)', source: 'loadingPhaseStore' },
  { key: 'loadingPhase', description: 'Loading phase (records|scene|restore|launch)', source: 'loadingPhaseStore' },
  { key: 'sceneReady', description: 'Whether the WebGL scene is ready', source: 'loadingPhaseStore' },
  { key: 'viewHandoffActive', description: 'Whether a view-handoff animation is in progress', source: 'loadingPhaseStore' },
  { key: 'cameraAssist', description: 'Camera assistance state (free|suspended)', source: 'loadingPhaseStore' },
  { key: 'graphicsMode', description: 'Graphics mode (webgl|fallback)', source: 'graphicsModeStore' },
  { key: 'testReady', description: 'Test readiness flag (true once parity is installed)', source: 'derived' },

  // Camera orbit slack (legacy camera-orbit-slack.js / camera.ts)
  { key: 'cameraSlack', description: 'Camera orbit slack phase (idle|active|settling)', source: 'cameraStore.orbitSlack.phase' },
  { key: 'cameraSlackReason', description: 'Reason string for the current camera orbit slack phase', source: 'cameraStore.orbitSlack.reason' }
] as const;

/**
 * Set of attribute keys this module owns.
 * Useful for tests that want to assert "every legacy attr is covered".
 */
export const PARITY_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(
  PARITY_ATTRIBUTES.map((a) => a.key)
);

// ── Attribute Computation ────────────────────────────────────────────────────

/**
 * Compute the desired parity attribute map from current store snapshots.
 * Pure function — no side effects, no DOM access. Easy to test.
 */
export interface ParityAttributeMap {
  readonly [key: string]: string | null;
}

/** Unwrap helper: extract the value type from a Svelte store, function store, or plain $state value. */
type Unwrap<T> = T extends (...args: never[]) => infer V
  ? V
  : T extends { subscribe: (cb: (val: infer V) => unknown) => unknown }
    ? V
    : T;

type JourneyValue = Unwrap<typeof journeyStore>;
type FocusValue = Unwrap<typeof focusStore>;
type SearchValue = Unwrap<typeof searchStore>;
type FilterValue = Unwrap<typeof filterState>;
type ViewportValue = Unwrap<typeof viewport>;
type CameraValue = Unwrap<typeof cameraStore>;

export function computeParityAttributes(
  nav: NavState,
  journey: JourneyValue,
  focus: FocusValue,
  search: SearchValue,
  filters: FilterValue,
  vp: ViewportValue,
  loadingPhaseValue: LoadingPhase = 'launch',
  demoPhaseValue: string = 'IDLE',
  graphicsModeValue: string = 'webgl',
  camera: CameraValue = cameraStore as CameraValue
): ParityAttributeMap {
  const compassState = getJourneyCompassState();
  const presentation: CompassPresentationState = getJourneyCompassPresentationState(compassState);

  // graph-context: legacy uses these values across CSS hooks
  const graphContext = (() => {
    if (vp.isCompact && journey.routeExplorationPhase === 'searching') return 'corridor';
    if (nav.currentView === 'map') return 'map';
    if (nav.mode === 'inside') return 'inside';
    if (nav.mode === 'focus' || nav.mode === 'trail') return 'focus';
    if (nav.mode === 'search' || search.summary) return 'corridor';
    if (nav.mode === 'overview') return 'overview';
    return 'overview';
  })();

  const panelSurfaceMode = ((): string => {
    // 'semantic-dive' is the highest-priority surface — it must take
    // precedence over focus-search/map-focus-search so parity-attrs
    // doesn't overwrite the manually-set body[data-panel-surface='semantic-dive']
    // when the user enters semantic-dive from another surface.
    if (focus.semanticDiveMode) return 'semantic-dive';
    if (nav.currentView === 'map') {
      if (nav.surface === 'focus-search' || nav.surface === 'search' || search.summary) return 'map-search';
      if (nav.surface === 'focus') return 'map-focus';
      if (nav.surface === 'map-focus-search') return 'map-focus-search';
      if (nav.surface === 'map-trail') return 'map-trail';
      if (nav.surface === 'map') return 'map';
      return 'map-idle';
    }
    if (nav.surface === 'focus-search') return 'focus-search';
    if (nav.surface === 'map-focus-search') return 'map-focus-search';
    if (nav.surface === 'map-trail') return 'map-trail';
    if (nav.surface === 'thread-inspect') return 'thread-inspect';
    if (nav.surface === 'search') return 'search';
    if (nav.surface === 'focus') return 'focus';
    if (nav.surface === 'inside') return 'inside';
    if (nav.surface === 'map') return 'map';
    return 'idle';
  })();

  const trailState =
    journey.depth > 0 || presentation.navigationOwner === 'map-trail-strip'
      ? 'active'
      : 'inactive';
  const semanticDive = focus.semanticDiveMode
    ? 'active'
    : (journey.depth >= 2 ? 'transitioning' : 'inactive');
  const threadInspectionActive = focus.threadInspector.active;
  const inspectedThreadIndex = focus.threadInspector.inspectedIndex;

  // Mode derives from navState.mode for compatibility with the
  // legacy data-mode attribute that the CSS layer reads.
  const mode = nav.mode;

  // Demo phase: read from store (no circular DOM read).
  const demoPhase = demoPhaseValue;

  const filterActive = filters.status !== 'all'
    || filters.city !== ''
    || filters.website
    || filters.email
    || filters.geocoded;

  // Loading / scene readiness — derived from loadingPhase store values.
  // No circular DOM reads: these come from loadingPhaseStore / graphicsModeStore.
  const isLoading = loadingPhaseValue !== 'launch';
  const loadingOverlay = isLoading ? 'visible' : 'hidden';
  const sceneReady = isLoading ? 'false' : 'true';
  const viewHandoffActive = isLoading ? 'true' : 'false';
  const cameraAssist = isLoading ? 'loading' : 'free';

  return {
    journeyCompass: journey.compass?.phase ?? 'idle',
    journeyCompassPhase: journey.compass?.phase ?? 'idle',
    journeyCompassDensity: presentation.density,
    journeyCompassCopy: presentation.copy,
    journeyNavigationOwner: presentation.navigationOwner,

    navMode: nav.mode,
    navSurface: nav.surface,
    panelSurface: panelSurfaceMode,
    panelSurfaceMode,
    activeView: nav.currentView,
    viewMode: nav.currentView,
    focusedNode: (() => {
      // Primary: Svelte navStore rune (set by Svelte-side focus flows).
      if (nav.focusedIndex !== null && Number.isFinite(nav.focusedIndex)) {
        return String(nav.focusedIndex);
      }
      // Fallback: legacy `__APP_STATE__.navState.focusedIndex`. Legacy
      // `applyLocalNeighborhoodFocus` / `navigation-state.ts:146` writes to
      // the legacy state but the Svelte navStore is not updated by the
      // legacy code path, so this fallback is what actually carries the
      // focus index in production. Mirrors the same pattern in
      // FocusCard.svelte::currentFocusedIdx.
      try {
        const w = window as unknown as { __APP_STATE__?: { navState?: { focusedIndex?: unknown } } };
        const legacy = w.__APP_STATE__?.navState?.focusedIndex;
        if (typeof legacy === 'number' && Number.isFinite(legacy)) return String(legacy);
      } catch { /* ignore */ }
      return null;
    })(),
    graphContext,
    routeExploration: journey.routeExplorationPhase || 'idle',

    trailDepth: String(journey.depth),
    trailState,

    semanticDive,
    insideWalkState: focus.strandContinuityPhase || 'idle',

    focusTransition: focus.transitionMode || 'idle',
    searchStatus: search.status || 'idle',

    strandJourney: focus.strandContinuityPhase || 'idle',
    threadInspect: threadInspectionActive ? 'active' : null,
    threadInspectSurface: threadInspectionActive ? (focus.threadInspector.source || 'rail') : 'idle',
    inspectedThreadIndex: threadInspectionActive && inspectedThreadIndex !== null
      ? String(inspectedThreadIndex)
      : null,
    journeyPhase: journey.phase || 'idle',
    terrainHandoff: journey.terrainHandoffPhase || 'idle',
    demoPhase,

    filtersActive: String(filterActive),

    reducedMotion: String(vp.reducedMotion),
    compact: String(vp.isCompact),
    mobile: String(vp.isMobile),
    mode,

    // Loading / scene readiness — derived from loadingPhase store.
    loadingOverlay,
    loadingPhase: loadingPhaseValue,
    sceneReady,
    viewHandoffActive,
    cameraAssist,
    graphicsMode: graphicsModeValue,
    testReady: 'true',

    // Camera orbit slack (legacy camera-orbit-slack.js).
    // The camera store is the Svelte-native source of truth.
    cameraSlack: camera.orbitSlack.phase || 'idle',
    cameraSlackReason: camera.orbitSlack.reason || null
  };
}

// ── DOM Writer ──────────────────────────────────────────────────────────────

/**
 * Apply the parity attribute map to document.body.
 * SSR-safe (no-op when document/body is unavailable).
 * Idempotent: setting the same value is a no-op for browser.
 */
export function applyParityAttributes(map: ParityAttributeMap): void {
  if (typeof document === 'undefined' || !document.body) return;

  for (const [key, value] of Object.entries(map)) {
    if (value === null || value === undefined) {
      if (document.body.dataset[key] !== undefined) {
        delete document.body.dataset[key];
      }
      continue;
    }
    const str = String(value);
    if (document.body.dataset[key] !== str) {
      document.body.dataset[key] = str;
    }
  }
}

// ── Installer ───────────────────────────────────────────────────────────────

/**
 * Internal: last-applied snapshot, used to short-circuit no-op writes.
 */
let _lastSnapshot: string | null = null;

/**
 * Install the parity attribute sync layer.
 *
 * Subscribes to all relevant stores; on every change, recomputes the
 * attribute map and writes it to <body>.
 *
 * Returns a cleanup function that unsubscribes all listeners.
 *
 * @param options.initialSync When true (default), performs an initial
 *   sync after subscription. Useful for tests that want a deterministic
 *   first read.
 */
export function installParityAttributeSync(
  options: { initialSync?: boolean } = {}
): () => void {
  const { initialSync = true } = options;

  if (typeof document === 'undefined' || !document.body) {
    // SSR / no-DOM: return a no-op cleanup.
    return () => {};
  }

  const unsubs: Array<() => void> = [];

  const recomputeAndApply = (): void => {
    const map = computeParityAttributes(
      navStore(),
      journeyStore(),
      focusStore(),
      searchStore as unknown as SearchValue,
      get(filterState),
      viewport(),
      get(loadingPhaseStore),
      get(demoPhaseStore) as unknown as string,
      get(graphicsModeStore),
      cameraStore
    );

    // Cheap short-circuit: same JSON snapshot means no DOM changes needed.
    const snapshot = JSON.stringify(map);
    if (snapshot === _lastSnapshot) return;
    _lastSnapshot = snapshot;

    applyParityAttributes(map);
  };

  // Standard svelte stores (Writable/Readable) — reactive via .subscribe()
  // W11 WIP safety net: some migrated stores may not have .subscribe() yet.
  // The initial recomputeAndApply() below still reads every store imperatively,
  // so dropping a subscription only loses future reactivity (not the first read).
  const safeSubscribe = (store: unknown, label: string): void => {
    try {
      if (store && typeof (store as { subscribe?: unknown }).subscribe === 'function') {
        unsubs.push((store as { subscribe: (fn: () => void) => () => void }).subscribe(recomputeAndApply));
      } else {
        // Rune-based store (no .subscribe); read imperatively via initial recompute below.
        console.debug?.(`[parity-attrs] skipping non-subscribable store: ${label}`);
      }
    } catch (err) {
      console.warn?.(`[parity-attrs] failed to subscribe to ${label}:`, err);
    }
  };
  safeSubscribe(navStore, 'navStore');
  safeSubscribe(journeyStore, 'journeyStore');
  safeSubscribe(focusStore, 'focusStore');
  safeSubscribe(searchStore, 'searchStore');
  safeSubscribe(filterState, 'filterState');
  safeSubscribe(loadingPhaseStore, 'loadingPhaseStore');
  safeSubscribe(demoPhaseStore, 'demoPhaseStore');
  safeSubscribe(graphicsModeStore, 'graphicsModeStore');
  // Rune-based stores — read imperatively; not subscribable from plain .ts.
  // The .svelte.ts sibling uses $effect.root() for full reactivity.

  if (initialSync) {
    recomputeAndApply();
  }

  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch {
        // best-effort
      }
    }
    _lastSnapshot = null;
  };
}

/**
 * Read the current parity attribute map from the DOM (for tests / probes).
 * Returns the live values written by applyParityAttributes.
 */
export function readParityAttributesFromBody(): ParityAttributeMap {
  if (typeof document === 'undefined' || !document.body) return {};
  const out: Record<string, string> = {};
  for (const desc of PARITY_ATTRIBUTES) {
    const v = document.body.dataset[desc.key];
    if (v !== undefined) out[desc.key] = v;
  }
  return out;
}

/**
 * Test/debug helper: reset the internal snapshot cache so the next
 * recompute is forced even if the data is identical.
 */
export function resetParityAttributeCache(): void {
  _lastSnapshot = null;
}
