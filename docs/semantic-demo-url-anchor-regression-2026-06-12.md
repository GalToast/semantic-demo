# URL Anchor Regression — Root Cause and Recommended Fix

**Date:** 2026-06-12
**Status:** Root cause identified. Fix not yet applied (intentional — held back by TODO list pending user sign-off).
**Reporter:** Phase decomposition — C (smoke test) → A (diagnoser, timed out with key finding) → D (contract-test runner) → B (build-fix blocker surfaced, not blocking this doc)

## TL;DR

Loading `http://127.0.0.1:8795/dist/svelte/index.html?anchor=519` does not rebuild the focus pocket.
**The anchor-restoration code path is gated behind a `q` query parameter (length ≥ 2).**
For URLs with `?anchor=<id>` but no `q` params, the FocusPocket rebuild logic is never reached.

```ts
// src/lib/orchestration/url-state.ts:193-197   (the gate)
const query = params.get('q');
const anchorId = params.get('anchor');
if (query && query.trim().length >= 2) {
  await _restoreSearchFromParams(query, anchorId);   // <-- anchor logic lives INSIDE this
}
```

`?anchor=519` alone → `query` is `null` → `_restoreSearchFromParams` is never called → the entire anchor-restoration body, including the `<->` FocusPocket rebuild path, is skipped.

## Manual smoke (Step C, the trigger for this diagnosis)

| Probe | `?anchor=519` result | `__APP_ACTIONS__.focusOnNode(519)` result |
|---|---|---|
| `document.body.dataset.panelSurface` | `'focus-search'` ✓ | `'focus-search'` ✓ |
| `window.__APP_STATE__.navState.focusedIndex` | `null` ❌ | `519` ✓ |
| `window.__APP_STATE__.navState.focusPocketIndices.length` | `0` ❌ | `>0` ✓ |
| `document.title` | unchanged ❌ | `"Focus: Angel Hands Birth & Postpartum Doula Services, LLC"` ✓ |
| URL after 5s | `?anchor=519&view=galaxy` | `?view=galaxy&depth=1&record=520` (focus pipeline pushed neighbor) |

The legacy `__APP_ACTIONS__.focusOnNode()` path works correctly. Only the URL-anchor initialization path is broken.

## Lifecycle timeline (traced from Worker A + smoke)

| Step | Actor | Effect |
|---|---|---|
| 1 | Browser loads `?anchor=519` | `window.location.search = "?anchor=519"` |
| 2 | Vite evaluates `App.svelte <script module>` block | `import '@lib/orchestration/triggers'` triggers side-effect import → triggers.ts registers `subscribe(SEARCH_FOCUS_REQUESTED, …)` before publish |
| 3 | App.svelte module body: `earlyPublish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: 519 })` | triggers subscriber fires → `navStore.update(s => ({...s, focusedIndex: 519, mode: 'focus', surface: 'focus-search', trailDepth: 1}))` |
| 4 | `_dataLoadState.status = 'ready'` (after ~600ms when records+threads resolve) | `_dataLoadState` is a Svelte 5 `$state` object → any reader of `.status` re-tracks |
| 5 | FocusPocket.svelte `$effect` runs (dataReady=true, idx=519) → `applyLocalNeighborhoodFocus(519)` | should rebuild focus pocket |
| 6 | App.svelte `onMount` → `initData().then(()=>applyUrlState())` | `applyUrlState()` runs |
| 7 | `applyUrlState` → `resetStateBeforeUrlRestore()` → `clearExplorationFocusSelection()` | **`navStore.update(s => ({...s, focusedIndex: null, mode:'overview', …}))`** — wipes the focusedIndex set in step 3 |
| 8 | `applyUrlState` reads `q` (null) and `anchor` (519) → `if (query?.trim().length >= 2)` is **false** → `_restoreSearchFromParams` is **not** called | anchor restoration is silently dropped |
| 9 | `applyUrlState` continues → `preserveDomForcedFocusSearchSurface()` sets `mode: 'search'`, `surface: 'focus-search'` | body.attributes updated but state machine is stuck in `mode: 'search'` (NOT `focus`) |

Step 7 + Step 8 together are why the URL-anchor smoke fails. Final state: `navState.focusedIndex === null`, `navState.focusPocketIndices === []`, `body.dataset.semanticDive === "transitioning"` (according to Worker D's evidence from `live-url-state-reconstruction.spec.js`), `document.title` unchanged.

## Secondary: Svelte 5 reactivity caveat in FocusPocket.svelte $effect

`src/components/FocusPocket.svelte` (lines 23-43) reads `focusedIndex()` and `hasFocus()` inside a `$effect`. Both delegate to `get(_navWritable)` of the `navStore` (a Svelte `writable` from `svelte/store`, NOT a Svelte 5 `$state` rune). Per Svelte 5 semantics, this `get()` call does **not** register as a tracking dependency.

Practical consequence: the `$effect` will re-fire when `_dataLoadState.status` flips from `'loading'` to `'ready'` (because that's a `$state` read). It will **not** re-fire when only `navStore.focusedIndex` changes via a `navStore.update()`. After the data-ready "first fire" with stale state, no further reactive rebuild happens even if the focusedIndex is later updated by `applyUrlState`.

This is masked by the primary root cause today. If the primary fix lands and the URL pipeline DOES set `navStore.focusedIndex` correctly, the `$effect` will still only re-fire if `_dataLoadState.status` ALSO happens to change in the same tick. In practice, `applyUrlState` runs after `initData()` (data is already ready), so the data-status dep is satisfied at first-fire time. Then `navStore.update(focusedIndex: 519)` happens — but the $effect doesn't see it.

**The actually-safe fix should land in BOTH places:**
- (a) `applyUrlState` must run anchor restoration for `?anchor=` URLs without `q` (primary)
- (b) FocusPocket $effect should re-track when `navStore.focusedIndex` changes (secondary)

For (b), the cleanest approach without touching navigation.ts architecture: read `navStore` via a `$state`-backed mirror, OR cast the `navStore` itself to expose a Svelte 5 reactive interface. The current `App.svelte:159-173` code already demonstrates the right pattern:

```svelte
let navFocusedIndex = $state<number | null>(null);
$effect(() => {
  _navUnsub?.();
  _navUnsub = navStore.subscribe((s) => {
    navFocusedIndex = s.focusedIndex;
  });
  return () => { _navUnsub?.(); _navUnsub = null; };
});
```

FocusPocket should adopt this same pattern. But that touches the FocusPocket → navigation boundary, which is a higher-risk seam.

## Evidence (bundle inspection, supports the gate claim)

Worker A's bundle grep at offset ~853300 of `dist/svelte/assets/index-Cz3GIZT3.js` revealed:

```js
if(t){
  let e=Number(t);
  if(Number.isFinite(e)){
    ea(Yi.SEARCH_FOCUS_REQUESTED,{index:e});   // publish early
    try{ nO(e) } catch(t){ Na(`[url-state] applyLocalNeighborhoodFocus failed for anchor`, e, t); }
  }
}
let n=hO();
if(await Rw(e, AbortSignal.timeout(3e4)), n&&gO(), t&&!Number.isFinite(Number(t))){ … }
```

Decoding: `t` = `anchorId`, `e` = `numericId`, `ea(...)` = `publish(...)`, `nO(e)` = the in-bundle direct call to `applyLocalNeighborhoodFocus(numericId)`, `Na(...)` = a debugWarn (silent unless failure), `hO()` = `isDomForcedFocusSearchSurface()`, `Rw(...)` = `runSearch(query, signal)`, `gO()` = `preserveDomForcedFocusSearchSurface()`.

The critical sequencing: the anchor-direct-call block executes **before** `await runSearch(query, signal)`. So in the deployed bundle, the direct call fires when the body runs — but the entire block is inside `_restoreSearchFromParams`, gated by the `query && query.trim().length >= 2` check at the caller.

**The dirty url-state.ts direct call was a real attempt at belt-and-suspenders, but it lived inside the gated function. Removed in cleanup commit (see Step C below). Without `q`, this code never reaches the applyLocalNeighborhoodFocus call.**

## Test evidence (Step D — `live-url-state-reconstruction.spec.js` already catches this)

`tests/live-url-state-reconstruction.spec.js` triggers 4 URL reconstruction scenarios. 2/4 fail today:

| Test | URL | Symptom | Status |
|---|---|---|---|
| "full-parameter URL reconstructs depth=2 dive mode correctly" | `?anchor=<id>&depth=2&…` | `body.dataset.semanticDive === "transitioning"`, expected `"active"` | **FAIL** |
| "record focus restoration completes after async search/data load" | `?anchor=<id>&q=…` | `semanticDive: 'transitioning'` | **FAIL** |
| Two other tests (search-only, view-only) | (no anchor) | n/a | pass |

Both failing tests confirm anchor-driven pocket assembly does not complete. This is the same regression the manual smoke sees.

**Crucial contract-test gap:** `tests/surface-contract-check.mjs --surface=launch-focus --shell=svelte` **passes** today even with the regression. It validates DOM structure (`#focus-stage`, `#focus-pocket-a11y`, etc) but does NOT assert that the anchor-triggered focus path actually completes. The contract suite is currently more permissive than the user-facing failure. Either `launch-focus` surface contract should be tightened to assert the dive state, OR a new dedicated test should pin the regression.

**Other contract rot (separate issue, out of URL-anchor scope):** 65/72 contract tests fail on `ENOENT` for `.ts` files in `js/modules/`. The migration scaffolding is missing `js/modules/semantic-guide.js`, `js/modules/url-state.ts`, and several other legacy files that `applyUrlState` and `window-actions.ts` still reference. This blocks `npm run build:svelte`. See `migration-build-fix-2026-06-12` worker report.

## What was cleaned today (no functional change to URL flow)

> **April 2026 timeline correction:** Slice `f36765b` (`chore(slice): focus-pocket url anchor fix, mobile field-node UX, test shell defaults, pre-commit guard`) was committed to `master` at 17:52:20 today by the user right before our diagnostic sweep. That commit **already shipped** the entire original-batch work I was sizing up:
>
> - `src/lib/orchestration/url-state.ts` direct call + debugWarn (the change this doc diagnosed as ineffective)
> - `src/components/FocusCard.svelte` + `WeatherWidget.svelte` mobile hide CSS
> - `tests/surface-contract-check.mjs` + `tests/visual-state-audit.mjs` shell URL flips + edgeRatio threshold
> - `scripts/git-hooks/pre-commit.ps1` + `package.json` `git:hook:install`/`git:hook:check`
>
> Subsequent parallel work in the same window:
> - `b8a50ba` — `chore: remove 154 dead .ts shadow files under js/modules/` (good housekeeping)
> - `c892a01` — `fix(hooks): make pre-commit install cross-platform, add bash/cmd wrappers`
> - `ca13d50` — `docs(visual-qa): focus-pocket 3D-only migration critique`
>
> The 23 file modifications still in the working tree (mostly `src/lib/{engine,data-loader,journey}/...` and contract tests) are from this parallel sweep — not authored by this diagnostic and not in scope of this commit batch.

### Side-effect of the diagnostic sweep

Worker C (url-state-cleanup, closed at `ocw_3a3de365-…`) inadvertently reverted the url-state.ts portion of `f36765b` because its prompt described the change as "diagnostic instrumentation" rather than "shipped fix". I have restored url-state.ts to match HEAD via `git checkout HEAD -- src/lib/orchestration/url-state.ts` so the tree no longer carries that revert. Worker C's edit was otherwise clean and correctly cataloged the changes — the prompt framing was the issue, not the worker's execution.

**Net effect:** this sweep contributed one new doc (`docs/semantic-demo-url-anchor-regression-2026-06-12.md`) and zero source changes. The url-state.ts `applyLocalNeighborhoodFocus` direct call from `f36765b` remains in place; it lives inside `_restoreSearchFromParams` and therefore does not fire for `?anchor=` URLs without `q`. Regression is **unfixed** and is pending Approach 1 / Approach 2 / Approach 3 decision as documented below.

## Recommended fix (NO EDITS YET — pending owner sign-off)

### Approach 1 — minimum viable (preferred)

Restructure `applyUrlState()` to call an anchor handler unconditionally when `anchor` is present:

```ts
// src/lib/orchestration/url-state.ts — refactor pseudocode
const query = params.get('q');
const anchorId = params.get('anchor');

// ALWAS restore anchor if present, regardless of q
if (anchorId && Number.isFinite(Number(anchorId))) {
  await _restoreAnchorFromParams(Number(anchorId));   // NEW: tiny function with the publish + nav-store.set
}

// then run search if there's a query
if (query && query.trim().length >= 2) {
  await _restoreSearchFromParams(query);              // existing, may also restore non-numeric anchor inside
}
```

`_restoreAnchorFromParams(numericId)` body:
```ts
async function _restoreAnchorFromParams(numericId: number) {
  // 1. make sure navStore.focusedIndex lands BEFORE any subsequent state.reset runs
  navStore.update(s => ({
    ...s,
    focusedIndex: numericId,
    mode: 'focus',
    surface: 'focus-search',
    trailDepth: 1
  }));
  // 2. publish so subscribers can refresh trail/search history
  publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId });
}
```

This is order-sensitive: we must perform the nav-store update BEFORE `resetStateBeforeUrlRestore()` runs in `applyUrlState`, OR move `resetStateBeforeUrlRestore()` to run BEFORE the anchor handler. The latter is cleaner:

```ts
navStore.update(restore-token bookkeeping);
resetStateBeforeUrlRestore();
const query = ...; const anchorId = ...;
if (anchorId && Number.isFinite(Number(anchorId))) await _restoreAnchorFromParams(Number(anchorId));
if (query && query.trim().length >= 2) await _restoreSearchFromParams(query);
```

**Owner guidance:** This change is contained to `src/lib/orchestration/url-state.ts`. Touch-level risk matches the d57bdf0 commit (one file, one function). Test coverage should add: `tests/live-url-state-reconstruction.spec.js` cases for `?anchor=<id>` without `q`, and `tests/surface-contract-check.mjs --surface=launch-focus --shell=svelte` should be tightened to assert `body.dataset.semanticDive === 'active'` after the URL is applied.

### Approach 2 — also fix the Svelte 5 reactivity caveat

If we want the FocusPocket $effect to track `focusedIndex` changes properly, port `FocusPocket.svelte` to use the App.svelte mirror pattern:

```svelte
let navFocusedIndex = $state<number | null>(null);
let navHasFocus = $state(false);
let dataReady = $state(false);

$effect(() => {
  _navUnsub?.();
  _navUnsub = navStore.subscribe(s => {
    navFocusedIndex = s.focusedIndex;
    navHasFocus = !!(Number.isFinite(s.focusedIndex) || s.mode === 'focus' || s.mode === 'inside');
  });
  return () => { _navUnsub?.(); _navUnsub = null; };
});

$effect(() => {
  const dr = getDataLoadState().status === 'ready';
  if (!dr) return;
  const idx = navFocusedIndex;
  const focused = navHasFocus;
  // ... existing applyLocalNeighborhoodFocus call ...
});
```

This requires also discipline about cleanup of `navStore.subscribe` listeners on `$effect` teardown (currently FocusPocket does NOT subscribe — it just calls `focusedIndex()` getter which doesn't track).

**Owner guidance:** Approach 2 is a more thorough fix but crosses two file boundaries (FocusPocket.svelte + navStore contract). Suggestion: ship Approach 1 first to unblock the URL-anchor regression; defer Approach 2 to a follow-up sweep with its own ownership.

### Approach 3 — do nothing, file regression ticket

If shipping Approach 1 today is too much, file a regression ticket with this doc as the spec. The risk: producers sharing `?anchor=<id>` URLs (likely in marketing/email deep-links) will see broken focus-pocket rebuild.

## Decision matrix

| Approach | Risk | Lines touched | Fixes primary? | Fixes secondary? | Test changes |
|---|---|---|---|---|---|
| 1 - minimum viable (extract `_restoreAnchorFromParams`) | Low | ~20 lines in `url-state.ts` | ✅ | ❌ | Tighten launch-focus surface, add anchor-only test |
| 2 - full fix (1 + Svelte 5 reactive tracking) | Medium | ~30 lines in `url-state.ts` + ~10 in `FocusPocket.svelte` | ✅ | ✅ | Same as 1 |
| 3 - ticket only | Zero today | 0 | ❌ (ticket) | ❌ (ticket) | none |

## Open questions for runtime verification

To confirm Approach 1 fixes the regression without needing a rebuild (using the existing dist bundle as a sandbox):

```js
// Open http://127.0.0.1:8795/dist/svelte/index.html?anchor=519 in browser DevTools,
// then evaluate in the console after data is ready:
window.__APP_STATE__.navState.focusedIndex                    // should be 519 after Approach 1 builds
document.body.dataset.semanticDive                            // should be 'active'
document.title                                                 // should include "Angel Hands"

window.__APP_ACTIONS__.focusOnNode(519);                      // sanity: legacy path still works
```

For approach 2, additionally:

```js
// After Approach 2 builds, watch FocusPocket $effect fire:
const before = document.title;
window.__APP_ACTIONS__.resetExplorationFocus();                // should clear focusedIndex, likely trigger $effect
// Then:
window.__APP_ACTIONS__.focusOnNode(519);
// Assert document.title changes — proves the $effect tracked focusedIndex→navFocusedIndex
```

## Cross-team coordination notes

- **Worker B (build-fixer)** exited case (b) and returned an error report. The build break for `js/modules/semantic-guide.js` is a SEPARATE pre-existing migration scaffolding issue, not blocking this regression fix but still blocks any production rebuild. Stub no-op: `requestSemanticGuide: () => null` in a new `src/lib/engine/stubs/semantic-guide-stub.ts` would unblock builds without restoring dead-js behaviour.
- **Surface contract tests need tightening.** `launch-focus`/`svelte` currently treats DOM-existence as success; it should also assert state-machine progression (`semanticDive === 'active'`, `focusedIndex === 519`, `document.title` includes the business name).
- **Migration scaffolding rot is wider than expected.** Worker D reports 65/72 url-state-adjacent tests fail on `ENOENT` for `.ts` files. This is bigger-scoped cleanup than the url-anchor regression; recommend a separate `migration-cleanup` sweep with dedicated owner.

## Verification status

| Check | Status |
|---|---|
| Manual smoke `?anchor=519` | Reproduced broken behavior |
| Manual smoke `__APP_ACTIONS__.focusOnNode(519)` | Confirms working baseline |
| Bundle inspection (gating evidence) | Done — shows direct-call inside `_restoreSearchFromParams` |
| Source inspection (gating evidence) | Done — line 195-196 |
| Contract test (`live-url-state-reconstruction`) | 2/4 failing — regression caught |
| Test for Approach 1 | Not written — pending fix decision |
| Test for Approach 2 | Not written — pending fix decision |

This doc is intentionally prescriptive without being prescriptive-edited. Owner decides which approach to take.
