/** capability axis sub-score names (#1 qualityPerCapability) */
export type CapabilityAxis = 'vision' | 'toolUse' | 'code';

/** tool-execution reliability tier (#3) */
export type ToolExecutionReliability = 'LOW' | 'MEDIUM' | 'HIGH';

/** force-pin header values (#13) */
export type ForceModelValue = 'original' | 'best';

/** per-axis quality sub-scores (gap #1). 0..100 per axis. */
export interface QualityPerCapability {
  vision: number;
  toolUse: number;
  code: number;
}

/** single row in the router-capability matrix */
export interface RouterMatrixEntry {
  modelId: string;
  family: string;

  /** gap #1 — per-axis quality sub-scores (0..100) */
  qualityPerCapability: QualityPerCapability;

  /** auto-derived: qualityPerCapability.vision > 0 */
  canVision: boolean;
  /** auto-derived: qualityPerCapability.toolUse > 0 */
  canToolUse: boolean;
  /** auto-derived: qualityPerCapability.code > 0 */
  canCode: boolean;

  /** gap #4 — token budget; skip candidate when req exceeds it */
  contextWindowLimit: number;
  /** auto-derived: contextWindowLimit >= 32000 */
  longContext: boolean;

  /** gap #15 — StreamQualityMeter P95: interChunkDelta > 250ms + lastChunkLatency > 1500ms → false */
  streamingSmooth: boolean;
  /** auto-derived: toolExecutionReliability === 'HIGH' && streamingSmooth === true */
  streamingSafe: boolean;

  /** gap #3 */
  toolExecutionReliability: ToolExecutionReliability;

  /** preferred horizontal-T1 carrier key for this entry */
  preferredCarrierKey?: string;
  /** horizontal-T1 failover candidates sharing the same upstream model id */
  multiCarrierRouteIds: string[];

  /** gap #12 — link to non-degraded parent; -flex/-fast/etc variants get category='degraded' */
  degradedVariantOf?: string;
}

/* ── X-Router response headers (gap #6 + #8) ───────────────────────────── */

export const X_ROUTER_FAILOVER_APPLIED       = 'X-Router-Failover-Applied';
export const X_ROUTER_DIAGNOSTIC             = 'X-Router-Diagnostic';
export const X_ROUTER_FORCE_MODEL            = 'X-Router-Force-Model';
export const X_ROUTER_ALLOW_DEGRADED_VAR     = 'X-Router-Allow-Degraded-Variants';
export const X_ROUTER_CAPABILITY_UNSATISFIED = 'X-Router-Capability-Unsatisfied';

/** gap #12 — degraded variants are opt-in; default false */
export const ALLOW_DEGRADED_DEFAULT = false;

/* ── CarrierShapeClass discriminated union (gap #11, 7 confirmed shapes) ── */

type _CarrierShapeClassBase = { routeId: string; modelId: string };

/** (1) cloudflare et al: bare "Connection error." → per-key cooldown (realm A transient) */
export type TransientUnknownConnection       = _CarrierShapeClassBase & { class: 'transient_unknown_connection'; raw: string };

/** (2) nvidia-style 404 with empty body → per-(carrier,model) breaker permanent (realm B) */
export type PermanentUnknownId               = _CarrierShapeClassBase & { class: 'permanent_unknown_id'; statusCode: 404; body?: never };

/** (3) opencode-zen 401 CreditsError → per-(carrier,model) breaker permanent (realm B) */
export type PermanentNoPaymentMethod         = _CarrierShapeClassBase & { class: 'permanent_no_payment_method'; statusCode: 401; creditsUrl: string };

/** (4) kilo 402 Paid Model - Credits Required with negative balance → per-(carrier,model) breaker permanent (realm B) */
export type PermanentCreditBalanceExhausted  = _CarrierShapeClassBase & { class: 'permanent_credit_balance_exhausted'; statusCode: 402; balance: number; buyCreditsUrl: string };

/** (5) zydit 502 "Upstream stream failed before output" willRetry → per-key cooldown (realm A transient) */
export type TransientUpstreamStreamFailed    = _CarrierShapeClassBase & { class: 'transient_upstream_stream_failed_before_output'; statusCode: 502; willRetry: true };

/** (6) openrouter 404 with paid redirect slug hint → horizontal hop candidate (NOT tier descent) */
export type PermanentPaidRedirect            = _CarrierShapeClassBase & { class: 'permanent_404_unavailable_for_free_with_paid_redirect'; statusCode: 404; slugHint: string };

/** (7) client-side dispatcher refusal "Unsupported external subagent model..." → unified class */
export type DispatcherUnsupportedModelPrefix = _CarrierShapeClassBase & { class: 'dispatcher_unsupported_model_prefix'; prefix: string; requestedModel: string };

/** Discriminated union of all 7 confirmed carrier-shape classes from gap #11 bench data. */
export type CarrierShapeClass =
  | TransientUnknownConnection
  | PermanentUnknownId
  | PermanentNoPaymentMethod
  | PermanentCreditBalanceExhausted
  | TransientUpstreamStreamFailed
  | PermanentPaidRedirect
  | DispatcherUnsupportedModelPrefix;
