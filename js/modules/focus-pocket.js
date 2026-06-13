/**
 * focus-pocket.js — Delegation shim to the TypeScript migration source.
 *
 * Legacy tests import from js/modules/focus-pocket.js.
 * All logic lives in js/modules/focus-pocket.ts.
 */
export {
  getFocusPocketIndices,
  setFocusPocketIndices,
  clearFocusPocketIndices,
  getFocusPocketRoleByIndex,
  setFocusPocketRoleByIndex,
  setFocusPocketRoleForIndex,
  clearFocusPocketRoleByIndex,
  getFocusPocketMotionByIndex,
  setFocusPocketMotionByIndex,
  setFocusPocketMotionForIndex,
  clearFocusPocketMotionByIndex,
  getFocusPocketMeta,
  setFocusPocketMeta,
  clearFocusPocketMeta,
  applyLocalNeighborhoodFocus,
  applyFocusPocketBreathing,
  syncRuntimeState,
  getRuntimeStateSnapshot,
} from './focus-pocket.ts';
