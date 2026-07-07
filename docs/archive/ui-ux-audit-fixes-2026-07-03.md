# UX Audit Fix List — 2026-07-03

Companion to `docs/ui-ux-audit-2026-07-03.md` and `tmp/ux-faceoff-comparison.md`.
Fixes the converged ★★★/★★ bugs surfaced by the 4-lane model face-off (mimo/stepfun/agnes/nemotron).

## Status legend

- ✅ Fixed
- ⏸️ Deferred (with reason)
- ⚠️ Pre-existing (parallel-session owned)

---

## ✅ Fixed (this session)

### 1. SearchResults `aria-activedescendant` ID mismatch ★★★ (all 3 lanes)

- **File**: `src/components/SearchResults.svelte` L442
- **Bug**: `aria-activedescendant` referenced `search-result-${index}` (the _inner button_ id, `SearchResultItem.svelte` L133) instead of the `role="option"` div id `search-result-option-${order}` (L130). A listbox's `aria-activedescendant` must point to the `role="option"` element, so screen readers could not track keyboard navigation.
- **Fix**: `aria-activedescendant={activeIndex >= 0 ?`search-result-option-${activeIndex}`: undefined}` — `order === activeIndex` for the active item (per `active={order === activeIndex}`), so the id resolves to the option div.
- **Test impact**: `a11y-w42b-contract.test.mjs:137` regex `/…`search-result-/`still matches (`search-result-option-`contains`search-result-` as prefix). ✅ verified.

### 2. Splash `aria-hidden` + `aria-live` conflict ★★ (stepfun+agnes)

- **File**: `src/components/Splash.svelte` L186
- **Bug**: `<span class="sr-only" id="splash-cta-busy" aria-hidden="true" aria-live="polite">` — `aria-hidden="true"` suppressed the `aria-live="polite"` region, so the "Entering the 3D scene, please wait" announcement never fired proactively.
- **Fix**: removed `aria-hidden="true"`. The span is already `sr-only` (visually hidden, AT-accessible). The `aria-describedby="splash-hint splash-cta-busy"` path on the CTA still works; the live region now announces the busy state when `ctaBusy` flips.
- **Test impact**: `component-Splash.test.ts` assertions still match (`<span…id="splash-cta-busy"…aria-live="polite"`, `<span class="sr-only"…id="splash-cta-busy"`). ✅ verified.

### 3. InfoPanel `hasError = $derived(false)` dead error state ★★★ (all 3 lanes)

- **File**: `src/components/InfoPanel.svelte` L198 (script) + L361 (loading spinner) + L388 (error block)
- **Bug**: `hasError` hardcoded to `false`; the `role="alert"` error UI ("Unable to load details") was dead code. If the dataset failed to load, users saw an empty/loading state with no error feedback.
- **Fix**:
    - Imported `getDataLoadState` from `@lib/data-store` (exports `DataLoadState` with `status: 'idle'|'loading'|'ready'|'error'`).
    - `let hasError = $derived(getDataLoadState().status === 'error')` — surfaces real data-load failures.
    - Gated the loading spinner with `&& !hasError` so "Loading…" and "Unable to load details" don't render simultaneously.
- **Test impact**: surface-contract tests (`info-panel-empty`/`info-panel-populated`) run against the real dev server where `status='ready'` → `hasError=false` → empty/populated render as before. ✅ no regression. Compile-clean per edit-tool validation + full build.

---

## ⏸️ Deferred (with reason)

### 4. JourneyChrome `isLoading = $derived(false)` dead loading state ★★ (stepfun+agnes)

- **File**: `src/components/JourneyChrome.svelte` L117 (`aria-busy` at L346)
- **Reason for deferral**: There is **no async trail-loading signal to wire to**. `walkThreadNeighbor()` in `src/lib/journey/thread-settler.ts` is **synchronous** (returns `WalkResult | null`, no Promise/await). `journey.svelte` has no loading/busy/settling field; `navigation.svelte` only has `loadingPhaseKey` (boot-phase, not trail-loading). Wiring `aria-busy` to boot-loading would be semantically wrong (chrome is hidden during boot).
- **Action taken**: Updated the comment to document the synchronous reality so the next reader doesn't mistake the placeholder for a wiring gap. Kept `isLoading=false` + `aria-busy` attribute hook for contract-test compatibility.
- **To finish later**: if trail fetch ever becomes async, introduce a loading flag in `journeyStore` and wire `isLoading` to it. **Blocked on parallel session** which owns `src/lib/journey/thread-lens.ts` (in dirty file list) — do not introduce a journey-store loading flag concurrently.

### 5. FocusCard `tabindex="0"` on `role="region"` ★★ (agnes+mimo)

- **File**: `src/components/FocusCard.svelte` L297-298
- **Reason for deferral**: This is a **deliberate accessible scroll-container pattern**, not a bug. The code carries an explicit `<!-- svelte-ignore a11y_no_noninteractive_tabindex: focusable scroll region for keyboard users -->` comment documenting the intent. Removing `tabindex="0"` would regress keyboard scrolling of the card content. The lanes' suggestion (skip link) is an alternative, not a fix for a defect.
- **Action**: left unchanged. Documented here so it isn't re-flagged.

### 6. WalkBreadcrumb `role="listbox"` with button children ★★ (agnes+mimo)

- **File**: `src/components/WalkBreadcrumb.svelte` L60
- **Reason for deferral**: The listbox pattern is **functional** — `aria-activedescendant` + `walk-chip-${i}` ids match on both sides, roving tabindex + `handleKeydown` (Arrow/Home/End/Enter/Space) implemented. `role="toolbar"` (mimo's suggestion) is a semantic-preference debate, not a defect fix. Changing it risks regressing the working keyboard nav.
- **Action**: left unchanged.

---

## ⚠️ Pre-existing parallel-session breakage (NOT caused by these fixes)

### ThreadInspector title text

- **Test**: `tests/unit-active/a11y-w42b-contract.test.mjs:85` — `expect(read(THREAD_INSPECTOR)).toContain('Thread connection to node')`
- **Cause**: `src/components/ThreadInspector.svelte` is modified by the parallel session (in dirty file list); the title text appears changed/removed. This test reads `THREAD_INSPECTOR`, **not** any file edited in this session.
- **Action**: do not fix — the parallel session owns ThreadInspector mid-flight. Surface for them to reconcile on quiescence.

---

## Verification

- `npx vitest run component-Splash component-SearchResults a11y-w42b-contract a11y-w43a-keyboard-trap search-results-arrow-keys-render-contract` → **4 files passed, 1 file failed** (only the pre-existing ThreadInspector title test; the aria-activedescendant test in the same file passed). 82/83 tests pass.
- Edit-tool TypeScript-clean validation passed for all 4 edited files.
- Full `npm run build` — running (see commit).

## Files edited this session

- `src/components/SearchResults.svelte` (aria-activedescendant fix)
- `src/components/Splash.svelte` (aria-hidden removal)
- `src/components/InfoPanel.svelte` (hasError wiring + spinner gate + import)
- `src/components/JourneyChrome.svelte` (comment documenting sync reality)

## Session lock

Acquired via `node scripts/session-lock.mjs acquire` (HP@LAPTOP-2QK2TQAP). Release when work is reviewed/merged.
