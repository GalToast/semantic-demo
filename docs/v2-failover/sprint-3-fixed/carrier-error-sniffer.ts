import { parseRecoverySlug } from './headers'

/**
 * Gap #11 — carrier-shape sniffer library.
 * Classifies raw carrier error bodies into permanent/transient shape classes
 * for v2 failover circuit-breaker routing.
 *
 * Source: tmp/spec-failover-v2.md §gap #11 + tmp/kimi-nvidia-bench-2026-07-24.md
 * (Round 2 pilots γ/δ/ε + Round 3 pilots ζ/η/θ).
 *
 * FIX-C (Sprint-3):
 *  1. Renamed local union from CarrierShapeClass → SniffedShapeClass to avoid
 *     type clash with types.ts (which uses `class` discriminant, not `shape`).
 *  2. Added routeId/modelId to every shape (gap #11 discriminated union req).
 *  3. Replaced dead _modelId/_carrierKey with live routeId/modelId params.
 *  4. Fixed balance-exhausted regex to capture negative exponents (-1.5e-5).
 *  5. Lowercase-trimmed NoPaymentMethod body test so casing variance doesn't
 *     silently declassify errors.
 */

// ─── Helper: normalize body text before case-insensitive substring checks ───

/** Lowercase-trim + collapse internal whitespace so casing/whitespace variance
 *  in upstream JSON strings doesn't silently defeat classify-match. */
export function normalizeForCarrierMatching(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ─── SniffedShapeClass discriminated union (gap #11, 7 confirmed shapes) ──

/**
 * Local shape-class union for the sniffer.
 * Mirrors types.ts CarrierShapeClass discriminant-key (`class`) but avoids
 * the name collision (types.ts uses `_CarrierShapeClassBase & { class, ... }`
 * while this file originally used `{ shape, ... }`).
 *
 * FIX-C: renamed to `SniffedShapeClass`; switched `shape` → `class` to match
 * the canonical types.ts discriminant; added optional `routeId`/`modelId`
 * so every shape can carry the gap-#11 routing metadata.
 */
export type SniffedShapeClass =
    | { class: 'transient_unknown_connection'; raw?: string; routeId?: string; modelId?: string }
    | { class: 'permanent_unknown_id'; statusCode: 404; routeId?: string; modelId?: string }
    | { class: 'permanent_no_payment_method'; statusCode: 401; creditsUrl?: string; routeId?: string; modelId?: string }
    | {
          class: 'permanent_credit_balance_exhausted'
          statusCode: 402
          balance: number
          buyCreditsUrl: string
          routeId?: string
          modelId?: string
      }
    | {
          class: 'transient_upstream_stream_failed_before_output'
          statusCode: 502
          willRetry?: true
          routeId?: string
          modelId?: string
      }
    | {
          class: 'permanent_404_unavailable_for_free_with_paid_redirect'
          statusCode: 404
          slugHint?: string
          routeId?: string
          modelId?: string
      }
    | {
          class: 'dispatcher_unsupported_model_prefix'
          prefix?: string
          requestedModel?: string
          routeId?: string
          modelId?: string
      }

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Diagnose a carrier HTTP response and emit a classified shape descriptor.
 *
 * FIX-C: `_modelId` → `modelId` (live), `_carrierKey` → `routeId` (live).
 * Both values are threaded onto every returned shape via `routeId`/`modelId`
 * fields so downstream failover logic has the routing metadata it needs.
 */
export function carrierErrorShapeSniffer(
    resp: { status?: number; body?: string; errorMessage?: string },
    modelId?: string,
    routeId?: string
): SniffedShapeClass | null {
    const result =
        matchTransientUnknownConnection(resp) ??
        matchPermanentUnknownId(resp) ??
        matchPermanentNoPaymentMethod(resp) ??
        matchPermanentCreditBalanceExhausted(resp) ??
        matchTransientUpstreamStreamFailedBeforeOutput(resp) ??
        matchPermanent404UnavailableForFreeWithPaidRedirect(resp) ??
        matchDispatcherUnsupportedModelPrefix(resp) ??
        null

    // Attach the once-dead params onto the matched shape (no-op if null).
    if (result) {
        if (routeId !== undefined) result.routeId = routeId
        if (modelId !== undefined) result.modelId = modelId
    }
    return result
}

// ─── Shape matchers ─────────────────────────────────────────────────────────

// ─── 1. transient_unknown_connection ───

/**
 * Evidence: Round 2 γ ocw_27345ac1 cloudflare — bare `Connection error.`
 * Spec: gap #11 transient class; per-key cooldown (gap #7 realm A).
 */
function matchTransientUnknownConnection(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    if (resp.errorMessage === 'Connection error.') {
        return { class: 'transient_unknown_connection', raw: resp.body || '' }
    }
    return null
}

// ─── 2. permanent_unknown_id ───

/**
 * Evidence: Round 1 α ocw_db7689b6 nvidia — 404 with no body.
 * Spec: gap #11 permanent class; per-(carrier,model) breaker (gap #7 realm B).
 */
function matchPermanentUnknownId(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    if (resp.status === 404 && (!resp.body || !resp.body.trim())) {
        return { class: 'permanent_unknown_id', statusCode: 404 }
    }
    return null
}

// ─── 3. permanent_no_payment_method ───

/**
 * Evidence: Round 1 β ocw_8e19f379 opencode-zen — 401 CreditsError + billing URL.
 * Verbatim: `{"type":"CreditsError","message":"No payment method. Add a payment method here: https://opencode.ai/workspace/.../billing"}`
 * Spec: gap #11 permanent class; per-(carrier,model) breaker (gap #7 realm B).
 *
 * FIX-C: body text is lowercased + whitespace-collapsed before substring check,
 * so casing variants like "creditserror" still classify.
 */
function matchPermanentNoPaymentMethod(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    if (resp.status !== 401 || !resp.body) return null

    const normalized = normalizeForCarrierMatching(resp.body)
    if (normalized.includes('creditserror') || normalized.includes('no payment method')) {
        const urlMatch = resp.body.match(/https?:\/\/[^\s"]+/)
        return { class: 'permanent_no_payment_method', statusCode: 401, creditsUrl: urlMatch?.[0] }
    }
    return null
}

// ─── 4. permanent_credit_balance_exhausted ───

/**
 * Evidence: Round 2 δ ocw_aa9c983b kilo — 402 Paid-Credits-Required with negative balance.
 * Verbatim: `{"title":"Paid Model - Credits Required","message":"Add credits to continue, or switch to a free model","balance":-0.00003,"buyCreditsUrl":"https://app.kilo.ai/profile"}`
 * Spec: gap #11 permanent class; per-(carrier,model) breaker (gap #7 realm B).
 *
 * FIX-C: Strict numeric regex captures `-1.5e-5` (negative exponent), not `-1.5`.
 */
function matchPermanentCreditBalanceExhausted(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    if (resp.status !== 402 || !resp.body) return null

    const text = resp.body
    if (!text.includes('Paid Model') || !text.includes('Credits Required')) return null

    try {
        const obj = JSON.parse(text) as Record<string, unknown>
        if (typeof obj.balance === 'number' && typeof obj.buyCreditsUrl === 'string') {
            return {
                class: 'permanent_credit_balance_exhausted',
                statusCode: 402,
                balance: obj.balance,
                buyCreditsUrl: obj.buyCreditsUrl
            }
        }
    } catch {
        // malformed JSON — still classify permanently but without numeric fields
        const buyUrl = text.match(/"buyCreditsUrl"\s*:\s*"([^"]+)"/)?.[1]
        if (buyUrl) {
            // FIX-C: strict numeric pattern handles negatives AND negative exponents
            const balMatch = text.match(/"balance"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/)
            return {
                class: 'permanent_credit_balance_exhausted',
                statusCode: 402,
                balance: balMatch ? Number(balMatch[1]) : NaN,
                buyCreditsUrl: buyUrl
            }
        }
    }
    return null
}

// ─── 5. transient_upstream_stream_failed_before_output ───

/**
 * Evidence: Round 3 ζ ocw_27345ac1 zydit — 502 Upstream stream failed before output.
 * Verbatim: `502 Upstream stream failed before output` (willRetry attempt 1/10).
 * Spec: gap #11 transient class; per-key cooldown (gap #7 realm A).
 */
function matchTransientUpstreamStreamFailedBeforeOutput(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    const haystack = `${resp.body ?? ''} ${resp.errorMessage ?? ''}`
    if (resp.status === 502 && haystack.includes('Upstream stream failed before output')) {
        return { class: 'transient_upstream_stream_failed_before_output', statusCode: 502 }
    }
    return null
}

// ─── 6. permanent_404_unavailable_for_free_with_paid_redirect ───

/**
 * Evidence: Round 3 η ocw_cb8950db openrouter — 404 body with recovery slug hint.
 * Verbatim: `{"code":404,"message":"This model is unavailable for free. The paid version is available now - use this slug instead: moonshotai/kimi-k2.6"}`
 * Spec: gap #11; sniffer extracts recoverySlug from body via `parseRecoverySlug(body)`.
 * Routing implication: caller adds as horizontal hop candidate (T1) — NOT tier-descent.
 */
function matchPermanent404UnavailableForFreeWithPaidRedirect(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    if (resp.status !== 404 || !resp.body) return null

    const text = resp.body
    const normalized = normalizeForCarrierMatching(text)
    if (normalized.includes('unavailable for free') && normalized.includes('slug instead')) {
        const slugHint = parseRecoverySlug(text)
        if (slugHint) {
            return {
                class: 'permanent_404_unavailable_for_free_with_paid_redirect',
                statusCode: 404,
                slugHint
            }
        }
    }
    return null
}

// ─── 7. dispatcher_unsupported_model_prefix ───

/**
 * Evidence: Round 3 θ (neuralwatt) — client-side dispatcher refusal before upstream dispatch.
 * Verbatim: `Unsupported external subagent model 'neuralwatt/kimi-k2.6'. Refusing to launch because Qwen Code may fall back to its default model.`
 * Spec: gap #11; classified upstream so v2 gap #11 library stays shape-unified even for
 * pre-flight client-side rejections.
 */
function matchDispatcherUnsupportedModelPrefix(resp: {
    status?: number
    body?: string
    errorMessage?: string
}): SniffedShapeClass | null {
    const haystack = `${resp.body ?? ''} ${resp.errorMessage ?? ''}`
    if (haystack.includes('Unsupported external subagent model')) {
        // Extract model prefix if present in the haystack
        const prefixMatch = haystack.match(/Unsupported external subagent model\s+'([^']+)'/)
        return {
            class: 'dispatcher_unsupported_model_prefix',
            prefix: prefixMatch?.[1],
            requestedModel: prefixMatch?.[1]
        }
    }
    return null
}
