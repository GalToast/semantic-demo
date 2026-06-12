/**
 * @lib/orchestration/parity-attrs.svelte.ts
 *
 * Single source of truth for the body data-* attributes that the legacy
 * production shell (vector-explorer-polished.html) requires for focus-search,
 * journey-compass, semantic-dive, navigation, viewport, and filter parity.
 *
 * Migrated to Svelte 5 runes: uses $effect.root() for reactive DOM sync
 * instead of manual .subscribe() calls. The $effect auto-tracks all rune
 * reads inside its callback, so any change to any store automatically
 * triggers a recompute + DOM write.
 *
 * This module is intentionally SSR-safe: every DOM write is guarded.
 */

// ── Store Imports (re-exported for consumers) ─────────────────────────────────

import { get } from 'svelte/store';
import { navStore } from '@lib/stores/navigation.svelte';
import type { NavState } from '@lib/types/state';
import { journeyStore } from '@lib/stores/journey.svelte';
import { focusStore } from '@lib/stores/focus.svelte';
import { searchStore } from '@lib/stores/search.svelte';
import { filterState } from '@lib/stores/filter.svelte';
import { viewport } from '@lib/stores/viewport.svelte';
import { cameraStore } from '@lib/stores/camera.svelte';
import { demoPhase as demoPhaseStore } from '@lib/stores/demo.svelte';
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
  { key: 'trailDepth', description: 'Current trail depth (0|1|2+)', source: 'journeyStore.trailDepth' },
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

export function computeParityAttributes(): ParityAttributeMap {
  // Direct reads from rune stores (auto-tracked when called inside $effect)
  const nav = navStore();
  const journey = journeyStore();
  const focus = focusStore();
  const search = searchStore;
  const filters = get(filterState);
  const vp = viewport();
  const demoPhaseValue: string = get(demoPhaseStore);
  const camera = cameraStore;

  const compassStateVal = getJourneyCompassState();
  const presentation: CompassPresentationState = getJourneyCompassPresentationState(compassStateVal);

  // Loading/graphics state derived from nav and camera stores
  const loadingPhaseValue: LoadingPhase = (nav.loadingPhaseKey as LoadingPhase) || 'launch';
  const graphicsModeValue = 'webgl';

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
    if (nav.currentView === 'map') {
      if (nav.surface === 'focus-search' || nav.surface === 'search' || search.summary) return 'map-search';
      if (nav.surface === 'focus') return 'map-focus';
      if (nav.surface === 'map-focus-search') return 'map-focus-search';
      if (nav.surface === 'map-trail') return 'map-trail';
      if (nav.surface === 'map') return 'map';
      return 'map-idle';
    }
    if (nav.surface === 'focus-search') return 'focus-search';
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

  const trailState =
    journey.trailDepth > 0 || presentation.navigationOwner === 'map-trail-strip'
      ? 'active'
      : 'inactive';
  const semanticDive = focus.semanticDiveMode
    ? 'active'
    : (journey.trailDepth >= 2 ? 'transitioning' : 'inactive');
  const threadInspectionActive = focus.threadInspector.active;
  const inspectedThreadIndex = focus.threadInspector.inspectedIndex;

  const mode = nav.mode;

  const demoPhase = demoPhaseValue;

  const filterActive = filters.status !== 'all'
    || filters.city !== ''
    || filters.website
    || filters.email
    || filters.geocoded;

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
    focusedNode: nav.focusedIndex !== null ? String(nav.focusedIndex) : null,
    graphContext,
    routeExploration: journey.routeExplorationPhase || 'idle',

    trailDepth: String(journey.trailDepth),
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

    loadingOverlay,
    loadingPhase: loadingPhaseValue,
    sceneReady,
    viewHandoffActive,
    cameraAssist,
    graphicsMode: graphicsModeValue,
    testReady: 'true',

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

// ── Installer (rune-based) ─────────────────────────────────────────────────

/**
 * Internal: last-applied snapshot, used to short-circuit no-op writes.
 */
let _lastSnapshot: string | null = null;

/**
 * Internal: root effect handle for cleanup.
 */
let _effectRoot: (() => void) | null = null;

/**
 * Install the parity attribute sync layer.
 *
 * Uses $effect.root() to create a reactive effect that auto-tracks all
 * rune store reads. On every relevant change, recomputes the attribute
 * map and writes it to <body>.
 *
 * Returns a cleanup function that stops all effects.
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
    return () => {};
  }

  // Clean up any previous root
  if (_effectRoot) {
    _effectRoot();
    _effectRoot = null;
  }

  _effectRoot = $effect.root(() => {
    $effect(() => {
      // Reading any rune here auto-tracks it — any change triggers this effect
      const map = computeParityAttributes();

      // Cheap short-circuit: same JSON snapshot means no DOM changes needed.
      const snapshot = JSON.stringify(map);
      if (snapshot === _lastSnapshot) return;
      _lastSnapshot = snapshot;

      applyParityAttributes(map);
    });

    if (initialSync) {
      // Force an initial compute
      const map = computeParityAttributes();
      _lastSnapshot = JSON.stringify(map);
      applyParityAttributes(map);
    }
  });

  return () => {
    if (_effectRoot) {
      _effectRoot();
      _effectRoot = null;
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
