/**
 * @lib/engine/camera-choreography/cursor.ts — Focus node orchestrator (focusOnNode)
 *
 * Port of js/modules/camera-controls-choreography-cursor.js
 *
 * Orchestrates the full focus-on-node flow: dispatches navigation transitions,
 * syncs DOM attributes, publishes events, updates journey/compass state, and
 * triggers the camera animation (delegated to focus.ts).
 *
 * DESIGN: All legacy module dependencies are lazy-loaded at module init time via
 * _ensureModules(). Exported functions are synchronous with defensive guards.
 */

import { animateCameraToNode } from './focus';
import * as legacyStateModule from '../../../../js/state';
import * as selectorsStaticModule from '../../../../js/state/selectors/index';
import * as mapStateStaticModule from '../../../../js/modules/map-state';
import * as semanticDiveUiStaticModule from '@lib/journey/semantic-dive';
import * as cameraControlsCoreStaticModule from '../../../../js/modules/camera-controls-core.ts';
import * as focusPanelModeStaticModule from '../../../../js/modules/focus-panel-mode.js';
// Static imports for the two modules flagged INEFFECTIVE_DYNAMIC_IMPORT
// when dynamically loaded here (lifecycle.js + journey.js are already
// statically imported elsewhere in the imperative bridge graph, so the
// dynamic form bought nothing and only added an extra hop).
import * as lifecycleStaticModule from '../../../../js/modules/lifecycle.js';
import * as journeyStaticModule from '../../../../js/modules/journey.js';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

/** Point shape used by selectors. */
interface Point {
  lead_id?: string | number | null;
  name?: string;
  x?: number;
  y?: number;
  z?: number;
  cluster?: number | string;
  [key: string]: unknown;
}

/**
 * Legacy nav state subset with the mutable fields cursor.ts accesses at runtime.
 * The canonical NavState type from @lib/types/state is the Svelte store shape;
 * this runtime interface matches the JS state.navState proxy surface.
 */
interface LegacyNavState {
  mode: string;
  focusedIndex: number | null;
  trailSeedIndex: number | null;
  trailNeighborIndices: number[];
  trailCursor: number;
  walkHistoryIndices: number[];
  lastTraversalReason: string | null;
  threadCandidates: number[];
  threadSource: string;
  focusPocketIndices: number[];
  focusPocketMeta: Record<string, unknown> | null;
  focusPocketRoleByIndex: Map<number, string>;
  focusFramingMeta: Record<string, unknown> | null;
  currentPersonality: { type: string } | null;
  neighborhoodIndices: number[];
}

/** Minimal legacy state properties accessed by cursor.ts. */
interface LegacyState {
  selectedPoint: Point | null;
  hoverHighlightIndex: number;
  pinnedThreadIndex: number | null;
  navState: LegacyNavState;
  [key: string]: unknown;
}

/** Selectors module shape. */
interface SelectorsModule {
  getNavState(): LegacyNavState;
  getPoints(): Point[] | null;
  getTrailDepth(): number;
  getMyceliumMode(): string;
  getFocusedNode(): number | null;
}

/** Environment module shape (legacy). */
interface EnvironmentModule {
  isMobile(): boolean;
}

/** Lifecycle module shape. */
interface LifecycleModule {
  dispatchNavTransition(action: string, options?: Record<string, unknown>): void;
  setTrailDepth(depth: number, options?: { skipUrlSync?: boolean }): void;
  setMyceliumMode(mode: string, options?: { skipUrlSync?: boolean }): void;
  refreshCompositionState(): void;
  updateExplorationUi(): void;
  syncSearchStatusForFocus(point: Point, options?: Record<string, unknown>): void;
}

/** Journey module shape. */
interface JourneyModule {
  applyPointFilterColors(): void;
  syncFocusStage(point: Point): void;
}

/** Journey compass controller module shape. */
interface JourneyCompassControllerModule {
  updateJourneyCompass(): void;
}

/** Map state module shape. */
interface MapStateModule {
  refreshMapRouteEmbodiment(): void;
}

/** Semantic dive UI module shape. */
interface SemanticDiveUiModule {
  syncSemanticDiveUi(): void;
}

/** Event bus module shape. */
interface EventBusModule {
  publish(eventName: string, payload?: Record<string, unknown>): void;
  EVENTS: Record<string, string>;
}

/** Camera controls core module shape. */
interface CameraCoreModule {
  clearRouteExploration(reason?: string): void;
}

/** Focus panel mode module shape. */
interface FocusPanelModeModule {
  setFocusPanelMode(mode: string): void;
  FOCUS_PANEL_MODE: Record<string, string>;
}

// ── Lazy Module Cache ────────────────────────────────────────────────────────

let _state: LegacyState | null = null;
let _selectors: SelectorsModule | null = null;
let _environment: EnvironmentModule | null = null;
let _lifecycle: LifecycleModule | null = null;
let _journey: JourneyModule | null = null;
let _journeyCompass: JourneyCompassControllerModule | null = null;
let _mapState: MapStateModule | null = mapStateStaticModule as unknown as MapStateModule;
let _semanticDiveUi: SemanticDiveUiModule | null = semanticDiveUiStaticModule as unknown as SemanticDiveUiModule;
let _eventBus: EventBusModule | null = null;
let _cameraCore: CameraCoreModule | null = cameraControlsCoreStaticModule as unknown as CameraCoreModule;
let _focusPanelMode: FocusPanelModeModule | null = focusPanelModeStaticModule as unknown as FocusPanelModeModule;

let _loaded = false;

async function _ensureModules(): Promise<void> {
  if (_loaded) return;
  try {
    const [
      envMod,
      lifecycleMod,
      journeyMod,
      compassMod,
      busMod,
    ] = await Promise.all([
      import('../../../../js/modules/environment.js'),
      lifecycleStaticModule as unknown as LifecycleModule,
      journeyStaticModule as unknown as JourneyModule,
      import('../../../../js/modules/journey-compass-controller.js'),
      import('../../../../js/modules/event-bus.js'),
    ]);
    _state = (legacyStateModule as unknown as { state: LegacyState }).state;
    _selectors = selectorsStaticModule as unknown as SelectorsModule;
    _environment = envMod as unknown as EnvironmentModule;
    _lifecycle = lifecycleMod as unknown as LifecycleModule;
    _journey = journeyMod as unknown as JourneyModule;
    _journeyCompass = compassMod as unknown as JourneyCompassControllerModule;
    _eventBus = busMod as unknown as EventBusModule;
    _loaded = true;
  } catch (err) {
    console.error('[camera-choreography/cursor] Failed to load legacy modules:', err);
  }
}

void _ensureModules();

// ─── FocusOnNodeOptions ──────────────────────────────────────────────────────

export interface FocusOnNodeOptions {
  preserveMode?: boolean;
  fromTraversal?: boolean;
  fromCanvasNode?: boolean;
  fromSearchResult?: boolean;
  appendHistory?: boolean;
  restoreHistory?: boolean;
  skipUrlSync?: boolean;
  historyMode?: string;
  [key: string]: unknown;
}

// ── focusOnNode ──────────────────────────────────────────────────────────────

export function focusOnNode(
  index: number,
  options: FocusOnNodeOptions = {},
): boolean {
  if (!_loaded || !_state || !_selectors || !_lifecycle || !_journey || !_eventBus || !_cameraCore) return false;

  if (!Number.isFinite(index) || index < 0) return false;
  const points = _selectors.getPoints();
  if (!points || index >= points.length) return false;
  const point = points[index];
  if (!point) return false;

  _state.selectedPoint = point;
  _state.hoverHighlightIndex = -1;
  _state.pinnedThreadIndex = null;

  _lifecycle.dispatchNavTransition('FOCUS_NODE', {
    index,
    preserveMode: !!options.preserveMode,
    fromTraversal: !!options.fromTraversal,
    fromCanvasNode: !!options.fromCanvasNode,
    appendHistory: !!options.appendHistory,
    restoreHistory: !!options.restoreHistory,
  });

  if (_selectors.getTrailDepth() === 0) {
    _lifecycle.setTrailDepth(1, { skipUrlSync: true });
  }

  if (_selectors.getNavState().mode === 'trail' && _selectors.getMyceliumMode() !== 'trail') {
    _lifecycle.setMyceliumMode('trail', { skipUrlSync: true });
  }

  document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'));

  const hint = document.getElementById('onboarding-hint');
  if (hint) {
    hint.classList.remove('visible');
    (hint as unknown as Record<string, unknown>)._dismissedThisSession = true;
    const autoHideTimer = (hint as unknown as Record<string, unknown>)._autoHideTimer as number | undefined;
    if (autoHideTimer !== undefined) clearTimeout(autoHideTimer);
  }

  document.body.dataset.focusOrigin = options.fromCanvasNode
    ? 'field-node'
    : options.fromSearchResult
      ? 'search-result'
      : options.fromTraversal
        ? 'trail-walk'
        : 'programmatic';

  if (options.fromCanvasNode && _focusPanelMode) {
    _focusPanelMode.setFocusPanelMode(_focusPanelMode.FOCUS_PANEL_MODE.FIELD_NODE ?? 'field-node');
  }

  if (_environment?.isMobile()) {
    const storySection = document.getElementById('story-section') as HTMLDetailsElement | null;
    const clusterSection = document.getElementById('cluster-section') as HTMLDetailsElement | null;
    if (storySection) storySection.open = false;
    if (clusterSection) clusterSection.open = false;
  }

  _eventBus.publish(_eventBus.EVENTS.CAMERA_MOVED ?? 'camera-moved', { reason: 'focus-node', index });
  _eventBus.publish(_eventBus.EVENTS.CAMERA_NODE_FOCUSED ?? 'camera-node-focused', { index, point, options });

  _journey.applyPointFilterColors();
  _lifecycle.updateExplorationUi();
  _journey.syncFocusStage(point);
  _mapState?.refreshMapRouteEmbodiment();

  _cameraCore.clearRouteExploration(
    options.fromTraversal ? 'trail-walk' : options.fromCanvasNode ? 'field-node-focus' : 'focus',
  );

  _lifecycle.syncSearchStatusForFocus(point, {
    fromTraversal: !!options.fromTraversal,
    fromSearchResult: !!options.fromSearchResult,
  });

  // Fire camera animation — does not block, runs its own rAF loop
  animateCameraToNode(index, {
    transitionStyle: options.fromTraversal ? 'walk' : options.fromSearchResult ? 'search' : 'focus',
  });

  _semanticDiveUi?.syncSemanticDiveUi();
  _lifecycle.refreshCompositionState();

  if (!options.skipUrlSync) {
    _eventBus.publish(_eventBus.EVENTS.URL_SYNC_REQUESTED ?? 'url-sync-requested', {
      params: { record: String(point.lead_id ?? '') },
      mode: options.historyMode || 'push',
      reason: 'focus',
    });
  }

  _journeyCompass?.updateJourneyCompass();
  return true;
}
