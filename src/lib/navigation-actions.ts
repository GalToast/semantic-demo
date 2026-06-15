/**
 * @lib/navigation-actions.ts — Canonical navigation action constants
 *
 * Single source of truth for all NAV_TRANSITION_ACTIONS values.
 * Imported by both the Svelte store layer and the engine kernel.
 * Kept in a leaf file with zero dependencies to avoid circular imports.
 */

export const NAV_TRANSITION_ACTIONS = Object.freeze({
  FOCUS_NODE: 'focus-node',
  RETURN_OVERVIEW: 'return-overview',
  TRAVERSE_NEIGHBOR: 'traverse-neighbor',
  WALK_THREAD: 'walk-thread',
  WALK_TO: 'walk-to',
  SET_SURFACE: 'set-surface',
  SET_VIEW: 'set-view',
  RESET: 'reset',
  SET_DEPTH: 'set-depth',
  BACKTRACK: 'backtrack',
  RESET_FOCUS: 'reset-focus',
  RESET_EXPERIENCE: 'reset-experience',
  ENTER_INSIDE: 'enter-inside',
  EXIT_INSIDE: 'exit-inside',
  RESTORE_EXPLORATION_HISTORY: 'restore-exploration-history',
} as const);

export type NavTransitionAction =
  typeof NAV_TRANSITION_ACTIONS[keyof typeof NAV_TRANSITION_ACTIONS];
