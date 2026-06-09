---
name: Production Readiness Gate
description: End-of-cycle review that combines code inspection, focused read-only checks, and adversarial verification into a go/no-go report with severity-ranked findings and verification evidence.
source: auto-skill
extracted_at: '2026-06-09T13:12:00.000Z'
---

# Production Readiness Gate

Use this when a codebase claims completion but shipping is risky — for example, after a large migration, before a release, or when multiple subsystems interact. It is a **read-only gate**: inspect files, run lightweight checks, return a verdict. Do not edit.

**Adjacent skills:**
- `SVELTE_MIGRATION_PARITY_AUDIT` — run first to enumerate migration gaps.
- `STATE_DESYNC_PARITY_SURGERY` — run after to fix state desyncs found here.
- `WEBGL_INTERACTION_ROBUSTNESS_SWEEP` — run after to confirm WebGL/timer/cleanup fixes.
- `DEEP_DIVE_LOGIC_AUDIT` — run if systemic architecture issues are suspected.
- `TS_SHADOW_STRICTNESS_TRIAGE` / `TS_JS_DRIFT_CLOSURE_SLICE` — use when the readiness report shows TS coverage high but `@ts-nocheck` payloads or stale migration docs.

## Preflight
Read repo-local memory before assuming prior sweep findings are current. Many legacy-migration claims decay quickly and require on-disk verification.
1. Read the repo’s top-level `AGENTS.md` for authoritative maintenance and tooling rules.
2. Confirm the review is read-only: no edits, no subagents.
3. Set up a checklist of the review dimensions you will cover (see The Eight Dimensions below). Run shell-based verification first; cross-check at least one grep result against actual file content before treating it as ground truth.

## The Nine Dimensions

### 0. Source Control Completion (CRITICAL MASK PATTERN)
This dimension sits above all others because a passing build can mask a broken repository clone.

**Detection signals:**
- `npm run build`, `npm run typecheck`, and test suite all **PASS**
- `git status` shows many files as deleted (`D`) that were recently committed (e.g., `.js` shadows removed in a cleanup commit)
- A large count of untracked files (`??`) in `git status` that are **the active build source** (e.g., `.ts` files matching deleted `.js` siblings)
- Ready signals such as "100% TS coverage" in docs, but the TS files were never committed to git

**Verification procedure:**
1. Count deleted tracked source files: `git status --short | findstr "^ D" | find /c /v ""`
2. Count untracked source files matching those deletions: `git status --short -- "<path-pattern>" | findstr "^??" | find /c /v ""`
3. Cross-check: do the untracked files have deleted siblings of the same basename (e.g., `foo.ts` untracked, `foo.js` deleted)?
4. Confirm by running: `git ls-files -- "<path-pattern>" | find /c /v ""` — if count is 0, the source is fully absent from version control
5. **Do not trust "100% TS coverage" metrics** unless you verify those 100% of files are actually tracked in git

**Why it matters:** A repo that builds locally `npm run build` but fails on `git clone` is broken on the most important production threshold: recoverability. Every checkpoint, deploy, or audit after this point inherits that fragility.

**Verdict consequence:** This finding makes the gate **NO-GO** until addressed, regardless of whether all test/build checks pass.

### 1. Build & Type Integrity
Run:
- `npm run lint` — expect 0 errors.
- `npx tsc --noEmit -p tsconfig.typecheck.json` — expect 0 errors.
- `npx tsc --noEmit` — expect 0 errors.
- `npm run check` or `npm run check:svelte` + `npm run build:svelte` — expect 0 TS/Svelte errors.
- `npx vitest run` - note pass/fail counts and timeout details.
Record every failure. Type-check failures are often the most time-consuming to fix later and can unblock other findings. Treat `ts-nocheck` counts as a maturity signal, not a build blocker.

### 2. State Mutation Invariants
Identify the production guard (e.g., `withStateMutation()`, Proxy `set` trap, CRITICAL_KEYS).
- Grep for direct mutations outside the guard: `state\.(navState|strandContinuityState|camera|renderer|scene|\*?)` writes in `js/modules/` and `src/lib/`.
- Manually skip lines that are already wrapped.
- Every remaining match is a production throw or silent bypass.
- Pay special attention to sub-object reassignment: `state.navState = {...}` bypasses nested Proxy traps.

### 3. Legacy ↔ Svelte Store Sync
In dual-track migrations, the goal is structural independence, not just parity:
- Prefer eliminating `@legacy` imports over mirroring state.
- If legacy remains, confirm each dynamic `import('@legacy/...')` is load-bounded and optional (lazy), not blocking surface rendering.
- Verify that legacy coupling does not prevent `vite build` from producing a usable output, failsafe chunks, or clean caching boundaries.

### 4. Hit Testing & Interaction Parity
When the same logical selection has multiple code paths (raycast, screen-distance, rail-inspect):
- Projection: does every caller apply `localToWorld` before `project(camera)`?
- Threshold: do the pixel-radius fallback and raycaster threshold produce consistent winners?
- Canvas reachability: does every path use the same `elementFromPoint` fallback rules?
- Does one path update `state.lastCanvasNodePick` and the other not?

### 5. Thread / Route State Races
Timer-driven traversals (exploring → arrived → settled) are high-risk.
- Map every `setTimer(key, delay, cb)` call in `src/lib/journey/` and `src/lib/thread-*`.
- Verify stale-callback guards: does each callback check `phase === expected && targetIndex === captured` before acting?
- Verify interrupt resistance: does a new walk clear *all* pending timers *before* setting the new phase?
- Check timer pool ownership: are all timer IDs owned by `strand-continuity`, or are some stored in `state.*` fields that bypass pool-wide clears?
- Run the unit tests for timer/thread behavior plus a 2x cross-check before treating this slice as passing.

### 6. WebGL Cleanup / Disposal Completeness
WebGL leaks accumulate silently.
- For every `THREE.Group`, `THREE.Mesh`, `THREE.LineSegments`, `THREE.InstancedMesh`, `THREE.SpriteMaterial` created, verify a corresponding `dispose()` / `scene.remove()` / `disposeObject3D()`.
- For canvas textures (`createSporeTexture`, `createFocusRingTexture`, etc.), verify a tracked disposal array.
- Check init/destroy symmetry: does `initX()` call `disposeX()` first?
- Verify state texture references are nulled after disposal.

### 7. Test Confidence — False Negatives & Vacuity
Tests that always pass are worse than failing tests.
- Read contract tests: does the test navigate to the correct surface state before asserting?
- Look for `.catch(() => {})` swallowing timeouts where a missing element is the signal.
- Look for `if (el) { pass } else { pass(hidden) }` patterns that pass both ways.
- Look for variable shadowing or copy-paste errors that produce bogus failures (`box` is function, `box.width` is `undefined`).
- Verify unit tests that mutate critical state use the production guard — if they bypass it, they pass for the wrong reason.
- Distinguish suite-isolated pass rates from full-suite behavior: a passing unit test can still indicate an environment or isolation defect when `npx vitest run tests/unit/<file>` passes but `npx vitest run` fails.

### 8. Data Integrity Preconditions
One bad assumption can ruin the visual experience.
- Verify geometric preconditions: `data.dat` positions in [0,1], buffer lengths match point counts, normalization applied.
- Verify feature flags / URL params are re-read at call time, not cached at module init.
- Verify fallback chains (feature → data worker → mock) are deterministic.

## Procedure

1. **Inspect.** Read the relevant source files. Use shell tools (`findstr`, `git grep`, `npm`, `npx`, `Get-Content`, `dir`) for patterns; cross-check at least one grep result against actual file content before propagating a claim.
2. **Run checks.** Execute `npm run lint`, `npx tsc --noEmit -p tsconfig.typecheck.json`, `npx tsc --noEmit`, `npm run check`, `npx vitest run`. Do not pipe through `head`/`tail` on Windows.
3. **Adversarial pass.** For each finding, ask: “What would make this wrong?” “What edge case am I missing?” “Does the evidence support the claim?”
4. **Classify severity.**
   - **CRITICAL:** Production throw, wrong data to UI, WebGL leak per interaction, state race that overwrites correct state, or blocking build/test failure in CI path.
   - **HIGH:** Silent state desync, dual-path divergence, timer leak on teardown, build artifacts diverging between test/build, or test isolation failure that hides regressions.
   - **MEDIUM:** Test false-negative, listener duplication risk, parity attribute value drift, or `@ts-nocheck` accumulation that blocks strict-mode graduation.
   - **LOW:** Code smell, defensive coding gap, unused import.
5. **Prioritize.** Sort findings by severity, then by blast radius (user-facing > internal).
6. **Produce the gate report.** Return a concise markdown report with:
   - Verdict: **GO** / **GO with remediations** / **NO-GO**.
   - Top findings (max 8) ordered by severity, with exact file paths/line references, why each matters, suggested fix, and what verification you performed.
   - A short “Priority Fix Order” list if remediation is needed.

## Output Format

```markdown
### N. One-line title — SEVERITY
- **Files:** path:line(s)
- **Why it matters:** impact on user or production stability
- **Suggested fix:** brief approach
- **Verification:** what you checked (command output, grep, test result)
```

End with:
- **Verdict:** GO / GO with remediations / NO-GO
- **Priority Fix Order:** numbered list if remediation needed
- **Verification Performed:** table of checks run and results

## When NOT to Use

- **Simple single-bug triage:** use targeted read-only inspection without the full eight-dimension gate.
- **Open-ended bug sweep:** use `PARALLEL_DIAGNOSTIC_BUGSWEEP` or `GLOBAL_PRODUCT_QUALITY_SWEEP` instead.
- **After fixes are known:** use `STRUCTURED_BUG_SURGERY` or `STATE_DESYNC_PARITY_SURGERY` to execute verified fixes.

## Validated Cache-Buster / Bundle Pattern (2026-06-08)

A specific production-readiness signal that appeared repeatedly in this repo: a test can fail even when source changes are correct because test and build esbuild invocations diverge. Detection signals:
- `npm run test` reports “stale cache buster,” but the actual problem is a hash mismatch that survives cache refresh.
- `dist/bundle.js` hash keeps changing between build and test because one path runs a plugin or hook the other does not.
- The test invokes `esbuild.build(...)` directly while `scripts/build-app.mjs` adds an extra normalization plugin or rerun hook.
Fix: align the post-build normalization step between test and build environments; do not keep regenerating cache-busters to mask a real hash-divergence condition.

## Release Gate Drift: Migration-Cleanup Pattern (2026-06-09)

After large JS→TS/Svelte migrations, readiness reports can claim “100% TS” while the repo is not actually ship-ready. This is a common post-migration false-positive pattern.

**Typical signals:**
- Source-control status shows many deleted legacy files (`js/modules/*.js`) plus many untracked replacements (`js/modules/*.ts`).
- `npm run build`, `npm run build:safe`, and `npm run check:svelte` pass, but `npm run test:fast` fails.
- One hard failure is a shell/contract test still asserting legacy files/paths that were intentionally removed; another is stale cache-buster hashes.
- Component wiring docs may describe simple prop changes while the real codebase drift is contract and source-control drift.

**Key checks to run:**
- `git status --short | findstr "^ D" | find /c /v ""`
- `git ls-files "js/**/*.ts" | find /c /v ""`
- `npm run check:ts-progress` and `npm run ts-readiness`
- `npm run test:fast`; if it fails in `check:shell`, inspect the shell test for paths/files that no longer exist on disk
- `npm run check:cache` for stale bundle/CSS hashes after builds

**Verdict implication:** Even if builds and typechecks are green, this pattern is **NO-GO** until:
1. Release contract tests are updated to match the current architecture.
2. Cache busters or build/test hash paths are aligned.
3. Unit-test suite is fully green.
4. Outstanding lint/test failures are fixed or explicitly deferred in a release note.

## Validated Release-Gate Repair Pattern (2026-06-09)

When the failure surface is specifically the release gates (not runtime behavior), a targeted slice can restore green status without weakening checks. Validated approach:

1. **Shell/contract tests** — update file reads from deleted `.js` to existing `.ts` siblings; if a check is genuinely out of scope (e.g. `summary-gemma-story` only applies to old `connection-analysis.js` flow), remove or relax only that assertion, not the whole guard.
2. **Cache busters** — rebuild bundle, then run the cache-buster script with `--fix` (if supported) or let it auto-update; do not manually write hashes.
3. **Unit-test alias mismatch** — when `lifecycle-bridge.ts` imports via `@legacy/modules/X.js` but the on-disk file is `js/modules/X.ts`, register `vi.mock` for **both** the `@legacy/...` path and the relative `.ts` path using shared mock objects. Vitest treats different resolved specifiers as different mock identities; a single mock on `.ts` does not intercept `@legacy/.js`.
4. **Lint fixes** — add missing globals (`structuredClone`) to test environment config rather than per-file `/* global */` comments; remove stale `eslint-disable` comments for rules that no longer exist in the flat config.
5. **Adjacent contract drift** — if another contract script (`composition-state-owner-contract.mjs`, `mobile-chrome-ownership-contract.mjs`, `semantic-thread-relationship-role-contract.mjs`) hard-codes deleted `.js` paths, fix them in the same slice only if they directly block `npm run test:fast`. Do not expand scope to full rewrite of retired contracts unless the task explicitly includes it.

## Exit Criteria for Ship Decision

Mark GO when ALL of the following are true:
1. `tsc` (both configs) passes cleanly.
2. `npm run check` builds cleanly with 0 errors/warnings.
3. Unit suite is green under `npx vitest run` after one explicit rerun (no “passes in isolation only” carve-outs).
4. No `@legacy/*` import remains on a hot path that blocks Svelte standalone deployment or runtime fallback.
5. Known data preconditions are satisfied (e.g., `data.dat` values in [0,1]), or fallback behavior is explicitly designed.
6. Uncommitted migration artifacts are committed and have a recoverable baseline statement.
7. Node-native `.mjs` contract tests do not fail with `ERR_MODULE_NOT_FOUND` after JS→TS deletion, even when `npm run build` is green.

## Bundler-Safe but Node-Native Unsafe Release Pattern (2026-06-09)

After JS→TS deletion, `npm run build` can pass while a separate Node-native test/release gate fails. This is a repeatable post-migration false-positive pattern distinct from cache-buster drift.

Typical source-control and codebase signals:
- Update `extracted_at` in the auto-skill frontmatter whenever this section is refreshed: `extracted_at: 'YYYY-MM-DDTHH:MM:SS.sssZ'`
- legacy `.js` runtime files deleted across `js/modules/**/*.js`; `.ts` replacements exist, often as untracked or staged files.
- esbuild or Vite succeeds because it resolves `.ts` siblings when `.js` specifiers have no corresponding `.js` file.
- Node-run `.mjs` tests or release-gate commands fail with `ERR_MODULE_NOT_FOUND` because Node’s ESM loader resolves specifiers literally and does not substitute `.ts` for `.js`.
- A subset of tests (vitest, Playwright, or dynamic import paths) may still pass due to custom loaders, alias resolution, or browser bundling, masking the failure.

Detection workflow:
1. Run `npm run build` and note pass/fail.
2. Run `npm run test:fast` and the release gate tests that execute standalone Node files (`npm run test:contract`, targeted `node tests/*.mjs` checks).
3. Grep for imports pointing at deleted JS paths from both test files and tooling scripts, and distinguish three cases: bundler-runtime only, Node-native test only, and both.
4. Verify whether the failing module paths are inside a tested test suite before widening scope.

Fix pattern:
- Prefer narrow path/test updates over restoring deleted legacy `.js` files.
- For release gates: update shell/contract tests to read the current TS/JS ownership map instead of asserting legacy paths.
- For runtime coupling: if `dist/bundle.js` is the deploy surface, esbuild resolution can remain; if `src/` or Node-native paths must run directly, align imports to real files and update aliases explicitly.
- Do not conflate cache/hash drift with import-resolution drift: diagnose resolution failures first, then align any build/test hash paths separately.
