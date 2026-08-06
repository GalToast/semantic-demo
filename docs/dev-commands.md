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
