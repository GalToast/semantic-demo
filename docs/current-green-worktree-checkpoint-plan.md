# Proposed Commit/Checkpoint Plan - Wave 15 Cleanup

This plan groups the current Green Worktree changes into logical checkpoints for review and landing.

## 1. Build & Tooling (Foundation)
Stabilizes the build system, TypeScript configuration, and base dependencies.
- `package.json` / `package-lock.json`
- `eslint.config.js`
- `scripts/build-app.mjs` (New declarative build)
- `tsconfig.json` / `tsconfig.typecheck.json` (New strict typing foundation)
- `types/` (Ambient declarations)

## 2. Svelte Migration Phase 2 (Declarative UI)
The core shift from manual DOM manipulation to Svelte reactive components.
- `js/modules/stores.js` (Shared reactive state)
- `js/modules/components/App.svelte` (Unified root)
- `js/modules/components/InfoPanel*.svelte` (Surface decomposition)
- `js/modules/components/SearchResultsList.svelte` (Declarative search)
- `js/modules/components/SelectedBusinessDetails.svelte` (Declarative details)
- `js/modules/components/LegendPanelChrome.svelte`
- `js/modules/view-models/` (Data transformation logic)
- `js/modules/app-svelte-island.js` (Mounting entry)

## 3. Search & Data Schema (Hardening)
Standardizes the positional array format and safe DOM builders.
- `js/modules/utils/data-schema.js` (Single source of truth for columns)
- `js/modules/utils/data-mapper.js` (Safe record parsing)
- `js/modules/utils/dom-builder.js` (Secure XSS-resistant factory)
- `js/modules/search-filter-core.js` (Consolidated logic)
- `js/modules/search-results-ui.js` / `js/modules/search-state.js` (Integration)
- `js/modules/exploration-mode.js` (Extracted mode logic)

## 4. Dewindowing & Engine Lifecycle (Core Refactor)
Clears legacy `window.*` globals and improves GPU memory hygiene.
- `js/modules/app.js` / `js/modules/lifecycle.js` (Lifecycle decomposition)
- `js/modules/three-engine.js` (Resource disposal)
- `js/modules/webgl-context.js` (Unified hardware state)
- `js/modules/bindings/` (Adapter cleanup)
- `js/modules/*-adapter.js` (Bridge reduction)
- `js/modules/three-*.ts` (TypeScript porting of engine internals)

## 5. CSS & Shell Alignment (Visual)
Aligns the app shell and styles with the new component model.
- `vector-explorer-polished.html` (Flattened shell)
- `css/mobile_premium__state.css` (State machine cleanup)
- `css/shell.css` / `css/mobile_premium__narrow.css`
- `semantic-demo.css`

## 6. Verification & Contracts (Green Gate)
Updates the contract suite to match the new architecture.
- `tests/contracts.manifest.json`
- `tests/exploration-modes-contract.mjs`
- `tests/state-ownership-contract.mjs`
- `tests/filter-ownership-contract.mjs`
- `tests/data-schema-contract.mjs`
- `tests/three-resource-lifecycle-contract.mjs`
- `tests/unit/` (View model coverage)
- `tests/cache-buster-check.js`
- `tests/shell-contract-check.js`
- Remaining architectural contracts in `tests/`

---

## ⚠️ Suspicious Files (Review Recommended)
These files do not obviously belong in the final landing set and may be transient artifacts or local dev tools:
- `.codex/` (Likely local extension data)
- `nocheck.js` (Unknown purpose)
- `refactor-config.cjs` / `scripts/refactor-filters.cjs` (Migration tools)
- `test-regex.cjs` (Debug tool)
- `vector-explorer-polished.html.restored` (Backup file)

## Verification Status
- [x] `npm run build` PASS
- [x] `npm run test:contract` (71/71) PASS
- [x] `git diff --check` CLEAN (except known CRLF)
