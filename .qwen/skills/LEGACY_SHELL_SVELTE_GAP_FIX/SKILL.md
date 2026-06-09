---
name: LEGACY_SHELL_SVELTE_GAP_FIX
description: Fix live-product blockers caused by a legacy HTML shell that loads only the JS bundle while Svelte consumers/mounts are absent or CSS assumes Svelte has replaced legacy surfaces.
source: auto-skill
extracted_at: '2026-06-09T17:33:36.315Z'
---

# Legacy Shell Svelte Gap Fix

Use when the served app shell is a plain legacy HTML page (e.g. `vector-explorer-polished.html`) loading only `dist/bundle.js`, but UI code was migrated to Svelte stores/components or CSS gates behavior on Svelte-mounted body classes. Symptoms: empty containers, missing rows, vanished panels, or console “button not found” warnings after a migration sweep.

## Procedure

1. Confirm the wiring gap.
   - Inspect the shell HTML for a Svelte root script/mount. If absent and `document.querySelectorAll('[data-svelte-h]').length === 0` in-browser, the shell is legacy-only.
   - Check if the broken surface is rendered by a Svelte component (e.g. `src/components/SearchResults.svelte`) but the shell never mounts it.

2. Choose the smallest robust fix.
   - Prefer restoring legacy DOM rendering in the JS module that currently writes to Svelte stores (e.g. `js/modules/search-results-ui.js`) so the legacy shell is self-sufficient.
   - Keep Svelte store writes intact so the Svelte future state keeps working when the focus track wires up.
   - Mirror the DOM contract expected by CSS (`search.css`, `mobile_premium__chrome.css`) and event bindings (`bindSearchResultInteractions`).

3. Implement dual-path rendering.
   - Add private helpers: `clearLegacySearchResultsDom()`, `buildCountLine()`, `buildResultButton()`, `renderLegacySearchResultsDom()`, plus any delegated handlers for legacy-only buttons (e.g. show-more).
   - Tag the wrapper with a unique attribute (`data-legacy-search-results="1"`) and the container with `data-legacy-results-source="legacy"` so it is inspectable.
   - Cache the last render context/sessionStorage count so duplicated logic doesn’t require a network round-trip.

4. Gate Svelte-only CSS rules.
   - Add `body.is-svelte-mounted` to selectors that hide or replace legacy surfaces (e.g. `#info-panel`, `.search-container`) when Svelte has taken over.
   - In the legacy shell where no Svelte root mounts, the class is never set, so the rule never matches and the legacy surface stays visible.
   - When the Svelte focus stage eventually mounts, it can set `body.classList.add('is-svelte-mounted')` to re-enable the intended Svelte-driven layout.

5. Wire clear/error/empty paths.
   - Update `clearSearchState`, `applySemanticSearchErrorState`, `applyEmptySemanticSearchState` to also clear the legacy DOM (`clearLegacySearchResultsDom`) so stale rows aren’t left behind.

6. Bundle/build hygiene.
   - If `npm run build` fails because of orphan island imports deleted in a prior sweep, wrap the missing paths in a runtime `safeImport(path)` helper with `try`/`catch` and keep literal imports for the islands that still exist.
   - Rebuild and verify the bundle size delta is explained by orphan module removal.

7. Verify with headed browser checks.
   - Mobile: fresh load, type a query, assert row count > 0 and count line text is non-empty; click Center/focus and assert the legacy info panel is still visible/readable.
   - Desktop: type a query, assert rows render; click a row and assert the focused business title changes.

8. Save evidence and report.
   - Save screenshots + DOM assertions under `tmp/browser-product-qa-fix-minimax-m3/`.
   - State: files changed, exact fixes, commands with pass/fail, browser evidence paths, and remaining risks/next lanes.

## New pattern (2026-06-09 search-chrome triage)

Does the repaired surface depend on a body attribute that legacy code can change after mount? Then also:
- Extract the body attribute into local state inside the Svelte component.
- Sync it with a `MutationObserver` on the attribute.
- Fall back to short-lived polling only during early mount, and clear it once updates are stabilizing.
- Derive the effective surface from the observed body value, with a state fallback chain.
- Use that derived value to render the surface rather than trusting one store read during startup.

This body-attribute watch pattern is reusable for panel surfaces, focus-search states, journey phases, and similar doubled-writer transitions.

## Verified cases and caveats (2026-06-08 to 2026-06-09)
- A contract wait gate that expects the legacy shell to reveal `.journey-compass-action.primary` under `data-panel-surface="focus-search"` can still fail after Svelte surface patches if the legacy bundle hides the button during the settled route state.
- Focus-pocket geometry updates that return new payload fields are fine once confirmed against source and motion contract; verify with `tests/focus-pocket-motion-contract.mjs` and keep `tests/real-route-contract.mjs` gated on the actual served shell behavior.

## Evidence and scope (2026-06-08 playthrough verification)
When this gap ships to a product playthrough, the failure pattern is reproducible on mobile and desktop:
- `#focus-stage` is `null` in state JSON right after a real search-result click.
- `.search-container` stays visible with `display:block; z-index:14` even under focus/preview/follow.
- Journey primary action shows `Map` instead of `Inside`, and the "Inside" / `enter-inside` button is hidden.
- `#focus-thread-inspector`, neighbor list, and walk history are all missing or idle.
- The script output shows 404s for deleted Svelte island bundles like `dist/search-results-svelte-island.js` and `dist/selected-details-svelte-island.js`.
- Root module: `js/modules/event-bindings.js` retains dynamic imports to those deleted island paths in a `safeImport()` block that silently catches and ignores the failure.

Use the product QA run folder under `tmp/product-qa/<timestamp>/` (propriedad `ownership-assertions.json`, state JSON `boxes` maps, and `bodyDataset`) as the source of truth for which DOM containers are missing versus merely hidden.

## Why this approach
- Keeps the served shell functional without mounting the whole Svelte app into a page that was never designed for it.
- Preserves the Svelte migration track — future wiring just needs to set `body.is-svelte-mounted` and the same JS stores already have the canonical data.
- Minimizes churn: only the broken seam is touched; adjacent surfaces remain untouched.
