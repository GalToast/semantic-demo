# Journey test modes (mock vs live)

`tests/widget-journey.spec.js` is the end-to-end "widget journey" suite. It runs
against the **built** app in `dist/svelte/` (serve it; don't point Playwright at
`src/`). AGENTS.md points journey work at `npm run qa:journey:headless`; this file
is the mode / flakiness reference so we don't bloat AGENTS.md.

## Two modes

| Mode | How to get it | Server | Data | Stability |
|------|---------------|--------|------|-----------|
| **Mock (standalone)** — the gate | `qa:journey:headless` with PHP **down** | Playwright auto-starts `python -m http.server 8795 --directory .` | 20-record mock catalog ("Showing demo data" banner) | **Deterministic green** |
| **Live** | `qa:journey:headless` (or `qa:journey:live`) with PHP **up** on :8795 | reuses the PHP dev server (`php -S`) | real 8,406-record API | **Flaky under full parallelism** |

`playwright.config.js` auto-starts its own `python` server on 8795 only when
`TEST_BASE_URL` is unset **and** nothing is already listening — so with PHP down
the suite is self-contained and mock.

## Why live mode is flaky

The PHP built-in dev server (`php -S`) is **single-threaded**. Under the suite's
default parallel worker count it drops / 404s concurrent requests, so different
tests fail on each run (e.g. a literal "Not Found" page, or `splash-cta` /
visibility timeouts from CPU starvation). These are **infrastructure flakes, not
test bugs** — the same tests pass in mock mode and in isolation.

## Recommended usage

- **Gate / CI:** run `qa:journey:headless` with PHP down (mock). Green.
- **Live smoke (occasional):** ensure PHP is up (`php -S 127.0.0.1:8795 -t .`),
  then `npm run qa:journey:live` (`--workers=2`). If you still see 404s, drop to
  `--workers=1` (fully serial — bulletproof against the single-threaded server,
  just slower). For a permanently stable live run, front `dist/svelte` with a
  threaded server (nginx / Apache) instead of `php -S`.

## Recent fixes (this area)

- `caee64f4` — `playwright.config.js`: webServer → 8795 + repo root (standalone).
- `cfb23aed` — 3 test-debt guards aligned with intentional product changes
  (W52-a11y, Bug 3a mode-chip hiding, Bug 3b `fc-btn-selected-map`).
- `684f7525` — F7 source-path off-by-one (`'../../src'` → `'../src'`); 5k
  splash-cta wait 40s → 90s (parallel-contention headroom).
