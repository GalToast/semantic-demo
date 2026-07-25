/**
 * barrier-filter.ts — Sprint-2 gap #12 + #13
 *
 * #12  Degraded-variants opt-in filter (`X-Router-Allow-Degraded-Variants`)
 * #13  Force-pin header parsing (`X-Router-Force-Model: original | best`)
 */

import type { RouterMatrixEntry, ForceModelValue } from '../v2-sprint1/types';
import {
  ALLOW_DEGRADED_DEFAULT,
  X_ROUTER_FORCE_MODEL,
  X_ROUTER_ALLOW_DEGRADED_VAR,
} from '../v2-sprint1/types';

/* ───────────────────────────────────────────────────────────────────────────
   Gap #12 — degraded-variants filter
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Filters a router-capability matrix according to the caller's degraded-variant
 * preference.
 *
 * Rules:
 * 1. Entries whose `degradedVariantOf === undefined` (i.e. canonical / parent
 *    model rows) are **always** retained — they represent the non-degraded
 *    upstream model and are never suppressed by this filter.
 * 2. Entries whose `degradedVariantOf` is defined (e.g. `-flex`, `-fast`,
 *    `-short`, `-mini`, `-tiny` quantized variants) are retained **only** when
 *    `allowDegraded === true`.
 * 3. When `allowDegraded === false` (the default per `ALLOW_DEGRADED_DEFAULT`),
 *    all degraded-variant rows are removed from the returned array.
 *
 * @param matrix        — source matrix rows to filter.
 * @param allowDegraded — caller preference; defaults to `ALLOW_DEGRADED_DEFAULT`.
 * @returns             — a new array containing only the rows that pass the
 *                        degraded-variants gate.
 */
export function filterDegradedVariants(
  matrix: RouterMatrixEntry[],
  allowDegraded: boolean = ALLOW_DEGRADED_DEFAULT,
): RouterMatrixEntry[] {
  return matrix.filter((entry) => {
    // Non-degraded parent entries are always retained regardless of preference.
    if (entry.degradedVariantOf === undefined) {
      return true;
    }
    // Degraded variants survive only when the caller has explicitly opted in.
    return allowDegraded === true;
  });
}

/* ───────────────────────────────────────────────────────────────────────────
   Gap #13 — force-pin header helpers
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Determine whether the incoming request demands strict original-model
 * routing (no vertical descent).
 *
 * Per spec Q4 the header value is compared **case-sensitively**:
 * only the exact string `'original'` triggers the pin. Any other value,
 * including `'Original'` or `'ORIGINAL'`, is treated as unrecognized and
 * returns `false`, allowing the dispatcher to perform its normal descent.
 *
 * @param reqHeaders — Fetch-standard `Headers` instance from the incoming
 *                     router request.
 * @returns `true` when the header is present and exactly `'original'`;
 *          `false` when the header is absent or holds any other value.
 */
export function isForcePinned(reqHeaders: Headers): boolean {
  const raw = reqHeaders.get(X_ROUTER_FORCE_MODEL);
  if (raw === null) {
    return false;
  }
  return raw === 'original';
}

/**
 * Parse the `X-Router-Force-Model` header into a typed `ForceModelValue`.
 *
 * Valid literals (case-sensitive per spec Q4):
 * - `'original'` → forces the dispatcher to stay on T0 + T1 (same model id
 *   across all carrier routes) and skip vertical descent entirely.
 * - `'best'`     → explicitly requests the default ladder output; the
 *   dispatcher behaves as if no force-pin was supplied.
 *
 * Any absent or unrecognized value yields `undefined`, signalling the caller
 * to fall through to the normal descent composition logic.
 *
 * @param reqHeaders — Fetch-standard `Headers` instance.
 * @returns `'original'`, `'best'`, or `undefined`.
 */
export function parseForceModelValue(reqHeaders: Headers): ForceModelValue | undefined {
  const raw = reqHeaders.get(X_ROUTER_FORCE_MODEL);
  if (raw === null) {
    return undefined;
  }
  if (raw === 'original') {
    return 'original';
  }
  if (raw === 'best') {
    return 'best';
  }
  // Unrecognized literal — caller falls back to default descent behavior.
  return undefined;
}

/**
 * Apply a force-pin decision to a list of candidate descendants.
 *
 * Behaviour matrix:
 * | `forceModel` | Action                                                    |
 * |--------------|-----------------------------------------------------------|
 * | `undefined`  | Return `descendents` unchanged (default ladder).          |
 * | `'original'` | Keep only entries whose `modelId` === `requestedModelId`. |
 * | `'best'`     | Return `descendents` unchanged (`best` == default ladder). |
 *
 * The `'original'` branch is the work-horse for gap #13: it prunes away every
 * cross-family or lower-tier candidate so the dispatcher is limited to T0+T1
 * horizontal retries.
 *
 * @param forceModel       — parsed pin value from `parseForceModelValue()`.
 * @param requestedModelId — the original model id from the dispatch request
 *                           (honouring R1).
 * @param descendents      — candidate rows produced by `composeDescentChain()`.
 * @returns                — filtered or unfiltered array, depending on pin.
 */
export function applyForcePin<T extends { modelId: string }>(
  forceModel: ForceModelValue | undefined,
  requestedModelId: string,
  descendents: T[],
): T[] {
  if (forceModel === undefined) {
    return descendents;
  }
  if (forceModel === 'original') {
    return descendents.filter((d) => d.modelId === requestedModelId);
  }
  // `forceModel === 'best'` — no-op; the default ladder already is "best".
  return descendents;
}

/* ───────────────────────────────────────────────────────────────────────────
   Gap #12 (cont.) — degraded-variant opt-in header reader
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Read the `X-Router-Allow-Degraded-Variants` request header and return the
 * caller's degraded-variant preference as a boolean.
 *
 * Truth table:
 * - Header present with exact value `'true'`  (case-sensitive) → `true`
 *   (explicit opt-in, overrides `ALLOW_DEGRADED_DEFAULT`).
 * - Header absent                                               → `ALLOW_DEGRADED_DEFAULT`
 *   (`false` by default per spec Q3).
 * - Header present with exact value `'false'` (case-sensitive) → `false`
 *   (explicit opt-out).
 * - Header present with any other value                       → `false`
 *   (treated as unrecognized / safe default).
 *
 * @param reqHeaders — Fetch-standard `Headers` instance.
 * @returns `true` only when the header is exactly `'true'`; otherwise `false`.
 */
export function isAllowingDegradedVariants(reqHeaders: Headers): boolean {
  const raw = reqHeaders.get(X_ROUTER_ALLOW_DEGRADED_VAR);
  if (raw === null) {
    return ALLOW_DEGRADED_DEFAULT;
  }
  if (raw === 'true') {
    return true;
  }
  // `'false'` or any unrecognized string → do not allow degraded variants.
  return false;
}
