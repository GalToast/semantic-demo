import type { RouterMatrixEntry, CapabilityAxis } from "../v2-sprint1/types";

export interface Candidate {
  modelId: string;
  routeId: string;
  qualityScore: number;
  isPrimaryRoute: boolean;
  tier: 0 | 1 | 2 | 3 | 4;
}

/**
 * Compose the descent chain per spec Sprint-2 §`composeDescentChain` (spec lines 109-117).
 *
 * Tier outline:
 *   T0: [(m_id, primary_route)]                       — explicit request on primary route
 *   T1: [(m_id, r) for r in multiCarrierRouteIds(m_id) skipping primary]  — horizontal hop same model
 *   T2: [(cross_family_m, r) for cross_family in matrix.equivalentQualityBank(m_id, cap_axis); for r in multiCarrierRouteIds] — cross-family equivalent-quality band
 *   T3: one band drop per cap_axis; degrade by qualityPerCapability[cap_axis] value within the cross-family equivalent-quality matrix
 *   T4: second band drop (bounded by default to ≤2 total drops)
 *
 * After tier construction, applies allowDegradedVariants filter (#12) and capability gating (R4) in one pass.
 */
export function composeDescentChain(
  matrix: RouterMatrixEntry[],
  m_id: string,
  cap_axis: CapabilityAxis,
  force_pin: boolean,
  allow_dv: boolean,
): Candidate[] {
  let chain: Candidate[] = [];

  chain.push(...tier0(matrix, m_id, cap_axis));
  chain.push(...tier1(matrix, m_id, cap_axis));

  if (!force_pin) {
    chain.push(...tier2(matrix, m_id, cap_axis));
    chain.push(...tier3(matrix, m_id, cap_axis));
    chain.push(...tier4(matrix, m_id, cap_axis));
  }

  chain = applyDegradedAndCapabilityFilter(chain, matrix, allow_dv, cap_axis);
  return chain;
}

/* ── Tier builders (private) ── */

function tier0(matrix: RouterMatrixEntry[], m_id: string, cap_axis: CapabilityAxis): Candidate[] {
  const routeId = primaryRouteIdForModel(matrix, m_id, cap_axis);
  if (routeId === undefined) return [];

  const q = qualityNow(m_id, matrix, cap_axis);
  return [
    {
      modelId: m_id,
      routeId,
      qualityScore: q,
      isPrimaryRoute: true,
      tier: 0,
    },
  ];
}

function tier1(matrix: RouterMatrixEntry[], m_id: string, cap_axis: CapabilityAxis): Candidate[] {
  const primary = primaryRouteIdForModel(matrix, m_id, cap_axis);
  const routes = multiCarrierRouteIds(matrix, m_id);
  const q = qualityNow(m_id, matrix, cap_axis);
  const out: Candidate[] = [];

  for (const routeId of routes) {
    if (routeId === primary) continue;
    out.push({
      modelId: m_id,
      routeId,
      qualityScore: q,
      isPrimaryRoute: false,
      tier: 1,
    });
  }

  return out;
}

function tier2(matrix: RouterMatrixEntry[], m_id: string, cap_axis: CapabilityAxis): Candidate[] {
  const bank = equivalentQualityBank(matrix, m_id, cap_axis);
  const sorted = sortByQualityAscDescPreference(bank, cap_axis);
  const out: Candidate[] = [];

  for (const entry of sorted) {
    const routes = multiCarrierRouteIds(matrix, entry.modelId);
    for (const routeId of routes) {
      out.push({
        modelId: entry.modelId,
        routeId,
        qualityScore: entry.qualityPerCapability[cap_axis],
        isPrimaryRoute: false,
        tier: 2,
      });
    }
  }

  return out;
}

function tier3(matrix: RouterMatrixEntry[], m_id: string, cap_axis: CapabilityAxis): Candidate[] {
  const baseQuality = qualityNow(m_id, matrix, cap_axis);
  const dropped = bandDropBelow(matrix, baseQuality, cap_axis);
  const sorted = sortByQualityAscDescPreference(dropped, cap_axis);
  const out: Candidate[] = [];

  for (const entry of sorted) {
    const routes = multiCarrierRouteIds(matrix, entry.modelId);
    for (const routeId of routes) {
      out.push({
        modelId: entry.modelId,
        routeId,
        qualityScore: entry.qualityPerCapability[cap_axis],
        isPrimaryRoute: false,
        tier: 3,
      });
    }
  }

  return out;
}

function tier4(matrix: RouterMatrixEntry[], m_id: string, cap_axis: CapabilityAxis): Candidate[] {
  const baseQuality = qualityNow(m_id, matrix, cap_axis);
  const dropped = bandDropBelow(matrix, baseQuality - 10, cap_axis);
  const sorted = sortByQualityAscDescPreference(dropped, cap_axis);
  const out: Candidate[] = [];

  for (const entry of sorted) {
    const routes = multiCarrierRouteIds(matrix, entry.modelId);
    for (const routeId of routes) {
      out.push({
        modelId: entry.modelId,
        routeId,
        qualityScore: entry.qualityPerCapability[cap_axis],
        isPrimaryRoute: false,
        tier: 4,
      });
    }
  }

  return out;
}

/* ── Post-filter applied LAST in one pass ── */

function applyDegradedAndCapabilityFilter(
  candidates: Candidate[],
  matrix: RouterMatrixEntry[],
  allow_dv: boolean,
  cap_axis: CapabilityAxis,
): Candidate[] {
  return candidates.filter(c => {
    const entry = matrix.find(e => e.modelId === c.modelId);
    if (!entry) return false;

    if (!allow_dv && entry.degradedVariantOf !== undefined) {
      return false;
    }

    if (!isCapabilityForAxis(entry, cap_axis)) {
      return false;
    }

    return true;
  });
}

/* ── Quality-band helpers ── */

function equivalentQualityBank(
  matrix: RouterMatrixEntry[],
  m_id: string,
  cap_axis: CapabilityAxis,
): RouterMatrixEntry[] {
  const baseQuality = qualityNow(m_id, matrix, cap_axis);
  return matrix.filter(
    e =>
      e.modelId !== m_id &&
      Math.abs(e.qualityPerCapability[cap_axis] - baseQuality) <= 5,
  );
}

function bandDropBelow(
  matrix: RouterMatrixEntry[],
  baseQuality: number,
  cap_axis: CapabilityAxis,
): RouterMatrixEntry[] {
  return matrix.filter(e => {
    const q = e.qualityPerCapability[cap_axis];
    return q >= baseQuality - 15 && q < baseQuality - 5;
  });
}

function multiCarrierRouteIds(matrix: RouterMatrixEntry[], m_id: string): string[] {
  const routes = new Set<string>();
  for (const e of matrix) {
    if (e.modelId === m_id) {
      for (const r of e.multiCarrierRouteIds) {
        routes.add(r);
      }
    }
  }
  return Array.from(routes);
}

function primaryRouteIdForModel(
  matrix: RouterMatrixEntry[],
  m_id: string,
  cap_axis: CapabilityAxis,
): string | undefined {
  const capMatch = matrix.find(e => e.modelId === m_id && isCapabilityForAxis(e, cap_axis));
  if (capMatch) {
    return capMatch.preferredCarrierKey ?? capMatch.multiCarrierRouteIds[0];
  }

  const anyMatch = matrix.find(e => e.modelId === m_id);
  if (anyMatch) {
    return anyMatch.preferredCarrierKey ?? anyMatch.multiCarrierRouteIds[0];
  }

  return undefined;
}

function isCapabilityForAxis(entry: RouterMatrixEntry, cap_axis: CapabilityAxis): boolean {
  switch (cap_axis) {
    case "vision":
      return entry.canVision;
    case "toolUse":
      return entry.canToolUse && entry.toolExecutionReliability !== "LOW";
    case "code":
      return entry.canCode;
    default:
      return false;
  }
}

function sortByQualityAscDescPreference(
  entries: RouterMatrixEntry[],
  cap_axis: CapabilityAxis,
): RouterMatrixEntry[] {
  return [...entries].sort(
    (a, b) => b.qualityPerCapability[cap_axis] - a.qualityPerCapability[cap_axis],
  );
}

/* ── Internal helper ── */

function qualityNow(m_id: string, matrix: RouterMatrixEntry[], cap_axis: CapabilityAxis): number {
  const entry = matrix.find(e => e.modelId === m_id);
  return entry ? entry.qualityPerCapability[cap_axis] : 0;
}
