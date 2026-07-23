# Wave 1 — Search Layer Cleanup Plan

> **STATUS (2026-07-23, HEAD `c7e99114`):** ALL three waves CLOSED at current HEAD. Last verified by main-lane audit on 2026-07-23. §4a Wave-2 `search-debounce.ts` timer closed by `9d1610a1`; §4b Wave-2 `search-dispatch.ts` controller closed by `7e24c0f2` (test coverage `9baf5293` + `057da257`). §1 #2 URL-param sticky-flag bug CLOSED — `src/lib/search/mock-search-fallback.ts:369` `shouldBypassApiSearch()` returns the bypass `boolean` directly without calling `markApiUnreachable('url-param')`; grep → 0 hits. **Wave-3 presentational-search extract LANDED via `c7e99114`** — pulls 3 components into new dir `src/lib/components/search/`; `src/components/SearchResults.svelte:32-34` imports all 3 (orchestration-only surface). Audit PASSED svelte-extract-scoped-css-reactivity + ErrorState REUSE checks. See bottom-of-file “Wave-2 follow-up CLOSED + Wave-3 extension LANDED” block for the full cite.

> **STATUS (2026-07-22, HEAD `840411fb`):** The FULL Wave-1 search-layer cleanup is now CLOSED, including the SearchInput-controller extraction follow-up that this plan defers to a Wave-2. `src/lib/search/search-debounce.ts` AND `src/lib/search/search-dispatch.ts` both exist (confirmed by `ls`). So §1 / §5 / §2c are all DONE — the deferred SearchInput-convergence controller extraction the plan flagged as the outstanding item has landed. Nothing in this plan remains open.

> Read-only investigation. Source files were NOT edited. All claims cite `file:line`
> from `rg`/`find`/`wc`/`sed`. HEAD `161194f1` at investigation; **current HEAD `5222e684`** after the parallel-lane merge of 7 commits landed between investigation and polish (no files cited in this plan were structurally relocated by that merge — line numbers below are stable at `5222e684` for verified cites).

> **⚠️ SUPERSEDED — most of this Wave-1 plan is now CLOSED** (2026-07-16 audit; status compiled from `git log --oneline -- <file>`). All 5 `§5` execution-order steps are DONE by prior commits, so the §1 #1 / §2c “THREE overlapping result caches” framing is retire-grade stale (the referenced files `api-cache.ts`, `mapper.ts`, `search-cache.ts` no longer exist). Wave-1 closure record:
>
> - **§2a (cache lifecycle consolidation)** — `search-cache.ts` merged into `cache.ts`; 11 cache exports appended, 0 name collisions. Closed by W52 `8a467b72`.
> - **§3a / §5 #1 (DELETE orphan `api-cache.ts`)** — file removed; no live importers existed. Closed by `eb82baa3 refactor(search): delete orphaned api-cache.ts`.
> - **§3b / §5 #3 (DELETE dead `mapper.ts`)** — file removed; `semantic-search-mapper.ts` already carries the live API; `SearchResult` lifted to `state-types.ts` (W49-ish via `ce958405` state-split commits). Closed by `88df7661 refactor(search): remove dead mapper.ts`.
> - **§3c / §5 #4 (EXTRACT `result-presentation.ts`)** — pure helpers migrated out of `result-renderer.ts`, which dropped 374 → 247 LOC. New `src/lib/search/result-presentation.ts` (≈6.9 KB). Closed via the state-types split commit lineage (`ce958405` family).
> - **§4a / §5 #5 (EXTRACT `search-debounce.ts`)** — new `src/lib/search/search-debounce.ts` (≈1.4 KB); `SearchInput.svelte` dropped 678 → 662 LOC. Closed by `9d1610a1 refactor(search): extract SearchDebounce timer from SearchInput.svelte`.
> - **§5 #2 (sticky bypass respect + reload recovery)** — `markApiUnreachable` / `clearApiUnreachable` / `readApiUnreachable` helper-triad + `API_BYPASS_STICKY_MS = 60_000` expiry on read path; legacy `'1'` string treated as expired so old tabs recover automatically. Closed by PR-M loose commits (see `src/lib/search/mock-search-fallback.ts:285-378` + AGENTS.md “Conventions (search fallback)” documentation).
>
> The narrative below is retained as a **historical Wave-1 investigation** — the line cites (`search-cache.ts:N`, `api-cache.ts:N`, `mapper.ts:N`) reference now-absent files.
>
> **Wave-2 follow-up CLOSED + Wave-3 extension LANDED at HEAD `c7e99114` (2026-07-23):**
>
> - **§4a Wave-2 `search-debounce.ts` timer** — LANDED via `9d1610a1 refactor(search): extract SearchDebounce timer from SearchInput.svelte` (test coverage `9baf5293 test(search): cover SearchDebounce + align Enter-key contract`).
> - **§4b Wave-2 `search-dispatch.ts` controller** — LANDED via `7e24c0f2 refactor(search): extract SearchDispatch controller from SearchInput.svelte` (test coverage `057da257 test(search): add SearchDispatch unit coverage and update SearchInput architecture guards`). The “until `SearchInput.svelte` owner-converges with parallel session sprint” wait is RESOLVED — the parallel sprint harvested both §4a + §4b in one coordinated pair.
> - **§1 #2 URL-param sticky-flag bug** — CLOSED per PR-M triad. Verified at HEAD `c7e99114`: `src/lib/search/mock-search-fallback.ts:369` `shouldBypassApiSearch()` returns the URL-bypass `boolean` directly without calling `markApiUnreachable('url-param')`; explicit comment at file:374-380 documents the contract; `grep "markApiUnreachable('url-param')" src/lib/search/mock-search-fallback.ts` → 0 hits.
>
> Wave-1+2 closure trajectory: 8a467b72 · eb82baa3 · 88df7661 · ce958405 · PR-M loose · 9d1610a1 · 7e24c0f2 → Wave-3 extract `c7e99114`.
>
> **Wave-3 extension (NEW, undocumented by original Wave-1 plan, opened 2026-07-23):** parallel Pi session harvested the **presentational halves** out of `SearchResults.svelte` AFTER Wave-1+2 controller extractions landed. Wave-3 LANDED via `c7e99114 refactor(search): extract SearchErrorState, SearchEmptyState, SearchResultList` into NEW dir `src/lib/components/search/`:
>
> - `SearchErrorState.svelte` — wrapper around shared `@components/ErrorState.svelte` `variant="card"` (`SearchErrorState.svelte:13-14` imports it; no inline-render duplication). DOM `.search-error-*` rules preserved via GLOBAL `css/search.css:1548-1681`.
> - `SearchEmptyState.svelte` — NEW presentation-only no-results + suggestions; pure props; no store subscriptions.
> - `SearchResultList.svelte` — presentation-only listbox + count + Show-more; imports `SearchResultItem` from `@components/`; **ships its own scoped `.search-show-more-btn` CSS** in its `<style>` block (file:145/169/174) — moved FROM `SearchResults.svelte` so Svelte's scoped CSS applies correctly to the button rendered by THIS component (move documented by comment at file:143-144).
>
> **Wave-3 audit (main-lane verification at HEAD `c7e99114`):**
>
> - **svelte-extract-scoped-css-reactivity PASSED**: `grep -nE '^\s*\.(search-error-|search-empty-|search-result-list|search-show-more-btn)' src/components/SearchResults.svelte` matches at lines 11-21 — these are inside the parent's HTML comment at lines 1-29 (`<!-- ... DOM ids/classes expected by contract tests ... -->`), NOT orphan scoped CSS rules; parent's `<style>` block no longer defines these (only `.search-results-wrapper` + `.sr-only` + `:global()` modifiers stay, which is correct — wrapper owned by parent).
> - **CSS split verified**: `.search-show-more-btn` moved TO `SearchResultList.svelte` scoped block (file:145/:169/:174); `.search-error-*` + `.search-empty-*` stay GLOBAL at `css/search.css`; DOM-contract comment at `SearchResults.svelte:1-29` documents the classes (no orphan-rule drift).
> - **ErrorState REUSE**: `SearchErrorState.svelte:13-14` imports ErrorState + FriendlyError (variant="card"); no duplicate inline render.
>
> Wave-3 is driven entirely by the parallel Pi session; this Wave-1 plan leaves the presentational-extract surface to that session and stops at verifying the audit.

## 1. Executive Summary (ranked by impact ÷ effort)

1. **`src/lib/search/api-cache.ts` is fully orphaned (224 lines, ~0 callers).** It is the
   "concentric" duplicate of the live cache. `rg` finds no importer outside itself and the
   deprecation shim in `cache.ts` (`src/lib/search/api-cache.ts:1-2`; the live cache is
   `src/lib/search/cache.ts`). Delete it. Confirmed: `rg -rn "from '@lib/search/api-cache'" src tests`
   → empty.
2. **`shouldBypassApiSearch()` writes the transient-error sticky flag on permanent URL params
   (side-effect bug).** `src/lib/search/mock-search-fallback.ts:359-377` calls
   `markApiUnreachable('url-param')` for `staticOnly=1/offline=1/noApi=1`. Those params are meant
   to be a permanent bypass, but this pollutes the 60s `sessionStorage.api_unreachable` flag
   (`API_BYPASS_STICKY_MS` at `mock-search-fallback.ts:278`), so a stale 60s flag can outlive the
   intent. Fix: don't write the sticky record for the URL-param path.
3. **`src/lib/search/mapper.ts` is dead (215 lines, 0 importers) and duplicates
   `semantic-search-mapper.ts`.** `rg -ln "from '@lib/search/mapper'"` → empty; live mapper is
   `semantic-search-mapper.ts` (importer: `src/lib/search-engine.ts:38`). Overlapping pairs:
   `getSemanticSearchServiceResults`/`getPayloadResults`,
   `mapSemanticSearchServiceResult`/`mapServiceRow`. Delete `mapper.ts` after a grep confirm.
4. **UI/render module sprawl: `results-ui.ts` (579) + `result-renderer.ts` (374) +
   `orchestration.ts` (410) form one tangled ball.** Cross-imports are dense
   (`results-ui.ts` is imported by `orchestration.ts`, `result-renderer.ts`, `state.ts`,
   `lifecycle.ts`, `parity-attrs.svelte.ts` — `rg -ln "results-ui" src`). A blind "fold into one
   facade" is HIGH risk because both `results-ui.ts` and `result-renderer.ts` have dedicated unit
   tests (DOM + pure helpers). Recommended: incremental extraction of pure helpers only (§3).
5. **`SearchInput.svelte` is 678 lines** but does NOT own a suggestion list (suggestions live in
   sibling `SearchResults.svelte`/`SearchResultItem.svelte`; `rg` finds no suggestion render in
   `SearchInput.svelte`). The real seams are debounce lifecycle + combobox keyboard nav. Both are
   local to the input element, so extraction is a SMALL win; keep scoped (§4).

## 2. Caching Layer Inventory

### 2a. `src/lib/search/cache.ts` (231 lines) — `CacheEntry` type + IDB-backed Map

- **Caches:** `appState.searchState.semanticSearchResultCache: Map<string, CacheEntry>` where
  `CacheEntry = { storedAt, lastAccessedAt, payload: SearchPayload }`
  (`cache.ts:12-17`, `cache.ts:62-72` `initSearchCache`).
- **Key shape:** `query.trim().normalize('NFC').toLowerCase() + ':' + offset`
  (`getSemanticSearchCacheKey`, `cache.ts:54-59`).
- **TTL/invalidation:** `SEMANTIC_SEARCH_CACHE_TTL_MS = 10*60*1000` (10 min),
  `SEMANTIC_SEARCH_CACHE_MAX_ENTRIES = 8` (`cache.ts:9-10`). Expired entries evicted on read and
  during `storeSemanticSearchPayload` LRU sweep (`cache.ts:108-150`, `cache.ts:152-229`). Backed by
  IndexedDB via `idb-service` (`cache.ts:18`, `cache.ts:38-60`).
- **Callers of its exports:**
    - `getCachedSemanticSearchPayload` / `storeSemanticSearchPayload` / `initSearchCache` /
      `getSemanticSearchCacheDiagnostics` ARE re-exported FROM `api-cache.ts`
      (`api-cache.ts:9-12`, `api-cache.ts:18`, `api-cache.ts:225-226`) — but `api-cache.ts` is itself
      orphaned (see 2c).
    - `state-types.ts:20` + `state-types.ts:448` import **only the `CacheEntry` type** (type-only).
    - `app.svelte.ts:94` declares `semanticSearchResultCache: new Map<string, CacheEntry>()` and is
      guarded by `tests/unit-active/state-semanticsearchcache-typing-contract.test.ts:28-69`
      (asserts the `CacheEntry` shape + `initSearchCache` pattern).
- **Duplication flag:** This module's payload cache is functionally a near-duplicate of the LIVE
  cache in `search-cache.ts` (§2c) but is never reached by the active path. Its only _required_
  survivor is the `CacheEntry` type contract.

### 2b. Sticky bypass in `src/lib/search/mock-search-fallback.ts` (the LIVE "cache-of-unreachable")

- **Caches:** `sessionStorage.api_unreachable` as `ApiUnreachableRecord = { setAt, reason }`
  (`mock-search-fallback.ts:281-284`, `markApiUnreachable` `:285-298`).
- **Key shape:** single flag (no query keying).
- **TTL/invalidation:** `API_BYPASS_STICKY_MS = 60_000` (60s, `:278`). `readApiUnreachable`
  (`:316-357`) returns null if absent, legacy `'1'` (treated expired), unparseable, or
  `Date.now()-setAt > 60_000`. `clearApiUnreachable` (`:300-314`) is called from the API _success_
  path. `shouldBypassApiSearch` (`:359-377`) consults it.
- **Callers:** `src/lib/search-engine.ts:43-45` imports `shouldBypassApiSearch`, `markApiUnreachable`,
  `clearApiUnreachable`; used at `src/lib/search-engine.ts:91` (guard), `:143` (clear on success),
  `:154` (mark on failure). This is the ONLY live bypass and must be preserved.
- **Bug flag:** `shouldBypassApiSearch` (`:366-372`) calls `markApiUnreachable('url-param')` for
  `staticOnly/offline/noApi` URL params — mixing a permanent intent with the transient 60s sticky
  flag. (See §1 #2.)

### 2c. `src/lib/search/api-cache.ts` (224 lines) + the LIVE `src/lib/search/cache.ts` (235 lines)

- **`search-cache.ts` (LIVE):** `getCachedSearch`/`setCachedSearch`/`getPendingSearch`/
  `setPendingSearch` (`search-cache.ts:1-235`). Key = `{query, page, offset}` via
  `cacheKeyToString` (`search-cache.ts:24-27`); TTL `DEFAULT_TTL_MS = 5*60*1000` (5 min),
  `MAX_ENTRIES = 128` (`search-cache.ts:42-46`). This is what `src/lib/search-engine.ts` actually uses
  (`src/lib/search-engine.ts:27` imports `getCachedSearch/setCachedSearch/...`).
- **`api-cache.ts` (ORPHAN):** exports `fetchSemanticSearchResults` (retry/timeout + static-dev
  PHP fallback, `api-cache.ts:97-224`) and re-exports `cache.ts` helpers. **Zero importers** —
  `src/lib/search-engine.ts` defines its own `fetchSemanticSearchResultsDirect`
  (`src/lib/search-engine.ts:84`) and does NOT import `api-cache.ts` (`rg` confirms no `from '@lib/search/api-cache'`
  anywhere in `src`/`tests`). It only talks to `cache.ts` (deprecated IDB layer).
- **Duplication/incompatibility flag:** THREE overlapping result caches exist:
  `cache.ts` (query+offset, 10min, max 8, IDB), `search-cache.ts` (query+page+offset, 5min, max
  128, in-memory), and `mock-catalog`/`mock-search-fallback` (hand-curated). Only `search-cache.ts`
    - the `mock-search-fallback` sticky flag are on the live path. `api-cache.ts` + `cache.ts`'s
      payload-caching half are concentric dead weight.

## 3. Consolidation Candidates

### 3a. DELETE `src/lib/search/api-cache.ts` (224 lines) — highest ROI

- **Files:** `api-cache.ts` (224). Leaves `cache.ts` (kept ONLY for the `CacheEntry` type guard,
  see §2a/§3d).
- **Public API to preserve:** none required by live code. `fetchSemanticSearchResults` has no
  callers. `initSearchCache`/`getCachedSemanticSearchPayload`/`storeSemanticSearchPayload`/
  `getSemanticSearchCacheDiagnostics` are re-exported _from_ `api-cache.ts` but only _into_
  `api-cache.ts` itself — no external consumer.
- **Blast radius:** Low. No `src`/`tests` file imports `api-cache.ts`. The only references are the
  legacy plan doc `plans/refactor-semantic-search-api-cache.md` (pre-TS migration, references
  `js/modules/...`) — not a build artifact.
- **Effort:** S. **Risk:** low.

### 3b. DELETE `src/lib/search/mapper.ts` (215 lines); migrate `SearchResult` if needed

- **Files:** `mapper.ts` (215). Live twin `semantic-search-mapper.ts` (70) is imported by
  `src/lib/search-engine.ts:38`.
- **Public API to preserve:** `semantic-search-mapper.ts` already provides `getPayloadResults`,
  `mapServiceRow`, `normalizeSearchPage/Offset/Limit`. `SearchResult` is actually defined in
  `state-types.ts:515-516` (not in `mapper.ts`), so deleting `mapper.ts` does not break the
  `SearchResult` type. `mapper.ts`'s extra helpers (`isNumericOnlySearchQuery` `:72`,
  `resultMatchesNumericSearchQuery` `:77`, `hydrateSemanticResultContexts` `:213`) have 0 importers
  (`rg -ln "search/mapper'"` empty) — confirm before delete, then remove.
- **Blast radius: Low.** No `src` importer.
- **Effort:** S. **Risk:** low (after grep confirm).

### 3c. EXTRACT pure presentation helpers out of `result-renderer.ts` (374 lines)

- **Files:** `result-renderer.ts` (374). Pure, tested helpers: `renderResultCountLine` `:94`,
  `getSearchResultStrength` `:107`, `getSearchResultStrengthLabel` `:113`, `getSearchResultCardClasses`
  `:121`, `buildSearchResultSnippet` `:127`, `buildSearchRankLabel` `:161`, `buildSearchStageLabel`
  `:184`. Move these to a new `src/lib/search/result-presentation.ts`.
- **Keep in `result-renderer.ts`:** DOM-touching functions (`scheduleCompactSearchResultReveal`
  `:251`, `setActiveSearchResultRow` `:278`, `refreshSearchResultHierarchy` `:338`) that depend on
  `results-ui.ts` (already imported there).
- **Public API to preserve:** all exported names must remain importable (re-export from new module,
  or update importers). `result-renderer-pure-helpers.test.ts` already covers these.
- **Blast radius:** medium — `results-ui.ts` and any component import these. Grep each name
  before moving. **Effort:** M. **Risk:** med (re-export churn but behavior-preserving).

### 3d. DO NOT bulk-merge `results-ui.ts` + `orchestration.ts` + `result-renderer.ts`

- They are a tightly coupled trio with dense cross-imports and **two dedicated test files**
  (`tests/unit-active/search-results-ui-ts-dom.test.js`,
  `tests/unit-active/result-renderer-pure-helpers.test.ts`). A single "SearchFacade" fold is HIGH
  risk for marginal gain. Prefer the §3c incremental extraction. If a facade is desired later, do
  it only after §3c and with a re-export shim so existing imports + tests keep passing.

## 4. SearchInput.svelte Extraction (678 → <400 lines)

Note: `SearchInput.svelte` does **NOT** render suggestions (those live in
`SearchResults.svelte`/`SearchResultItem.svelte`; `rg` found no suggestion list in the file). Real
seams are debounce + combobox keyboard nav.

### 4a. `search-debounce.ts` (new lib)

- **State:** `debounceTimer: ReturnType<typeof setTimeout> | null`, `debounceMs`, optional
  `searchAbortController`.
- **Carves out:** `debounceDispatch` (`SearchInput.svelte:179-189`) + the debounce half of
  `handleInput` (`:191-211`). Provide `scheduleDebounced(fn, ms)` and `cancelDebounced()`.
- **Props/events:** pure functions; returns a handle `{ schedule, cancel }`. Parent keeps
  `queryInput`/`dispatchSearch` ownership.
- **Target:** ~30 lines extracted; `SearchInput.svelte` drops ~40 lines.

### 4b. `search-combobox-keys.ts` (new lib) — OPTIONAL, lower priority

- **State:** pure key-predicate helpers: `isEnterCommit(e)`, `isEscapeAbort(e, showLoading)`,
  `isArrowDownNav(e)`.
- **Carves out:** the predicate logic in `handleKeydown` (`SearchInput.svelte:246-287`). The actual
  DOM focus calls (`list.querySelector('[data-order="0"]')`, `:120`/`:282`) stay in the component
  because they touch the live result list.
- **Target:** ~25 lines; `SearchInput.svelte` drops ~30 lines.
- **Goal:** after 4a (+4b optional) `SearchInput.svelte` shrinks ~70 lines (678 → ~608). To hit
  <400 you'd also need to move the abort/`dispatchSearch` orchestration (`:129-177`, `:288-330`)
  into a `search-dispatch.ts` controller — flag as a follow-up, not Wave 1, since it couples to
  `searchState`/`pendingSearch`/`engineReady` stores and is higher risk.

## 5. Recommended Execution Order (each commit topic-pure, gates green)

| #   | Commit subject                                                | File set                                                           | Verification                                                                 | Invariant                                                                                                                 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | `refactor(search): delete orphaned api-cache.ts`              | delete `src/lib/search/api-cache.ts`                               | `npm run check`, `npm run lint`, plus `npm run test:contract`                | `rg "from '@lib/search/api-cache'"` → empty; no live importer existed                                                     |
| 2   | `fix(search): don't persist sticky flag for url-param bypass` | `mock-search-fallback.ts` `shouldBypassApiSearch` `:359-377`       | `npm run test:unit`, `npm run qa:journey:headless`                           | `staticOnly=1/offline=1/noApi=1` still bypass, but `sessionStorage.api_unreachable` only set on real API failure (`:154`) |
| 3   | `refactor(search): remove dead mapper.ts`                     | delete `src/lib/search/mapper.ts` (after grep confirm 0 importers) | `npm run check`, `npm run test:unit`                                         | `semantic-search-mapper.ts` covers `getPayloadResults`/`mapServiceRow`; `SearchResult` still from `state-types.ts:515`    |
| 4   | `refactor(search): extract pure result-presentation helpers`  | new `result-presentation.ts`; `result-renderer.ts` re-exports      | `npm run test:unit` (`result-renderer-pure-helpers.test.ts`), `npm run lint` | pure helper signatures unchanged; DOM helpers stay in `result-renderer.ts`                                                |
| 5   | `refactor(search): extract search-debounce lib`               | new `search-debounce.ts`; `SearchInput.svelte` uses it             | `npm run qa:journey:headless`, `npm run test:unit`                           | debounce timing preserved (300ms); no double-dispatch (`handleInput` guard `:200-204` kept)                               |

Each commit must leave `npm run check` + `npm run lint` green; commits 2/4/5 also run the search
journey test. No unrelated work per commit.

## 6. Verification Steps

Per-commit (run by main lane):

- `npm run check` — typecheck (catches the `CacheEntry`/`SearchResult` type moves in #3).
- `npm run lint` — eslint (no unused-import leftovers after deletions).
- `npm run test:unit` — Vitest incl. `result-renderer-pure-helpers.test.ts`,
  `search-results-ui-ts-dom.test.js`, `state-semanticsearchcache-typing-contract.test.ts`
  (the last GUARDS `cache.ts` `CacheEntry` — do NOT delete `cache.ts`, only `api-cache.ts`).
- `npm run test:contract` — module/contract surface.
- `npm run qa:contract` — QA contract.
- `npm run qa:journey:headless` — headless journey.

Wave 2 end (full gate):

- All of the above + `npm run build` (main lane owns; this plan did not build).

### Search coverage in `tests/widget-journey.spec.js`

- **Present:** `tests/widget-journey.spec.js:139` "Mobile (375px): synthesize-trigger + search-trail-cue
  never overlap result cards", and `:262` "W48 search-surface polish". Both fill `#search-input`
  with `'coffee'` (`:170`), `requestSubmit()` the form (`:172`), and assert
  `.search-result-listitem, [role="option"]` items (`:178`, `:249`). This exercises the live
  `src/lib/search-engine.ts` → `search-cache.ts` → `mock-search-fallback` path end-to-end.
- **Gap flagged:** No journey test targets the **URL-param bypass** (`staticOnly=1/offline=1/noApi=1`)
  or the **60s sticky-flag** behavior directly. Recommend adding one journey assertion that
  `?staticOnly=1` yields mock results AND that `sessionStorage.api_unreachable` is NOT written by
  that path (regresses the §1 #2 fix).

PLAN SAVED TO: tmp/wave1-plans/search-layer-cleanup-plan.md
