# Active Context — semantic-explorer

**Last updated:** 2026-06-13 (post-BOTH-wave)
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
- **Wave 9 (legacy-runtime retirement): CLOSED.** All 5 tickets done (9A, 9B, 9C, 9D, 9E) per `docs/legacy-runtime-retirement-roadmap-2026-06-13.md` and `docs/legacy-runtime-retirement.md`. **0 dynamic `@legacy/*` imports remain in `src/`** (down from 15 pre-wave). 39 files now use the renamed `@legacy-js/*` alias (the BOTH bridge). Full retirement record at `docs/legacy-runtime-retirement.md`.
- **InfoPanel:** Single-track product surface in `src/components/InfoPanel.svelte`; keep legacy compatibility artifacts separate from product ownership.
- **Migration plan:** `docs/phase56-migration-plan.md` is the latest bridge-elimination plan; verify against live `check:ts-progress` before executing old advice.

## Invariant tests (in `tests/unit-active/`, run with `npm run test:unit`)
- **`with-state-mutation-invariant.test.ts`** — scans for direct mutations of `CRITICAL_KEYS` / `TRACKED_SUB_KEYS` (per `src/lib/state/with-state-mutation.ts`) outside a `withStateMutation(() => { ... })` block. Supports the local alias `withMutation` (used in `demo-choreography.ts`). Catches regressions in the AGENTS.md invariant: "All mutations to navState, strandContinuityState, and other TRACKED_SUB_KEYS in state.js MUST be wrapped in withStateMutation()." Current: 0 violations.
- **`css-important-invariant.test.ts`** — regression detector for the AGENTS.md rule "Avoid `!important` as a default CSS fix." Counts `!important` uses across `css/` and `src/lib/css/`; fails on increase. Current: 7 uses (matches baseline; no new uses).
- **`commit-purity-invariant.test.ts`** — meta-test that scans `git log` for commit title prefixes (e.g., `docs(...)`, `fix(...)`) and asserts the prefix matches the file classes in the commit. HARD FAIL: `docs(...)` or `test(...)` must be 100% file-class match. SOFT WARN: `feat/fix/refactor(...)` should have ≥50% parenthetical-scope match. Motivation: the `b5ad93e → 0761a80` failure mode (a `docs(roadmap)` commit that bundled 7 noise files). The test is grandfathered with `EXEMPTED_SHAS` for known exceptions.

To add a fourth invariant test: follow the same pattern (read the AGENTS.md rule, write a regex/scanner test, fail with a clear error message). Examples: off-limits-files guard, no TODO without ticket number, BOTH-bridge shape.

To add a third invariant test: follow the same pattern (read the AGENTS.md rule, write a regex/scanner test, fail with a clear error message). Examples: off-limits-files guard, BOTH-bridge shape (no @legacy imports outside the documented list), no TODO without ticket number.

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
- **BOTH-bridge retirement (Ticket 9D Option B).** The renamed `@legacy-js/*` alias is still in `vite.config.ts`. 39 files still touch it. A future wave could rewrite them as relative paths and drop the alias entirely. Estimated 1-2 hours, low risk. Pre-staged prompt not yet drafted.
- **Main chunk still large.** Next bridge target is reducing the main entry chunk size. Current `engine-*.js` chunk separation helps but the index-*.js chunk is still 1.4 MB pre-gzip.
- **Main chunk still large.** Next bridge target is reducing the main entry chunk size. Current `engine-*.js` chunk separation helps but the index-*.js chunk is still 1.4 MB pre-gzip.
- Product route ownership seam is closed in the Svelte path. Next product seam is cleanup/hardening around semantic dive state ownership and bridge coupling.
- Dirty worktree contains prior migration/archive/test additions under `legacy-reference/`, `tests/unit-active/`, `tests/unit/README.md`, `tests/dismiss-in-complete-state-contract.mjs`, and `vitest.legacy.config.js`. Treat as existing user/worker work; do not revert casually.
- Parallel visual-state audits can saturate local browser; prefer sequential headed runs for visual QA.
- **Dev server noise:** The Svelte/Vite dev server (port 5173) re-touches `dist/svelte/*` via HMR. For close-out commits, use explicit `git add <files>` (never `git add -A`). See `dev-server-drift-handling` skill.

## Session artifacts (2026-06-13 wave)
- **9 ready-to-fire worker prompts** in `tmp/commit-messages-2026-06-13/` (1+2, 1+2-v2, 4, 5, 6, 8, 9C, 9D, 9E)
- **3 memories + 2 skills + 1 profile doc** saved (bash-detach, v2-prompt recovery, session summary; bash-detach-handling + dev-server-drift-handling skills; `notes/fred-profile.md`)
- **Key router running** at `127.0.0.1:8788` with 18 keys across 5 providers (OpenCode Zen, NVIDIA NIM, Mistral, ModelScope, Kilo). The session has been using `pi:direct-opencode-go/mimo-v2.5` direct (bypasses the router); future work on nvidia/mistral/modelscope/kilo routes can use the router.
- **48 commits this session**, all pushed to origin. Wave included the BOTH-pattern follow-ups (1+2, 3, 4, 5, 6, 8), Wave 9 (9A, 9B, 9C, 9D, 9E), the cleanup wave (withStateMutation wrappings, `@legacy-js` alias rename), 3 invariant tests, and the docs close-out + retirement publication.

## Next session entry (2026-06-13 →)

1. **Triage the 3 remaining worktree mods** (Vite HMR + 1 touched file with empty diff). All noise.
2. **Decide the next arc.** Options:
   - **A. BOTH-bridge retirement (Option B from 9D).** Rewrite the 39 static `@legacy-js/*` imports as relative paths, drop the alias from `vite.config.ts`. 1-2 hours, low risk. Closes the BOTH bridge fully.
   - **B. Svelte-track product feature work.** The BOTH infrastructure is done. Pivot to product features (visual diagnostic features, main chunk split, relationship-roles finalization, CORS production proxy for rerank). Needs your direction on the specific feature.
   - **C. Another invariant test.** `off-limits-files guard` (the AGENTS.md worker policy boundaries), `no TODO without ticket number`, or a BOTH-bridge shape test (asserts no new `@legacy-js` consumers).
3. **Run the test suite** (`npm run test:unit`) to verify 16/16 files, 123/123 tests still pass.
