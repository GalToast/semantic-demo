# Search Fallback Conventions — Semantic Explorer

Moved out of `AGENTS.md` (Prompt Budget). Dev-environment + fallback detail.

## "Showing demo data" banner

The yellow banner fires ONLY on the genuine 20-business mock fallback (M10), not the 8,406-record local index. The `SEARCH_MOCK_FALLBACK` event (search-engine emits it only when `performMockSearch` returns rows) drives the banner; `SEARCH_DEGRADED` (local index fallback) does NOT show it. When live `/api.php` is unreachable in dev against a static server, the engine first tries the real local 8,406 index (no banner); only on total miss does it fall back to 20 mock + banner. Don't suppress; if noisy, lower trigger frequency, don't silence.

The banner means either (a) the API on 8795 returned an error or raw PHP source, or (b) no PHP is listening at all. With PR-N + PHP CLI on 8795 the banner stays hidden.

## `sessionStorage.api_unreachable` (PR-M)

Time-bounded sticky bypass, NOT a permanent lock. Record is `{setAt: Date.now(), reason: string}`; expires after `API_BYPASS_STICKY_MS` (60s) on the read path; clears on the next successful API response. Legacy `'1'` strings are treated as expired so old tabs recover automatically.

Helpers (in `@lib/search/mock-search-fallback`): `markApiUnreachable(reason)`, `clearApiUnreachable()`, `readApiUnreachable()`. Never call `sessionStorage.setItem('api_unreachable', ...)` directly — go through `markApiUnreachable` so the timestamp is recorded.

Caller-initiated search cancellation does not mark the API unreachable; genuine network failures and internal request timeouts still do. This keeps a superseded search from forcing later searches onto the local fallback lane.

## `?staticDev=0`

Forces live API and surfaces failures as errors. The orchestration path bypasses
its seven-second local-index race in this mode, so contract tests observe the
real API rejection rather than a locally synthesized result. Used by contract
tests; do not use in normal dev flows.

## Dev with live data

Vite dev proxies `/api*` to `127.0.0.1:8795`; the system expects a PHP backend there (see `docs/ops/DEPLOY_STATUS.md`, `docs/ops/walkthrough-r7-findings.md`). For dev with live data: stop whatever's on 8795 (`python -m http.server` from `npm run serve` is the legacy JS track — see `memory/environment.md`, deleted 2026-06-07) and run `php -S 127.0.0.1:8795 -t .` from the repo root (or `npm run serve`, which now restores plain data twins first). PHP CLI server executes `/api.php` AND serves static files (replaces Python for both roles). PR-N makes `api.php` fall back to `src/data.dat` when no root-level `data.dat` exists, so a fresh checkout Just Works without copying.

**Data-twins gotcha (2026-08-23):** the build ships `dist/svelte/data/` as .br/.gz twins only (plains deleted except `data.dat`). PHP's built-in server does not negotiate encodings, so plain data URLs 404 → silent geometric-fallback. `npm run serve` now auto-runs `scripts/decompress-data-twins.mjs` to restore plains before starting PHP (idempotent).

## Debug

`curl '/api.php?action=semantic_search&q=coffee&limit=1&offset=0' -H 'Referer: http://127.0.0.1:5173/'` — should return JSON `{ok: true, ...}`.
