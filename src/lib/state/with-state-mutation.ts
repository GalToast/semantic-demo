// with-state-mutation.ts — typed extraction of the state mutation guard and key sets.
// Extracted from js/state.js for TS migration. The JS shim re-exports from here.

// ── Key Sets ─────────────────────────────────────────────────────────────────
// CRITICAL_KEYS: top-level properties that throw on direct mutation outside withStateMutation().
export const CRITICAL_KEYS = [
  'currentView',
  'navState',
  'semanticLaneState',
  'loadingPhaseKey',
  'semanticThreadsStatus',
  'rawPositionsBuffer',
  'rawClustersBuffer',
] as const;

export type CriticalKey = typeof CRITICAL_KEYS[number];

// TRACKED_SUB_KEYS: sub-object properties that are wrapped in nested Proxies.
// Writes outside withStateMutation() warn in dev mode (non-critical) or throw (if parent is CRITICAL).
export const TRACKED_SUB_KEYS = [
  'navState',
  'strandContinuityState',
  'focusOrbitSlackState',
  'terrainHandoffState',
  'routeExplorationState',
  'routeChoreographyState',
  'inspectedStrandDiagnostics',
  'arrivalHandoffDiagnostics',
  'routeTraceDiagnostics',
  'scenePerformanceDiagnostics',
  'activeFilters',
] as const;

export type TrackedSubKey = typeof TRACKED_SUB_KEYS[number];

// Runtime Sets for O(1) lookups (used by proxy traps in state.js).
export const CRITICAL_KEYS_SET = new Set<string>(CRITICAL_KEYS);
export const TRACKED_SUB_KEYS_SET = new Set<string>(TRACKED_SUB_KEYS);

// ── Mutation Guard ───────────────────────────────────────────────────────────
// Shared flag wrapped in an object so both this module and state.js's proxy traps
// reference the same mutable container. A bare `let` import would copy the value.
export const _isMutatingRef = { value: false };

/** Read the current mutating state (for proxy traps). */
export function isMutating(): boolean {
  return _isMutatingRef.value;
}

export function withStateMutation<T>(fn: () => T): T {
  const prev = _isMutatingRef.value;
  _isMutatingRef.value = true;
  try {
    return fn();
  } finally {
    _isMutatingRef.value = prev;
  }
}
