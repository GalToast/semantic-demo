import { parseRecoverySlug } from './headers';

/**
 * Gap #11 — carrier-shape sniffer library.
 * Classifies raw carrier error bodies into permanent/transient shape classes
 * for v2 failover circuit-breaker routing.
 *
 * Source: tmp/spec-failover-v2.md §gap #11 + tmp/kimi-nvidia-bench-2026-07-24.md
 * (Round 2 pilots γ/δ/ε + Round 3 pilots ζ/η/θ).
 */
export type CarrierShapeClass =
  | { shape: 'transient_unknown_connection' }
  | { shape: 'permanent_unknown_id' }
  | { shape: 'permanent_no_payment_method'; billingUrl?: string }
  | { shape: 'permanent_credit_balance_exhausted'; balance: number; buyCreditsUrl: string }
  | { shape: 'transient_upstream_stream_failed_before_output' }
  | { shape: 'permanent_404_unavailable_for_free_with_paid_redirect'; recoverySlug: string }
  | { shape: 'dispatcher_unsupported_model_prefix' };

export function carrierErrorShapeSniffer(
  resp: { status?: number; body?: string; errorMessage?: string },
  _modelId?: string,
  _carrierKey?: string,
): CarrierShapeClass | null {
  return (
    matchTransientUnknownConnection(resp) ??
    matchPermanentUnknownId(resp) ??
    matchPermanentNoPaymentMethod(resp) ??
    matchPermanentCreditBalanceExhausted(resp) ??
    matchTransientUpstreamStreamFailedBeforeOutput(resp) ??
    matchPermanent404UnavailableForFreeWithPaidRedirect(resp) ??
    matchDispatcherUnsupportedModelPrefix(resp) ??
    null
  );
}

// ─── 1. transient_unknown_connection ───

/**
 * Evidence: Round 2 γ ocw_27345ac1 cloudflare — bare `Connection error.`
 * Spec: tmp/spec-failover-v2.md gap #11 transient class; per-key cooldown (gap #7 realm A).
 */
function matchTransientUnknownConnection(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  if (resp.errorMessage === 'Connection error.') {
    return { shape: 'transient_unknown_connection' };
  }
  return null;
}

// ─── 2. permanent_unknown_id ───

/**
 * Evidence: Round 1 α ocw_db7689b6 nvidia — 404 with no body.
 * Spec: gap #11 permanent class; per-(carrier,model) breaker (gap #7 realm B).
 */
function matchPermanentUnknownId(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  if (resp.status === 404 && (!resp.body || !resp.body.trim())) {
    return { shape: 'permanent_unknown_id' };
  }
  return null;
}

// ─── 3. permanent_no_payment_method ───

/**
 * Evidence: Round 1 β ocw_8e19f379 opencode-zen — 401 CreditsError + billing URL.
 * Verbatim: `{"type":"CreditsError","message":"No payment method. Add a payment method here: https://opencode.ai/workspace/.../billing"}`
 * Spec: gap #11 permanent class; per-(carrier,model) breaker (gap #7 realm B).
 */
function matchPermanentNoPaymentMethod(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  if (resp.status !== 401 || !resp.body) return null;

  const text = resp.body;
  if (text.includes('CreditsError') || text.includes('No payment method')) {
    const urlMatch = text.match(/https?:\/\/[^\s"]+/);
    return { shape: 'permanent_no_payment_method', billingUrl: urlMatch?.[0] };
  }
  return null;
}

// ─── 4. permanent_credit_balance_exhausted ───

/**
 * Evidence: Round 2 δ ocw_aa9c983b kilo — 402 Paid-Credits-Required with negative balance.
 * Verbatim: `{"title":"Paid Model - Credits Required","message":"Add credits to continue, or switch to a free model","balance":-0.00003,"buyCreditsUrl":"https://app.kilo.ai/profile"}`
 * Spec: gap #11 permanent class; per-(carrier,model) breaker (gap #7 realm B).
 */
function matchPermanentCreditBalanceExhausted(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  if (resp.status !== 402 || !resp.body) return null;

  const text = resp.body;
  if (!text.includes('Paid Model') || !text.includes('Credits Required')) return null;

  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (typeof obj.balance === 'number' && typeof obj.buyCreditsUrl === 'string') {
      return {
        shape: 'permanent_credit_balance_exhausted',
        balance: obj.balance,
        buyCreditsUrl: obj.buyCreditsUrl,
      };
    }
  } catch {
    // malformed JSON — still classify permanently but without numeric fields
    const buyUrl = text.match(/"buyCreditsUrl"\s*:\s*"([^"]+)"/)?.[1];
    if (buyUrl) {
      const balMatch = text.match(/"balance"\s*:\s*([-\d.eE]+)/);
      return {
        shape: 'permanent_credit_balance_exhausted',
        balance: balMatch ? Number(balMatch[1]) : NaN,
        buyCreditsUrl: buyUrl,
      };
    }
  }
  return null;
}

// ─── 5. transient_upstream_stream_failed_before_output ───

/**
 * Evidence: Round 3 ζ ocw_27345ac1 zydit — 502 Upstream stream failed before output.
 * Verbatim: `502 Upstream stream failed before output` (willRetry attempt 1/10).
 * Spec: gap #11 transient class; per-key cooldown (gap #7 realm A).
 */
function matchTransientUpstreamStreamFailedBeforeOutput(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  const haystack = `${resp.body ?? ''} ${resp.errorMessage ?? ''}`;
  if (resp.status === 502 && haystack.includes('Upstream stream failed before output')) {
    return { shape: 'transient_upstream_stream_failed_before_output' };
  }
  return null;
}

// ─── 6. permanent_404_unavailable_for_free_with_paid_redirect ───

/**
 * Evidence: Round 3 η ocw_cb8950db openrouter — 404 body with recovery slug hint.
 * Verbatim: `{"code":404,"message":"This model is unavailable for free. The paid version is available now - use this slug instead: moonshotai/kimi-k2.6"}`
 * Spec: gap #11; sniffer extracts recoverySlug from body via `parseRecoverySlug(body)`.
 * Routing implication: caller adds as horizontal hop candidate (T1) — NOT tier-descent.
 */
function matchPermanent404UnavailableForFreeWithPaidRedirect(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  if (resp.status !== 404 || !resp.body) return null;

  const text = resp.body;
  if (text.includes('unavailable for free') && text.includes('slug instead')) {
    const recoverySlug = parseRecoverySlug(text);
    if (recoverySlug) {
      return {
        shape: 'permanent_404_unavailable_for_free_with_paid_redirect',
        recoverySlug,
      };
    }
  }
  return null;
}

// ─── 7. dispatcher_unsupported_model_prefix ───

/**
 * Evidence: Round 3 θ (neuralwatt) — client-side dispatcher refusal before upstream dispatch.
 * Verbatim: `Unsupported external subagent model 'neuralwatt/kimi-k2.6'. Refusing to launch because Qwen Code may fall back to its default model.`
 * Spec: gap #11; classified upstream so v2 gap #11 library stays shape-unified even for
 * pre-flight client-side rejections.
 */
function matchDispatcherUnsupportedModelPrefix(resp: {
  status?: number;
  body?: string;
  errorMessage?: string;
}): CarrierShapeClass | null {
  const haystack = `${resp.body ?? ''} ${resp.errorMessage ?? ''}`;
  if (haystack.includes('Unsupported external subagent model')) {
    return { shape: 'dispatcher_unsupported_model_prefix' };
  }
  return null;
}
