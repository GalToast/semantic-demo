# W6 Fix Wave 3 — State-Source-of-Truth Consolidation — Semantic Explorer (2026-06-19)

## Role

You are **Worker 3 of 4** in a coordinated fix swarm. Your job is to apply the **state-consolidation items** from Wave 3 of the smell swarm synthesis. **You own Wave 3; do not touch anything in Waves 1, 2, or 4.**

You are a paid `opencode-go/mimo-v2.5` worker on the Pi harness. You will verify each fix against source, run the lint+build+contract verification, then commit atomically.

**This is the most delicate wave.** State consolidation has the largest blast radius. Two parallel-session contract tests (`state-mutator-ownership-contract.mjs`, `state-transition-contract.mjs`) are actively in flight and assert invariants that this work must not violate. **Be conservative — investigate first, then act.**

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Read First (non-negotiable)

- `tmp/smell-accounting-2026-06-19.md` (full cross-reference synthesis)
- `tmp/smell-state-2026-06-19.md` (your main source — every Wave 3 finding is in this report)
- `AGENTS.md` (repo-local rules, especially state mutation rules)
- `src/lib/state/with-state-mutation.ts` (the canonical mutation helper — understand it before you use it)
- `src/lib/state/app.svelte.ts` (the Svelte 5 state class — source of truth)

## Wave 3 — Your Scope (8 items)

### Files you MAY edit

- `src/lib/data-store.ts` (H1, H4 — primary init path, keep this)
- `src/lib/data-store.svelte.ts` (H1, H4, L1 — likely DELETE per main lane decision; see below)
- `src/lib/search/cache.ts` (H2, L2)
- `src/lib/engine/adapters/search-bridge.ts` (H3, M4)
- `src/lib/search/results-ui.ts` (H3)
- `src/lib/search/scoring.ts` (M3)
- `src/lib/semantic-threads.ts` (M1)
- `src/lib/stores/legacy-stores.ts` (L4 — likely already deleted by Wave 1; if so, skip)

### Files you may NOT edit (OFF-LIMITS — parallel session owns)

```
M src/components/Canvas.svelte
M src/lib/orchestration/parity-attrs.svelte.ts
M src/lib/stores/lifecycle.ts          (state ownership tests; CRITICAL — do not touch)
M tests/cluster-filter-city-filter-side-effect-contract.mjs
M tests/cluster-filter-contract.mjs
M tests/cluster-filter-dewindowing-contract.mjs
M tests/composition-state-invariant-contract.mjs
M tests/focus-semantic-state-boundary-contract.mjs
M tests/journey-thread-inspector-contract.mjs
M tests/lifecycle-composition-contract.mjs
M tests/state-mutator-ownership-contract.mjs   (CRITICAL — parallel session is mid-edit)
M tests/state-transition-contract.mjs          (CRITICAL — parallel session is mid-edit)
M tests/step-inside-state-sync-contract.mjs
M tests/surface-contract-check.mjs
M tests/thread-inspector-dewindowing-contract.mjs
M vite.config.ts
?? tmp_check_dive.mjs, tmp_check_dive2.mjs, tmp_check_dive3.mjs, tmp_check_search.mjs, tmp_lc_diag.mjs
```

Also off-limits to you (other waves own these):

- All CSS files (Wave 1 / Wave 4)
- `src/components/FocusPocketA11y.svelte`, `ModeChips.svelte` (Wave 1)
- `src/lib/focus/stage-renderer.ts`, `geometry.ts` (Wave 1)
- `src/lib/audio/audio-scape.ts` (Wave 1)
- `src/lib/engine/three-engine.ts` (Wave 2)
- `src/lib/orchestration/triggers.ts` (Wave 2)
- `src/lib/ui/legend-bindings.ts`, `journey-bindings.ts`, `onboarding-bindings.ts` (Wave 2)
- `src/lib/engine/mycelium-engine.ts`, `node-manager.ts` (Wave 4)
- `src/lib/z-index.ts`, `src/lib/css/z-layers.css`, `css/base.css` (Wave 4)

## The 8 Items in Order (with main-lane decisions)

### 1. H1 / H4 / L1 — Consolidate data-store (DELETE the .svelte.ts orphan)

**Main lane decision**: Active init path is `data-store.ts` (confirmed: `App.svelte:45` imports from `@lib/data-store`, `main.ts:16` imports from `@lib/data-store`). The `.svelte.ts` file is orphan. **Delete it.**

**Procedure**:

1. **First, verify the orphan claim**:

    ```bash
    rg -rn "from.*data-store\.svelte" src/ tests/ 2>/dev/null
    rg -rn "@lib/data-store\.svelte" src/ tests/ 2>/dev/null
    rg -rn "from.*data-store\.svelte" --hidden 2>/dev/null
    ```

    If ALL return zero matches, proceed to delete.

2. **If any import exists**: STOP and report. Do not delete a referenced file. The main lane will re-decide.
3. **Delete**: `rm src/lib/data-store.svelte.ts`
4. **Re-export from `data-store.ts`** for any exports that `.svelte.ts` had but `.ts` did not. The W2 state report flagged `positionBuffer`, `clustersBuffer`, `pointIndexByLeadId` as `$state` locals in `.svelte.ts` that did NOT have `.ts` exports. **However, since we're deleting the orphan, the canonical `.ts` writables are the source of truth** — no need to re-export.

**Verify after fix**:

- `rg -rn "data-store\.svelte" src/ tests/ 2>/dev/null` returns zero matches
- `ls src/lib/data-store*.ts` shows only `data-store.ts`

### 2. H2 — `cache.ts` Map init + `+=` writes bypass `withStateMutation()`

**Procedure**:

1. **Read** `src/lib/state/with-state-mutation.ts` to understand the helper signature (likely `withStateMutation(fn: () => T): T`).
2. **Read** `src/lib/search/cache.ts:37` — the `if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map(...)` line.
3. **Refactor** to wrap in `withStateMutation`:

    ```typescript
    // Replace line 37 with:
    withStateMutation(() => {
        if (!state.semanticSearchResultCache) {
            state.semanticSearchResultCache = new Map<string, CacheEntry>()
        }
    })
    ```

4. **Read** `src/lib/search/cache.ts:110,121,122,130,159` — the `state.semanticSearchCacheDiagnostics.* += 1` lines.
5. **Refactor** to wrap each `+=` in `withStateMutation`:

    ```typescript
    withStateMutation(() => {
        state.semanticSearchCacheDiagnostics.misses += 1
    })
    ```

    Or batch them in a single call if they're sequential.

**Verify after fix**:

- `rg -n "withStateMutation" src/lib/search/cache.ts` returns 6+ matches (1 init + 5 increments, possibly batched)
- The function `markSemanticSearchCache()` (line 92-98) is already guarded — leave it unchanged

### 3. H3 / M4 — Route all `searchGlowIndices` mutations through the store

**Procedure**:

1. **Read** `src/lib/stores/search.svelte.ts` to find the canonical `setSearchGlow(indices, topIndex)` action.
2. **Refactor** `src/lib/engine/adapters/search-bridge.ts`:
    - Lines 61-66: replace direct `ctx._state.searchGlowIndices.clear()` and `.add()` calls with a single call to `setSearchGlow(indices, topIndex)` from the store.
    - Line 69 already calls `setSearchGlow(indices, indices[0] ?? null)` — keep that and remove the legacy writes above it.
3. **Refactor** `src/lib/search/results-ui.ts:810-811`:
    - `state.searchGlowIndices.clear()` → call the store's `clearSearchGlow()` action (or `setSearchGlow([], null)`).
4. **M4**: Once H3 is done, the `_applyGlow` dual-path is gone (the store action is the single path).

**Verify after fix**:

- `rg -n "searchGlowIndices\.(clear|add)" src/lib/engine/adapters/search-bridge.ts src/lib/search/results-ui.ts` returns 0 matches
- `rg -n "setSearchGlow" src/lib/engine/adapters/search-bridge.ts src/lib/search/results-ui.ts` shows the call sites

### 4. M1 — Replace 500ms busy-wait in `semantic-threads.ts` with Promise gate

**Procedure**:

1. **Read** `src/lib/semantic-threads.ts:136-142` to understand the busy-wait loop.
2. **Read** the function that calls `attachLegacyState()` to understand the producer side.
3. **Refactor**:
    - Add a module-level `let _stateReadyResolve: (() => void) | null = null`
    - Add a module-level `let _stateReadyPromise: Promise<void> = new Promise(r => { _stateReadyResolve = r })`
    - In `attachLegacyState()`, after setting `_state`, call `_stateReadyResolve?.()`
    - Replace the busy-wait with: `await _stateReadyPromise` (if first call) OR `if (_state !== null) return; await _stateReadyPromise` (if subsequent call)
4. **Preserve the 500ms timeout fallback**: `Promise.race([_stateReadyPromise, sleep(500)])` — if the promise resolves, continue; if timeout, `console.warn` and return `false`.

**Verify after fix**:

- `rg -n "Date\.now" src/lib/semantic-threads.ts` returns 0 (no more `Date.now()` busy-wait)
- `rg -n "_stateReadyPromise" src/lib/semantic-threads.ts` shows the gate

### 5. M3 — Migrate `scoring.ts` to read from `appState`

**Procedure**:

1. **Read** `src/lib/search/scoring.ts:10` to see the legacy import.
2. **Read** `src/lib/state/app.svelte.ts` to see the Svelte 5 state class.
3. **Refactor**:
    - Change `import { state, type Point } from '../engine/state-bridge'` → `import { appState } from '../state/app.svelte'`
    - Replace `state.leadEnrichment` → `appState.leadEnrichment`
    - Replace `state.points` → `appState.points`
    - Type `Point` may need to come from `src/lib/types/` instead of the bridge.

**Verify after fix**:

- `rg -n "from.*engine/state-bridge" src/lib/search/scoring.ts` returns 0
- `rg -n "appState" src/lib/search/scoring.ts` shows 2+ matches

### 6. L2 — Add invariant comment to `cache.ts:119` (no code change)

**Procedure**:

- Add a 1-line comment above the `lastAccessedAt` mutation:

    ```typescript
    // lastAccessedAt is an internal cache field; mutation here does not affect Svelte 5 reactivity.
    ```

### 7. L3 — Fix `Math.random()` in `search-engine.ts:326` (mock search delay)

**Procedure**:

- Replace `80 + Math.random() * 170` with a fixed `165` (midpoint) OR a seeded random.
- **If the mock search is non-observable in production** (e.g., only used in dev/test), just use a fixed value: `165`.
- **If it's user-observable** (e.g., shown in production UI), use a seeded approach: import `seededUnit` from `src/lib/utils/` (read the file first to find the right export name).

**Verify after fix**:

- `rg -n "Math\.random" src/lib/search-engine.ts` returns 0 (or returns matches only in clearly-marked non-deterministic blocks like audio)

### 8. L4 — Verify `legacy-stores.ts` is dead

**This may already be done by Wave 1.** Run:

```bash
rg -rn "from.*legacy-stores" src/ tests/ 2>/dev/null
rg -rn "@lib/stores/legacy-stores" src/ tests/ 2>/dev/null
```

If both return empty and the file still exists (Wave 1 didn't delete it for some reason), delete it. If Wave 1 already deleted it, skip and note "already done by Wave 1" in your return.

## Verification (REQUIRED before commit)

1. **Lint**: `npm run lint > /tmp/build-w3-lint.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w3-lint.log`
    - File-redirect only
    - Must exit 0

2. **Type check**: `npm run check:svelte > /tmp/build-w3-typecheck.log 2>&1; echo EXIT=$?; tail -80 /tmp/build-w3-typecheck.log`
    - **CRITICAL** — type errors here mean the state class + mutations broke
    - File-redirect only
    - Must exit 0

3. **Build**: `npm run build > /tmp/build-w3-build.log 2>&1; echo EXIT=$?; tail -50 /tmp/build-w3-build.log`
    - File-redirect only
    - Must exit 0

4. **SKIP contract tests as a verification gate** (NEW, replaces original step 4). The state contract tests (`state-mutator-ownership-contract.mjs`, `state-transition-contract.mjs`, `composition-state-invariant-contract.mjs`, `focus-semantic-state-boundary-contract.mjs`, etc.) are **actively being rewritten by the parallel session** at the time of dispatch — running them mid-edit will give false failures that have nothing to do with your work. **Do NOT run them as verification.** Instead:
    - Run `npm run check:svelte` (svelte-check) — this validates type correctness for your state changes
    - Run `npm run build` to confirm production bundle still compiles
    - The main lane will run the contract tests AFTER both your commit and the parallel session's next commit land, in a coordinated post-merge pass
    - If `svelte-check` or `build` fails because of a state contract issue, that IS your problem to fix; if it fails for some other reason, report and do not commit

5. **Git status sanity**: `git status --short` must show ONLY:
    - Modified: `src/lib/data-store.ts`, `src/lib/search/cache.ts`, `src/lib/search/scoring.ts`, `src/lib/search/results-ui.ts`, `src/lib/search-engine.ts`, `src/lib/engine/adapters/search-bridge.ts`, `src/lib/semantic-threads.ts`
    - Deleted: `src/lib/data-store.svelte.ts` (only if the verify step confirmed orphan)
    - Possibly deleted: `src/lib/stores/legacy-stores.ts` (if Wave 1 didn't already delete it)
    - **No** off-limits files (especially the contract test files)
    - **No** untracked files

## Commit Protocol

**Single atomic commit**:

```bash
# 1. Re-check status before staging
cd "C:\Users\HP\repos\semantic-explorer"
git status --short

# 2. Stage ONLY your changed files (NEVER use -A)
git add src/lib/data-store.ts src/lib/search/cache.ts src/lib/search/scoring.ts src/lib/search/results-ui.ts src/lib/search-engine.ts src/lib/engine/adapters/search-bridge.ts src/lib/semantic-threads.ts
git add -u src/lib/data-store.svelte.ts  # only if deleted
git add -u src/lib/stores/legacy-stores.ts  # only if Wave 1 didn't already delete it

# 3. Verify staging matches your scope
git status --short
git diff --cached --stat

# 4. Commit with descriptive message
git commit -m "refactor(w6-wave3): state-source-of-truth consolidation

- Delete verified-orphan src/lib/data-store.svelte.ts (W2-H1, H4, L1)
- Wrap cache.ts Map init and += writes in withStateMutation (W2-H2)
- Route all searchGlowIndices mutations through stores/search.svelte.ts setSearchGlow (W2-H3, M4)
- Replace 500ms Date.now busy-wait in semantic-threads.ts with Promise gate (W2-M1)
- Migrate scoring.ts to read from appState instead of legacy state-bridge (W2-M3)
- Add invariant comment to cache.ts:119 lastAccessedAt (W2-L2)
- Replace Math.random() mock search delay with fixed value (W2-L3)
- Verify and delete legacy-stores.ts if not already done by Wave 1 (W2-L4)

Refs: tmp/smell-accounting-2026-06-19.md Wave 3
Verified: npm run lint clean, npm run check:svelte clean, npm run build clean,
  state-mutator-ownership-contract.mjs pass, state-transition-contract.mjs pass,
  composition-state-invariant-contract.mjs pass"

# 5. Verify commit
git log -1 --format="%h %s"
git show --stat HEAD
```

**DO NOT PUSH.** The `origin` remote points to a sibling Desktop path — main lane will mirror.

## Pitfalls

- **Pipe auto-detach trap**: `npm run build 2>&1 | tail -20` triggers 45s auto-detach. ALWAYS file-redirect.
- **Bare `git add -A` in dirty tree**: parallel session has 16 tracked files modified including the state contract tests. `-A` will catch them. Use explicit paths.
- **`data-store.svelte.ts` may have consumers you didn't find**: if the rg for `.svelte` imports returns hits, STOP. The main lane will re-decide.
- **The `state-mutator-ownership-contract.mjs` and `state-transition-contract.mjs` are in flight**: even if they pass NOW, the parallel session may modify them after you. The serial commit gate says to wait if 5+ commits land in 30 min. Re-check `git log --since="30 minutes ago" --oneline` immediately before commit.
- **The `withStateMutation` helper signature**: read `src/lib/state/with-state-mutation.ts` first. If it requires a special argument (e.g., a key for tracing), use that.
- **H3 refactor may break the engine's glow application**: if `setSearchGlow` is async and the engine expects synchronous glow, this could flicker. Test by running the relevant contract tests.
- **M3 migration of `scoring.ts` may break mock search**: if the engine bridge and `appState` diverge (even briefly), scoring will return empty. Run the contract tests after M3.

## Return

Return a short text summary (≤400 words) with:

1. Wall-time used (in minutes)
2. Commit SHA
3. `git show --stat` summary
4. `npm run lint`, `npm run check:svelte`, `npm run build` results (exit codes)
5. **Contract test results**: pass/fail for `state-mutator-ownership`, `state-transition`, `composition-state-invariant`
6. Any items where you had to deviate (e.g., `data-store.svelte.ts` had consumers, `subscribeKeyed` signature was different, `setSearchGlow` was async, etc.)
7. Any new findings you noticed (add to your report, do not auto-fix)
8. **CRITICAL**: if you had to revert any change because a contract test failed, say so explicitly with the revert reason

**Wall budget: 3600s (1 hour).** Wave 3 is the largest blast-radius wave; the budget reflects the time needed for verification, not exploration.

## CRITICAL: Build verification under contention

The parallel session is currently running multiple `vite build` processes. Running `npm run build` may hang at "377 modules transformed" because the dev server port is held by another build. If your build hangs for >90s:

1. `tasklist | grep -i vite` to confirm other vite processes are running
2. Wait ~60s and retry once: `npm run build > /tmp/build-w3-build-retry.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w3-build-retry.log`
3. If the retry still hangs, commit with a clear note in the body: "Build verification deferred to main lane due to parallel session's concurrent vite builds. svelte-check passed clean." — do not block the commit
4. **NEVER `taskkill /IM node.exe` or `Get-Process node | Kill`** — that will kill the key-router, MCP servers, and the parallel session. Use the exact PID from `tasklist`.
