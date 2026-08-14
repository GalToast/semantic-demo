# Phone-Farm Audit Findings — semantic-explorer (2026-08-14)

**Source:** swarm run #3 through the phone lambda farm (laptop-orchestrated, 4 lanes, harness-side capture).
**Full captures:** `/root/phone-workspace/swarm/captured-*.md` on the phone. The findings below were **main-lane verified** against current repo code.

## Finding 1 — worker boundary trusted unvalidated payload (MEDIUM, fixed)

The following observations describe the pre-fix state captured by the farm;
the implementation and verification status are recorded under Disposition.

`src/lib/workers/data-worker.ts`

- Payload casts without runtime shape validation: `handleLoadRecords(payload as { url: string })` (L201), `handleLoadUrls(payload as { urls ... })` (L213), `handleLoadLeadEnrichment(payload as { url: string })` (L219). Nested fields implicitly trusted.
- `retryFetch(url, ...)` (L246) with no scheme/host allowlist → if the main thread ever pipes untrusted input to `url`, the worker becomes an open fetch proxy (`file:`, `data:`, etc.).
- Load path: `retryFetch` on superseded requests isn't aborted (no AbortController threaded through requestId supersede).

**Recommendation:** runtime payload validation (url-is-string, urls-is-array) before fetch; AbortController keyed on requestId.

## Finding 2 — lockstep gating parity healthy (no action)

`App.svelte focusActive` and `JourneyChrome` `chromeHasFocus` use symmetric parity predicates (`useParityAttrs()`); no asymmetric-gate regression found.

## Finding 3 — demo choreography 10-phase flow healthy (no action)

`src/lib/stores/demo.svelte.ts` — `DemoPhase` + `setDemoPhase`/transition guard intact; veil-stacking prevention logic in place per worker scan.

## Disposition

- Finding 1 → fixed in the main lane (2026-08-14):
  - `requireThreadPayload()` now rejects empty URL arrays as well as malformed or
    non-HTTP(S) entries.
  - Each active worker request owns an `AbortController`; a newer message aborts
    the previous request, and `retryFetch()`/backoff propagate the signal without
    retrying abort errors.
  - Focused regression coverage was extended for the empty-array case.
  - Verified with 197 focused Vitest tests, `tsc --noEmit -p tsconfig.typecheck.json`,
    targeted ESLint, and `npm run build`.
- Finding 2/3 → verified healthy; no change needed.

DONE-2026-08-14 (Finding 1 implemented and verified)
