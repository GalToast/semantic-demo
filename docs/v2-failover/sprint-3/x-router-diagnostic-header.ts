// gap #8 — X-Router-Diagnostic header builder/parser + JSONL row serializer.
// Same attemptedChains shape consumed by the JSONL telemetry appender (gap #10).

import {
  X_ROUTER_DIAGNOSTIC,
  type CarrierShapeClass,
} from "../v2-sprint1/types";

/** One entry in the attempted chain — reuses the JSONL row's `attempted_chains` shape
 *  so the diagnostic header is byte-for-byte re-usable as the JSONL row's body. */
export interface DiagnosticAttemptItem {
  routeId: string;
  modelId: string;
  statusClass: string;     // e.g. "permanent_credit_balance_exhausted"
  latencyMs: number;
  errorClass?: string;    // optional: a top-level reason category such as "transient" / "permanent"
  shape?: CarrierShapeClass;
}

export interface DiagnosticHeaderPayload {
  attemptedChains: DiagnosticAttemptItem[];
  selectedIndex?: number;
  forcedPin: boolean;
  capabilityAxis: string;   // 'vision' | 'toolUse' | 'code'
  totalLatencyMs: number;
  detectedAtGmt: number;    // ms since unix epoch
}

export interface BuiltHeader {
  name: string;    // always X_ROUTER_DIAGNOSTIC
  value: string;   // encodeURIComponent(JSON.stringify(payload))
}

/** Build the outbound X-Router-Diagnostic header value. */
export function buildDiagnosticHeader(
  attempted: DiagnosticAttemptItem[],
  selectedIndex: number | undefined,
  forcedPin: boolean,
  capabilityAxis: string,
  totalLatencyMs: number,
): BuiltHeader {
  const payload: DiagnosticHeaderPayload = {
    attemptedChains: attempted,
    selectedIndex,
    forcedPin,
    capabilityAxis,
    totalLatencyMs,
    detectedAtGmt: Date.now(),
  };
  const json = JSON.stringify(payload);
  return {
    name: X_ROUTER_DIAGNOSTIC,
    value: encodeURIComponent(json),
  };
}

/** Parse the inbound header value back into the typed payload. Throws on malformed JSON. */
export function parseDiagnosticHeader(value: string): DiagnosticHeaderPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch (e: unknown) {
    throw new TypeError(
      `X-Router-Diagnostic parse error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new TypeError("X-Router-Diagnostic payload is not an object");
  }
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.attemptedChains)) {
    throw new TypeError("X-Router-Diagnostic payload.attemptedChains is not an array");
  }
  // Minimal shape validation for array items
  for (let i = 0; i < p.attemptedChains.length; i++) {
    const item = p.attemptedChains[i];
    if (item === null || typeof item !== "object") {
      throw new TypeError(`X-Router-Diagnostic attemptedChains[${i}] is not an object`);
    }
  }
  return parsed as DiagnosticHeaderPayload;
}

/** Reuse the diagnostic attempted-chains shape to emit a JSONL telemetry row (gap #10 schema).
 *  Caller layers `requestedModel` onto the row; the attempted_chains entries match gap #8. */
export function diagnosticToJsonlRow(
  payload: DiagnosticHeaderPayload,
  requestedModel: string,
): {
  ts: number;
  requested_model: string;
  requested_capability_axis: string;
  attempted_chains: DiagnosticAttemptItem[];
  final_status_override: string | undefined;
} {
  return {
    ts: payload.detectedAtGmt,
    requested_model: requestedModel,
    requested_capability_axis: payload.capabilityAxis,
    attempted_chains: payload.attemptedChains,
    final_status_override:
      payload.selectedIndex !== undefined
        ? payload.attemptedChains[payload.selectedIndex]?.statusClass
        : undefined,
  };
}

/** Normalizes raw status code + shape into a string `statusClass` for the JSONL line.
 *  If shape is provided, uses shape.class; otherwise maps statusCode → friendly class:
 *    0     → "no_response"
 *    200..299 → "ok"
 *    301-308 → "redirect"
 *    429   → "transient_rate_limited"
 *    500-599 → "transient_server_error"
 *    401/402/404/422 → "permanent"
 *    else  → "unknown"
 */
export function classifyStatusClass(
  shape: CarrierShapeClass | undefined,
  statusCode: number,
): string {
  if (shape) {
    return shape.class;
  }
  if (statusCode === 0) return "no_response";
  if (statusCode >= 200 && statusCode <= 299) return "ok";
  if (statusCode >= 301 && statusCode <= 308) return "redirect";
  if (statusCode === 429) return "transient_rate_limited";
  if (statusCode >= 500 && statusCode <= 599) return "transient_server_error";
  if (statusCode === 401 || statusCode === 402 || statusCode === 404 || statusCode === 422) {
    return "permanent";
  }
  return "unknown";
}

/* ------------------------------------------------------------------ */
/* Helper: appendHeader (pre-stream-flush write; no in-flight swap)   */
/* ------------------------------------------------------------------ */

/** Append the diagnostic header to an existing header bag before stream flush. */
export function appendHeader(
  headers: Record<string, string>,
  attempt: DiagnosticAttemptItem[],
  selectedIndex: number | undefined,
  forcedPin: boolean,
  capabilityAxis: string,
  totalLatencyMs: number,
): Record<string, string> {
  const built = buildDiagnosticHeader(
    attempt,
    selectedIndex,
    forcedPin,
    capabilityAxis,
    totalLatencyMs,
  );
  return {
    ...headers,
    [built.name]: built.value,
  };
}
