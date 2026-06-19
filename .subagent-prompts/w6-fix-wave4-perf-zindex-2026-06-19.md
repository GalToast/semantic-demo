# W6 Fix Wave 4 — Performance + Z-Index Hygiene — Semantic Explorer (2026-06-19)

## Role

You are **Worker 4 of 4** in a coordinated fix swarm. Your job is to apply the **performance + z-index items** from Wave 4 of the smell swarm synthesis. **You own Wave 4; do not touch anything in Waves 1, 2, or 3.**

You are a paid `opencode-go/mimo-v2.5` worker on the Pi harness. You will verify each fix against source, run the lint+build verification, then commit atomically.

**Performance changes here touch the 3D render loop.** Be conservative. Verify with `git diff` before commit and run the relevant contract tests if they exist (do not modify the test files).

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Read First (non-negotiable)

- `tmp/smell-accounting-2026-06-19.md` (full cross-reference synthesis)
- `tmp/smell-engine-2026-06-19.md` (your main source for W1-engine findings: H2, M3, L2)
- `tmp/smell-ui-2026-06-19.md` (your main source for W3 findings: H2, M1, L1, L2)
- `AGENTS.md` (repo-local rules, especially z-index SSOT)
- `src/lib/z-index.ts` (canonical z-index SSOT for TS)
- `src/lib/css/z-layers.css` (canonical z-index SSOT for CSS)
- `css/base.css` lines 108-131 (the third, divergent source)

## Wave 4 — Your Scope (6 items)

### Files you MAY edit

- `src/lib/engine/mycelium-engine.ts` (H2 — Vector3 hoisting)
- `src/lib/engine/node-manager.ts` (M3, L2 — Color/Object3D)
- `src/lib/semantic-threads.ts` (M1 — Promise gate. **WAIT** — Wave 3 owns this file. If Wave 3 has not yet committed the Promise gate, do M1 here; if Wave 3 has committed, skip and note "already done".)
- `src/lib/z-index.ts` (H2 — consolidate to 2 sources)
- `src/lib/css/z-layers.css` (H2 — keep this, expand tokens)
- `css/base.css` (H2 — remove or import z-layers)
- `css/mobile_premium__focus-dive.css` (M1 — replace hardcoded z-index with var)
- `src/components/SpectorInspector.svelte` (L2 — dev-only, no fix needed; just verify)

### Files you may NOT edit (OFF-LIMITS — parallel session owns)

```
M src/components/Canvas.svelte
M src/lib/orchestration/parity-attrs.svelte.ts
M src/lib/stores/lifecycle.ts
M tests/cluster-filter-city-filter-side-effect-contract.mjs
M tests/cluster-filter-contract.mjs
M tests/cluster-filter-dewindowing-contract.mjs
M tests/composition-state-invariant-contract.mjs
M tests/focus-semantic-state-boundary-contract.mjs
M tests/journey-thread-inspector-contract.mjs
M tests/lifecycle-composition-contract.mjs
M tests/state-mutator-ownership-contract.mjs
M tests/state-transition-contract.mjs
M tests/step-inside-state-sync-contract.mjs
M tests/surface-contract-check.mjs
M tests/thread-inspector-dewindowing-contract.mjs
M vite.config.ts
?? tmp_check_dive.mjs, tmp_check_dive2.mjs, tmp_check_dive3.mjs, tmp_check_search.mjs, tmp_lc_diag.mjs
```

Also off-limits to you (other waves own these):

- All CSS files NOT listed above (Wave 1 owns most CSS; specifically `css/shell.css`, `css/mobile_base.css`, `css/progressive_disclosure.css`, `css/search.css`, `css/synthesis.css`, `css/mobile_premium__state.css`)
- `src/components/ModeChips.svelte`, `FocusPocketA11y.svelte` (Wave 1)
- `src/lib/focus/stage-renderer.ts`, `geometry.ts` (Wave 1)
- `src/lib/audio/audio-scape.ts` (Wave 1)
- `src/lib/engine/three-engine.ts` (Wave 2)
- `src/lib/orchestration/triggers.ts` (Wave 2)
- `src/lib/ui/legend-bindings.ts`, `journey-bindings.ts`, `onboarding-bindings.ts` (Wave 2)
- `src/lib/data-store.ts`, `data-store.svelte.ts` (Wave 3)
- `src/lib/search/cache.ts`, `scoring.ts`, `results-ui.ts`, `search-engine.ts` (Wave 3)
- `src/lib/engine/adapters/search-bridge.ts` (Wave 3)

**Race note**: `src/lib/semantic-threads.ts` is shared between Wave 3 (M1) and Wave 4 (M1, same fix). **If Wave 3 has already committed when you start, skip M1 and note "already done by Wave 3"**. If Wave 3 is in flight or has not started, **you wait for Wave 3 to commit first**. To check: `git log --oneline -5 -- src/lib/semantic-threads.ts`. If the most recent commit on that file is a "refactor(w6-wave3)" commit, Wave 3 has done it. Otherwise, do M1 (or wait for Wave 3 — see step 4 below).

## The 6 Items in Order

### 1. H2 — Per-frame `new Vector3()` GC pressure in `mycelium-engine.ts`

**Procedure**:

1. **Read** `src/lib/engine/mycelium-engine.ts:305-337` (`getSaggedPoint` inner function).
2. **Identify all `new Vector3(...)` allocations** — there are 5-7 (lines 314, 315, 316, 317, 325, 326, 334).
3. **Refactor**:
    - At module top (after imports), add:

        ```typescript
        const _worldUp = new Vector3(0, 1, 0) // module-level constant for worldUp
        const _defaultViewVec = new Vector3(0.28, 0.2, 1) // module-level default
        // Plus scratch instances that getSaggedPoint can reuse:
        const _scratchVec3A = new Vector3()
        const _scratchVec3B = new Vector3()
        const _scratchVec3C = new Vector3()
        ```

    - Inside `getSaggedPoint`, replace `new Vector3(...)` with `.copy(...)` on the scratch instances. Example:

        ```typescript
        // Before:
        const viewVec = useCamera
            ? new Vector3().subVectors(cameraPos, new Vector3(midX, midY, midZ)).normalize()
            : new Vector3(0.28, 0.2, 1).normalize()
        // After:
        const viewVec = useCamera
            ? _scratchVec3A.subVectors(cameraPos, _scratchVec3B.set(midX, midY, midZ)).normalize()
            : _scratchVec3A.copy(_defaultViewVec).normalize()
        ```

4. **Be careful**: `Vector3.normalize()` mutates and returns `this`, so the result is the same scratch instance. **Do not** assign the result to a different variable if the original scratch is still needed elsewhere in the same call.
5. **Preserve the `addScaledVector(new Vector3(0, 1, 0), ...)` on line 334**: replace with `.addScaledVector(_worldUp, ...)` — no new allocation.

**Verify after fix**:

- `rg -n "new Vector3" src/lib/engine/mycelium-engine.ts` returns 0 matches in `getSaggedPoint` (lines 305-337) but may still have matches elsewhere in the file
- The function still passes a quick smoke: read the function and trace 2-3 sample inputs to verify the result is identical

### 2. M3 — Reuse module-level `Color` instance in `node-manager.ts:404`

**Procedure**:

1. **Read** `src/lib/engine/node-manager.ts:404` to see the per-point `Color` allocation.
2. **Read** `src/lib/engine/node-manager.ts:39` (the `THREAD_TINT_COLOR` constant).
3. **Refactor**:
    - At module top, add: `const _threadTintColor = new Color(THREAD_TINT_COLOR)`
    - In the `forEach` loop at line 404, replace `new Color(THREAD_TINT_COLOR)` with `_threadTintColor` (or `.copy(_threadTintColor)` if the receiving `.lerp()` mutates and we need a fresh instance — read the API to confirm).

**Verify after fix**:

- `rg -n "new Color\(THREAD_TINT_COLOR\)" src/lib/engine/node-manager.ts` returns 0 matches
- The loop still produces the same per-point color (this is a one-time allocation in `createPoints()`)

### 3. L2 — `_nodeSporeObject` shared mutable scratch state in `node-manager.ts:52`

**Procedure**:

- Add a comment above the declaration:

    ```typescript
    // _nodeSporeObject is a module-level scratch Object3D used in setNodeSporeInstanceMatrix().
    // This is safe under the single-threaded JS execution model. If any future Web Worker
    // offload touches this path, refactor to per-call Object3D instances.
    ```

- **No code change** — just document the invariant.

### 4. M1 — Replace 500ms busy-wait in `semantic-threads.ts` with Promise gate

**Coordination check first**:

```bash
git log --oneline -3 -- src/lib/semantic-threads.ts
```

If the most recent commit on this file is a `refactor(w6-wave3)` commit, **SKIP THIS ITEM** (Wave 3 already did it). Note in your return: "M1 already done by Wave 3."

If Wave 3 has not committed, **STOP and report** to main lane — do not duplicate the work. Two workers editing the same file in parallel will create a merge conflict. Main lane will coordinate.

(If for some reason Wave 3 has not started and main lane explicitly told you to do M1, follow the Wave 3 prompt's M1 procedure.)

### 5. H2 — Consolidate z-index token system (3 sources → 2)

**This is a CSS-wide refactor. Be careful.**

**Procedure**:

1. **Read** all three sources:
    - `src/lib/z-index.ts` (TS, 16 layers)
    - `src/lib/css/z-layers.css` (CSS, 30 tokens)
    - `css/base.css` lines 108-131 (CSS, 15 tokens, subset)
2. **Choose consolidation direction** (main lane lean: keep TS + 1 CSS, remove base.css duplicate):
    - **Option A (preferred)**: Keep `z-index.ts` as TS SSOT. Keep `z-layers.css` as CSS SSOT. Remove the duplicate tokens from `css/base.css` lines 108-131. Any CSS file that only loads `base.css` (not `z-layers.css`) needs to import `z-layers.css`.
    - **Option B**: Keep `z-layers.css` as the only CSS source, delete `base.css`'s z-index block. Same as A but be more aggressive about deleting.
3. **Refactor**:
    - In `css/base.css`, **delete** lines 108-131 (the `:root { --z-*: ... }` block).
    - Verify no other file in `css/` only loads `base.css` and uses z-index tokens without also loading `z-layers.css`:

        ```bash
        # For each CSS file, check if it uses --z-* and imports z-layers.css
        rg -l '\-\-z\-' css/*.css | while read f; do
          if ! grep -q 'z-layers' "$f"; then
            echo "MISSING z-layers import: $f"
          fi
        done
        ```

    - If any CSS file is missing the import, add `@import './z-layers.css';` at the top.

4. **For `src/lib/z-index.ts`**: the W3-UI report flagged that `z-index.ts` (16 layers) doesn't have `--z-overlay`, `--z-toast`, `--z-loading`, `--z-max`. Decide:
    - If TS code never references these CSS-only tokens, leave `z-index.ts` alone.
    - If TS code does reference them, add them to `z-index.ts`.
    - **Most likely**: TS code uses `Z_LAYERS.canvas`, `Z_LAYERS.panels`, etc. The CSS-only tokens (`--z-toast`, `--z-loading`, `--z-max`) are not used in TS. Leave `z-index.ts` alone.

**Verify after fix**:

- `rg -n "^\s*--z-" css/base.css` returns 0 (no z-index tokens left in base.css)
- `rg -rn "z-layers" css/` shows every CSS file that uses z-index tokens imports z-layers.css
- `npm run build` still succeeds (CSS imports may break if any file was relying on the base.css duplication)

### 6. M1 — Replace hardcoded `z-index: 1200/1201` in `mobile_premium__focus-dive.css`

**Procedure**:

1. **Read** `css/mobile_premium__focus-dive.css:1741,1756` to see the hardcoded values.
2. **Refactor**:
    - Line 1741: `z-index: 1200;` → `z-index: var(--z-toast);`
    - Line 1756: `z-index: 1201;` → `z-index: var(--z-toast-above);` (or add a new `--z-toast-plus: 1201` token to `z-layers.css` first)
3. **Preferred**: add `--z-toast-plus: 1201` to `z-layers.css` if `--z-toast-above` is 1300 (a 99-unit jump is too much for a "plus 1" semantic). Read `z-layers.css` to see the gap.
4. **Verify**: `rg -n "z-index: 120" css/mobile_premium__focus-dive.css` returns 0 (the hardcoded values are gone)

### 7. L2 — SpectorInspector `z-index: 5` (no-op, just verify)

**Procedure**:

- Read `src/components/SpectorInspector.svelte:308`. If the value is 5 and the file is dev-only, do nothing. Just note in your return: "L2 verified; no action needed (dev-only)."

## Verification (REQUIRED before commit)

1. **Lint**: `npm run lint > /tmp/build-w4-lint.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w4-lint.log`
    - File-redirect only
    - Must exit 0

2. **Type check**: `npm run check:svelte > /tmp/build-w4-typecheck.log 2>&1; echo EXIT=$?; tail -80 /tmp/build-w4-typecheck.log`
    - File-redirect only
    - Must exit 0

3. **Build**: `npm run build > /tmp/build-w4-build.log 2>&1; echo EXIT=$?; tail -50 /tmp/build-w4-build.log`
    - File-redirect only
    - Must exit 0

4. **Surface contract** (if it doesn't touch off-limits files):
    - `npm run qa:surface:mobile-idle > /tmp/build-w4-qa.log 2>&1; echo EXIT=$?; tail -50 /tmp/build-w4-qa.log`
    - The H2 z-index refactor is the highest-risk item for visual regression
    - **Do not run the surface-contract-check test** (off-limits); but the qa:surface: scripts are usually separate and not in the off-limits list.

5. **Git status sanity**: `git status --short` must show ONLY:
    - Modified: `src/lib/engine/mycelium-engine.ts`, `src/lib/engine/node-manager.ts`, `src/lib/css/z-layers.css`, `css/base.css`, `css/mobile_premium__focus-dive.css`
    - Possibly modified: `src/lib/semantic-threads.ts` (only if Wave 3 has not yet committed M1 and main lane told you to do it)
    - **No** off-limits files
    - **No** untracked files

## Commit Protocol

**Single atomic commit**:

```bash
# 1. Re-check status before staging
cd "C:\Users\HP\repos\semantic-explorer"
git status --short

# 2. Stage ONLY your changed files (NEVER use -A)
git add src/lib/engine/mycelium-engine.ts src/lib/engine/node-manager.ts
git add src/lib/css/z-layers.css css/base.css css/mobile_premium__focus-dive.css
# Only add semantic-threads.ts if Wave 3 has not committed M1 and main lane said you own it:
# git add src/lib/semantic-threads.ts

# 3. Verify staging matches your scope
git status --short
git diff --cached --stat

# 4. Commit with descriptive message
git commit -m "refactor(w6-wave4): perf + z-index hygiene

- Hoist Vector3 allocations in mycelium-engine.ts getSaggedPoint to module-level scratch (W1-H2)
- Reuse module-level Color instance in node-manager.ts createPoints (W1-M3)
- Document _nodeSporeObject scratch-state invariant (W1-L2)
- [conditional: Promise gate in semantic-threads.ts if not already done by Wave 3] (W2-M1)
- Consolidate z-index tokens: remove duplicate from css/base.css, ensure z-layers.css imported everywhere (W3-H2)
- Replace hardcoded z-index: 1200/1201 in mobile_premium__focus-dive.css with var(--z-toast) + new --z-toast-plus token (W3-M1)

Refs: tmp/smell-accounting-2026-06-19.md Wave 4
Verified: npm run lint clean, npm run check:svelte clean, npm run build clean"

# 5. Verify commit
git log -1 --format="%h %s"
git show --stat HEAD
```

**DO NOT PUSH.** The `origin` remote points to a sibling Desktop path — main lane will mirror.

## Pitfalls

- **Pipe auto-detach trap**: `npm run build 2>&1 | tail -20` triggers 45s auto-detach. ALWAYS file-redirect.
- **Bare `git add -A` in dirty tree**: parallel session has 16 tracked files modified. `-A` will catch them. Use explicit paths.
- **`Vector3.normalize()` mutates and returns `this`**: this is the API, not a bug. But it means scratch instances cannot be used for two different normals at the same time. Trace the data flow carefully.
- **The `Color.lerp(receiver, t)` API**: `receiver.lerp(other, t)` mutates `receiver` and returns it. If the original color matters later, copy first: `const c = _scratchColorA.copy(original).lerp(_threadTintColor, 0.005)`.
- **The z-index refactor (H2) is high-risk for visual regressions**: any CSS file that used a z-index token from `base.css` will break if it doesn't also load `z-layers.css`. The verify step (search for `--z-` usage in CSS files) is **critical** — do not skip it.
- **H2 in `mycelium-engine.ts` is in a hot path**: the 3D render loop. Test by building and running. If the build succeeds but visual smoke is broken, REVERT and report.
- **`semantic-threads.ts` race with Wave 3**: check the git log first. If Wave 3 has committed, skip. If not, do NOT duplicate — STOP and report to main lane.

## Return

Return a short text summary (≤400 words) with:

1. Wall-time used (in minutes)
2. Commit SHA
3. `git show --stat` summary
4. `npm run lint`, `npm run check:svelte`, `npm run build` results (exit codes)
5. **QA results**: pass/fail for `qa:surface:mobile-idle` (if you ran it)
6. Any items where you had to deviate (e.g., `semantic-threads.ts` already done by Wave 3, `z-layers.css` import scan found 3 files missing import, etc.)
7. **Performance estimate**: how many `new Vector3()` allocations per frame were eliminated (count: pre-fix was 5-7 per `getSaggedPoint` call, post-fix should be 0)
8. **Z-index consolidation result**: how many CSS files were missing the `z-layers.css` import before your fix
9. Any new findings you noticed

## CRITICAL: Build verification under contention

The parallel session is currently running multiple `vite build` processes. Running `npm run build` may hang at "377 modules transformed" because the dev server port is held by another build. If your build hangs for >90s:

1. `tasklist | grep -i vite` to confirm other vite processes are running
2. Wait ~60s and retry once: `npm run build > /tmp/build-w4-build-retry.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w4-build-retry.log`
3. If the retry still hangs, commit with a clear note in the body: "Build verification deferred to main lane due to parallel session's concurrent vite builds. lint and svelte-check passed clean." — do not block the commit
4. **NEVER `taskkill /IM node.exe` or `Get-Process node | Kill`** — that will kill the key-router, MCP servers, and the parallel session. Use the exact PID from `tasklist`.

**Wall budget: 3600s (1 hour).** Wave 4 has the most code-level refactoring (Vector3 hoisting) and a CSS-wide refactor (z-index consolidation).
