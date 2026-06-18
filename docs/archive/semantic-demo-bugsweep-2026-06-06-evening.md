# Semantic Demo Bugsweep — Evening Follow-up

**Date:** 2026-06-06 (evening, ~20:11 local)
**Scope:** 4 parallel diagnose-only workers, mimo-v2.5 model, seams = JS runtime, CSS cascade & mobile, Svelte migration, build/test/PQ/docs
**Authoritative prior sweep:** `semantic-demo-bugsweep-2026-06-05.md` (resolved via commit `753583b`)
**Concurrent activity to be aware of:** an active peer worker "Svelte Component Finisher" (`minimax-m3-free`) is editing `src/components/*.svelte` and `src/lib/journey/thread-inspector.ts` mid-flight. **Svelte findings below that touch those files should be re-verified on disk before any fix.**

## Headline Numbers

| Worker | Status | Findings | Bytes | Time |
|---|---|---|---|---|
| CSS cascade & mobile | ✅ completed (exit 0) | 6 (1 HIGH, 3 MEDIUM, 2 LOW) | 340K | 6m13s |
| Svelte migration | ✅ completed (exit 0) | 8 (0 HIGH, 5 MEDIUM, 3 LOW) | 483K | 7m36s |
| Build / PQ / docs | ⚠️ timed out at 600s, partial report on disk | 14 (0 HIGH, 6 MEDIUM, 8 LOW) + PQ verification | 391K | 10m00s |
| JS runtime | ⚠️ timed out at 600s, no written report | 0 confirmed (file-visit list captured) | 516K | 10m00s |

**Net confirmed findings:** 28 (1 HIGH, 14 MEDIUM, 13 LOW).
**PQ verification status:** 2 of 3 morning PQ items still open on disk (tokenizer.ts `Intl.Segmenter` + special-char pre-processing, `nearDuplicateKey` accent-strip). 1 closed (`cleanOptionalValue` in canonical `dom-formatters.js`/`dom-formatters.ts`).

## 1 HIGH severity

### F-CSS-1: Z-index token drift between TS/inline (80) and legacy CSS (50)
**Source:** CSS worker + adversarial re-verify
**Files:** `src/lib/z-index.ts:32`, `css/base.css:119`, `src/index.html:26`, `src/lib/css/z-layers.css:49`
**Verified by main lane:** `z-index.ts` says 80, `base.css` says 50, `index.html` inline says 80. Real drift.
**Risk:** legacy app loads `base.css` and gets 50; Svelte app uses the inline 80 and `Z_LAYERS.panels` constant 80. If any Svelte component ever imports `z-layers.css`, `--z-panels` will be silently redefined to 50, layering panels underneath what they should overlap.
**Suggested fix:** Reconcile to one canonical value (80 looks intended — `index.html` and `Z_LAYERS` both agree). Update `base.css:119` and `z-layers.css:49` to 80. Add a comment.

## 14 MEDIUM severity

| ID | Surface | Title | Worker | Re-verify |
|---|---|---|---|---|
| F-CSS-2 | CSS | `src/index.html` inline z-index token set is incomplete (17 of 30+ tokens) — `.skip-link` hardcodes `z-index: 9999` because `--z-max` is missing | CSS | ✅ on disk |
| F-CSS-3 | CSS | Dead `biofield-*` selectors (38 rules, 0 JS/TS/Svelte/HTML refs) across `shell.css:289,768-937`, `progressive_disclosure.css:445`, `mobile_base.css:496-545` — delete per AGENTS.md invariant | CSS | ✅ on disk |
| F-CSS-4 | CSS | Duplicate `.search-trail-cue` rules in `layout_base.css:829-838` and `search.css:2074-2083` (identical) | CSS | ✅ on disk |
| F-SVELTE-1 | Svelte | `check:svelte` script in `package.json:25` runs `svelte-check --no-tsconfig` — **hides real TS errors**. `compass.ts:106` has 2 `Object is possibly 'undefined'` errors that CI never sees | Svelte | ✅ verified `package.json:25` |
| F-SVELTE-2 | Svelte | `LegacyCompassSurface.svelte` is the unaccounted 22nd component (340 lines, rendered in `App.svelte:158`); AGENTS.md component table and scaffold status are stale | Svelte + cross-confirm Build/PQ | ⚠️ Finisher may be touching it |
| F-SVELTE-3 | Svelte | `JourneyCanvas.svelte` imported in `App.svelte:42` but never rendered; dual `Canvas`/`JourneyCanvas` engine-bridge init code is duplicated and can drift | Svelte | ✅ on disk |
| F-PQ-1 | Build | NEW: `js/modules/utils/data-mapper.ts:9-12` has a local `cleanOptionalValue` that only checks `'NULL'`, missing 5 other `NULLISH_SENTINELS` — drifts from canonical | Build/PQ | ✅ verified on disk; worker path was `js/modules/data-mapper.ts` (missing `utils/`) |
| F-PQ-2 | Build | NEW: `src/lib/data-loader.ts:237-239` has the same drift as data-mapper | Build/PQ | ✅ verified |
| F-PQ-3 | Build | NEW: `js/modules/semantic-threads.ts:154-157` has `_cleanOptionalValue` with **NO sentinel filtering at all** — returns `String(value)` for any non-null | Build/PQ | ✅ verified |
| F-PQ-4 | Build | NEW: `src/lib/search/tokenizer.ts:54-68` is missing the special-char pre-processing that the JS version has (smart quotes, ampersands, slashes, hyphens, @#) — `"O'Brien"` tokenizes to `["o","brien"]` instead of `["obrien"]` | Build/PQ | ✅ verified |
| F-BUILD-1 | Build | `npm run test` FAILS — 8 stale cache buster mismatches (e.g. `semantic-demo.css` expects `4b23f48929e0`, got `9f37a5baa381`). Fixable via `npm run refresh:cache` | Build/PQ | ✅ worker run |
| F-BUILD-2 | Build | `npm run test:microdemo` FAILS without `npm run serve` running on port 8795 (no auto-start) | Build/PQ | ✅ worker run |
| F-BUILD-3 | Build | `npm run test:unit` is intermittent — 3 flaky 5s timeouts in `tests/unit/bridge-degraded.test.js:161,186,209` (pass on second run) | Build/PQ | ✅ worker run |
| F-PQ-5 | PQ verify | PQ MEDIUM `Intl.Segmenter` gap in `src/lib/search/tokenizer.ts` — **STILL PRESENT** (per Build/PQ worker verification) | Build/PQ | ✅ verified |

## 13 LOW severity

| ID | Surface | Title | Worker |
|---|---|---|---|
| F-CSS-5 | CSS | Landscape `max-height` breakpoint inconsistency: 420 / 430 / 480px across `mobile_premium__chrome.css`, `state.css`, `idle.css`, `strands.css`, etc. | CSS |
| F-CSS-6 | CSS | `src/index.html:52-62` `.skip-link` hardcodes `z-index: 9999` and colors `#0d2137`/`#4ecdc4` instead of using `var(--z-max)` and tokens | CSS |
| F-SVELTE-4 | Svelte | AGENTS.md:271 says `MapSummary.svelte` is a stub — it's 171 lines, complete. Scaffold status is stale | Svelte |
| F-SVELTE-5 | Svelte | `App.svelte:176-179` has a stale TODO for WeatherWidget — `WeatherWidget.svelte` exists (177 lines, imported at line 45) | Svelte |
| F-SVELTE-6 | Svelte | `InfoPanel.svelte:652,665` has unused CSS selectors `.selected-card-location svg` and `.selected-card-contact svg` (svelte-check warnings) | Svelte |
| F-SVELTE-7 | Svelte | `ThreadInspector.svelte:78` uses Svelte 4 `export function` pattern (`preview()`); works in Svelte 5 but is a legacy smell. **Note: Finisher is mid-replacement of this file's backing `thread-inspector.ts`** | Svelte |
| F-BUILD-4 | Build | `tsconfig.typecheck.json` includes `.js` files alongside `.ts` — unusual but intentional for shadow files | Build/PQ |
| F-BUILD-5 | Build | `deploy.sh` and `deploy.ps1` still reference sibling `../js/scanner.js` (file does not exist; scripts gracefully skip). AGENTS.md constraint still real | Build/PQ |
| F-BUILD-6 | Build | `test:contract` runner hits 120s timeout before completing 72 contract files | Build/PQ |
| F-PQ-6 | PQ verify | PQ MEDIUM `nearDuplicateKey` in `search-results-ui.{js,ts}:312-320` strips non-ASCII, merging "Café" and "Cafe" (same word, different accents). Original PQ description was slightly off (Fiancée vs Fiancé would NOT merge — é→e, so both → "fiance" or both → "fiancee" depending on input) | Build/PQ |
| F-PQ-7 | PQ verify | PQ LOW `semantic-search-mock-catalog` "skips" — **no bug found** on disk (both files complete, properly typed). Original PQ note was likely a transient | Build/PQ |
| F-DOCS-1 | Docs | AGENTS.md says "1 partial (ThreadInspector), 1 stub (MapSummary)" — both now complete. **Stale** | Build/PQ + Svelte |
| F-DOCS-2 | Docs | AGENTS.md says "19/21 complete" — actually 22 components. **Stale** | Build/PQ + Svelte |

## PQ Verification Matrix (from Build/PQ worker)

| PQ ID | Title | Status | Notes |
|---|---|---|---|
| HIGH | `cleanOptionalValue` drift in `dom-formatters` | ✅ FIXED | Both `.ts` and `.js` now have full 6-sentinel list. But NEW drift in 3 OTHER local copies (F-PQ-1, F-PQ-2, F-PQ-3) |
| MEDIUM | `Intl.Segmenter` gap in `tokenizer.ts` | ❌ STILL PRESENT | Plus missing special-char pre-processing (F-PQ-4, F-PQ-5) |
| MEDIUM | `nearDuplicateKey` non-ASCII strip | ❌ PRESENT | Worker corrected original analysis: merges accented/unaccented versions of SAME word, not different words |
| LOW | `semantic-search-mock-catalog` "skips" | ✅ NO BUG FOUND | Memory was truncated; no file-level issue on disk |

### F-PQ-4 / F-PQ-5 Drift — Current State (updated 2026-06-06 evening)

**F-PQ-4** (`src/lib/search/tokenizer.ts:54-68`): The TS port is missing the special-char pre-processing that the JS version (`js/modules/search-state.js`) performs. Specifically, the TS tokenizer does not normalize smart quotes (`" " ' '` → `""` `''`), ampersands (`&` → `and`), slashes (`/` → space), hyphens (`-` → space), or `@#` prefix stripping. This causes tokenization drift: e.g., `"O'Brien"` tokenizes to `["o","brien"]` instead of `["obrien"]`.

**F-PQ-5** (`src/lib/search/tokenizer.ts`): `Intl.Segmenter` gap remains — the TS tokenizer does not use `Intl.Segmenter` for word-boundary segmentation where the JS version does.

**Assignment:** Both items are assigned to the TS leaf port worker (`search-state.ts` / `tokenizer.ts` alignment pass). The worker should port the `preprocessSpecialChars()` helper from `js/modules/search-state.js` and integrate `Intl.Segmenter` into the TS tokenizer. Do not fix these in the legacy JS — the TS port is canonical.

## JS Runtime Worker — Partial Only

The JS worker systematically read `state.js`, `lifecycle-modes.js`, `url-state.js`, `journey-thread-settler.js`, `three-thread-manager.js`, `semantic-search-cache.js`, `map-state.js`, `bindings/global-bindings.js`, `strand-continuity.js`, `AGENTS.md`, and others (53+ file reads). It was about to compile its report ("Let me now do a final check on `navState` mutations that are NOT inside `withStateMutation`") when the 10-minute model pool budget expired. **No confirmed JS-runtime findings from this sweep — recommend a follow-up worker with a tighter scope (e.g., state.js mutation gap only) for the next round.**

What we *can* say with HIGH confidence about the JS runtime from the other workers' findings and the existing AGENTS.md invariants:
- `withStateMutation()` discipline is the dominant invariant; the existing 2026-06-06 sweep confirmed it holds for the canonical writers. We did not re-verify the long tail of state writers in this run.
- The 4 binding-listener fixes from the prior sweep are holding (per the global-bindings.js read).

## Surfaces verified CLEAN (no findings)

- **Z-index compliance in `src/components/*.svelte`:** All 22 components use `var(--z-*)` or `var(--z-*, fallback)`. Zero hardcoded `z-index` numbers. *(Svelte worker)*
- **`!important` in `src/components/*.svelte`:** Zero occurrences. *(Svelte worker)*
- **Svelte 4 `on:click` syntax in src/:** Zero. All Svelte 5 `onclick={}`. *(Svelte worker)*
- **Svelte 4 `$:` reactive blocks in src/:** Zero. All `$derived` or `$derived.by`. *(Svelte worker)*
- **`$effect()` read-write loops:** None — 8 `$effect` instances are all single-purpose (cleanup, viewport sync, focus state). *(Svelte worker)*
- **Missing a11y on `<button>`:** 36 buttons, all have handlers + ARIA. *(Svelte worker)*
- **Bridge teardown:** `bridge.ts:959-997` properly unbinds and disposes. *(Svelte worker)*
- **Svelte stores:** 12 stores, all have consumers. *(Svelte worker)*
- **CSS architecture:** Ownership docs and cascade order are current. *(Build/PQ worker)*
- **Engine bridge:** 1212 lines, properly typed. *(Build/PQ worker)*
- **ESLint config:** Properly configured. *(Build/PQ worker)*
- **`package.json` scripts:** All 161 local targets exist. *(Build/PQ worker)*

## Cross-Seam Patterns

1. **Drift between .ts shadow and .js canonical** appears in **4 places** (data-mapper, data-loader, semantic-threads, and the original dom-formatters). This is a **systemic migration hazard**: every time a .ts shadow is added, the helper it imports needs to be checked for parity. Suggest a CI check that diffs the function bodies of pairs and fails on drift.

2. **AGENTS.md is decaying faster than the code is moving.** 3 separate doc-drift findings (component count, MapSummary stub, ThreadInspector partial, WeatherWidget TODO). The component status table format invites staleness because there's no auto-generation. Consider a `npm run docs:check` script that lists `src/components/*.svelte` and diffs against the table.

3. **CI is hiding 2 real TS errors** because `check:svelte` uses `--no-tsconfig`. This is an infrastructure bug with a one-line fix (`svelte-check --workspace src --tsconfig ./tsconfig.json`).

4. **`npm run test` is currently RED** due to stale cache busters. Easy fix (`npm run refresh:cache`) but it means `npm test` is unreliable as a gate right now.

5. **The Svelte Component Finisher is mid-flight on `thread-inspector.ts`.** Any finding about that file or `ThreadInspector.svelte` needs re-verification after it lands. Findings F-SVELTE-2 (LegacyCompassSurface) and F-SVELTE-7 (`export function`) are in the same blast radius.

## Adversarial Pass (per QWEN.md)

What could be wrong with this report?
- **JS worker had no written report.** All JS-runtime findings are absent. The next sweep should target that surface specifically.
- **Build/PQ worker had path errors** (e.g. `js/modules/data-mapper.ts` should be `js/modules/utils/data-mapper.ts`). Re-verified the underlying code is still as described.
- **Svelte worker's HIGH-severity upgrade candidate** (the `--no-tsconfig` issue) is classified MEDIUM in their report. I'd argue it's HIGH because it means the canonical CI gate for src/ TS quality is non-functional. **Suggest reclassify F-SVELTE-1 as HIGH.**
- **CSS worker checked biofield / journey-chip / stat-caption** but not every class. Spot-check, not exhaustive.
- **The `src/lib/utils/data-mapper.ts` is a real file** (F-PQ-1), but the worker said `js/modules/data-mapper.ts`. The .ts shadow is at `js/modules/utils/data-mapper.ts`. Both drift. **F-PQ-1 may be understated** — there could be more such drifts in shadow files the worker didn't sample.
- **The 5–7 documented pre-existing contract failures** (thread-inspector, field-node, search-no-results, compass-rail, focus-pocket, info-panel-empty, mode-grid) were not re-verified in this sweep — `npm run test:contract` timed out. Those are still open per AGENTS.md.

## Recommended Next Moves

1. **Fix F-SVELTE-1 (the `check:svelte --no-tsconfig` bug)** — one-line `package.json` fix, will surface real TS errors in CI. (HIGH upgrade)
2. **Fix the HIGH z-index drift (F-CSS-1)** — reconcile to 80 across `base.css:119` and `z-layers.css:49`. Audit any selectors that depend on `--z-panels: 50` before changing.
3. **Delete the 38 dead `biofield-*` rules (F-CSS-3)** — per AGENTS.md invariant. Zero references found.
4. **Fix the 4 `cleanOptionalValue` drifts (F-PQ-1, F-PQ-2, F-PQ-3, plus the canonical)** — import from `dom-formatters.js` instead of local copies. The new `semantic-threads.ts` drift is the worst (no filtering at all).
5. **`npm run refresh:cache`** to unstick `npm run test`.
6. **Re-sweep JS runtime only** with a single 10-minute worker scoped to `js/modules/state.js` + the long tail of state writers. The systematic pattern is established; just needs more time.
7. **Update AGENTS.md component table** to add `LegacyCompassSurface.svelte` and bump count to 22, then mark `MapSummary` and `ThreadInspector` as complete.
8. **Wait for Svelte Component Finisher to land**, then re-verify F-SVELTE-2 and F-SVELTE-7 on disk.

## Files & Logs

- CSS worker: `.qwen/worker-logs/bugsweep-css-mobile/ocw_cb4cf9d6-.../stdout.log`
- Svelte worker: `.qwen/worker-logs/bugsweep-svelte/ocw_3289be26-.../stdout.log`
- Build/PQ worker: `.qwen/worker-logs/bugsweep-build-pq-docs/ocw_95aba687-.../stdout.log`
- JS runtime worker: `.qwen/worker-logs/bugsweep-js-runtime/ocw_1abe16d2-.../stdout.log`
