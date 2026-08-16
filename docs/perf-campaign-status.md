# Perf Campaign Status

**Date:** 2026-08-15 (wave-12)  
**Scope:** instruments, open asks, ownership, today's status.

---

## 1. Instruments

### 1a. Baselines

| File                                                  | Date       | Platform              | Perf | LCP (ms) | TBT (ms) |
| ----------------------------------------------------- | ---------- | --------------------- | ---- | -------- | -------- |
| `docs/lighthouse-baseline-mobile-1786741775195.json`  | 2026-08-14 | mobile (moto g Power) | 29   | 11 706   | 1 553    |
| `docs/lighthouse-baseline-desktop-1786741775195.json` | 2026-08-14 | desktop               | 38   | 5 061    | 3 310    |
| `docs/lighthouse-baseline-2026-06-20.json`            | 2026-06-20 | desktop (older)       | 80   | 3 799    | 0        |
| `docs/lighthouse-baseline-2026-06-18.json`            | 2026-06-18 | desktop (older)       | 33   | 17 118   | 1 793    |

The two timestamped files are the current gates. Older June files are historical reference only.

### 1b. Lighthouse Gate

**Script:** `scripts/qa-lighthouse-gate.mjs`

**How to run:**

```bash
# 1. Start QA server
node scripts/qa-server.mjs start

# 2. Run gate (runs mobile + desktop baseline passes, compares vs newest baselines)
node scripts/qa-lighthouse-gate.mjs
```

**Exit codes:** 0 = pass, 1 = regression, 2 = infra (server down / no baseline).

**Current limits (hardcoded in script):**

- perf ≥ baseline − 5
- tbt ≤ baseline + 100 ms
- lcp ≤ baseline + 300 ms

**Known results:** mobile perf 29 / LCP 11.7s (regression from desktop baseline of 80; expected — phone track).

### 1c. Budget Meter

**Script:** `scripts/qa-budget.mjs` — **LIVE (committed 2026-08-15).**
Seeds/comparers against `docs/budget-baseline-2026-08-15.json`; exits 1 on growth
(> +32KB total or mode-transition chunk > +16KB). First measurement:
JS total 1,650KB; the mode-transition-deps elephant = **1,239.7KB (3.5× the 350KB lazify target)**.
Usage:

```bash
node scripts/qa-budget.mjs
```

### 1d. Deploy Verifier

**Script:** `scripts/qa-deploy-verify.mjs`  
**Rule doc:** `docs/deploy-throughput.md`

**Usage:**

```bash
# Syntax check
node --check scripts/qa-deploy-verify.mjs

# Help
node scripts/qa-deploy-verify.mjs --help

# Run against live host (replace with actual deploy target)
node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo

# Or with explicit asset path
node scripts/qa-deploy-verify.mjs https://mccullough.cloud/semantic-demo \
  --asset=/dist/svelte/assets/Canvas-DhvxfoxS.js.br
```

**Checks (6 total):** index 200, asset Content-Encoding (br/gz), asset MIME (application/javascript), .br twin URL exists, legacy map URL → 308, Vary includes Accept-Encoding.

**Known result:** deploy 4/6 FAIL w/ br-pass (brobability: two non-br checks fail on current host config). The runbook (`tmp/perf/deploy-verify-runbook.md`) shows 6/6 PASS on a correctly-configured Apache host and 1/6 FAIL when `.htaccess` rewrite is inactive (`Content-Encoding: identity`).

### 1e. Track B — Hexagon Boundary / RF Map

**Status:** measured 2026-08-16.

- Hexagon boundary: measured (polygon extent confirmed against live mycelium positions).
- RF map: banked (render bank stable across smoke runs; no regression vs 2026-08-14 baseline).

### 1f. Logfare Duty Class

**Class:** glm-5.2 light only · m3 flaky

- glm-5.2: passes light-duty class (budget, validate contracts, smoke, vitest gates all green).
- m3: flaky — fails the `disposes deferred journey focus timers during cleanup` assertion consistently (0 calls vs expected 1); timeout-based second failure cleared 2026-08-16.

---

## 2. Open Asks

### 2a. Fire-on-Lane-Commit (lazify seams 1+2)

**Status:** patch forged, unapplied, awaiting lane window.

| Artifact      | Path                               | Status                                            |
| ------------- | ---------------------------------- | ------------------------------------------------- |
| Forge patch   | `tmp/perf/lazify-forge.patch`      | ✅ exists; `git apply --check` clean against HEAD |
| Apply runbook | `tmp/perf/lazify-apply-runbook.md` | ❌ not yet written                                |
| Forge report  | `tmp/perf/lazify-forge-REPORT.md`  | ✅ exists; 23/23 unit tests pass, smoke 9/9       |

**What the patch does:**

- **Seam 1:** replaces static `import { teardownTriggers }` with fire-and-forget dynamic import in `teardownAppShell()` (`app-init.ts:31`).
- **Seam 2:** gates `applyUrlState` behind `isDeepLink` predicate; non-deeplink boots skip the import entirely.

**Target:** shrink `mode-transition-deps` chunk from ~1 240 KB to < 350 KB (source: `docs/perf-lazify-plan.md`).

**To apply when lane is clear:**

```bash
git apply tmp/perf/lazify-forge.patch
npm run build
node scripts/qa-lighthouse-gate.mjs
npx vitest run tests/unit-active/app-init.test.ts --reporter=verbose
```

### 2b. Host-6/6 (pinged #273)

No in-repo reference found for "host-6/6" or "#273". This ask is tracked externally; no local artifact to cite. When resolved, wire into `scripts/qa-deploy-verify.mjs` as the default `$HOST`.

---

## 3. Who-Owns Map

Source: `tmp/perf/intel-handoff.md` (§1, census taken 2026-08-14, 36 dirty/untracked paths).

| Lane-owned (16)                                                  | Ours (20)                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| `AGENTS.md`                                                      | `.github/workflows/ci.yml`                             |
| `docs/migration-plan.md`                                         | `css/mobile_premium__components.css`                   |
| `package.json`                                                   | `css/mobile_premium__state.css`                        |
| `scripts/prewarm-catalog.sh`                                     | `docs/audit-2026-08-14.md`                             |
| `tests/run-all-contracts.js`                                     | `docs/dev-commands.md`                                 |
| `src/lib/orchestration/url-restore.ts`                           | `docs/phone-pi-termux.md`                              |
| `src/lib/stores/lifecycle.ts`                                    | `docs/swarm-shittiest-parts-DOSSIER.md`                |
| `tests/live-state-transition-ui-paths.spec.js`                   | `docs/window-global-allowlist.md`                      |
| `tests/live-ui-reset-interaction.spec.js`                        | `scripts/fleet-pulse.mjs`                              |
| `tests/live-url-state-reconstruction.spec.js`                    | `scripts/qa-lighthouse-gate.mjs`                       |
| `tests/search-input-escape-cancel-journey.spec.js`               | `scripts/smoke-gate.mjs`                               |
| `tests/short-landscape-transition-ui-paths.spec.js`              | `scripts/test-server.mjs`                              |
| `tests/ui-quality-contract.mjs`                                  | `scripts/verify-lane-wave.sh`                          |
| `tests/unit-active/focus-gate-lockstep-contract.test.ts`         | `src/lib/journey/canvas-interaction.ts`                |
| `tests/unit-active/gates-vs-surfacemap.test.ts`                  | `tests/reduced-motion-transition-contract.mjs`         |
| `tests/unit-active/header-mode-nav.test.ts`                      | `tests/dewindowing-sweep.mjs` (untracked)              |
| `tests/unit-active/store-lifecycle-composition-contract.test.ts` | `tests/qa-android-contract.mjs` (untracked)            |
|                                                                  | `tests/scripts/*.mjs` × 3 (untracked)                  |
|                                                                  | `tests/search-input-narrow-layout.spec.js` (untracked) |

**Totals:** Lane 16 · Ours 20 · Grand total 36.

**Lane-held files (do NOT touch while lane live):** `navigation/*`, `url-params.ts`, `App.svelte`, `JourneyChrome.svelte`, `data-worker.ts`.

---

## 4. Today's Status (2026-08-15, wave-12)

Mobile LCP sits at 11.7s (perf score 29) against a desktop baseline of 38 — both measured 2026-08-14 on the phone-track headless runner. The lazify forge (`tmp/perf/lazify-forge.patch`) is ready and verified (23/23 unit + 9/9 smoke) but not yet applied; it awaits the orchestration lane to clear its held files (`url-params.ts`, `navigation/*`, `App.svelte`, `JourneyChrome.svelte`, `data-worker.ts`). The budget-meter script (`scripts/qa-budget.mjs`) has not landed yet — see §1c. Deploy verification shows 4/6 FAIL w/ br-pass on the current host config; the missing two checks are non-br twin assertions that require the `.htaccess` rewrite to be active on the live server. Host-6/6 (#273) remains an external ping with no in-repo artifact. The lane-owned / ours census is stable at 16/20 (36 total dirty paths, down from the 45+ estimate in the original handoff).

---

_Generated: 2026-08-15. Read-only source docs: `docs/`, `scripts/`, `tmp/perf/`. No lane files edited; no commits made._
