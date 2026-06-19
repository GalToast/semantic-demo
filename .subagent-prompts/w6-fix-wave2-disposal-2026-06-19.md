# W6 Fix Wave 2 — Disposal-Contract Retrofit — Semantic Explorer (2026-06-19)

## Role

You are **Worker 2 of 4** in a coordinated fix swarm. Your job is to apply the **5 disposal-contract items** from Wave 2 of the smell swarm synthesis. **You own Wave 2; do not touch anything in Waves 1, 3, or 4.**

You are a paid `opencode-go/mimo-v2.5` worker on the Pi harness. You will verify each fix against source, run the lint+build+surface-contract verification, then commit atomically.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Read First (non-negotiable)

- `tmp/smell-accounting-2026-06-19.md` (full cross-reference synthesis)
- `tmp/smell-engine-2026-06-19.md` (your main source for W1-engine findings: H1, M1, M2, M4)
- `tmp/smell-ui-2026-06-19.md` (your main source for W3 findings: H3, M4)
- `AGENTS.md` (repo-local rules)
- `docs/semantic-demo-css-authority-map.md` and `docs/semantic-demo-mobile-state-ownership.md` if they exist

## Wave 2 — Your Scope (5 items)

### Files you MAY edit

- `src/lib/engine/three-engine.ts` (H1, M1, M2)
- `src/lib/orchestration/triggers.ts` (M4)
- `src/lib/ui/legend-bindings.ts` (H3)
- `src/lib/ui/journey-bindings.ts` (H3)
- `src/lib/ui/onboarding-bindings.ts` (M4)

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

- All CSS files (Wave 1 / Wave 4)
- `src/components/ModeChips.svelte` (already deleted by Wave 1)
- `src/lib/focus/stage-renderer.ts`, `geometry.ts` (Wave 1)
- `src/lib/audio/audio-scape.ts` (Wave 1)
- `src/lib/data-store.ts`, `data-store.svelte.ts` (Wave 3)
- `src/lib/search/cache.ts`, `scoring.ts`, `results-ui.ts` (Wave 3)
- `src/lib/engine/adapters/search-bridge.ts` (Wave 3)
- `src/lib/semantic-threads.ts` (Wave 3)
- `src/lib/engine/mycelium-engine.ts`, `node-manager.ts` (Wave 4)
- `src/lib/z-index.ts`, `src/lib/css/z-layers.css`, `css/base.css` (Wave 4)

## The 5 Items in Order

### 1. `visibilitychange` listener leak in `three-engine.ts` (W1-H1)

- Line 723: `document.addEventListener('visibilitychange', () => { ... })` with anonymous arrow
- **Fix**: Store the listener reference in a module-level variable, register it as a named function. Then in `cancelAnimate()` (line 919) and `deinit()` (line 1000), call `document.removeEventListener('visibilitychange', <stored-ref>)`.
- **Verify**: After fix, `rg -n "removeEventListener" src/lib/engine/three-engine.ts` returns at least 1 match. The `cancelAnimate` and `deinit` functions should each have the call.

### 2. `_loaded` flag never reset in `three-engine.ts` (W1-M1)

- Lines 275, 278, 304: `_loaded = true` is set, never reset
- **Fix**: Add `_loaded = false` in `deinit()` (line 1000) BEFORE the function returns. Also reset any other module-cached references (`webglContext`, etc.) that should be re-initialized on subsequent `initThreeJS()`.
- **Verify**: After fix, `rg -n "_loaded" src/lib/engine/three-engine.ts` shows 4+ matches (the original 3 + the new reset line).

### 3. Document `cancelAnimate` contract in `three-engine.ts` (W1-M2)

- **Main lane decision**: per the synthesis, do NOT change behavior. Add a doc comment.
- `cancelAnimate()` is at line 919. Add a JSDoc block above it:

    ```
    /**
     * Cancel the render loop and tear down scene graph resources.
     * NOTE: This is a LIGHTER teardown. The `deinit()` function additionally calls
     * disposeNodeVisualsPort() and disposeMyceliumPort() to release tracked textures
     * and mycelium GPU resources. Call deinit() after cancelAnimate() for full cleanup.
     * The WebGL context-lost handler (line 701) currently only calls cancelAnimate();
     * tracked textures will leak until context GC — known issue, see smell-accounting W1-M2.
     */
    ```

- **Verify**: After fix, `git diff src/lib/engine/three-engine.ts | head -30` shows the new comment block above `cancelAnimate()`.

### 4. Migrate 19 `subscribe()` calls in `triggers.ts` to `subscribeKeyed()` (W1-M4)

- File: `src/lib/orchestration/triggers.ts`
- 19 subscription sites at lines 110, 115, 121, 125, 130, 135, 151, 179, 180, 190, 282, 301, 311, 321, 337, 351, 365, 377, 389
- **Fix**: For each subscription, call `subscribeKeyed(EVENTS.X, 'triggers.ts', callback)` instead of `subscribe(EVENTS.X, callback)`. The `subscribeKeyed` API in `event-bus.ts:152` accepts an owner key; using `'triggers.ts'` ensures any future HMR re-execution of triggers.ts doesn't stack subscriptions (the previous owner-keyed entries are unsubscribed automatically).
- **Verify**: After fix, `rg -n "subscribeKeyed" src/lib/orchestration/triggers.ts` returns 19+ matches and `rg -n "^\s+subscribe\(" src/lib/orchestration/triggers.ts` returns 0 matches (no bare `subscribe(` calls remain — note: this regex should match `subscribe(` at start of expression, not `subscribeKeyed`).

### 5. AbortController for `legend-bindings.ts` + `journey-bindings.ts` + `onboarding-bindings.ts` (W3-H3, W3-M4)

- **`legend-bindings.ts` lines 43, 53**: `document.addEventListener('pointerdown', ...)` and `document.addEventListener('keydown', ...)`
- **`journey-bindings.ts` lines 184, 192**: `document.addEventListener('click', ...)` and `document.addEventListener('keydown', ...)`
- **`onboarding-bindings.ts` lines 87-89**: 3 listeners (`mousemove`, `keydown`, `click`)
- **Fix pattern** (mirror `global-bindings.ts` and `panel-bindings.ts`):

    ```typescript
    // At module top:
    let _abortController: AbortController | null = null

    // In init function (where listeners are added):
    _abortController = new AbortController()
    document.addEventListener('pointerdown', handler, { signal: _abortController.signal })

    // Add or update dispose function:
    export function disposeLegendBindings() {
        _abortController?.abort()
        _abortController = null
        registeredEvents.clear() // if there is a registeredEvents set
    }
    ```

- For `onboarding-bindings.ts`, the existing `disposeOnboardingBindings()` at line 15 should call `abort()` on the new controller.
- **Verify**:
    - `rg -n "removeEventListener" src/lib/ui/legend-bindings.ts src/lib/ui/journey-bindings.ts src/lib/ui/onboarding-bindings.ts` returns 0 (we use AbortController, not removeEventListener)
    - `rg -n "AbortController" src/lib/ui/legend-bindings.ts src/lib/ui/journey-bindings.ts src/lib/ui/onboarding-bindings.ts` shows a new controller per file
    - `rg -n "signal:" src/lib/ui/legend-bindings.ts src/lib/ui/journey-bindings.ts src/lib/ui/onboarding-bindings.ts` shows the `signal: _controller.signal` pattern in 7+ addEventListener calls (2 in legend, 2 in journey, 3 in onboarding)

## Verification (REQUIRED before commit)

1. **Lint**: `npm run lint > /tmp/build-w2-lint.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w2-lint.log`
    - File-redirect only (avoid 45s auto-detach trap on pipe)
    - Must exit 0
    - **M4 in `triggers.ts`** has 19 changes — if lint complains about subscription count, this is expected and OK (we're replacing 19 bare `subscribe()` with 19 `subscribeKeyed()`)

2. **Build**: `npm run build > /tmp/build-w2-build.log 2>&1; echo EXIT=$?; tail -50 /tmp/build-w2-build.log`
    - File-redirect only
    - Must exit 0
    - **Do not run this if lint already failed** — fix lint first

3. **Type check**: `npm run check:svelte > /tmp/build-w2-typecheck.log 2>&1; echo EXIT=$?; tail -50 /tmp/build-w2-typecheck.log` (or `npx svelte-check` if no script)
    - File-redirect only
    - Must exit 0

4. **Git status sanity**: `git status --short` must show ONLY:
    - Modified: `src/lib/engine/three-engine.ts`, `src/lib/orchestration/triggers.ts`, `src/lib/ui/legend-bindings.ts`, `src/lib/ui/journey-bindings.ts`, `src/lib/ui/onboarding-bindings.ts`
    - **No** off-limits files
    - **No** untracked files

## Commit Protocol

**Single atomic commit**:

```bash
# 1. Re-check status before staging
cd "C:\Users\HP\repos\semantic-explorer"
git status --short

# 2. Stage ONLY your changed files (NEVER use -A)
git add src/lib/engine/three-engine.ts
git add src/lib/orchestration/triggers.ts
git add src/lib/ui/legend-bindings.ts
git add src/lib/ui/journey-bindings.ts
git add src/lib/ui/onboarding-bindings.ts

# 3. Verify staging matches your scope
git status --short
git diff --cached --stat

# 4. Commit with descriptive message
git commit -m "refactor(w6-wave2): disposal-contract retrofit

- Store visibilitychange listener ref; removeEventListener in cancelAnimate/deinit (W1-H1)
- Reset _loaded flag in deinit() for re-init support (W1-M1)
- Document cancelAnimate() lighter-teardown contract via JSDoc (W1-M2)
- Migrate 19 triggers.ts subscribe() calls to subscribeKeyed() (W1-M4)
- Add AbortController to legend-bindings.ts (2 listeners) + journey-bindings.ts (2 listeners) (W3-H3)
- Add AbortController to onboarding-bindings.ts (3 listeners); abort in disposeOnboardingBindings (W3-M4)

Refs: tmp/smell-accounting-2026-06-19.md Wave 2
Verified: npm run lint clean, npm run check:svelte clean, npm run build clean"

# 5. Verify commit
git log -1 --format="%h %s"
git show --stat HEAD
```

**DO NOT PUSH.** The `origin` remote points to a sibling Desktop path — main lane will mirror.

## Pitfalls

- **Pipe auto-detach trap**: `npm run build 2>&1 | tail -20` triggers 45s auto-detach. ALWAYS file-redirect.
- **Bare `git add -A` in dirty tree**: parallel session has 16 tracked files modified. `-A` will catch them. Use explicit paths.
- **The `subscribeKeyed` API**: read `src/lib/orchestration/event-bus.ts:152` to confirm the signature. If it's `subscribeKeyed(eventName, ownerKey, callback)` use that; if it takes an object use that. **Read the source first** — do not guess.
- **The `registeredEvents` set** in `legend-bindings.ts` / `journey-bindings.ts` / `onboarding-bindings.ts` may need to be cleared on dispose. Check what the existing `dispose*` function does and mirror that pattern.
- **For M4 (`triggers.ts`)**: if any of the 19 sites has a callback that itself reads subscription state, the migration may need a small refactor. Read each site first.
- **The `lifecycle.ts:350-358` comment** says module-lifetime subscriptions are intentional in production. **DO NOT change that comment** — it's the documented design for non-HMR production. The M4 fix is HMR-safety only; production behavior is unchanged.

## Return

Return a short text summary (≤300 words) with:

1. Wall-time used (in minutes)
2. Commit SHA
3. `git show --stat` summary
4. `npm run lint`, `npm run check:svelte`, `npm run build` results (exit codes)
5. Any items where you had to deviate from the prompt (e.g., `subscribeKeyed` signature was different than expected, `registeredEvents` had a non-obvious owner, etc.)
6. Any new findings you noticed while editing (add to your report, do not auto-fix)

## CRITICAL: Build verification under contention

The parallel session is currently running multiple `vite build` processes. Running `npm run build` may hang at "377 modules transformed" because the dev server port is held by another build. If your build hangs for >90s:

1. `tasklist | grep -i vite` to confirm other vite processes are running
2. Wait ~60s and retry once: `npm run build > /tmp/build-w2-build-retry.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w2-build-retry.log`
3. If the retry still hangs, commit with a clear note in the body: "Build verification deferred to main lane due to parallel session's concurrent vite builds. lint and svelte-check passed clean." — do not block the commit
4. **NEVER `taskkill /IM node.exe` or `Get-Process node | Kill`** — that will kill the key-router, MCP servers, and the parallel session. Use the exact PID from `tasklist`.

**Wall budget: 3600s (1 hour).** Wave 2 is more substantive than Wave 1; the trigger migration is 19 sites.
