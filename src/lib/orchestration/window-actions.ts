/**
 * Svelte production shell compatibility actions.
 *
 * The headed scene and visual contracts drive the live Three.js scene through
 * window.__APP_ACTIONS__. Keep these wrappers pointed at the sanctioned engine
 * bridge until those scene mutations are fully ported to src/.
 */

import { state as legacyState, withStateMutation } from '@lib/engine/state-bridge';
import { focusOnNode } from '@lib/engine/camera-controls';
import { search, clearSearch } from '@lib/search/state';
import { switchView } from '@lib/orchestration/view-controller';
import {
  setTrailDepth,
  setSemanticDiveMode,
  returnToOverview,
  resetExperienceState,
  resetExplorationFocus,
  refreshCompositionState,
} from '@lib/orchestration/lifecycle';
import { setTrailFromSeed } from '@lib/journey/neighborhood';
import { traverseNeighbor, walkThreadNeighbor } from '@lib/journey/thread-settler';
import {
  inspectThreadNeighbor,
  pinThreadNeighbor,
  unpinThreadInspection,
  clearThreadInspection,
} from '@lib/journey/thread-inspector';
import { showSemanticThreadsDetail } from '@lib/journey/connection-analysis';
import type { ViewName, SwitchViewOptions } from '@lib/orchestration/view-controller';
import * as semanticGuideModule from '@lib/journey/semantic-guide';
import {
  resetExperienceState as resetSvelteExperienceState,
  resetExplorationFocus as resetSvelteExplorationFocus,
  refreshCompositionState as refreshSvelteCompositionState,
  setSemanticDiveMode as setSvelteSemanticDiveMode,
  setTrailDepth as setSvelteTrailDepth
} from '@lib/stores/lifecycle';
import { navStore } from '@lib/stores/navigation.svelte';
import { journeyStore } from '@lib/stores/journey.svelte';

type LegacyActionModules = {
  state?: Record<string, unknown>;
  withStateMutation?: <T>(fn: () => T) => T;
  camera?: {
    focusOnNode?: (index: number, options?: Record<string, unknown>) => boolean;
  };
  lifecycle?: {
    switchView?: (view: ViewName, options?: SwitchViewOptions) => void;
    setTrailDepth?: (depth: number, options?: Record<string, unknown>) => void;
    setSemanticDiveMode?: (enabled: boolean) => void;
    returnToOverview?: () => void;
    resetExperienceState?: () => void;
    resetExplorationFocus?: (options?: Record<string, unknown>) => void;
    refreshCompositionState?: () => void;
  };
  search?: {
    search?: (query: string, options?: Record<string, unknown>) => Promise<void>;
    clearSearch?: (options?: Record<string, unknown>) => void;
  };
  journey?: {
    setTrailFromSeed?: (index: number) => void;
    traverseNeighbor?: (step: number) => void;
    inspectThreadNeighbor?: (index: number, options?: Record<string, unknown>) => unknown;
    pinThreadNeighbor?: (index: number, options?: Record<string, unknown>) => unknown;
    unpinThreadInspection?: () => unknown;
    clearThreadInspection?: (options?: Record<string, unknown>) => unknown;
    walkThreadNeighbor?: (index: number, options?: Record<string, unknown>) => unknown;
  };
  semanticGuide?: {
    requestSemanticGuide?: (point?: unknown) => void;
  };
  connectionAnalysis?: {
    showSemanticThreadsDetail?: () => Promise<void>;
  };
};

type AppActionsWindow = Window & {
  __APP_ACTIONS__?: Record<string, unknown>;
  __APP_STATE__?: unknown;
  __TEST_STATE__?: unknown;
};

let legacyModules: LegacyActionModules | null = null;
let loadPromise: Promise<LegacyActionModules> | null = null;

async function loadLegacyActionModules(): Promise<LegacyActionModules> {
  if (legacyModules) return legacyModules;
  if (loadPromise) return loadPromise;

  loadPromise = Promise.resolve().then(() => {
    const modules: LegacyActionModules = {
      state: legacyState,
      withStateMutation,
      camera: { focusOnNode },
      lifecycle: {
        switchView: switchView as typeof switchView,
        setTrailDepth,
        setSemanticDiveMode,
        returnToOverview,
        resetExperienceState,
        resetExplorationFocus,
        refreshCompositionState,
      },
      search: { search, clearSearch },
      journey: {
        setTrailFromSeed,
        traverseNeighbor,
        inspectThreadNeighbor,
        pinThreadNeighbor,
        unpinThreadInspection,
        clearThreadInspection,
        walkThreadNeighbor,
      },
      semanticGuide: semanticGuideModule,
      connectionAnalysis: { showSemanticThreadsDetail }
    };
    legacyModules = modules;

    const w = window as AppActionsWindow;
    if (modules.state) {
      w.__APP_STATE__ ??= modules.state;
      w.__TEST_STATE__ ??= modules.state;
    }

    return modules;
  });

  return loadPromise;
}

function getLegacyModules(): LegacyActionModules | null {
  return legacyModules;
}

function normalizeLegacyNavState(): void {
  const modules = getLegacyModules();
  const state = modules?.state as { navState?: Record<string, unknown> } | undefined;
  const navState = state?.navState;
  if (!navState) return;

  const mutate = modules?.withStateMutation ?? (<T>(fn: () => T): T => fn());
  mutate(() => {
    if (!Array.isArray(navState.focusPocketIndices)) navState.focusPocketIndices = [];
    if (!Array.isArray(navState.threadCandidates)) navState.threadCandidates = [];
    if (!Array.isArray(navState.trailNeighborIndices)) navState.trailNeighborIndices = [];
    if (!Array.isArray(navState.walkHistoryIndices)) navState.walkHistoryIndices = [];
    if (!Array.isArray(navState.explorationHistoryIndices)) navState.explorationHistoryIndices = [];
    if (!(navState.focusPocketRoleByIndex instanceof Map)) navState.focusPocketRoleByIndex = new Map();
    if (!(navState.threadReasonByIndex instanceof Map)) navState.threadReasonByIndex = new Map();
  });
}

function valueArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return [...(value as Iterable<unknown>)];
  }
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function finiteIndexList(value: unknown): number[] {
  return valueArray(value)
    .map((index) => Number(index))
    .filter((index) => Number.isFinite(index));
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const index = Number(value);
  return Number.isFinite(index) ? index : null;
}

function syncSvelteNavFromLegacy(): void {
  const navState = (getLegacyModules()?.state as { navState?: Record<string, unknown> } | undefined)?.navState;
  if (!navState) return;

  const focusedIndex = asFiniteNumber(navState.focusedIndex);
  // W15+ parity-attrs fix: the legacy state.navState.mode and surface fields are
  // not updated by the Svelte track's cursor.ts focusOnNode path (cursor.ts only
  // writes to _navWritable, not the legacy object). Mirroring them from legacy
  // here would clobber the correct 'focus'/'focus-search' values with 'overview'/'idle'.
  // The Svelte track owns mode/surface exclusively; this mirror only handles
  // focusedIndex + trail/thread bookkeeping.
  navStore.update((state) => ({
    ...state,
    focusedIndex,
    trailSeedIndex: asFiniteNumber(navState.trailSeedIndex),
    trailNeighborIndices: finiteIndexList(navState.trailNeighborIndices),
    trailCursor: asFiniteNumber(navState.trailCursor) ?? state.trailCursor,
    trailDepth: asFiniteNumber(navState.trailDepth) ?? state.trailDepth,
    walkHistoryIndices: finiteIndexList(navState.walkHistoryIndices),
    lastTraversalReason: typeof navState.lastTraversalReason === 'string'
      ? navState.lastTraversalReason
      : state.lastTraversalReason,
    threadCandidates: valueArray(navState.threadCandidates) as any[],
    threadReasonByIndex: navState.threadReasonByIndex instanceof Map
      ? navState.threadReasonByIndex as Map<number, string>
      : state.threadReasonByIndex,
    threadSource: typeof navState.threadSource === 'string'
      ? navState.threadSource
      : state.threadSource,
    focusPocketIndices: finiteIndexList(navState.focusPocketIndices),
    focusPocketMeta: (navState.focusPocketMeta as typeof state.focusPocketMeta | undefined) ?? state.focusPocketMeta,
    focusPocketRoleByIndex: navState.focusPocketRoleByIndex instanceof Map
      ? navState.focusPocketRoleByIndex as Map<number, string>
      : state.focusPocketRoleByIndex,
    neighborhoodIndices: finiteIndexList(navState.neighborhoodIndices),
  }));

  journeyStore.update((state) => ({
    ...state,
    phase: (navState.mode as typeof state.phase | undefined) ?? state.phase,
    depth: asFiniteNumber(navState.trailDepth) ?? state.depth,
    trailDepth: asFiniteNumber(navState.trailDepth) ?? state.trailDepth,
    trailSeedIndex: asFiniteNumber(navState.trailSeedIndex),
    trail: finiteIndexList(navState.walkHistoryIndices).map((index) => ({ index })),
    cursor: asFiniteNumber(navState.trailCursor) ?? state.cursor,
    walkHistoryIndices: finiteIndexList(navState.walkHistoryIndices),
    threadCandidates: valueArray(navState.threadCandidates) as any[],
    threadReasonByIndex: navState.threadReasonByIndex instanceof Map
      ? navState.threadReasonByIndex as Map<number, string>
      : state.threadReasonByIndex,
    threadSource: typeof navState.threadSource === 'string'
      ? navState.threadSource
      : state.threadSource,
    lastTraversalReason: typeof navState.lastTraversalReason === 'string'
      ? navState.lastTraversalReason
      : state.lastTraversalReason,
  }));

  if (typeof document !== 'undefined' && document.body) {
    const depth = asFiniteNumber(navState.trailDepth) ?? 0;
    document.body.dataset.trailDepth = String(depth);
    document.body.dataset.trailState = depth > 0 ? 'active' : 'inactive';
  }

  (window as Window & { __refreshTestCompatState__?: () => void }).__refreshTestCompatState__?.();
}

export function installWindowActions(): () => void {
  if (typeof window === 'undefined') return () => {};

  const w = window as AppActionsWindow;
  const previousActions = w.__APP_ACTIONS__;

  w.__APP_ACTIONS__ = {
    ...(previousActions ?? {}),
    search: (query: string, options?: Record<string, unknown>) => {
      return getLegacyModules()?.search?.search?.(query, options);
    },
    clearSearch: (options?: Record<string, unknown>) => {
      const resetOptions = { ...(options ?? {}), preserveSearch: false };
      resetSvelteExplorationFocus(resetOptions);
      getLegacyModules()?.lifecycle?.resetExplorationFocus?.(resetOptions);
      syncSvelteNavFromLegacy();
    },
    switchView: (view: string, options?: Record<string, unknown>) => {
      normalizeLegacyNavState();
      getLegacyModules()?.lifecycle?.switchView?.(view as ViewName, options as SwitchViewOptions);
      syncSvelteNavFromLegacy();
    },
    focusOnNode: (index: number, options?: Record<string, unknown>) => {
      normalizeLegacyNavState();
      const result = getLegacyModules()?.camera?.focusOnNode?.(index, options) ?? false;
      syncSvelteNavFromLegacy();
      return result;
    },
    setTrailFromSeed: (index: number) => {
      getLegacyModules()?.journey?.setTrailFromSeed?.(index);
      syncSvelteNavFromLegacy();
    },
    setTrailDepth: (depth: number, options?: Record<string, unknown>) => {
      normalizeLegacyNavState();
      setSvelteTrailDepth(depth, options);
      const lifecycle = getLegacyModules()?.lifecycle;
      lifecycle?.setTrailDepth?.(depth, options);
      lifecycle?.refreshCompositionState?.();
      refreshSvelteCompositionState();
      syncSvelteNavFromLegacy();
    },
    setSemanticDiveMode: (enabled: boolean) => {
      setSvelteSemanticDiveMode(enabled);
      setSvelteTrailDepth(enabled ? 2 : 1);
      getLegacyModules()?.lifecycle?.setSemanticDiveMode?.(enabled);
      refreshSvelteCompositionState();
      syncSvelteNavFromLegacy();
    },
    returnToOverview: () => {
      getLegacyModules()?.lifecycle?.returnToOverview?.();
      syncSvelteNavFromLegacy();
    },
    resetExperienceState: () => {
      resetSvelteExperienceState();
      getLegacyModules()?.lifecycle?.resetExperienceState?.();
    },
    resetExplorationFocus: (options?: Record<string, unknown>) => {
      resetSvelteExplorationFocus(options);
      getLegacyModules()?.lifecycle?.resetExplorationFocus?.(options);
    },
    refreshCompositionState: () => {
      getLegacyModules()?.lifecycle?.refreshCompositionState?.();
      syncSvelteNavFromLegacy();
    },
    traverseNeighbor: (step: number) => {
      getLegacyModules()?.journey?.traverseNeighbor?.(step);
      syncSvelteNavFromLegacy();
    },
    inspectThreadNeighbor: (index: number, options?: Record<string, unknown>) => {
      return getLegacyModules()?.journey?.inspectThreadNeighbor?.(index, options);
    },
    pinThreadNeighbor: (index: number, options?: Record<string, unknown>) => {
      return getLegacyModules()?.journey?.pinThreadNeighbor?.(index, options);
    },
    unpinThreadInspection: () => {
      return getLegacyModules()?.journey?.unpinThreadInspection?.();
    },
    clearThreadInspection: (options?: Record<string, unknown>) => {
      return getLegacyModules()?.journey?.clearThreadInspection?.(options);
    },
    walkThreadNeighbor: (index: number, options?: Record<string, unknown>) => {
      const result = getLegacyModules()?.journey?.walkThreadNeighbor?.(index, options);
      syncSvelteNavFromLegacy();
      return result;
    },
    requestSemanticGuide: (point?: unknown) => {
      getLegacyModules()?.semanticGuide?.requestSemanticGuide?.(point);
    },
    showSemanticThreadsDetail: () => {
      return getLegacyModules()?.connectionAnalysis?.showSemanticThreadsDetail?.();
    }
  };

  void loadLegacyActionModules().catch((error) => {
    console.error('[window-actions] Failed to preload legacy action modules:', error);
  });

  return () => {
    if (w.__APP_ACTIONS__ === previousActions) return;
    if (previousActions) {
      w.__APP_ACTIONS__ = previousActions;
    } else {
      delete w.__APP_ACTIONS__;
    }
  };
}
