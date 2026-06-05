/**
 * @lib/stores/navigation.ts — Navigation state store
 *
 * Replaces the navState slice from state.js.
 * Typed transition function replaces dispatchNavTransition.
 */
import { writable, derived, get } from 'svelte/store';
import type { NavState, NavMode, PanelSurface } from '@lib/types/state';

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

/** Primary navState store — use update() or set() for safe mutations */
export const navState = writable<NavState>({ ...INITIAL_NAV_STATE });

// ── Derived convenience stores ────────────────────────────────────────────────

export const isOverview = derived(navState, ($nav) => $nav.mode === 'overview');
export const isExploration = derived(navState, ($nav) =>
  $nav.mode === 'trail' || $nav.mode === 'focus' || $nav.mode === 'inside'
);
export const hasFocus = derived(navState, ($nav) =>
  $nav.mode === 'focus' || $nav.mode === 'inside' || $nav.focusedIndex !== null
);
export const hasTrail = derived(navState, ($nav) => $nav.trailDepth > 0);
export const currentMode = derived(navState, ($nav) => $nav.mode);
export const currentSurface = derived(navState, ($nav) => $nav.surface);
export const trailDepth = derived(navState, ($nav) => $nav.trailDepth);
export const focusedIndex = derived(navState, ($nav) => $nav.focusedIndex);

// ── Navigation transition actions (typed replacement for NAV_TRANSITION_ACTIONS) ──

export const NAV_TRANSITION_ACTIONS = {
  FOCUS_NODE: 'focus-node',
  RETURN_OVERVIEW: 'return-overview',
  TRAVERSE_NEIGHBOR: 'traverse-neighbor',
  WALK_THREAD: 'walk-thread',
  SET_SURFACE: 'set-surface',
  RESET: 'reset'
} as const;

export type NavTransitionAction =
  (typeof NAV_TRANSITION_ACTIONS)[keyof typeof NAV_TRANSITION_ACTIONS];

export interface NavTransitionPayload {
  index?: number;
  skipHistory?: boolean;
  reason?: string;
  surface?: PanelSurface;
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
  const current = get(navState);

  switch (action) {
    case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
      if (!Number.isFinite(payload.index)) {
        return { handled: false, noOp: true, reason: 'invalid-index' };
      }
      navState.update((s) => ({
        ...s,
        mode: 'focus',
        focusedIndex: payload.index ?? null,
        previousSurface: s.surface,
        explorationHistoryIndices: payload.skipHistory
          ? s.explorationHistoryIndices
          : [...s.explorationHistoryIndices, payload.index!]
      }));
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW: {
      navState.update((s) => ({
        ...s,
        mode: 'overview',
        focusedIndex: null,
        trailSeedIndex: null,
        trailDepth: 0,
        trailCursor: -1,
        surface: 'idle'
      }));
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.SET_SURFACE: {
      if (!payload.surface) {
        return { handled: false, noOp: true, reason: 'no-surface' };
      }
      navState.update((s) => ({
        ...s,
        surface: payload.surface!,
        previousSurface: s.surface
      }));
      return { handled: true };
    }

    case NAV_TRANSITION_ACTIONS.RESET: {
      navState.set({ ...INITIAL_NAV_STATE });
      return { handled: true };
    }

    default:
      return { handled: false, noOp: true, reason: 'unknown-action' };
  }
}

/** Reset nav state to initial */
export function resetNavState(): void {
  navState.set({ ...INITIAL_NAV_STATE });
}

/** Update a single field safely via callback */
export function updateNavState(mutator: (current: NavState) => Partial<NavState>): void {
  navState.update((current) => ({ ...current, ...mutator(current) }));
}
