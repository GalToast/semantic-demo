# Journey test modes (mock vs live)

`tests/widget-journey.spec.js` is the end-to-end "widget journey" suite (~19
tests). It runs against the **built** app in `dist/svelte/` (serve it; don't
point Playwright at `src/`). AGENTS.md points journey work at
`qa:journey:headless`; this file is the mode / stability reference so we don't
bloat AGENTS.md.

## Two modes

| Mode | How to get it | Server | Data | Stability |
|------|---------------|--------|------|-----------|
| **Mock (standalone)** — the gate | `qa:journey:headless` with PHP **down** | Playwright auto-starts `python -m http.server 8795 --directory .` | 20-record mock catalog ("Showing demo data" banner) | **Deterministic green** |
| **Live** | `qa:journey:live` (or `qa:journey:headless`) with PHP **up** on :8795 | reuses the PHP dev server (`php -S`) | real 8,406-record API | **Unstable — can abort mid-run** |

`playwright.config.js` auto-starts its own `python` server on 8795 only when
`TEST_BASE_URL` is unset **and** nothing is listening — so with PHP down the
suite is self-contained and mock.

## Important: it already runs serial

`playwright.config.js` sets `fullyParallel: false` and `workers: 1`. So
**both** modes run at a single worker already — there is no parallelism to
"reduce." A live-smoke profile therefore does **not** change concurrency vs the
default; it just labels a run that expects the live PHP server to be up.
(Passing `--workers=2` on the CLI is overridden by the config's `workers: 1`,
so `qa:journey:live` pins `--workers=1` explicitly to match.)

## Why live mode is unstable (not parallelism)

The difference between green mock and flaky/aborting live is the **server**, not
worker count:

- The PHP built-in dev server (`php -S`) is **single-threaded** and chokes on
  the browser's concurrent in-test requests (multiple XHRs to the API,
  static-asset fetches) — returning 404s / stalling. Different tests fail on
  each run, and under the full ~19-test WebGL suite the run can **abort with no
  Playwright summary** (local Chromium/WebGL resource exhaustion).
- `python -m http.server` (mock mode) is also single-threaded, but the app
  issues far fewer / cheaper requests against mock data, so it stays green.

These are **infrastructure issues, not test bugs** — the same tests pass in mock
mode and individually against live.

## Recommended usage

- **Gate / CI:** run `qa:journey:headless` with PHP down (mock). Green.
  This is the only deterministic gate.
- **Live smoke (best-effort, may abort):** ensure PHP is up
  (`php -S 127.0.0.1:8795 -t .`), then `npm run qa:journey:live`. It is
  serial (config-enforced) and may still abort/crash under the full WebGL
  suite — treat a clean run as a bonus signal, **not** a gate.
- **For a stable live run:** front `dist/svelte` with a **threaded** server
  (nginx / Apache + PHP-FPM) instead of `php -S`; that removes the
  single-threaded choke point. (Out of scope for this repo's dev workflow.)

## Recent fixes (this area)

- `caee64f4` — `playwright.config.js`: webServer → 8795 + repo root (standalone).
- `cfb23aed` — 3 test-debt guards aligned with intentional product changes
  (W52-a11y, Bug 3a mode-chip hiding, Bug 3b `fc-btn-selected-map`).
- `684f7525` — F7 source-path off-by-one (`'../../src'` → `'../src'`); 5k
  splash-cta wait 40s → 90s (extra headroom under live API latency).
- `11a83a96` — added `qa:journey:live` profile + this doc.
