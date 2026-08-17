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

## Swarm-9 closeout (measured 2026-08-16)

- **Lighthouse re-baseline (b2):** desktop perf 38→86, TBT 3310→130ms, LCP 5.1→2.0s; mobile 29→34, LCP 11.7→10.5s. GATE ✓ BOTH. Root cause of the old low desktop was ENV, not code (EPERM in chrome-launcher cleanup noted as flake).
- **Dyno measure (a2 verdict):** ranks 4/5 (compass/cluster fire-and-forget at module eval) are economically NEGATIVE (+8.1KB preload cost vs 2.3KB split); RECOMMENDATION: skip them; pursue rank-1 = app-init → journey ENTRY-LAZY — the cascade root in OUR file (app-init.ts).
- **Route pool (c1):** poolside/laguna-xs-2.1 via nvidia/v1 VERIFIED ALIVE (262k ctx, free) — may join the pool; FreeInference + others skip-listed.
- **RANK-1 verdict (e1, measured):** app-init entry-lazy = FLAT (+6.8KB growth). Root cause: boot-time void import() doesn't defer fetch (rolldown + other boot refs still absorb; wrapper overhead).
- **Fresh re-seed + host clinical (2026-08-16, t3/t1):** lighthouse re-seeded EPERM-free (fresh CHROME_USER_DATA_DIR): mobile perf 35, desktop 74 (+36), LCP 10.5/2.2. Gate = numeric compare (t3's parseFloat-flag was a stale-log artifact). Host: Defender realtime throttled (elevated, ScanAvgCPULoadFactor 20); heap cap for future spawns (setx NODE_OPTIONS=2048, verified 2240MB); telemetry tmp/perf9/heap-telemetry.mjs (append-only JSONL; tune: flat-rss healthy, GC-CPU/OOM → raise, far-under → lower). Session whale = pi-agent spikes to 2.6GB under full LH runs.
  **THE winning move (rank-2): BEHAVIOURAL deferral** — gate journey-adapter init inside first-need: Canvas composable onMount → import journey before initEngine in the same tick; or move initJourneyCanvasInteractionAdapter call OUT of journey.ts queueMicrotask INTO canvas-interaction/lifecycle.engineHeavy (both OUR files). Recipe exists in tmp/perf9/rank1-measure.md §Step-4.

- **Rank-2 verdict (t2, measured): SKIP landing.** The behavioural deferral WORKS (journey facade: 0 preload bytes, fetched only at first Canvas mount — grep-verified) but is NET-NEGATIVE: rolldown thin-import overhead +6.7 KB vs 2.8 KB deferred (fire card over-estimated 25–35 KB; sub-graph was already chunk-split). Verdict: do NOT apply rank2.patch; the true boot mass left = the engine/lifecycle dynamic-import seam (lane-owned) + adapter-CODE move (Option-P, not facade).

-   **ELEPHANT CAMPAIGN FINAL VERDICT (3 measured rounds):** rank-1 (entry-lazy, +6.8KB — rolldown overhead), rank-2 (facade-defer, +3.9KB — facade was already thin; subgraph pre-split), teardown-carve (0 net — every teardown module already statically anchored at boot via AppBoot/three-engine-state/adapters/MapView). Conclusions: the ~1.24MB mode-transition chunk IS the first-frame canvas scaffold (ThreadManager renderer + mycelium); deferring it = deferring the first 3D frame itself. Probes (e1,t2,w1,w2) all confirm: LAZIFY CEILING REACHED by body-code surgery. The real balance remaining = HTTP/CDN caching, image/simplex strategy, worker-buffer reuse — budget-simplex track (fresh baselines 35/74).
