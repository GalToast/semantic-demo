/**
 * @lib/focus/pocket.ts — Thin re-export from journey/focus-pocket.ts
 *
 * W7-B Pair 3 collapse: the canonical implementation lives in
 * @lib/journey/focus-pocket. This file is kept as a forwarding
 * module so existing import paths continue to resolve.
 *
 * Once all consumers migrate to @lib/journey/focus-pocket,
 * this file can be deleted.
 */
export {
    getFocusPocketIndices,
    setFocusPocketIndices,
    getFocusPocketRoleByIndex,
    setFocusPocketRoleByIndex,
    setFocusPocketRoleForIndex,
    clearFocusPocketRoleByIndex,
    getFocusPocketMotionByIndex,
    setFocusPocketMotionByIndex,
    setFocusPocketMotionForIndex,
    clearFocusPocketMotionByIndex,
    clearFocusPocketIndices,
    getFocusPocketMeta,
    setFocusPocketMeta,
    clearFocusPocketMeta,
    applyLocalNeighborhoodFocus,
    syncPocketNodesToStore,
    applyFocusPocketBreathing,
    syncRuntimeState,
    getRuntimeStateSnapshot
} from '@lib/journey/focus-pocket'
