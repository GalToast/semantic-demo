---
name: Svelte Migration Parity Audit
description: Systematic audit of a JS → Svelte/TS migration for component parity, store coverage, bridge wiring, dead code, and documentation drift. Finds functional gaps between legacy and new tracks.
source: auto-skill
extracted_at: '2026-06-06T20:48:52.571Z'
---

# Svelte Migration Parity Audit

Run this when verifying the completeness of a JS → Svelte/TypeScript migration. It covers ten layers: component mounting, store data flow, bridge event surface, legacy export parity, DOM parity-attr integrity, doc drift, attribute value domain mapping, legacy-state direct mutation (store desync), test infrastructure bridge globals, and cross-track copy detection (3-way hazard).

## The Ten-Layer Audit

### Layer 1: Component Mount & Visibility
Check what's actually **rendered** vs what's only imported:
1. In the root component (App.svelte or similar), grep for every `<ComponentName>` in the template.
2. For each component, check its `visible`/`open`/`expanded` prop — is anything always `false`?
3. For each component marked as "Complete" in docs, verify it mounts and renders real content in the browser.
4. Look for commented-out component tags (`<!-- <Component /> -->`) that indicate unused imports.

**Key findings:** dead code, unrendered completed components, misleading doc claims.

**Special pattern — Imported but never rendered:** A component can be fully implemented (all props wired, store connections live) yet never appear in the DOM because it is missing from the template despite being imported. Detection: grep the component name in the `<script>` imports list and in the template body — a hit in imports but zero template tags equals a render gap. This is a HIGH finding because users see zero behavior from a feature that the Svelte track claims to own.

### Layer 2: Store → Component Data Flow
For every component that reads from a store:
1. **Find all store reads** in the component's `<script>` — `$storeName`, `get(storeName)`, `$derived(...)`.
2. **Trace the write side:** who calls the setter function that populates that store? Is there a real caller (not just a stub or the definition)?
3. **Check for stub implementations:** grep for `return null`, `return false`, `// No-op`, `// Bridge stub`, `// Placeholder` in the store action functions and any orchestration files that mediate between engine and store.
4. **Verify:** if a store derived value drives UI (e.g., `$focusPocketNodes`), does any code path actually call the setter with real data?

**Key findings:** stores that are never written, components that read `[]`/`null` forever, stubs that silently drop data.

### Layer 3: Bridge Event Surface
The Svelte → legacy bridge exposes callbacks. Verify each:
1. Read the bridge interface — what callbacks does it define (`onNodePicked`, `onNodeHovered`, `onViewChanged`, etc.)?
2. In the component that instantiates the bridge (usually `Canvas.svelte`), check which callbacks are actually passed.
3. For each **unused** callback, determine what state it should update — does the absence mean hover tracking is dead? View changes are lost? Context-loss handling is missing?

**Key findings:** half the event surface is dead. Hover, view-changed, context-loss, loading-progress callbacks unmapped.

### Layer 4: Legacy Export Parity
Compare the legacy module's export surface against what the Svelte side provides:
1. `grep "^export"` the legacy `.js` module — list every exported function.
2. `grep "^export"` the Svelte replacement `.ts` module — list every exported function.
3. Diff the two lists with: `diff <(grep "^export" js/old.js | sort) <(grep "^export" src/lib/new.ts | sort)`
4. For each function missing from the Svelte side: is it a deliberate omission (not needed) or a gap?
5. For each stub in the Svelte side (`return null`, `return false`): is there an open task to port it?

**Key findings:** unmigrated functions that break contracts, stubs that silently change behavior.

### Layer 5: DOM Parity-Attr Integrity
If the migration uses body `data-*` attributes for CSS coexistence:
1. Read the parity-attr installer module — what keys does it claim to own?
2. Check which of those keys are computed from **store values** vs **read from `document.body.dataset`** (circular dependency smell).
3. For store-derived attrs: verify the source store actually gets updated. For DOM-read attrs: trace the write side that eventually sets them.
4. Check for redundant writers: does App.svelte have a `$effect` that also writes the same attr? Two writers racing on the same attribute.
5. Verify each attr value matches what the legacy CSS expects (e.g., grep legacy CSS for `[data-mode="trail"]` to see if `"trail"` is a valid value).

**Key findings:** pure functions that depend on DOM (untestable), circular write patterns, attr value drift from CSS expectation, redundant writers.

### Layer 6: Documentation Drift
Docs often say one thing and code says another:
1. Read the project README, AGENTS.md, ARCHITECTURE.md for any status tables, progress claims, or component counts.
2. Verify each claim against the actual files: line counts, TODO counts, render state (`visible={true}` vs `{false}`), import resolution.
3. Check for claims about "stubs" or "partials" that are now complete, and vice versa.

**Key findings:** stale docs that misdirect the next worker — the most common source of wasted effort.

### Layer 7: Parity Attribute Value Domain Mapping
Parity attrs can be *present* but *wrong* — the right key, wrong semantic domain. This is harder to catch than missing attrs.

1. Read the `PARITY_ATTRIBUTES` manifest description for each key — what domain of values does it claim (e.g., `idle|checking|synthesizing|active|interrupted`)?
2. Find the corresponding line in `computeParityAttributes()`'s return map.
3. **Verify the value's semantic domain matches the manifest.** Example: if the manifest says "compass lifecycle phase (idle|checking|synthesizing|active|interrupted)" but the code writes `nav.mode` (overview|search|focus|inside|map), the attr is *present* but semantically **wrong** — the two domains happen to overlap on some values, passing naive tests.
4. Check what legacy CSS and test code actually expect: grep for `[data-key="expectedValue"]` in CSS and for the attr name in tests.
5. Cross-reference with the legacy JS module that originally wrote this attr — are they computing the same value from the same state machine?

**Key findings:** attrs that exist but carry wrong-domain values; false-positive tests that only check for *presence*, not *correctness*; CSS selectors that never fire.

### Layer 8: Legacy State Direct Mutation (Store Desync)
In a dual-track migration (Svelte stores + legacy `state.js`), any code that mutates `state.js` directly **must** also update the corresponding Svelte store. Missing mirror = stale Svelte UI.

1. Grep for patterns that write to the legacy state: `state\.navState\.`, `state\.trailDepth`, `state\.focusedNode`, `state\.semanticDiveMode`, `state\.currentView`, `state\.renderer`, `state\.scene`.
2. Check for `withMutation()` / `withStateMutation()` wrapping — writes within these blocks are legitimate legacy-track state changes.
3. For each legacy write in `src/` (the Svelte migration track), trace whether the corresponding Svelte store also gets updated (via `navStore.update()`, `focusStore.update()`, `dispatchNavTransition()`, `searchStore.update()`, etc.).
4. **Critical check:** `demo-choreography.ts`, `camera-choreography/`, `canvas-hover.ts`, and other engine-side modules in `src/lib/` — these run inside the Svelte track but sometimes mutate legacy state directly (for RAF loop consumption) without updating Svelte stores.
5. Check for the reverse: legacy `.js` files that mutate `state.js` but should also trigger store updates via the event bus or bridge callbacks.

**Key findings:** silent desyncs where user interactions (demo completion, camera arrival, canvas click) change the legacy state and thus the *next* frame, but the Svelte UI layer (reading from stores) shows stale values until the parity layer coincidentally recomputes.

### Layer 9: Test Infrastructure Bridge (Global Contract Surface)
When the migration track runs standalone (e.g., `npm run dev:svelte`), Playwright contract tests rely on `window.__APP_STATE__`, `window.__APP_ACTIONS__`, `window.__TEST_STATE__` — globals that the legacy `app.ts` sets during init. The migration track's bridge must provide an equivalent surface.

1. Grep `tests/` for all test-facing globals: `window.__APP_STATE__`, `window.__TEST_STATE__`, `window.__APP_ACTIONS__`, `window._getSelectedBusinessRoleLabel`.
2. Count references — this tells you how many assertions or `waitForFunction` calls depend on each global.
3. In `src/lib/engine/bridge.ts`, check whether `__APP_STATE__` is set during `init()` — does it point to the **legacy state singleton** or a Svelte-store-derived snapshot? If the former, tests reading it after a Svelte-only state change see stale data.
4. Check whether `__APP_ACTIONS__` is set at all in the Svelte track — this is the most common omission. Each action (e.g., `focusOnNode`, `setSemanticDiveMode`, `clearSearch`) must be wired to the corresponding Svelte store action.
5. **Dual-writing risk:** Both `app.ts` (legacy) and `bridge.ts` (Svelte) may set `__APP_STATE__` to different objects, and whichever runs last wins. In the hybrid shell, this can lead to race conditions between the legacy init and the bridge init.

**Key findings:** tests that silently pass in the legacy shell but silently fail in the Svelte track; actions that do nothing because the Svelte equivalent was never wired; stale `__APP_STATE__` content that tests assert against after Svelte state transitions.

### Layer 10: Cross-Track Copy Detection (3-Way Hazard)
When core logic is independently re-implemented in JS (legacy worker), TS (data-loader), and TS (dom-formatters), with different function names and possibly different sentinel sets — the copies will diverge over time. This creates latent bugs that only surface as edge-case data arrives.

1. Grep for the same-sentinel-set pattern across both tracks. Look for `['unknown', 'not found', 'none', 'none detected', 'n/a', 'null']` or `NULLISH_SENTINELS` or similar filter lists.
2. For each match, note the file, function name, and the exact set of sentinels.
3. Diff the sets — if one copy has different members (or a different fallback behavior), that's a data corruption path. Example: a business with status `"none detected"` might be treated as null in one track and valid in another.
4. Check whether newer TS modules import from the canonical utility function or define their own private copy. Private copies with a different name (`cleanOptional` vs `cleanOptionalValue`) are a maintenance trap even if functionally identical today.
5. Extend beyond sentinel filters: look for duplicate implementations of the same normalization logic (city trimming, UI helpers, NAICS parsing, etc.) with different names or signatures.

**Key findings:** silent data corruption when one track's sentinel filter accepts a value another track rejects; maintenance traps where updating one copy leaves the others stale; subtle edge-case regressions after a "fix" only touches the canonical copy.

## Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| **HIGH** | Functional state never reaches the UI; user-facing data is missing | Focus pocket nodes never populated; overlay shows empty |
| **MEDIUM** | Feature degraded, contract broken, or architecture smell that will cause bugs | 4-phase loading collapsed to 2; parity-attrs reads DOM; event callbacks unused |
| **LOW** | Code smell, redundant writers, brittle paths, docs out of sync | `!important` in CSS, stale AGENTS.md table, unused imports |

## Output Format

For each finding, record:
```
### N. One-line title — SEVERITY
- **Paths:** relevant file paths
- **Bug:** concise statement of the gap
- **Why it matters:** impact on user or tests
- **Verify:** a shell command, browser check, or test to reproduce
- **Suggested fix:** brief approach
```

Always provide verification commands or browser steps so the next worker (or a human) can confirm the finding independently.

## When Not to Use

This skill is for **migration audits at scale** — when you're checking whether a whole Svelte/TS track is correctly wired. It's overkill for:
- Adding a single component
- Debugging a specific CSS issue
- A simple store refactor
