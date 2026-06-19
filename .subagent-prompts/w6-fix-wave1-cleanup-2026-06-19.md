# W6 Fix Wave 1 — Low-Risk Cleanups — Semantic Explorer (2026-06-19)

## Role

You are **Worker 1 of 4** in a coordinated fix swarm. Your job is to apply the **9 small cleanup items** from Wave 1 of the smell swarm synthesis. **You own Wave 1; do not touch anything in Waves 2-4.**

You are a paid `opencode-go/mimo-v2.5` worker on the Pi harness. You will verify each fix against source, then commit atomically.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Read First (non-negotiable)

- `tmp/smell-accounting-2026-06-19.md` (full cross-reference synthesis — the master table is at the bottom)
- `tmp/smell-ui-2026-06-19.md` (your main source for W3 findings)
- `tmp/smell-engine-2026-06-19.md` (your main source for W1 findings)
- `tmp/smell-state-2026-06-19.md` (your main source for W2 findings)
- `AGENTS.md` (repo-local rules, especially CSS ownership docs)

## Wave 1 — Your Scope (9 items)

### Files you MAY edit

- `css/shell.css` (delete `biofield-*` selectors)
- `css/mobile_base.css` (delete `biofield-*` reduced-motion selectors + dead `[class*="demo-"]` selector — **z-index area is OFF-LIMITS to you, owned by Wave 4**)
- `css/progressive_disclosure.css` (delete `biofield-*` + `.demo-starter-chip`)
- `css/search.css` (delete `biofield-*` + `.demo-starter-chip`)
- `css/synthesis.css` (delete `biofield-*`)
- `css/mobile_premium__state.css` (delete `.demo-starter-chip`)
- `src/components/ModeChips.svelte` (DELETE the entire file — orphan)
- `src/components/FocusPocketA11y.svelte` (replace `z-index: 80` literal with `var(--z-panels)` at lines 130, 190)
- `src/lib/focus/stage-renderer.ts` (refactor `syncSelectedCardContentVariant` at lines 148-152 to accept DOM elements as params with `getElementById` fallback)
- `src/lib/focus/geometry.ts` (update header comment at lines 70-76 to acknowledge `appState` dependency)
- `src/lib/stores/legacy-stores.ts` (verify dead, then delete — see step 7)

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

- `css/mobile_premium__focus-dive.css` (Wave 4)
- `css/base.css` z-index tokens (Wave 4)
- `src/lib/z-index.ts` (Wave 4)
- `src/lib/css/z-layers.css` (Wave 4)
- `src/lib/engine/three-engine.ts`, `mycelium-engine.ts`, `node-manager.ts` (Wave 4)
- `src/lib/ui/legend-bindings.ts`, `journey-bindings.ts`, `onboarding-bindings.ts` (Wave 2)
- `src/lib/orchestration/triggers.ts` (Wave 2)
- `src/lib/data-store.ts`, `data-store.svelte.ts` (Wave 3)
- `src/lib/search/cache.ts`, `scoring.ts`, `results-ui.ts` (Wave 3)
- `src/lib/engine/adapters/search-bridge.ts` (Wave 3)
- `src/lib/semantic-threads.ts` (Wave 3 owns M1, Wave 4 doesn't touch it)

## The 9 Items in Order

### 1. Delete `biofield-*` CSS (W3-H1)

- `css/shell.css` lines 290, 740-874 (and any others — search)
- `css/mobile_base.css` lines 412-466
- `css/progressive_disclosure.css` line 438
- `css/search.css` line 1526
- `css/synthesis.css` line 142
- Verify with: `rg -n 'biofield' css/` returns zero matches
- **Skip** the `.n-glow` / `.nPulse` / `.nDrift` classes — those are the renamed active classes (per W3 report)

### 2. Delete `.demo-starter-chip` CSS (W3-M2)

- `css/search.css` lines 1541-1579
- `css/mobile_base.css` line 481
- `css/mobile_premium__state.css` line 108
- `css/progressive_disclosure.css` lines 457-458
- Verify with: `rg -n 'demo-starter-chip' css/` returns zero matches

### 3. Delete `src/components/ModeChips.svelte` (W3-M3)

- `rm src/components/ModeChips.svelte`
- Verify with: `rg -n 'ModeChips' src/` returns zero matches
- If anything does import it, STOP and report — do not delete a referenced file

### 4. Replace `z-index: 80` in `FocusPocketA11y.svelte` (W3-L1)

- Lines 130 and 190: `z-index: 80;` → `z-index: var(--z-panels);`
- Verify: confirm `z-layers.css` defines `--z-panels: 80` (it does per W3-H2 evidence)

### 5. Delete dead `[class*="demo-"]` reduced-motion selector (W3-L3)

- `css/mobile_base.css` lines 440-442 (inside `@media (prefers-reduced-motion: reduce)`)
- Verify with: `rg -n 'class\*="demo-"' css/` returns zero matches
- This is the LAST `!important` flagged in UI-11

### 6. Refactor `syncSelectedCardContentVariant` in `stage-renderer.ts` (W1-L1)

- Lines 148-152: 5 `document.getElementById()` calls
- Refactor to accept optional `HTMLElement` params with `getElementById` fallback
- **Be conservative** — this is a pure refactor, no behavior change
- The function may have multiple callers; check them all

### 7. Update `geometry.ts` header comment (W1-L3)

- Lines 70-76: comment says "Pure geometry/easing utilities"
- Update to: "Geometry/easing utilities that read from `appState` — not pure; mock `appState` in unit tests"

### 8. Verify and delete `src/lib/stores/legacy-stores.ts` (W2-L4)

- **First verify dead**: `rg -rn "from.*legacy-stores" src/ tests/ 2>/dev/null` and `rg -rn "from.*['\"]@lib/stores/legacy-stores['\"]" src/ tests/ 2>/dev/null`
- If both return empty: `rm src/lib/stores/legacy-stores.ts`
- If anything imports from it: STOP and report — do not delete a referenced file

### 9. Add comment to `audio-scape.ts:186,188` (W3-L4)

- The `Math.random()` for audio frequencies is intentional
- Add a 1-line comment above line 186: `// Audio frequencies are intentionally non-deterministic; not geometry.`
- **Don't change the code**, just add the comment

## Verification (REQUIRED before commit)

1. **Lint**: `npm run lint > /tmp/build-w1-lint.log 2>&1; echo EXIT=$?; tail -30 /tmp/build-w1-lint.log`
    - File-redirect only (avoid 45s auto-detach trap on pipe)
    - Must exit 0

2. **Build**: `npm run build > /tmp/build-w1-build.log 2>&1; echo EXIT=$?; tail -50 /tmp/build-w1-build.log`
    - File-redirect only
    - Must exit 0
    - **Do not run this if lint already failed** — fix lint first

3. **Surface contract**: if `tests/surface-contract-check.mjs` is in your edit set (it is OFF-LIMITS, do not edit), skip this. If a `npm run qa:contract:mobile-idle` or similar exists, run it file-redirected. Otherwise, skip.

4. **Git status sanity**: `git status --short` must show ONLY:
    - Modified: `css/shell.css`, `css/mobile_base.css`, `css/progressive_disclosure.css`, `css/search.css`, `css/synthesis.css`, `css/mobile_premium__state.css`, `src/components/FocusPocketA11y.svelte`, `src/lib/focus/stage-renderer.ts`, `src/lib/focus/geometry.ts`, `src/lib/audio/audio-scape.ts`
    - Deleted: `src/components/ModeChips.svelte`, `src/lib/stores/legacy-stores.ts` (only if you verified it was dead)
    - **No** off-limits files
    - **No** untracked files (don't `git add` the smoke-scratch `tmp_check_*.mjs` files)

## Commit Protocol

**Single atomic commit**:

```bash
# 1. Re-check status before staging
cd "C:\Users\HP\repos\semantic-explorer"
git status --short

# 2. Stage ONLY your changed files (NEVER use -A)
git add css/shell.css css/mobile_base.css css/progressive_disclosure.css css/search.css css/synthesis.css css/mobile_premium__state.css
git add src/components/FocusPocketA11y.svelte src/lib/focus/stage-renderer.ts src/lib/focus/geometry.ts src/lib/audio/audio-scape.ts
git add -u src/components/ModeChips.svelte src/lib/stores/legacy-stores.ts  # only if deleted

# 3. Verify staging matches your scope
git status --short
git diff --cached --stat

# 4. Commit with descriptive message
git commit -m "refactor(w6-wave1): low-risk cleanups

- Remove dead biofield-* CSS (W3-H1, ~40 selectors across 5 files)
- Remove dead .demo-starter-chip CSS (W3-M2, 8 selectors across 4 files)
- Delete orphan src/components/ModeChips.svelte (W3-M3, 163 lines)
- Replace z-index: 80 with var(--z-panels) in FocusPocketA11y.svelte (W3-L1)
- Remove dead [class*=\"demo-\"] reduced-motion selector (W3-L3)
- Refactor syncSelectedCardContentVariant to accept DOM elements (W1-L1)
- Update geometry.ts header comment to acknowledge appState (W1-L3)
- Delete verified-dead src/lib/stores/legacy-stores.ts (W2-L4)
- Add audio-scape Math.random() intentional-comment (W3-L4)

Refs: tmp/smell-accounting-2026-06-19.md Wave 1
Verified: npm run lint clean, npm run build clean"

# 5. Verify commit
git log -1 --format="%h %s"
git show --stat HEAD
```

**DO NOT PUSH.** The `origin` remote points to a sibling Desktop path (`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`) — main lane will mirror.

## Pitfalls

- **Pipe auto-detach trap**: `npm run build 2>&1 | tail -20` triggers 45s auto-detach. ALWAYS file-redirect: `> /tmp/build-XXX.log 2>&1; echo EXIT=$?; tail -20 /tmp/build-XXX.log`
- **Bare `git add -A` in dirty tree**: parallel session has 16 tracked files modified. `-A` will catch them. Use explicit paths.
- **Off-limits file touched**: re-run `git status --short` BEFORE commit. If any off-limits file appears, run `git restore --staged <path>` and continue.
- **Stale state**: re-run `git status --short` immediately before staging. If the parallel session landed a commit in your window, rebase: `git fetch origin && git rebase origin/master` (but only if there are no merge conflicts with your work).

## Return

Return a short text summary (≤250 words) with:

1. Wall-time used (in minutes)
2. Commit SHA
3. `git show --stat` summary
4. `npm run lint` and `npm run build` results (exit codes)
5. Any items skipped or blocked (e.g., `legacy-stores.ts` had consumers, `ModeChips.svelte` had consumers, `geometry.ts` had callers that broke, etc.)
6. Any new findings you noticed while editing (add to your report, do not auto-fix)

**Wall budget: 1800s (30 min).** Wave 1 should be small and quick; if you hit the budget, you've gone off-scope.
