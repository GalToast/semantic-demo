import type { RouterMatrixEntry, CapabilityAxis } from "../v2-sprint1/types";

/**
 * Capability gating (R4): filter matrix rows to ONLY those that satisfy the capability
 * axis request. Per types.ts:
 *   cap_axis === 'vision'  → keep entry.canVision === true
 *   cap_axis === 'toolUse' → keep entry.canToolUse === true && entry.toolExecutionReliability !== 'LOW'
 *   cap_axis === 'code'    → keep entry.canCode === true
 */
export function filterByCapability(
  matrix: RouterMatrixEntry[],
  cap_axis: CapabilityAxis,
): RouterMatrixEntry[] {
  return matrix.filter((entry) => hasCapabilityForAxis(entry, cap_axis));
}

/**
 * Context-window filter (gap #4): if `requestContextWindow` is supplied, drop matrix rows whose
 * `contextWindowLimit < requestContextWindow`. Trivial when cap_axis==='longContext' (covered by
 * `longContext` derived flag); for other cap_axises it is an optional extra filter pass.
 */
export function filterByContextWindow(
  matrix: RouterMatrixEntry[],
  requestContextWindow: number,
): RouterMatrixEntry[] {
  return matrix.filter((entry) => hasContextWindow(entry, requestContextWindow));
}

/**
 * Combined filter: capability (R4) AND context-window (#4) in one pass.
 * Returns rows passing BOTH filters.
 */
export function filterForDispatch(
  matrix: RouterMatrixEntry[],
  cap_axis: CapabilityAxis,
  requestContextWindow?: number,
): RouterMatrixEntry[] {
  let survivors = filterByCapability(matrix, cap_axis);
  if (requestContextWindow !== undefined && requestContextWindow > 0) {
    survivors = filterByContextWindow(survivors, requestContextWindow);
  }
  return survivors;
}

/** Affinity-map signature surface (gap #9 partial — full per-(carrier,model) affinity in Sprint 3). */
export type CarrierAffinity = Record<string /* routeId */, number /* priority 0..N where lowest=first trip priority */>;

/** Normalised reliability rank: HIGH = 0 (best), MEDIUM = 1, LOW = 2 (worst). */
const RELIABILITY_RANK: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/**
 * Returns routeIds of surviving matrix entries ranked by affinity priority.
 * Sort key (lower = higher dispatch priority):
 *   1. toolExecutionReliability rank: HIGH=0, MEDIUM=1, LOW=2
 *   2. streamingSmooth === true ? 0 : 1
 *   3. qualityPerCapability[cap_axis] DESC (higher score = better priority)
 *
 * If multiple matrix rows share the same routeId, the row with the highest rank wins
 * (lowest priority number is kept).
 */
export function rankRoutesByAffinity(
  matrix: RouterMatrixEntry[],
  m_id: string,
  cap_axis: CapabilityAxis,
): CarrierAffinity {
  // Step 1 — capability-filtered, model-filtered candidate rows
  const candidates = filterByCapability(matrix, cap_axis).filter(
    (e) => e.modelId === m_id,
  );

  // Step 2 — compute composite sort key for each candidate
  type Scored = {
    routeId: string;
    relRank: number;
    streamRank: number;
    quality: number;
  };

  const scored: Scored[] = candidates.map((e) => {
    const routeId = e.preferredCarrierKey ?? e.modelId;
    const relRank = RELIABILITY_RANK[e.toolExecutionReliability];
    const streamRank = e.streamingSmooth ? 0 : 1;
    const quality = e.qualityPerCapability[cap_axis] ?? 0;
    return { routeId, relRank, streamRank, quality };
  });

  // Step 3 — sort ascending by composite key (lower = better)
  scored.sort((a, b) => {
    if (a.relRank !== b.relRank) return a.relRank - b.relRank;
    if (a.streamRank !== b.streamRank) return a.streamRank - b.streamRank;
    // Higher quality DESC → lower number gets better priority, so reverse
    return b.quality - a.quality;
  });

  // Step 4 — build affinity map: routeId → priority (0 = first trip)
  // If the same routeId appears again with a worse key, ignore it.
  const seen = new Set<string>();
  const affinity: CarrierAffinity = {};
  let priority = 0;

  for (const s of scored) {
    if (seen.has(s.routeId)) continue;
    seen.add(s.routeId);
    affinity[s.routeId] = priority;
    priority += 1;
  }

  return affinity;
}

/** Dropped-reason description for a single matrix row. */
interface DroppedReason {
  routeId: string;
  modelId: string;
  reason: string;
}

/**
 * Returns `X-Router-Capability-Unsatisfied` header value (URL-encoded JSON).
 *
 * URL-encoded JSON shape:
 *   {
 *     axis: cap_axis,
 *     dropped: [{ routeId, modelId, reason }],
 *     attemptTs: ISOString
 *   }
 *
 * The dropped[] list captures every matrix row whose capability axis check failed.
 */
export function buildCapabilityUnsatisfiedHeader(
  matrix: RouterMatrixEntry[],
  cap_axis: CapabilityAxis,
): string {
  const dropped: DroppedReason[] = [];

  for (const entry of matrix) {
    if (!hasCapabilityForAxis(entry, cap_axis)) {
      const routeId = entry.preferredCarrierKey ?? entry.modelId;
      let reason: string;
      switch (cap_axis) {
        case "vision":
          reason = "canVision is false";
          break;
        case "toolUse":
          if (!entry.canToolUse) {
            reason = "canToolUse is false";
          } else {
            reason = `toolExecutionReliability is ${entry.toolExecutionReliability}`;
          }
          break;
        case "code":
          reason = "canCode is false";
          break;
        default:
          reason = "capability not supported";
      }
      dropped.push({ routeId, modelId: entry.modelId, reason });
    }
  }

  const payload = {
    axis: cap_axis,
    dropped,
    attemptTs: new Date().toISOString(),
  };

  return encodeURIComponent(JSON.stringify(payload));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal predicates
// ═══════════════════════════════════════════════════════════════════════════════

/** Returns whether the matrix entry satisfies the requested capability axis. */
function hasCapabilityForAxis(
  entry: RouterMatrixEntry,
  cap_axis: CapabilityAxis,
): boolean {
  switch (cap_axis) {
    case "vision":
      return entry.canVision === true;
    case "toolUse":
      return entry.canToolUse === true && entry.toolExecutionReliability !== "LOW";
    case "code":
      return entry.canCode === true;
    default:
      // Exhaustive check for CapabilityAxis union
      return false;
  }
}

/**
 * Returns true when `entry.contextWindowLimit >= requestContextWindow`.
 * If `entry.contextWindowLimit` is undefined or 0 (likely sparse-catalog entries),
 * returns false conservatively.
 */
function hasContextWindow(
  entry: RouterMatrixEntry,
  requestContextWindow: number,
): boolean {
  const limit = entry.contextWindowLimit;
  if (limit === undefined || limit === 0) {
    return false;
  }
  return limit >= requestContextWindow;
}
