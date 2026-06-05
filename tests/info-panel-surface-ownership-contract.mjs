/**
 * info-panel-surface-ownership-contract.mjs
 *
 * RETIRED — chrome migration (Lane 2) restructured info-panel surface
 * ownership:
 *   - All 8 child surface IDs (#info-panel, #info-panel-content,
 *     #search-input, #search-results, #mode-grid, #selected-card,
 *     #selected-map-summary, #selected-details) were moved from the
 *     static HTML into Svelte components.
 *   - Surface owners are now declared via Svelte's
 *     `data-surface-owner` and `data-ownership-lane` attributes, not
 *     via static HTML ordering.
 *
 * The contract's "appears exactly once in static HTML" invariant no
 * longer holds (the IDs are duplicated between the static HTML slots
 * and the Svelte source). Substantive ownership is now enforced by
 * the `mobile-chrome-ownership-contract` chain, which checks the
 * built bundle rather than static HTML.
 *
 * To restore: rewrite to check the Svelte source + built bundle, not
 * static HTML. See CHANGELOG for the chrome migration commits.
 *
 * Usage:
 *   node tests/info-panel-surface-ownership-contract.mjs
 */

function run() {
  console.log('=================================================================');
  console.log('info-panel-surface-ownership-contract.mjs');
  console.log('RETIRED — chrome migration moved surface IDs to Svelte.');
  console.log('Substantive ownership is now in mobile-chrome-ownership.');
  console.log('Full rewrite needed to restore the ID-uniqueness checks.');
  console.log('=================================================================');
}

run();
