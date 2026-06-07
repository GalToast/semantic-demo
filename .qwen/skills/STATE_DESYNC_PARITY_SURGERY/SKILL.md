---
name: State Desync and Parity Surface Surgery
description: Fixes state desyncs between legacy JS and Svelte/TS migration tracks by eliminating dual DOM writers, sealing incomplete resets, completing bridge state paths, and filling parity-manifest gaps. Run after a parity audit but before shipping the Svelte track.
source: auto-skill
extracted_at: '2026-06-06T22:36:45.548Z'
---

# State Desync and Parity Surface Surgery

Use this when a parity audit has revealed specific state desyncs, dual writers, incomplete resets, or manifest gaps between a legacy JS track and a Svelte/TS migration track. Each pattern below is a self-contained fix template for a class of desync bug.

**Precondition:** You have a list of numbered findings (from a sweep report, audit, or test failure). Each finding identifies a specific desync, dual write, or manifest gap.

**Adjacent skills:**
- `SVELTE_MIGRATION_PARITY_AUDIT` — run this first to *find* the gaps; this skill *fixes* them.
- `STRUCTURED_BUG_SURGERY` — general multi-bug methodology. This skill is a specialized variant for parity/desync bugs.

## The Four Fix Patterns

### Pattern A: Leaking Focus State (Incomplete Reset)

**Symptom:** When exploration focus is reset (e.g., `resetExplorationFocus()`), certain sub-fields on `navStore` or `focusStore` are not explicitly cleared, allowing stale pocket data, meta, or role maps to ghost into the next session.

**How to diagnose:** Read every `navStore.update()` and `focusStore.update()` call in the reset function. Compare the fields it sets to the initial state defined in the store. Any field present in the initial state but not in the reset update is a candidate leak.

**Fix:**
1. Read the store's initial state to identify all sub-fields (e.g., `focusPocketIndices`, `focusPocketMeta`, `focusPocketRoleByIndex`).
2. Add the missing fields to the reset's `navStore.update()` / `focusStore.update()` call with their zero values (`[]`, `null`, `new Map()`).
3. Add a comment: `// Prevent stale <X> data from ghosting into new sessions.`

**Verification:** After the fix, call the reset function (or publish the event that triggers it) and assert that `get(navStore)` returns zero values for the formerly-stale fields. The store's initial state is the source of truth — the reset must converge toward it.

### Pattern B: Dual DOM Writers (Parity Layer Undercut)

**Symptom:** Multiple modules write the same `document.body.dataset.*` attribute. The parity layer (`parity-attrs.ts`) is supposed to be the sole writer, but legacy-port modules (`modes.ts`, `compass-controller.ts`, `view-controller.ts`) still write directly, creating races where parity's last-write-wins overwrite can lose context (e.g., a 'transitioning' phase set by the data writer is lost when parity's subscriber fires with `'active'`).

**How to diagnose:** Grep for `document.body.dataset` across all `src/` files. For each match, check whether parity-attrs.ts claims ownership via `PARITY_ATTRIBUTES`. Any match inside `src/` that *isn't* in `parity-attrs.ts` itself is a dual writer.

**Fix:**
1. For each match outside `parity-attrs.ts`: check if the value can be derived from a store.
2. If it can: remove the direct write. Add a comment `// body.dataset.<attr> is owned by parity-attrs.ts.`
3. If parity-attrs's `computeParityAttributes()` does NOT derive this value, add the derivation logic there, add it to the `PARITY_ATTRIBUTES` manifest, and subscribe the installer to the relevant store.
4. If the dual-writer module's function was also responsible for other DOM-side effects (e.g., element visibility, aria attributes), keep those — only remove the `body.dataset` writes.
5. If any imports become unused after removing the dataset writes, clean them up.

**Special cases:**
- **`refreshCompositionState()`** that wrote attributes and published an event: turn it into a pure event publisher. The parity layer's subscriber drives the DOM mirror.
- **Timed transitions** (e.g., a 820ms setTimeout that flips `dataset.semanticDive` from `'transitioning'` to `'active'`): the timing effect is lost when you remove the direct write. Parity-attrs computes the value from store state, which flips instantly. To preserve the timing visual, add a `transitionStartedAt` timestamp to the store and have parity-attrs read it + duration to compute intermediate phases. For a first pass, document the trade-off in a comment.

**Verification:**
- `grep -r "document.body.dataset" src/` — the only matches should be in `parity-attrs.ts`.
- Run `npm run check` (svelte-check + build) — 0 errors.
- Run `npm run test:unit` — all tests pass.
- Run the parity-attrs focused test if one exists (`vitest run tests/unit/svelte-parity-attrs.test.js`).

### Pattern C: Bridge State Path Incomplete

**Symptom:** A bridge function (in `bridge.ts` that mediates between Svelte stores and the legacy JS engine) only writes a critical state field in the **fallback** path, not the primary path. For example, `switchView()` updates `_state.currentView = view` only when `_viewController` is null (fallback path), so the primary path (with animation) leaves the legacy engine's RAF loop reading a stale view.

**How to diagnose:**
1. Find the bridge method — it has a conditional: `if (_viewController) { ... } else { fallback... }`.
2. Check which state fields are written in the fallback but NOT in the primary path.
3. Check which fields the legacy engine's RAF loop reads — those must be updated in ALL paths.

**Fix:**
1. Hoist the state field update *above* the conditional so it fires in both paths.
2. Add a comment explaining the invariant: "Always mirror the requested X onto the legacy state so the imperative RAF loop reads the new value immediately, even when the legacy controller is also driving the animation/handoff."
3. Only the *callbacks* (notifications to Svelte) stay in the conditional.

**Verification:** After the fix, call the bridge method with the primary path active (i.e., `_viewController` is set), then read the legacy state directly — it should reflect the new value instantly, not after the animation completes.

### Pattern D: Parity Manifest Gap

**Symptom:** The parity-attrs manifest enumerates which body `data-*` attributes the parity layer owns. Some attributes that Svelte modules write are missing from this manifest. When dual writers in those modules are removed (Pattern B), the missing attributes stop being synced to the DOM.

**How to diagnose:**
1. Read the `PARITY_ATTRIBUTES` manifest in `parity-attrs.ts`.
2. Grep for `document.body.dataset` in `src/` (after removing dual writers, the grep should return only parity-attrs.ts). For any match that ISN'T in the manifest, add it.
3. Additionally, read the focus and camera stores — check if they export store values that correspond to body attrs readers expect (e.g., `focusTransition`, `cameraSlack`). These should be in the manifest even if no Svelte module writes them directly — parity-attrs should be the sole source.

**Fix:**
1. Add manifest entries for each missing attribute:
   ```ts
   { key: 'focusTransition', description: '...', source: 'focusStore.transitionMode' },
   ```
2. Import any additional stores needed (e.g., `cameraStore`).
3. Add the value derivation in `computeParityAttributes()`'s return map.
4. Add the store subscription in `installParityAttributeSync()`.
5. Add test assertions in the parity-attrs test file to lock in the contract.

**Verification:**
- The focused test (`svelte-parity-attrs.test.js`) should now have a test asserting `PARITY_ATTRIBUTE_KEYS` includes the new attr.
- A compute-parity-attributes test should verify the new attr reflects the right store value.
- A full install test should verify the attr appears in `document.body.dataset` after installation.

## Workflow

For a batch of findings covering multiple patterns:

1. **Read all files mentioned** in the findings before making any edits. Identify which pattern(s) each finding maps to.
2. **Process findings in dependency order:**
   - Manifest gaps (Pattern D) first — parity-attrs needs to know about the attribute before you remove dual writers.
   - Then remove dual writers (Pattern B).
   - Then fix bridge paths (Pattern C).
   - Then fix incomplete resets (Pattern A) — these are self-contained.
3. **Run verification gate after every finding:**
   ```bash
   npm run check          # svelte-check + build: 0 errors
   npm run test:unit      # all unit tests pass
   vitest run tests/unit/svelte-parity-attrs.test.js  # parity test passes
   ```
4. **Adversarial review** per finding:
   - CSS: does any CSS selector depend on the removed attribute? (grep the value in `css/`)
   - Test contracts: does any test assert on the removed/different value? (grep in `tests/`)
   - Edge cases: what happens during async transitions? When stores update synchronously in a chain, does parity recompute correctly?
   - Parallel writers: Are there out-of-scope files (e.g., `focus.ts`, `camera.ts`) that still write the same attr? Note them as follow-up scope.

## When Not to Use

- **Single-bug debug:** use a simpler targeted fix without the full four-pattern workflow.
- **CSS-only parity:** parity surface issues that are purely CSS selector/value mismatch don't need this (use CSS ownership checking instead).
- **Before the parity audit is complete:** this skill presupposes you have a concrete list of findings. If you're still discovering what's broken, run the audit skill first.
