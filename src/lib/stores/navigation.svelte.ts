/**
 * @lib/stores/navigation.svelte.ts — Navigation state store (Svelte 5 runes)
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
import type { NavState, NavMode, PanelSurface } from '@lib/types/state';
import { writable, get, type Readable } from 'svelte/store';

// Legacy state fallback (transitional). The legacy js/state.js is the
// single source of truth during the migration. When the Svelte navigation
// store hasn't been populated by an init handler, fall back to it so the
// focused card / compass / surface attrs reflect real data.
function readLegacyNavField<T>(legacyKey: keyof LegacyNavState): T | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const w = window as unknown as {
      __semanticState?: { navState?: LegacyNavState };
      state?: { navState?: LegacyNavState };
      __APP_STATE__?: { navState?: LegacyNavState };
      __TEST_STATE__?: { navState?: LegacyNavState };
    };
    const nav = w.__APP_STATE__?.navState
      ?? w.__TEST_STATE__?.navState
      ?? w.__semanticState?.navState
      ?? w.state?.navState;
    return nav?.[legacyKey] as T | undefined;
  } catch {
    return undefined;
  }
}
interface LegacyNavState {
  focusedIndex?: number | null;
  surface?: string;
  mode?: string;
  currentView?: string;
  panelSurface?: string;
  panelSurfaceDetail?: string;
  focusPanelMode?: string;
}

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
  threadSource: '',
  focusPocketIndices: [],
  focusPocketMeta: null,
  focusPocketRoleByIndex: new Map(),
  focusPocketAnimationFrameId: null,
  focusFramingMeta: null,
  currentPersonality: null,
  neighborhoodIndices: [],
  explorationHistoryIndices: [],
  currentView: 'galaxy',
  myceliumMode: 'dormant',
  autoRotate: true,
  autoRotateSuspended: false,
  trailDepthFromExploration: 0,
  sceneRevealActive: false,
  sceneRevealStartedAt: 0,
  loadingPhaseKey: 'records',
  applyingUrlState: false,
  restoringBrowserHistory: false,
  urlStateRestoreToken: 0
};

// ── Store ────────────────────────────────────────────────────────────────────

const _navWritable = writable<NavState>({ ...INITIAL_NAV_STATE });

// ── NavStore API ─────────────────────────────────────────────────────────────
// navStore is a hybrid: callable as navStore() for Svelte 5 rune consumers,
// and satisfies Readable<NavState> + .update()/.set() for .ts orchestration consumers.

/** NavStore type: callable function that also satisfies Readable + Writable-ish. */
export type NavStoreApi = (() => NavState) &
  Readable<NavState> & {
    update(fn: (s: NavState) => NavState): void;
    set(value: NavState): void;
  };

/** Backward-compat alias used by barrel exports. */
export type NavStoreState = NavStoreApi;

function _createNavStore(): NavStoreApi {
  const fn = (() => get(_navWritable)) as NavStoreApi;

  // Satisfy Readable<NavState> so get(navStore) from svelte/store works.
  fn.subscribe = _navWritable.subscribe;

  // Writable-style update for navStore.update(s => ({...s, ...}))
  fn.update = _navWritable.update;

  // Writable-style set for navStore.set(state)
  fn.set = _navWritable.set;

  return fn;
}

/** Single reactive instance of the navigation state. */
export const navStore: NavStoreApi = _createNavStore();

// ── Derived Getters (Svelte 5 requires getters for module-level reactive exports) ──

export const isOverview = () => get(_navWritable).mode === 'overview';
export const isExploration = () => 
  get(_navWritable).mode === 'trail' || get(_navWritable).mode === 'focus' || get(_navWritable).mode === 'inside';
export const hasFocus = () => {
  const local = get(_navWritable);
  if (local.mode === 'focus' || local.mode === 'inside' || local.focusedIndex !== null) {
    return true;
  }
  const legacyMode = readLegacyNavField<string>('mode');
  if (legacyMode === 'focus' || legacyMode === 'inside') return true;
  const legacyFocused = readLegacyNavField<number | null>('focusedIndex');
  if (legacyFocused != null && Number.isFinite(legacyFocused)) return true;
  return false;
};
export const hasTrail = () => get(_navWritable).trailDepth > 0;
export const currentMode = (): string => {
  const local = get(_navWritable).mode;
  if (local) return local;
  const legacy = readLegacyNavField<string>('mode');
  if (legacy) return legacy;
  return local;
};
export const currentSurface = (): string => {
  const local = get(_navWritable).surface;
  if (local) return local;
  const legacy = readLegacyNavField<string>('surface');
  if (legacy) return legacy;
  return local;
};
export const focusedIndex = () => {
  const local = get(_navWritable).focusedIndex;
  if (local != null && Number.isFinite(local)) return local;
  const legacy = readLegacyNavField<number | null>('focusedIndex');
  if (legacy != null && Number.isFinite(legacy)) return legacy;
  return local;
};
export const currentView = (): string => {
  const local = get(_navWritable).currentView;
  if (local) return local;
  const legacy = readLegacyNavField<string>('currentView');
  if (legacy) return legacy;
  return local;
};
export const myceliumMode = () => get(_navWritable).myceliumMode;
export const isMapMode = () => get(_navWritable).currentView === 'map';
export const loadingPhase = () => get(_navWritable).loadingPhaseKey;

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

export type NavTransitionAction = typeof NAV_TRANSITION_ACTIONS[keyof typeof NAV_TRANSITION_ACTIONS];

export interface NavTransitionPayload {
  index?: number | null;
  mode?: NavMode;
  surface?: PanelSurface;
  view?: 'galaxy' | 'map';
  reason?: string | null;
}

/** Result of a navigation transition (for async orchestration). */
export interface NavTransitionResult {
  ok: boolean;
  previousMode: NavMode;
  nextMode: NavMode;
}

/** Reset navigation state to initial values. */
export function resetNavState(): void {
  _navWritable.set({ ...INITIAL_NAV_STATE });
}

/** Generic state update (wrapped in $state assignment). */
export function updateNavState(patch: Partial<NavState>): void {
  _navWritable.update(s => ({ ...s, ...patch }));
}

/** Switch the primary view (galaxy/map). */
export function switchView(view: 'galaxy' | 'map'): void {
  _navWritable.update(s => ({ ...s, currentView: view }));
}

/** Set the focused node index. */
export function setFocusedIndex(index: number | null): void {
  _navWritable.update(s => ({ ...s, focusedIndex: index }));
}

/** Set the navigation mode. */
export function setNavMode(mode: NavMode): void {
  _navWritable.update(s => ({ ...s, mode }));
}

/** Set the active panel surface. */
export function setSurface(surface: PanelSurface): void {
  _navWritable.update(s => ({ ...s, previousSurface: s.surface, surface }));
}

/** Enable or disable auto-rotation. */
export function setAutoRotate(active: boolean): void {
  _navWritable.update(s => ({ ...s, autoRotate: active }));
}

/** Suspend auto-rotation (e.g. during hover/interaction). */
export function suspendAutoRotate(): void {
  _navWritable.update(s => ({ ...s, autoRotateSuspended: true }));
}

/** Resume auto-rotation. */
export function resumeAutoRotate(): void {
  _navWritable.update(s => ({ ...s, autoRotateSuspended: false }));
}

/** Set the current loading phase key. */
export function setLoadingPhase(phase: string): void {
  _navWritable.update(s => ({ ...s, loadingPhaseKey: phase }));
}

/** Start the scene reveal sequence. */
export function startSceneReveal(): void {
  _navWritable.update(s => ({ ...s, sceneRevealActive: true, sceneRevealStartedAt: Date.now() }));
}

/** Complete the scene reveal sequence. */
export function completeSceneReveal(): void {
  _navWritable.update(s => ({ ...s, sceneRevealActive: false }));
}

/** Set the active story prompt (for UI sync). */
export function setActiveStoryPrompt(id: string | null): void {
  // Logic to handle story prompt mapping if needed
}

/** Set the mycelium mode (dormant|active|overdrive). */
export function setMyceliumMode(mode: string): void {
  _navWritable.update(s => ({ ...s, myceliumMode: mode as any }));
}

/** Set whether URL state is currently being applied. */
export function setApplyingUrlState(applying: boolean): void {
  _navWritable.update(s => ({ ...s, applyingUrlState: applying }));
}

/** Set whether browser history is currently being restored. */
export function setRestoringBrowserHistory(restoring: boolean): void {
  _navWritable.update(s => ({ ...s, restoringBrowserHistory: restoring }));
}

/** Increment the URL state restore token. */
export function bumpUrlStateRestoreToken(): number {
  _navWritable.update(s => ({ ...s, urlStateRestoreToken: s.urlStateRestoreToken + 1 }));
  return get(_navWritable).urlStateRestoreToken;
}

/** Set focus pocket specific indices. */
export function setFocusPocketIndices(indices: number[]): void {
  // Implementation for focus pocket state
}

/** Clear focus pocket indices. */
export function clearFocusPocketIndices(): void {
  // Implementation for focus pocket state
}

/** Set focus pocket metadata. */
export function setFocusPocketMeta(meta: any): void {
  // Implementation for focus pocket state
}

/** Clear focus pocket metadata. */
export function clearFocusPocketMeta(): void {
  // Implementation for focus pocket state
}

/** 
 * Dispatch a navigation transition (the core orchestrator). 
 * Replaces the heavy logic in js/modules/lifecycle.js.
 */
export function dispatchNavTransition(
  action: NavTransitionAction,
  payload: NavTransitionPayload = {}
): NavTransitionResult {
  const previousMode = get(_navWritable).mode;
  
  // High-level state machine logic (simplified for initial port)
  switch (action) {
    case 'focus-node':
      _navWritable.update(s => ({
        ...s,
        ...(payload.index !== undefined ? { focusedIndex: payload.index } : {}),
        mode: 'focus' as NavMode,
        surface: payload.surface ?? 'focus' as PanelSurface
      }));
      break;
    case 'return-overview':
      _navWritable.update(s => ({
        ...s,
        focusedIndex: null,
        mode: 'overview' as NavMode,
        surface: 'idle' as PanelSurface
      }));
      break;
    case 'set-view':
      if (payload.view) {
        const view: 'galaxy' | 'map' = payload.view;
        _navWritable.update(s => ({ ...s, currentView: view }));
      }
      break;
    case 'set-surface': {
      const surface = payload.surface ?? 'idle';
      _navWritable.update(s => ({
        ...s,
        previousSurface: s.surface,
        surface: surface as PanelSurface,
        // Derive mode from surface: search→search, focus→focus, inside→inside,
        // trail→trail, idle→overview. Map surfaces preserve current mode.
        mode: surface === 'search' ? 'search' :
              surface === 'focus' ? 'focus' :
              surface === 'inside' ? 'inside' :
              // Cast to string: 'trail' is a valid NavMode but PanelSurface
              // doesn't include it; dispatch code uses 'as any' to pass it.
              (surface as string) === 'trail' ? 'trail' :
              surface === 'idle' ? 'overview' :
              s.mode as NavMode
      }));
      break;
    }
    case 'traverse-neighbor':
      _navWritable.update(s => ({
        ...s,
        focusedIndex: payload.index ?? s.focusedIndex,
        mode: 'trail' as NavMode,
        surface: 'trail' as PanelSurface
      }));
      break;
    case 'walk-thread':
      _navWritable.update(s => ({
        ...s,
        focusedIndex: payload.index ?? s.focusedIndex,
        mode: 'trail' as NavMode,
        surface: 'trail' as PanelSurface
      }));
      break;
    case 'reset':
      resetNavState();
      break;
  }

  return {
    ok: true,
    previousMode,
    nextMode: get(_navWritable).mode
  };
}
