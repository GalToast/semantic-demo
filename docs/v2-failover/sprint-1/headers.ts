/**
 * V2 Failover Sprint 1 — URL-encoded JSON + recovery helpers.
 * Cites: spec-failover-v2.md gaps #6 (#8 header contract), #8 (URL-encoded JSON),
 * #13 (force-pin), plus recovery-slug extraction from kimi bench Round 3 (η).
 */

/** @see tmp/spec-failover-v2.md gap #8 — URL-encoded JSON diagnostic header */
export function urlEncodeJson(obj: unknown): string {
  return encodeURIComponent(JSON.stringify(obj));
}

/** @see tmp/spec-failover-v2.md gap #8 — decode URL-encoded JSON back to value */
export function urlDecodeJson<T = unknown>(str: string): T {
  return JSON.parse(decodeURIComponent(str)) as T;
}

/** One failed-attempt entry in the attempted chain (gap #8). */
export interface FailedAttempt {
  modelId: string;
  carrier: string;
  route: string;
  shape: string | null;
  error: string | null;
  attemptMs: number;
}

/** @see tmp/spec-failover-v2.md gap #8 — build X-Router-Diagnostic URL-encoded JSON */
export function buildDiagnosticHeader(failedAttempts: FailedAttempt[]): string {
  return urlEncodeJson(failedAttempts);
}

/** @see tmp/kimi-nvidia-bench-2026-07-24.md Round 3 η — 404 body recovery slug hint */
export function parseRecoverySlug(body: string): string | null {
  const m = body.match(/slug instead:\s*([^"\s]+)/);
  return m ? m[1] ?? null : null;
}

/** Response metadata driving the 5 X-Router-* response headers.
 *  @see tmp/spec-failover-v2.md gap #13 (force-pin) + gap #8 (diagnostic) + gap #12 (degraded) */
export interface ResponseHeadersMetadata {
  failoverApplied: boolean;
  diagnosticJson: string;             // already URL-encoded via buildDiagnosticHeader()
  forceModel: 'original' | 'best';
  allowDegradedVariants: boolean | null;   // null = omit header
  capabilityUnsatisfied: string | null;     // null = omit header
}

/** @see tmp/spec-failover-v2.md gap #8 / #13 — apply all X-Router-* response headers */
export function applyResponseHeaders(
  setHeader: (name: string, value: string) => void,
  metadata: ResponseHeadersMetadata,
): void {
  setHeader('X-Router-Failover-Applied', String(metadata.failoverApplied));
  setHeader('X-Router-Diagnostic', metadata.diagnosticJson);
  setHeader('X-Router-Force-Model', metadata.forceModel);
  if (metadata.allowDegradedVariants !== null) {
    setHeader('X-Router-Allow-Degraded-Variants', String(metadata.allowDegradedVariants));
  }
  if (metadata.capabilityUnsatisfied !== null) {
    setHeader('X-Router-Capability-Unsatisfied', metadata.capabilityUnsatisfied);
  }
}
