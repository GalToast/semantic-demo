# PHASE-5C-OVERLAY-HEADER-PATCH Report

## Summary

Preserved `v2Result.headers` in HTTP error responses when `v2FailoverDispatch` returns `{ success: false }`. Previously, diagnostic headers (e.g., `X-Router-Diagnostic`) were discarded on V2 failure because the success-path check (`if (v2Result.success)`) short-circuited, and the subsequent error response path had no access to them.

## Details

- **Backup created at:** `opencode-key-router.mjs.bak-pre-p5c-2026-07-25`
- **Sites patched:** A (line ~3528) + B (line ~4142)
- **Patch approach:** Option 1 — introduce `let v2diag;` scoped variable before each V2 overlay block; capture `v2Result?.headers` after V2 dispatch (regardless of success/failure); spread `...v2diag` into the error-response header object at both sites.
- **Lines added:** 3 per site (`let v2diag;`, `v2diag = v2Result?.headers;`, `...v2diag` spread in error headers)
- **node --check exit code:** 0
- **bun build exit code:** 0 (`--target node`; browser polyfill error on `node:os` is pre-existing)
- **Diffstat:** net +5 lines (4320 → 4325)
- **Restoration status:** not restored (patch held)

### Edit locations

| # | Site | Line (new) | Change |
|---|------|-----------|--------|
| 1 | A    | 3528      | `let v2diag;` declaration |
| 2 | A    | 3566      | `v2diag = v2Result?.headers;` capture |
| 3 | A    | 3608      | `...v2diag` merged into `{ "Retry-After": ..., ...v2diag }` |
| 4 | B    | 4142      | `let v2diag;` declaration |
| 5 | B    | 4180      | `v2diag = v2Result?.headers;` capture |
| 6 | B    | 4196      | `{ ...v2diag, ...allFailedHeaders }` merged into error response |

### Pre-existing auto-format changes (Biome)

The edit tool triggered biome auto-formatting which also cleaned up three unrelated items:
1. `let oldestCoolingIndex = undefined` → `let oldestCoolingIndex`
2. `Object.prototype.hasOwnProperty.call()` → `Object.hasOwn()`
3. `Math.pow(2, ...)` → `2 ** ...`

These are harmless style fixes that do not affect functionality.

## Verification plan for main-lane

When key-router is restarted by main-lane:
1. Send request with `x-v2-failover: 1` header to a provider with no active keys / all-key-failed error
2. Verify response includes any V2 diagnostic headers (e.g., `X-Router-Diagnostic`) even though V2 returned `success: false`
3. Verify normal paths (no `x-v2-failover` header, successful V2 responses) are unaffected

---

PHASE-5C-OVERLAY-HEADER-PATCH WORKER — FINAL REPORT
- PATCH LANDED: ✓
- Backup file: opencode-key-router.mjs.bak-pre-p5c-2026-07-25
- Note: main-lane will restart key-router after this point to pick up patch and run live verification
- Time taken / Cost: agnes-2.0-flash = $0
