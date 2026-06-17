/**
 * @lib/orchestration/navigation-state.ts — Re-exports from legacy navigation-state.
 *
 * Provides canonical src/lib/ path for navigation state functions
 * so non-bridge src/ files don't import directly from js/modules/.
 */

export {
  clearTrailThreadState,
  clearNavigationFocusState,
  dispatchNavTransition,
  NAV_TRANSITION_ACTIONS,
  setTrailNavState,
} from '../../../js/modules/navigation-state';

export type { NavTransitionAction, NavTransitionResult, SetTrailNavStateOpts } from '../../../js/modules/navigation-state';
