/**
 * @lib/stores/navigation.ts — Navigation state store (view handoff, mode switching)
 *
 * Replaces:
 *   - js/modules/lifecycle.js (view handoff, composition state)
 *   - Navigation slices from js/state.js
 *   - js/modules/navigation-state.js (trail/thread state)
 *
 * The navigation store owns the current view mode, surface, focus index,
 * and all view-handoff state. It is the single source of truth for
 * "where the user is" in the application.
 */
import { writable, derived } from 'svelte/store';
import type { NavState, NavMode, PanelSurface } from '@lib/types/state';
import { journeyStore } from './journey';

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const NAVIGATION_CONFIG = {
  /** Scene reveal duration (ms). */
  SCENE_REVEAL_DURATION_MS: 1650,
  /** Loading minimum visible duration (ms). */
  LOADING_MIN_VISIBLE_MS: 1320,
  /** Base auto-rotate speed. */
  AUTO_ROTATE_BASE_SPEED: 0.34,
  /** Delay before auto-rotate resumes after idle (ms). */
  AUTO_ROTATE_IDLE_MS: 3600,
  /** Delay before auto-rotate resumes after manual interaction (ms). */
  AUTO_ROTATE_MANUAL_IDLE_MS: 5200,
  /** Duration of the soft resume ramp (ms). */
  AUTO_ROTATE_SOFT_RESUME_MS: 1800,
  /** Mycelium mode descriptions. */
  MODE_DESCRIPTIONS: {} as Record<string, string>,
  /** Story prompt descriptions. */
  STORY_DESCRIPTIONS: {} as Record<string, string>
} as const;

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_NAV_STATE: NavState = {
  mode: 'overview',
  surface: 'idle',
  previousSurface: 'idle',
  focusedIndex: null,
  trailSeedIndex: null,
  trailNeighborIndices: [],
  trailCursor: -1,
  trailDepth: 0,
  walkHistoryIndices: [],
  lastTraversalReason: null,
  threadCandidates: [],
  threadReasonByIndex: new Map(),
  threadSource: 'geometric-fallback',
  focusPocketIndices: [],
  focusPocketMeta: null,
  focusPocketRoleByIndex: new Map(),
  focusPocketAnimationFrameId: null,
  focusFramingMeta: null,
  currentPersonality: null,
  neighborhoodIndices: [],
  explorationHistoryIndices: []
};

// ── Extended Navigation Store ────────────────────────────────────────────────

export interface NavStoreState extends NavState {
  /** Current view: 'galaxy' | 'map'. */
  currentView: 'galaxy' | 'map';
  /** Whether auto-rotate is enabled. */
  autoRotate: boolean;
  /** Whether auto-rotate is suspended (by user interaction). */
  autoRotateSuspended: boolean;
  /** Active story prompt (for guided storytelling). */
  activeStoryPrompt: string | null;
  /** Mycelium rendering mode. */
  myceliumMode: string;
  /** Trail depth as a derived value from exploration. */
  trailDepthFromExploration: number;
  /** Scene reveal state. */
  sceneRevealActive: boolean;
  /** Scene reveal started timestamp. */
  sceneRevealStartedAt: number;
  /** Loading phase key. */
  loadingPhaseKey: string;
  /** Whether URL state is being applied (suppresses certain side effects). */
  applyingUrlState: boolean;
  /** Whether browser history restoration is in progress. */
  restoringBrowserHistory: boolean;
  /** URL state restore token. */
  urlStateRestoreToken: number;
}

const INITIAL_STORE: NavStoreState = {
  ...INITIAL_NAV_STATE,
  currentView: 'galaxy',
  autoRotate: false,
  autoRotateSuspended: false,
  activeStoryPrompt: null,
  myceliumMode: 'default',
  trailDepthFromExploration: 0,
  sceneRevealActive: false,
  sceneRevealStartedAt: 0,
  loadingPhaseKey: 'records',
  applyingUrlState: false,
  restoringBrowserHistory: false,
  urlStateRestoreToken: 0
};

// ── Store ────────────────────────────────────────────────────────────────────

export const navStore = writable<NavStoreState>({ ...INITIAL_STORE });

/** Backwards-compatible alias — App.svelte and components import `navState`. */
export const navState = navStore;

// ── Derived ──────────────────────────────────────────────────────────────────

export const isOverview = derived(navStore, ($nav) => $nav.mode === 'overview');
export const isExploration = derived(navStore, ($nav) =>
  $nav.mode === 'trail' || $nav.mode === 'focus' || $nav.mode === 'inside'
);
export const hasFocus = derived(navStore, ($nav) =>
  $nav.mode === 'focus' || $nav.mode === 'inside' || $nav.focusedIndex !== null
);
export const hasTrail = derived(navStore, ($nav) => $nav.trailDepth > 0);
export const currentMode = derived(navStore, ($nav) => $nav.mode);
export const currentSurface = derived(navStore, ($nav) => $nav.surface);
export const focusedIndex = derived(navStore, ($nav) => $nav.focusedIndex);
export const currentView = derived(navStore, ($nav) => $nav.currentView);
export const myceliumMode = derived(navStore, ($nav) => $nav.myceliumMode);
export const isMapMode = derived(navStore, ($nav) => $nav.currentView === 'map');
export const loadingPhase = derived(navStore, ($nav) => $nav.loadingPhaseKey);

// ── Navigation Transition Actions (typed replacement for lifecycle.js) ───────

export const NAV_TRANSITION_ACTIONS = {
  FOCUS_NODE: 'focus-node',
  RETURN_OVERVIEW: 'return-overview',
  TRAVERSE_NEIGHBOR: 'traverse-neighbor',
  WALK_THREAD: 'walk-thread',
  SET_SURFACE: 'set-surface',
  SET_VIEW: 'set-view',
  RESET: 'reset'
} as const;

export type NavTransitionAction =
  (typeof NAV_TRANSITION_ACTIONS)[keyof typeof NAV_TRANSITION_ACTIONS];

export interface NavTransitionPayload {
  index?: number;
  skipHistory?: boolean;
  reason?: string;
  surface?: PanelSurface;
  view?: 'galaxy' | 'map';
}

export interface NavTransitionResult {
  handled: boolean;
  noOp?: boolean;
  reason?: string;
}

/**
 * Type-safe navigation transition dispatcher.
 * Replaces the stringly-typed dispatchNavTransition from lifecycle.js.
 */
export function dispatchNavTransition(
  action: NavTransitionAction,
  payload: NavTransitionPayload = {}
): NavTransitionResult {
  switch (action) {
    case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
      if (!Number.isFinite(payload.index)) {
        return { handled: false, noOp: true, reason: 'invalid-index' };
      }
      navStore.update((s) => ({
        ...s,
        mode: 'focus',
        focusedIndex: payload.index ?? null,
        previousSurface: s.surface,
        surface: 'focus',
        explorationHistoryIndices: payload.skipHistory
          ? s.explorationHistoryIndices
          : [...s.explorationHistoryIndices, payload.index!]
      }));
      // Body dataset sync is handled by the parity-attrs layer.
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW: {
      navStore.update((s) => ({
        ...s,
        mode: 'overview',
        focusedIndex: null,
        trailSeedIndex: null,
        trailDepth: 0,
        trailCursor: -1,
        trailNeighborIndices: [],
        walkHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: 'geometric-fallback',
        surface: 'idle'
      }));
      // Reset journeyStore trail fields to stay consistent with navStore.
      journeyStore.update((s) => ({
        ...s,
        trailDepth: 0,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        walkHistoryIndices: [],
        threadCandidates: [],
      }));
      // Body dataset sync is handled by the parity-attrs layer.
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.SET_SURFACE: {
      if (!payload.surface) {
        return { handled: false, noOp: true, reason: 'no-surface' };
      }
      // Derive mode from surface for base surfaces that map 1:1 to a NavMode.
      // Compound surfaces (focus-search, map-focus, etc.) do NOT derive mode.
      const SURFACE_TO_MODE: Partial<Record<PanelSurface, NavMode>> = {
        search: 'search',
        focus: 'focus',
        inside: 'inside',
      };
      const derivedMode = SURFACE_TO_MODE[payload.surface!];

      navStore.update((s) => ({
        ...s,
        surface: payload.surface!,
        previousSurface: s.surface,
        ...(derivedMode ? { mode: derivedMode } : {})
      }));
      // Body dataset sync is handled by the parity-attrs layer.
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.SET_VIEW: {
      if (!payload.view) {
        return { handled: false, noOp: true, reason: 'no-view' };
      }
      navStore.update((s) => ({
        ...s,
        currentView: payload.view!
      }));
      // Body dataset sync is handled by the parity-attrs layer.
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.RESET: {
      navStore.set({ ...INITIAL_STORE });
      return { handled: true };
    }

    default:
      return { handled: false, noOp: true, reason: 'unknown-action' };
  }
}

// ── Actions: View ────────────────────────────────────────────────────────────

/** Switch between galaxy and map view. */
export function switchView(view: 'galaxy' | 'map'): void {
  navStore.update((s) => ({ ...s, currentView: view }));
  // Body dataset sync is handled by the parity-attrs layer.
}

// ── Actions: Focus ───────────────────────────────────────────────────────────

/** Set the focused node index. */
export function setFocusedIndex(index: number | null): void {
  navStore.update((s) => ({
    ...s,
    focusedIndex: index,
    mode: index !== null ? 'focus' : s.mode
  }));
  // Body dataset sync is handled by the parity-attrs layer.
}

// ── Actions: Mode ────────────────────────────────────────────────────────────

/** Set the navigation mode. */
export function setNavMode(mode: NavMode): void {
  navStore.update((s) => ({ ...s, mode }));
  // Body dataset sync is handled by the parity-attrs layer.
}

/** Set the panel surface. */
export function setSurface(surface: PanelSurface): void {
  navStore.update((s) => ({
    ...s,
    surface,
    previousSurface: s.surface
  }));
  // Body dataset sync is handled by the parity-attrs layer.
}

// ── Actions: Auto-Rotate ─────────────────────────────────────────────────────

/** Set auto-rotate enabled/disabled. */
export function setAutoRotate(enabled: boolean): void {
  navStore.update((s) => ({ ...s, autoRotate: enabled }));
}

/** Suspend auto-rotate. */
export function suspendAutoRotate(): void {
  navStore.update((s) => ({ ...s, autoRotateSuspended: true }));
}

/** Resume auto-rotate. */
export function resumeAutoRotate(): void {
  navStore.update((s) => ({ ...s, autoRotateSuspended: false }));
}

// ── Actions: Loading ─────────────────────────────────────────────────────────

/** Set the loading phase key. */
export function setLoadingPhase(phase: string): void {
  navStore.update((s) => ({ ...s, loadingPhaseKey: phase }));
  // Body dataset sync is handled by the parity-attrs layer.
}

// ── Actions: Scene Reveal ────────────────────────────────────────────────────

/** Start the scene reveal animation. */
export function startSceneReveal(): void {
  navStore.update((s) => ({
    ...s,
    sceneRevealActive: true,
    sceneRevealStartedAt: performance.now()
  }));
}

/** Complete the scene reveal. */
export function completeSceneReveal(): void {
  navStore.update((s) => ({ ...s, sceneRevealActive: false }));
}

// ── Actions: Story ───────────────────────────────────────────────────────────

/** Set the active story prompt. */
export function setActiveStoryPrompt(prompt: string | null): void {
  navStore.update((s) => ({ ...s, activeStoryPrompt: prompt }));
}

// ── Actions: Mycelium Mode ───────────────────────────────────────────────────

/** Set the mycelium rendering mode. */
export function setMyceliumMode(mode: string): void {
  navStore.update((s) => ({ ...s, myceliumMode: mode }));
}

// ── Actions: URL State ───────────────────────────────────────────────────────

/** Set the applying URL state flag. */
export function setApplyingUrlState(applying: boolean): void {
  navStore.update((s) => ({ ...s, applyingUrlState: applying }));
}

/** Set the restoring browser history flag. */
export function setRestoringBrowserHistory(restoring: boolean): void {
  navStore.update((s) => ({ ...s, restoringBrowserHistory: restoring }));
}

/** Bump the URL state restore token. */
export function bumpUrlStateRestoreToken(): number {
  let token = 0;
  navStore.update((s) => {
    token = s.urlStateRestoreToken + 1;
    return { ...s, urlStateRestoreToken: token };
  });
  return token;
}

// ── Actions: Focus Pocket ────────────────────────────────────────────────────

/** Set the focus pocket indices. */
export function setFocusPocketIndices(indices: readonly number[]): void {
  navStore.update((s) => ({ ...s, focusPocketIndices: indices }));
}

/** Clear the focus pocket indices. */
export function clearFocusPocketIndices(): void {
  navStore.update((s) => ({
    ...s,
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: new Map()
  }));
}

/** Set the focus pocket meta. */
export function setFocusPocketMeta(meta: NavState['focusPocketMeta']): void {
  navStore.update((s) => ({ ...s, focusPocketMeta: meta }));
}

/** Clear the focus pocket meta. */
export function clearFocusPocketMeta(): void {
  navStore.update((s) => ({ ...s, focusPocketMeta: null }));
}

// ── Update Helper ────────────────────────────────────────────────────────────

/** Update a single field safely via callback. */
export function updateNavState(mutator: (current: NavStoreState) => Partial<NavStoreState>): void {
  navStore.update((current) => ({ ...current, ...mutator(current) }));
}

// ── Full Reset ───────────────────────────────────────────────────────────────

/** Reset nav state to initial. */
export function resetNavState(): void {
  navStore.set({ ...INITIAL_STORE });
  // Body dataset sync is handled by the parity-attrs layer.
}
