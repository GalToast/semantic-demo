# Active Context — semantic-explorer

**Last updated:** 2026-06-13 (post-BOTH-wave, post-A, pre-S6-arc)
**⚠ Update-prone:** Refresh this file whenever migration state, demo readiness, or blockers change.

## Migration status (Svelte + TypeScript)
- **Scaffold:** 25 Svelte components currently present under `src/components/`
- **Stores/types:** 12/12 stores, 4/4 type files, 4/4 orchestration files complete
- **Bridge:** `src/lib/engine/bridge.ts` ~1212 lines, imperative legacy bridge
- **Svelte check:** `npm run check:svelte` passes with 0 errors / 0 warnings as of 2026-06-13.
- **Build:** `npm run build:svelte` passes as of 2026-06-13 with **zero** `INEFFECTIVE_DYNAMIC_IMPORT` warnings after the Ticket 9A + 9B + 9C wave. `Canvas.svelte` lazy-loads `@lib/engine`, creating a separate `engine-*.js` chunk; remaining build chatter is expected runtime CSS resolution notices, plugin timing output, and the large chunk warning.
- **Legacy TS progress:** `npm run check:ts-progress` reports 151 runtime modules, 103 TS-only, 48 BOTH (`.ts` + `.js` shadow), 0 JS-only, 0 drift pairs.
- **Legacy entry:** `js/modules/app.ts` is the legacy/reference bundle entry; production remains the Svelte/Vite shell.
- **BOTH-pattern follow-up queue: EMPTY.** All 6 tickets closed (1+2, 3, 4, 5, 6, 8). See `docs/both-pattern-follow-ups-2026-06-13.md`.
- **Wave 9 (legacy-runtime retirement): CLOSED.** All 5 tickets done (9A, 9B, 9C, 9D, 9E) per `docs/legacy-runtime-retirement-roadmap-2026-06-13.md` and `docs/legacy-runtime-retirement.md`. **0 dynamic `@legacy/*` imports remain in `src/`** (down from 15 pre-wave).
- **A worker (9D-Option-B): CLOSED.** Worker `ocw_b4e07b6e` completed 2026-06-13. 35 source files rewritten as relative paths; BOTH bridge fully dropped from src/, vite.config.ts, vitest.config.js. **0 `@legacy` and 0 `@legacy-js` references in source code** (verified by `both-bridge-shape-invariant.test.ts`). The ambient declaration file `src/lib/types/legacy-modules.d.ts` was deleted. Cascade type-cast cleanup: 61 `unknown` intermediate casts across 5 files.
- **InfoPanel:** Single-track product surface in `src/components/InfoPanel.svelte`; keep legacy compatibility artifacts separate from product ownership.
- **Migration plan:** `docs/phase56-migration-plan.md` is the latest bridge-elimination plan; verify against live `check:ts-progress` before executing old advice.

## Invariant tests (in `tests/unit-active/`, run with `npm run test:unit`)

5 invariant tests in place, all pass:
- **`with-state-mutation-invariant.test.ts`** — scans for direct mutations of `CRITICAL_KEYS` / `TRACKED_SUB_KEYS` (per `src/lib/state/with-state-mutation.ts`) outside a `withStateMutation(() => { ... })` block. Supports the local alias `withMutation` (used in `demo-choreography.ts`). Catches regressions in the AGENTS.md invariant: "All mutations to navState, strandContinuityState, and other TRACKED_SUB_KEYS in state.js MUST be wrapped in withStateMutation()." Current: 0 violations.
- **`css-important-invariant.test.ts`** — regression detector for the AGENTS.md rule "Avoid `!important` as a default CSS fix." Counts `!important` uses across `css/` and `src/lib/css/`; fails on increase. Current: 7 uses (matches baseline; no new uses).
- **`commit-purity-invariant.test.ts`** — meta-test that scans `git log` for commit title prefixes (e.g., `docs(...)`, `fix(...)`) and asserts the prefix matches the file classes in the commit. HARD FAIL: `docs(...)` or `test(...)` must be 100% file-class match. SOFT WARN: `feat/fix/refactor(...)` should have ≥50% parenthetical-scope match. Motivation: the `b5ad93e → 0761a80` failure mode. The test is grandfathered with `EXEMPTED_SHAS` for known exceptions.
- **`todo-without-ticket-invariant.test.ts`** — scans source dirs (js/modules, src/lib, src/components, src/App.svelte, vite.config.ts, vitest.config.js) for TODO comments without a ticket reference (T-XXX, #XXX, "Ticket XXX", "Issue #XXX", "BOTH-XXX", "Wave X"). Fails if the count grows. Current baseline: 10 (all in-flight S6-arc ports). After S6 completes, the baseline drops to 0.
- **`both-bridge-shape-invariant.test.ts`** — scans src/, vite.config.ts, vitest.config.js, and src/tsconfig.json for any `@legacy` or `@legacy-js` reference. Fails on any match. Locks in the Wave 9 retirement.

To add a sixth invariant test: follow the same pattern (read the AGENTS.md rule, write a regex/scanner test, fail with a clear error message). Examples: off-limits-files guard, no-Math.random()-in-WebGL guard, seededUnit() invariant in geometry code.

## Demo readiness
- Svelte demo store/choreography regression for dismiss-in-COMPLETE state passes via `node tests/dismiss-in-complete-state-contract.mjs` as of 2026-06-13.
- Headed Svelte product playthrough passes with 0 ownership failures as of artifact `tmp/product-qa/2026-06-13T22-13-17-040Z`. The route seam is fixed: search focus hydrates neighbor candidates/pills, pill tap opens the thread inspector, Follow creates trail walk history, Step Inside reaches semantic dive, Map is reached through a real user route, and County reset returns to `map-idle` with search cleared from URL/store/DOM.
- Micro-demo legacy/reference path remains functional with verified state machine unless current contract runs prove otherwise.
- Do not reuse the old 2026-06-09 contract-failure list without re-running the focused contracts; current quick checks passed.
- Bugsweep 2026-06-05 resolved all 4 HIGH JS bugs (strand-continuity, three-interaction-visuals, state.js Proxy, three-node-manager textures).

## Subagent model rotation (2026-06-13)
- **`docs/subagent-model-catalog.md`** captures the active routing defaults and the new "Clip / Screenshot Diagnostic Rotation" pattern (clips as evidence artifacts, not deterministic DOM/layout replacements).
- **`nvidia/moonshotai/kimi-k2.6`** is the new priority-1 diagnostic scout (long-horizon coding + multimodal with image/video input). Source: Kimi K2.6 post; NVIDIA Build card.
- **`modelscope/Qwen/Qwen3-VL-{8B,235B}`** are the ModelScope visual QA candidates. Use 8B for smoke, 235B for full.
- `nvidia-capabilities` MCP is the live interface for NIM calls.

## High-risk surfaces (lead approval required to touch)
- `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`
- `js/modules/ui-renderers.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- CSS mobile cascade files (`css/journey_active.css`, `css/mobile_premium__*.css`, etc.)
- Deploy scripts (`deploy.sh`, `deploy.ps1`)

## Known blockers / open items
- **Main chunk still large.** Next bridge target is reducing the main entry chunk size. Current `engine-*.js` chunk separation helps but the index-*.js chunk is still 1.4 MB pre-gzip.
- **relationship-roles finalization (B2).** Blocked until all UI consumers migrate. Unblocks after S6 arc.
- **CORS production proxy for rerank (B3).** Production-readiness work. Defer until prod gate.
- **Wave 10: legacy runtime retirement (the next big arc).** After S6 lands, the Svelte track is fully canonical. The legacy `js/modules/*` tree can be retired in a follow-up wave (similar to Wave 9 but for runtime, not alias).
- Product route ownership seam is closed in the Svelte path. Next product seam is cleanup/hardening around semantic dive state ownership and bridge coupling.
- Dirty worktree contains prior migration/archive/test additions under `legacy-reference/`, `tests/unit-active/`, `tests/unit/README.md`, `tests/dismiss-in-complete-state-contract.mjs`, and `vitest.legacy.config.js`. Treat as existing user/worker work; do not revert casually.
- Parallel visual-state audits can saturate local browser; prefer sequential headed runs for visual QA.
- **Dev server noise:** The Svelte/Vite dev server (port 5173) re-touches `dist/svelte/*` via HMR. For close-out commits, use explicit `git add <files>` (never `git add -A`). See `dev-server-drift-handling` skill.

## S6 arc — Svelte migration close-out (in flight, 2026-06-13)

The S6 arc finishes the Svelte migration by porting the 10 remaining TODO-without-ticket violations. 5 tickets:

| Ticket | File(s) | What | Status |
|---|---|---|---|
| **S1** | `src/lib/ui/loading.ts` (3 TODOs) | Port weather + thread hydration flow into the Svelte loading pipeline | ✅ DONE — `3ccccac` |
| **S2** | `src/lib/orchestration/url-state.ts:412` | Switch URL-state to direct Svelte filter store mutations | ✅ DONE — `e5e01ad` |
| **S3** | `src/lib/orchestration/view-controller.ts:293,296` + `src/App.svelte:389` + `src/lib/orchestration/url-state.ts:529` | Toast notifications + semantic-guide icon (4 TODOs) | 🟡 Worker running |
| **S4** | `js/modules/legend-ui.ts:287` + `js/modules/tooltip.ts:149` | Move legacy call sites to Svelte component lifecycle | ✅ DONE — `ce7747d` |
| **S5** | `tests/unit-active/todo-without-ticket-invariant.test.ts` + `memory/active-context.md` + `docs/both-pattern-follow-ups-2026-06-13.md` | Drop baseline to 0; close-out | Prompt drafted, fires after S3 |

S1, S2, S4 all landed. 6 of 10 TODOs resolved. 4 remain (S3's scope).
The S3 worker created a new `Toast.svelte` + `toast.ts` orchestrator; inlined the semantic-guide SVG; wired the body data-attribute bridge mirroring the existing `bodyFocusPanelMode` pattern.
**Surprises from S1**: pre-existing `_loadingHideCancelled` build error (now fixed in passing), `@legacy/*` tsconfig alias not resolved by tsc (used relative path).
**Surprises from S4**: `tooltip.js` stub didn't follow the BOTH pattern (no `export * from './tooltip.ts'`) — worker added the re-export to match `view-controller.js`.

Pre-staged worker prompts at `tmp/commit-messages-2026-06-13/worker-ticket-S{1..5}-*.txt`.

## Session artifacts (2026-06-13 wave)
- **14 ready-to-fire worker prompts** in `tmp/commit-messages-2026-06-13/` (1+2, 1+2-v2, 4, 5, 6, 8, 9C, 9D, 9E, S1, S2, S3, S4, S5)
- **3 memories + 2 skills + 1 profile doc** saved (bash-detach, v2-prompt recovery, session summary; bash-detach-handling + dev-server-drift-handling skills; `notes/fred-profile.md`)
- **Key router running** at `127.0.0.1:8788` with 18 keys across 5 providers (OpenCode Zen, NVIDIA NIM, Mistral, ModelScope, Kilo). The session has been using `pi:direct-opencode-go/mimo-v2.5` direct (bypasses the router); future work on nvidia/mistral/modelscope/kilo routes can use the router.
- **55 commits this session** (target: 57+ after S3 + S5 land), all pushed to origin. Wave included the BOTH-pattern follow-ups (1+2, 3, 4, 5, 6, 8), Wave 9 (9A, 9B, 9C, 9D, 9E), the A worker (9D-Option-B), 5 invariant tests, the S1+S2+S4 worker trio, the S6-arc prompt drafting, and the docs close-out + retirement publication.

## Next session entry (post-S1+S2+S4, pre-S3+S5)

1. **A is COMPLETE.** Worker `ocw_b4e07b6e` finished. 35 source files rewritten; BOTH bridge gone from src/, vite.config.ts, vitest.config.js; both-bridge-shape-invariant test added.
2. **5 invariant tests in place.** withStateMutation, !important, commit-purity, todo-without-ticket, both-bridge-shape.
3. **S6 arc: 3 of 5 tickets landed.** S1 (loading flow), S2 (URL state mutations), S4 (legend/tooltip lifecycle) all done. 6 of 10 TODOs resolved. S3 (toast + semantic-guide icon, 4 TODOs) is in flight. S5 (close-out, 15 min) fires after S3.
4. **Test suite green:** 18/18 files, 130/130 tests. svelte-check 0/0.
5. **After S6:** Wave 10 (legacy runtime retirement) is the next big arc. The legacy `js/modules/*` tree is the only remaining retirement work.
