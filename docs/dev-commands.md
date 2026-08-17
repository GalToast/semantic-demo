# Dev Commands — Semantic Explorer

Moved out of `AGENTS.md` (Prompt Budget) so the per-call prompt stays lean. Full reference.

## Core scripts

```bash
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:contract
npm run qa:contract                            # all surface-contract checks (desktop + mobile)
npm run qa:contract:mobile-critical             # 12 mobile-critical surfaces (includes mobile-idle)
npm run qa:android -- --smoke                   # real Android Chrome smoke via ADB/CDP
# single-surface: node scripts/qa.mjs contract --surface=mobile-idle --headed
npm run test:microdemo
npm run serve
npm run audit:a11y           # a11y lint for src/components/*.svelte (tabulated)
npm run audit:a11y:strict    # same, exit 1 on any HIGH finding
npm run audit:a11y:json      # same, machine-readable JSON
```

## a11y audit

`scripts/audit-a11y.mjs` checks 8 rules: button type, button aria-label, form input id/aria, interactive non-semantic containers, image alt, low-alpha colors, outline suppression, aria-hidden wrapping focusable children.

Use `--file=<Substring>` and `--severity=HIGH|MED|LOW` to filter. Use narrower checks when validating a scoped change.

## Test server & stale-dist (Playwright `reuseExistingServer`)

- **8796** = Playwright test server (`scripts/test-server.mjs`): static `dist/` + proxy
  `/api.php` → **8795** (PHP). `playwright.config.js` starts
  `scripts/playwright-web-server.mjs`, port 8796, `reuseExistingServer: true`; the wrapper
  builds only when `dist/svelte/index.html` is missing or older than its tracked build inputs.
- `test-server.mjs` reads files from `dist/` **per request** (`Cache-Control: no-cache`), so a
  mid-session `npm run build` refreshes a **running** 8796 with no restart.
- **Foot-gun:** if _any_ process already binds 8796 when tests run, Playwright **skips the
  build** and serves whatever is on disk. After editing source, a stale 8796 serves an
  out-of-date `dist/` and tests can fail against the OLD build. Local-dev risk only — CI
  always rebuilds (no pre-bound port).
- **Worktree foot-g (2026-08-11):** `src/data.dat` + `src/data.dat.gz` are an **untracked
  local corpus asset** (1.8MB, exists only in the main checkout). A fresh `git worktree`
  must copy them (`cp <main>/src/data.dat src/` + `.gz`) and `npm run build` before
  data-based suites (3D/journey/hover) — otherwise `GET /data.dat` → 404 → `points:0`
  and every data-dependent test dies at the boot gate with no obvious cause.
- **Recovery — stop the exact PID on 8796 (never broad node groups), then re-run:**

    ```bash
    # Confirm the command line first (must mention test-server.mjs), then stop only that PID:
    pwsh -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'test-server\.mjs' } | Select-Object ProcessId,CommandLine"
    pwsh -NoProfile -Command "Stop-Process -Id <PID_FROM_ABOVE>"
    ```

- **Force-fresh:** run `npm run build` immediately before `npx playwright test …`; a running
  8796 then serves the just-rebuilt dist live. The `qa:journey:fresh*` scripts bake the
  pre-build in (`npm run build && npm run qa:journey*`).

- **Fresh-build override:** when 8796 is free, set `PLAYWRIGHT_FORCE_BUILD=1` to make the
  wrapper rebuild before starting the server. This does not affect a server already bound to
  8796; stop that exact server or run `npm run build` first.

- **Strict-freshness guard (opt-in):** `playwright.config.js` registers
  `scripts/playwright-global-setup.mjs` as `globalSetup`. By default it is a **no-op** (never
  disrupts parallel sessions). Set `PLAYWRIGHT_STRICT_FRESH=1` to make it **fail fast** with a
  clear message if `dist/svelte/index.html` is missing or stale (a build input newer than dist),
  pointing you at `npm run qa:journey:fresh`. Useful in CI or when chasing stale-dist regressions
  (e.g. the 5o keyboard-hint-panel z-index bug, caused by a stale dist missing `mobile_base.css`).
  It never rebuilds — use `:fresh` for that.

## Heavy 3d contract groups (3d-smoke / 3d-full)

`npm run verify:3d-tests` is the browser-free admission check for every
`tests/3d-*.spec.js` file. It rejects JavaScript parse errors, committed
merge markers, and unresolved local relative imports; CI also runs Playwright collection with `--list`. It does not
replace the resource-heavy `qa:3d` runtime battery.

These WebGL suites are heavy: each spec cold-loads `?q=coffee&nodemo=1` (8,406-point scene + engine init) and can take 60–180s+ per test on a contended host.

**Know before you run (2026-08-10, `59d5e444`/`789b06d6`):**

- The spec files override the playwright global timeout (120s) down to per-test budgets.
  60s was too small on this host → all first-attempts died in `openApp` readiness wait
  (`tests/helpers/3d-interaction-helpers.js:17`), which the runner mislabeled
  "transient browser/server failure" and retry-treadmilled. Budget is now 180s for the
  8 specs that were at 60s.
- **Cold-load duration is contention-unbounded** on shared hosts: observed 60s / 120s /
  180s+ depending on system load. Pass-rate correlates with how quiet the browser lane is.

**Correct recipe (verified):**

1. `npm run build` once (dist is custom-outDir `dist/svelte/`).
2. Start + borrow a warm static server at the REPO ROOT instead of letting the
   runner own one (the 3d helpers build `BASE_URL + /dist/svelte/index.html`, so
   TEST_BASE_URL must be repo-root-served, never dist-root):
   `python -m http.server 8785 --bind 127.0.0.1` (from the repo root; NOT `cd dist/svelte`)
   Serves both `/dist/svelte/...` (the app) and `/src/...` (raw .ts fallbacks).
   A dist-rooted server 404s the helper's `/dist/svelte/` path and triggers a
   raw-source fallback that crashes on Svelte runes (2026-08-11).
3. Tell the runner to borrow it + use the real GPU:
   `TEST_BASE_URL=http://127.0.0.1:8785 SEMANTIC_USE_D3D11=1 node tests/run-all-contracts.js --group=3d-full`
   (`--use-angle=d3d11` reaches the RTX 4050; without it Chromium may use software WebGL).
   **Never set `--workers` >1** (playwright.config.js mandates 1 for this serial
   WebGL family; parallel boots race the global APP_STATE mirror).
4. **Never run two browser suites in parallel** — they self-inflict the cold-load
   contention (measured: node-hit + smoke overlapping made both slower and flakier).
   One chromium-based contract run at a time.
5. **Never override `--workers` on the 3d family.** playwright.config.js mandates
   `workers: 1` + `fullyParallel: false` for the serial WebGL suite; a
   `--workers=2` run (2026-08-11) crashed the whole family with
   `ReferenceError: $state is not defined` (src/lib/state/app.svelte.ts:74) — two
   parallel app boots colliding on the `__SEMANTIC_EXPLORER_APP_STATE_V1__`/
   NAV-mirror globals, not a product bug. Config is authoritative here.
6. Budget: 16-spec 3d-full can need 60–90+ min serial. Use a background job with a
   generous cap; judge progress by `[run]`/`[PASS]` markers, not wall time.

## CI browser gate

The automatic deploy gate runs only `tests/widget-journey-smoke.spec.js` with
one Chromium worker and software WebGL enabled. This keeps the required CI
signal deterministic and bounded; run `npm run qa:journey:headless` separately
when the broader journey suite is needed. The production build job publishes
the `dist-svelte` artifact, and both the bundle-size and deploy jobs restore
that same verified artifact instead of rebuilding a second copy.

## 3d battery — port-8796 coordination rule (2026-08-11)

The playwright webServer binds 8796 (`reuseExistingServer` is env-gated via
PLAYWRIGHT_REUSE_SERVER=1 — NOT default). Fleet test lanes (e.g. demo-poller-\*,
journey audits) spawn their own webServer on 8796; running `qa:3d` while they're
active collides ("already used"). Check BEFORE running:
netstat -ano | grep :8796 → LISTENING by node.exe = a fleet lane's live run
Wait for the fleet's lane to finish (their webServer exits with their run) OR set
PLAYWRIGHT_REUSE_SERVER=1 ONLY if you're certain the existing server serves a
fresh dist. The `qa:3d:fresh` (build-first) variant remains the correctness gate.

### deep-link journey specs need the Vite DEV server (port 5173, IPv6 ::1)
`tests/deep-link-focus-card-hit-journey.spec.js` hardcodes
`TEST_BASE_URL || 'http://[::1]:5173'` — it does NOT use the 8796 test server.
Running it needs a live Vite dev server:
`npx vite --port 5173 --strictPort` (binds IPv6; curl IPv4 127.0.0.1:5173 → 000 is
expected — use `http://[::1]:5173`). Its final coordinate-click section is the
documented serial-GPU-rAF flake (see the spec header); record-deep-link boot+focus
restore verified GREEN under this oracle (2026-08-11: journey=focus-search, canvas up,
0×4xx). Don't "fix" the record path on the strength of this spec without 5173 up.

### qa:3d on Windows: the npm script env syntax breaks under cmd.exe
`npm run qa:3d` sets `SEMANTIC_USE_D3D11=1 PLAYWRIGHT_STRICT_FRESH=1` UNIX-style →
cmd.exe: "'SEMANTIC_USE_D3D11' is not recognized". Use the bash-native equivalent:
`SEMANTIC_USE_D3D11=1 PLAYWRIGHT_STRICT_FRESH=1 npx playwright test tests/3d-*.spec.js --browser=chromium --workers=1`
(2026-08-11; also the STRICT_FRESH guard aborts when dist is stale — rebuild first.)
