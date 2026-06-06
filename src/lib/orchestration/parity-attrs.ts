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
import {
  navStore,
  type NavStoreState
} from '@lib/stores/navigation';
import { journeyStore } from '@lib/stores/journey';
import { focusStore } from '@lib/stores/focus';
import { searchStore } from '@lib/stores/search';
import { filterState } from '@lib/stores/filter';
import { viewport } from '@lib/stores/viewport';
import {
  getJourneyCompassState
} from './compass-state';
import {
  getJourneyCompassPresentationState,
  type CompassPresentationState
} from './compass-controller';

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
  { key: 'trailDepth', description: 'Current trail depth (0|1|2+)', source: 'journeyStore.trailDepth' },
  { key: 'trailState', description: 'Trail state (inactive|active)', source: 'derived' },

  // Semantic dive (legacy semantic-dive-ui.js)
  { key: 'semanticDive', description: 'Semantic dive state (inactive|transitioning|active)', source: 'focusStore.semanticDiveMode' },
  { key: 'insideWalkState', description: 'Inside walk state (idle|walking|exploring|...)', source: 'focusStore.strandContinuityPhase' },

  // Journey phase
  { key: 'journeyPhase', description: 'Journey phase lifecycle (idle|overview|search|focus|inside|map|thread-inspect|walking|arriving|settling)', source: 'journeyStore.phase' },
  { key: 'demoPhase', description: 'Demo choreography phase', source: 'demoStore.phase' },

  // Filters (legacy filter-state.js)
  { key: 'filtersActive', description: 'Whether any filter is active', source: 'filterState' },

  // Viewport
  { key: 'reducedMotion', description: 'OS-level reduced motion preference', source: 'viewport.reducedMotion' },
  { key: 'compact', description: 'Whether viewport is at or below the mobile breakpoint', source: 'viewport.isCompact' },
  { key: 'mobile', description: 'Whether viewport is mobile (alias of compact)', source: 'viewport.isMobile' },
  { key: 'mode', description: 'Current visual mode (overview|focus|inside|map)', source: 'navStore.mode' },

  // Loading / scene readiness
  { key: 'loadingOverlay', description: 'Loading overlay visibility (hidden|visible)', source: 'derived' },
  { key: 'loadingPhase', description: 'Loading phase (records|scene|restore|launch)', source: 'derived' },
  { key: 'sceneReady', description: 'Whether the WebGL scene is ready', source: 'derived' },
  { key: 'viewHandoffActive', description: 'Whether a view-handoff animation is in progress', source: 'derived' },
  { key: 'cameraAssist', description: 'Camera assistance state (free|suspended)', source: 'derived' },
  { key: 'graphicsMode', description: 'Graphics mode (webgl|fallback)', source: 'derived' },
  { key: 'testReady', description: 'Test readiness flag (true once parity is installed)', source: 'derived' }
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

/** Unwrap helper: extract the value type from a Svelte store. */
type Unwrap<T> = T extends { subscribe: (cb: (val: infer V) => unknown) => unknown } ? V : T;

type JourneyValue = Unwrap<typeof journeyStore>;
type FocusValue = Unwrap<typeof focusStore>;
type SearchValue = Unwrap<typeof searchStore>;
type FilterValue = Unwrap<typeof filterState>;
type ViewportValue = Unwrap<typeof viewport>;

export function computeParityAttributes(
  nav: NavStoreState,
  journey: JourneyValue,
  focus: FocusValue,
  search: SearchValue,
  filters: FilterValue,
  vp: ViewportValue
): ParityAttributeMap {
  const compassState = getJourneyCompassState();
  const presentation: CompassPresentationState = getJourneyCompassPresentationState(compassState);

  // graph-context: legacy uses these values across CSS hooks
  const graphContext = (() => {
    if (vp.isCompact && journey.routeExplorationPhase === 'exploring') return 'corridor';
    if (nav.currentView === 'map') return 'map';
    if (nav.mode === 'inside') return 'inside';
    if (nav.mode === 'focus' || nav.mode === 'trail') return 'focus';
    if (nav.mode === 'search' || search.summary) return 'corridor';
    if (nav.mode === 'overview') return 'overview';
    return 'overview';
  })();

  const panelSurfaceMode = ((): string => {
    if (nav.surface === 'focus-search') return 'focus-search';
    // 'semantic-dive' is a legacy string the canvas-hit-test contract
    // asserts on body.dataset.panelSurface. It is set by the legacy
    // semantic-dive-ui / composition-state modules when active. The Svelte
    // focus store tracks semanticDiveMode; mirror that here.
    if (focus.semanticDiveMode) return 'semantic-dive';
    if (nav.surface === 'map-focus-search') return 'map-focus-search';
    if (nav.surface === 'map-trail') return 'map-trail';
    if (nav.surface === 'thread-inspect') return 'thread-inspect';
    if (nav.surface === 'search') return 'search';
    if (nav.surface === 'focus') return 'focus';
    if (nav.surface === 'inside') return 'inside';
    if (nav.surface === 'map') return 'map';
    return 'idle';
  })();

  const trailState = journey.trailDepth > 0 ? 'active' : 'inactive';
  const semanticDive = focus.semanticDiveMode
    ? 'active'
    : (journey.trailDepth >= 2 ? 'transitioning' : 'inactive');

  // Mode derives from navState.mode for compatibility with the
  // legacy data-mode attribute that the CSS layer reads.
  const mode = nav.mode;

  // Demo phase: kept here as a placeholder parity hook; the demo store
  // owns the live value and writes it directly. We only re-emit a safe
  // default if the body attribute is missing.
  const demoPhase = document?.body?.dataset?.demoPhase ?? 'IDLE';

  const filterActive = filters.status !== 'all'
    || filters.city !== ''
    || filters.website
    || filters.email
    || filters.geocoded;

  return {
    journeyCompassPhase: nav.mode,
    journeyCompassDensity: presentation.density,
    journeyCompassCopy: presentation.copy,
    journeyNavigationOwner: presentation.navigationOwner,

    navMode: nav.mode,
    navSurface: nav.surface,
    panelSurface: nav.surface,
    panelSurfaceMode,
    activeView: nav.currentView,
    viewMode: nav.currentView,
    focusedNode: nav.focusedIndex !== null ? String(nav.focusedIndex) : null,
    graphContext,
    routeExploration: journey.routeExplorationPhase || 'idle',

    trailDepth: String(journey.trailDepth),
    trailState,

    semanticDive,
    insideWalkState: focus.strandContinuityPhase || 'idle',

    journeyPhase: journey.phase || 'idle',
    demoPhase,

    filtersActive: String(filterActive),

    reducedMotion: String(vp.reducedMotion),
    compact: String(vp.isCompact),
    mobile: String(vp.isMobile),
    mode,

    // Loading / scene readiness — initial defaults; the loading-ui
    // module owns the live values and writes them directly to body.
    loadingOverlay: document?.body?.dataset?.loadingOverlay ?? 'hidden',
    loadingPhase: document?.body?.dataset?.loadingPhase ?? 'records',
    sceneReady: document?.body?.dataset?.sceneReady ?? 'false',
    viewHandoffActive: document?.body?.dataset?.viewHandoffActive ?? 'false',
    cameraAssist: document?.body?.dataset?.cameraAssist ?? 'free',
    graphicsMode: document?.body?.dataset?.graphicsMode ?? 'webgl',
    testReady: 'true'
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
      get(navStore),
      get(journeyStore),
      get(focusStore),
      get(searchStore),
      get(filterState),
      get(viewport)
    );

    // Cheap short-circuit: same JSON snapshot means no DOM changes needed.
    const snapshot = JSON.stringify(map);
    if (snapshot === _lastSnapshot) return;
    _lastSnapshot = snapshot;

    applyParityAttributes(map);
  };

  unsubs.push(navStore.subscribe(recomputeAndApply));
  unsubs.push(journeyStore.subscribe(recomputeAndApply));
  unsubs.push(focusStore.subscribe(recomputeAndApply));
  unsubs.push(searchStore.subscribe(recomputeAndApply));
  unsubs.push(filterState.subscribe(recomputeAndApply));
  unsubs.push(viewport.subscribe(recomputeAndApply));

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
