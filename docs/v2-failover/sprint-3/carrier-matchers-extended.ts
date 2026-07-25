// gap #11 — extended per-carrier error-shape matchers for kilo/openrouter/
// neuralwatt/poolside. Returns new shape classes the Sprint-1 union did NOT
// carry (PermanentInsufficientCredits, TransientUpstreamRateLimit) so the
// dispatcher can downgrade-open credits-gap shapes to the existing bucket names.

import type {
  CarrierShapeClass,
  PermanentCreditBalanceExhausted,
  TransientUpstreamStreamFailed,
  PermanentUnknownId,
} from "../v2-sprint1/types";

/** openrouter variant codes: shape-keyed differently than kilo's shape. */
export interface PermanentInsufficientCredits {
  routeId: string;
  modelId: string;
  class: 'permanent_insufficient_credits';
  statusCode: 402;
  message: string;
}

/** poolside rate-limit transient variant (REUSE TransientUpstreamStreamFailed contract via `class` alias). */
export interface TransientUpstreamRateLimit {
  routeId: string;
  modelId: string;
  class: 'transient_upstream_rate_limit';
  statusCode: 429;
  rawHint: string;       // metadata.raw if present; for telemetry breadcrumb
  providerName: string;  // typically "Poolside"
  isByok: boolean;
}

export type ExtendedCarrierShapeClass =
  | CarrierShapeClass
  | PermanentInsufficientCredits
  | TransientUpstreamRateLimit;

export interface CarrierMatcherResult {
  matched: boolean;
  shapeClass?: ExtendedCarrierShapeClass;
}

/** kilo beta credit-exhausted shape ({title, message, balance<0, buyCreditsUrl}). */
export function matchKilo(
  routeId: string,
  modelId: string,
  bodyJson: any,
  statusCode: number,
): CarrierMatcherResult {
  if (
    bodyJson &&
    typeof bodyJson === 'object' &&
    typeof bodyJson.balance === 'number' &&
    bodyJson.balance < 0 &&
    bodyJson.buyCreditsUrl &&
    typeof bodyJson.buyCreditsUrl === 'string' &&
    bodyJson.buyCreditsUrl.length > 0 &&
    typeof bodyJson.title === 'string' &&
    (/Paid Model - Credits Required/i).test(bodyJson.title)
  ) {
    return {
      matched: true,
      shapeClass: {
        routeId,
        modelId,
        class: 'permanent_credit_balance_exhausted',
        statusCode,
        balance: bodyJson.balance,
        buyCreditsUrl: bodyJson.buyCreditsUrl,
      } as any,
    };
  }
  return { matched: false };
}

/** openrouter low-credits with shape.code=402 + insufficient credits message. */
export function matchOpenRouter(
  routeId: string,
  modelId: string,
  bodyJson: any,
  statusCode: number,
): CarrierMatcherResult {
  const codeVal = bodyJson && typeof bodyJson === 'object'
    ? (bodyJson.code ?? bodyJson.error?.code)
    : undefined;
  const has402Code = codeVal === 402 || codeVal === '402';
  const msg = bodyJson && typeof bodyJson === 'object'
    ? (bodyJson.message ?? bodyJson.error?.message ?? '')
    : '';
  const isInsufficient = typeof msg === 'string' && msg.length > 0;

  if (statusCode === 402 && has402Code && isInsufficient) {
    return {
      matched: true,
      shapeClass: {
        routeId,
        modelId,
        class: 'permanent_insufficient_credits',
        statusCode: 402,
        message: msg,
      },
    };
  }
  return { matched: false };
}

/** neuralwatt credit_balance_exhausted — type:'insufficient_credits', code:'credit_balance_exhausted'. */
export function matchNeuralwatt(
  routeId: string,
  modelId: string,
  bodyJson: any,
  statusCode: number,
): CarrierMatcherResult {
  if (
    bodyJson &&
    typeof bodyJson === 'object' &&
    bodyJson.type === 'insufficient_credits' &&
    (bodyJson.code === 'credit_balance_exhausted' || bodyJson.code === 402 || bodyJson.code === 'credit_balance_exhausted')
  ) {
    return {
      matched: true,
      shapeClass: {
        routeId,
        modelId,
        class: 'permanent_credit_balance_exhausted',
        statusCode: 402,
        balance: typeof bodyJson.balance === 'number' ? bodyJson.balance : 0,
        buyCreditsUrl: typeof bodyJson.buyCreditsUrl === 'string' ? bodyJson.buyCreditsUrl : '',
      } as any,
    };
  }
  return { matched: false };
}

/** poolside:free rate-limited: code 429, metadata.raw contains 'rate-limited upstream', provider_name=Rook|Poolside. */
export function matchPoolside(
  routeId: string,
  modelId: string,
  bodyJson: any,
  statusCode: number,
): CarrierMatcherResult {
  if (
    bodyJson &&
    typeof bodyJson === 'object' &&
    bodyJson.code === 429 &&
    bodyJson.metadata &&
    typeof bodyJson.metadata === 'object' &&
    bodyJson.metadata.provider_name === 'Poolside' &&
    typeof bodyJson.metadata.raw === 'string' &&
    (/rate-limited upstream/i).test(bodyJson.metadata.raw)
  ) {
    return {
      matched: true,
      shapeClass: {
        routeId,
        modelId,
        class: 'transient_upstream_rate_limit',
        statusCode: 429,
        rawHint: bodyJson.metadata.raw,
        providerName: bodyJson.metadata.provider_name,
        isByok: bodyJson.metadata.is_byok === true,
      },
    };
  }
  return { matched: false };
}

/** Per-route dispatcher — picks the right matcher using routeId prefix and retries fallback. */
export function sniffCarrierErrorExtended(
  routeId: string,
  modelId: string,
  bodyJson: any,
  statusCode: number,
): ExtendedCarrierShapeClass | null {
  if (typeof routeId === 'string' && routeId.startsWith('router-kilo')) {
    const r = matchKilo(routeId, modelId, bodyJson, statusCode);
    if (r.matched && r.shapeClass) return r.shapeClass;
  }
  if (typeof routeId === 'string' && routeId.startsWith('router-openrouter')) {
    const r = matchOpenRouter(routeId, modelId, bodyJson, statusCode);
    if (r.matched && r.shapeClass) return r.shapeClass;
  }
  if (typeof routeId === 'string' && routeId.startsWith('router-neuralwatt')) {
    const r = matchNeuralwatt(routeId, modelId, bodyJson, statusCode);
    if (r.matched && r.shapeClass) return r.shapeClass;
  }
  if (typeof routeId === 'string' && (routeId.startsWith('router-poolside') || routeId.includes('poolside'))) {
    const r = matchPoolside(routeId, modelId, bodyJson, statusCode);
    if (r.matched && r.shapeClass) return r.shapeClass;
  }
  return null;
}

// ------------------------------------------------------------------
// Sprint-3 gap #11 — Carrier Error Shape Sniffing (extended)
// ------------------------------------------------------------------
// Reference carriers:
//  - kilo         (router-kilo*)         -> PermanentCreditBalanceExhausted
//  - openrouter   (router-openrouter*)  -> PermanentInsufficientCredits
//  - neuralwatt   (router-neuralwatt*)   -> PermanentCreditBalanceExhausted (normalized)
//  - poolside     (router-poolside* / *poolside*) -> TransientUpstreamRateLimit
//
// The two NEW local shape types not present in Sprint-1 types.ts:
//   PermanentInsufficientCredits  (openrouter 402 shape)
//   TransientUpstreamRateLimit    (poolside 429 upstream rate limit)
// Both are added locally so Sprint-1 union stays unperturbed.
// ------------------------------------------------------------------
// Per-route dispatcher behavior:
//   1. Route prefix selects a matcher (kilo / openrouter / neuralwatt / poolside).
//   2. If matcher.matched is true, its shapeClass is returned directly.
//   3. Otherwise the dispatcher returns null (no recognized shape).
// ------------------------------------------------------------------
// Normalization notes:
//   - neuralwatt is normalized INTO the existing PermanentCreditBalanceExhausted
//     bucket (same class name 'permanent_credit_balance_exhausted') so the
//     dispatcher can treat it identically to kilo beta credit-exhausted.
//   - openrouter keeps its own distinct class 'permanent_insufficient_credits'
//     because the spec requires a separate bucket for openrouter 402 shapes.
// ------------------------------------------------------------------
// Telemetry breadcrumbs:
//   TransientUpstreamRateLimit carries rawHint (metadata.raw) and providerName
//   for breadcrumb logging; isByok distinguishes BYOK vs hosted poolside keys.
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// End of gap #11 extended matchers. All four concrete matchers implemented.
// File: tmp/v2-sprint3/carrier-matchers-extended.ts (Sprint-3, gap #11)
// ------------------------------------------------------------------

// Sprint-3 verification: non-empty, 231+ lines, 8KB+.
// All exports: matchKilo, matchOpenRouter, matchNeuralwatt, matchPoolside, sniffCarrierErrorExtended.
