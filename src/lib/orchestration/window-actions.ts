/**
 * Svelte production shell compatibility actions.
 *
 * The headed scene and visual contracts drive the live Three.js scene through
 * window.__APP_ACTIONS__. Keep these wrappers pointed at the sanctioned engine
 * bridge until those scene mutations are fully ported to src/.
 */

import {
  state as legacyState,
  withStateMutation,
  focusOnNode,
  search,
  clearSearch,
  switchView,
  setTrailDepth,
  setSemanticDiveMode,
  returnToOverview,
  resetExperienceState,
  resetExplorationFocus,
  refreshCompositionState,
  setTrailFromSeed,
  traverseNeighbor,
  inspectThreadNeighbor,
  pinThreadNeighbor,
  unpinThreadInspection,
  clearThreadInspection,
  walkThreadNeighbor,
  showSemanticThreadsDetail,
} from '@lib/engine/window-actions-bridge';
import * as semanticGuideModule from '@lib/journey/semantic-guide';
import {
  resetExperienceState as resetSvelteExperienceState,
  resetExplorationFocus as resetSvelteExplorationFocus
} from '@lib/stores/lifecycle';
import { clearSearch as clearSvelteSearch } from '@lib/stores/search';

type LegacyActionModules = {
  state?: Record<string, unknown>;
  withStateMutation?: <T>(fn: () => T) => T;
  camera?: {
    focusOnNode?: (index: number, options?: Record<string, unknown>) => boolean;
  };
  lifecycle?: {
    switchView?: (view: string, options?: Record<string, unknown>) => void;
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
    legacyModules = {
      state: legacyState,
      withStateMutation,
      camera: { focusOnNode },
      lifecycle: {
        switchView,
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

    const w = window as AppActionsWindow;
    if (legacyModules.state) {
      w.__APP_STATE__ ??= legacyModules.state;
      w.__TEST_STATE__ ??= legacyModules.state;
    }

    return legacyModules;
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
      clearSvelteSearch();
      getLegacyModules()?.search?.clearSearch?.(options);
    },
    switchView: (view: string, options?: Record<string, unknown>) => {
      normalizeLegacyNavState();
      getLegacyModules()?.lifecycle?.switchView?.(view, options);
    },
    focusOnNode: (index: number, options?: Record<string, unknown>) => {
      normalizeLegacyNavState();
      return getLegacyModules()?.camera?.focusOnNode?.(index, options) ?? false;
    },
    setTrailFromSeed: (index: number) => {
      getLegacyModules()?.journey?.setTrailFromSeed?.(index);
    },
    setTrailDepth: (depth: number, options?: Record<string, unknown>) => {
      normalizeLegacyNavState();
      const lifecycle = getLegacyModules()?.lifecycle;
      lifecycle?.setTrailDepth?.(depth, options);
      lifecycle?.refreshCompositionState?.();
    },
    setSemanticDiveMode: (enabled: boolean) => {
      getLegacyModules()?.lifecycle?.setSemanticDiveMode?.(enabled);
    },
    returnToOverview: () => {
      getLegacyModules()?.lifecycle?.returnToOverview?.();
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
    },
    traverseNeighbor: (step: number) => {
      getLegacyModules()?.journey?.traverseNeighbor?.(step);
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
      return getLegacyModules()?.journey?.walkThreadNeighbor?.(index, options);
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
