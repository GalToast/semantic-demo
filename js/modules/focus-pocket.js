/**
 * focus-pocket.js — Delegation shim to canonical src/lib implementation.
 *
 * Legacy tests import from js/modules/focus-pocket.js.
 * All logic lives in src/lib/journey/focus-pocket.ts.
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
} from '../../src/lib/journey/focus-pocket.ts';
