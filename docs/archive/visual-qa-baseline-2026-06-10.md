# Visual QA Baseline — 2026-06-10

**Runner:** Visual QA worker, automated suite
**Date:** 2026-06-10 ~02:00 UTC
**Baseline status:** GREEN — all suites pass

## Summary

| Suite | Result |
|---|---|
| `npm run test:contract` | **72/72 passed** |
| `npm run test:unit` | **339/339 passed** |
| `npm run test` (fast static) | **All passed** (9 sub-checks + typecheck) |
| `npm run qa:contract:all` | **225/225 passed, 0 failures** |

**No failures in any suite.** All checks are green.

---

## 1. Contract Tests (`npm run test:contract`)

72 contract files executed against a built-in static server on dynamic port 8796. All passed.

| # | File | Duration |
|---|---|---|
| 1 | semantic-dive-ui-surface-contract.mjs | 1.02s |
| 2 | search-state-surface-contract.mjs | 570ms |
| 3 | lifecycle-composition-contract.mjs | 609ms |
| 4 | state-transition-contract.mjs | 594ms |
| 5 | state-transition-table-contract.mjs | 131ms |
| 6 | step-inside-state-sync-contract.mjs | 624ms |
| 7 | focus-semantic-state-boundary-contract.mjs | 570ms |
| 8 | journey-compass-state-contract.mjs | 233ms |
| 9 | semantic-lane-contract.mjs | 203ms |
| 10 | connection-analysis-contract.mjs | 195ms |
| 11 | camera-controls-motion-contract.mjs | 539ms |
| 12 | focus-pocket-motion-contract.mjs | 874ms |
| 13 | focus-pocket-composition-contract.mjs | 728ms |
| 14 | journey-event-bindings-contract.mjs | 111ms |
| 15 | demo-init-seam-contract.mjs | 115ms |
| 16 | reset-callsite-routing-contract.mjs | 736ms |
| 17 | demo-camera-retirement-contract.mjs | 390ms |
| 18 | cluster-labels-contract.mjs | 192ms |
| 19 | journey-thread-inspector-contract.mjs | 183ms |
| 20 | trail-review-focus-contract.mjs | 149ms |
| 21 | journey-walk-thread-neighbor-timer-contract.mjs | 152ms |
| 22 | journey-focus-ui-extraction-contract.mjs | 107ms |
| 23 | journey-point-color-contract.mjs | 117ms |
| 24 | journey-ui-ownership-contract.mjs | 86ms |
| 25 | share-view-clipboard-contract.mjs | 85ms |
| 26 | keyboard-help-aria-contract.mjs | 80ms |
| 27 | pathfinding-contract.mjs | 141ms |
| 28 | weather-lifecycle-contract.mjs | 83ms |
| 29 | weather-surface-ownership-contract.mjs | 111ms |
| 30 | camera-auto-rotate-settle-contract.mjs | 102ms |
| 31 | semantic-dive-reverse-contract.mjs | 1.26s |
| 32 | journey-window-surface-contract.mjs | 107ms |
| 33 | thread-inspector-dewindowing-contract.mjs | 118ms |
| 34 | journey-cluster-accent-dewindowing-contract.mjs | 103ms |
| 35 | window-bridge-gaps-contract.mjs | 87ms |
| 36 | residual-window-bridge-inventory-contract.mjs | 138ms |
| 37 | next-explore-candidate-contract.mjs | 149ms |
| 38 | ui-renderers-helper-contract.mjs | 776ms |
| 39 | lifecycle-semantic-guide-residual-bridge-contract.mjs | 104ms |
| 40 | legend-ui-ownership-contract.mjs | 127ms |
| 41 | semantic-dive-ui-dewindowing-contract.mjs | 96ms |
| 42 | lifecycle-search-panel-ownership-contract.mjs | 107ms |
| 43 | lifecycle-journey-quick-dewindowing-contract.mjs | 106ms |
| 44 | search-lifecycle-adapter-contract.mjs | 107ms |
| 45 | view-controller-ownership-contract.mjs | 141ms |
| 46 | loading-ui-contract.mjs | 111ms |
| 47 | state-ownership-contract.mjs | 1.18s |
| 48 | state-mutator-ownership-contract.mjs | 202ms |
| 49 | filter-ownership-contract.mjs | 116ms |
| 50 | cluster-filter-city-filter-side-effect-contract.mjs | 847ms |
| 51 | keyboard-reset-ownership-contract.mjs | 97ms |
| 52 | cluster-filter-dewindowing-contract.mjs | 98ms |
| 53 | search-state-ui-adapter-contract.mjs | 102ms |
| 54 | search-panel-adapter-contract.mjs | 97ms |
| 55 | exploration-modes-contract.mjs | 114ms |
| 56 | scene-reveal-contract.mjs | 113ms |
| 57 | scene-reveal-camera-dewindowing-contract.mjs | 136ms |
| 58 | webgl-restore-dewindowing-contract.mjs | 145ms |
| 59 | three-setup-init-dewindowing-contract.mjs | 225ms |
| 60 | cancel-animate-dewindowing-contract.mjs | 117ms |
| 61 | three-setup-loop-dewindowing-contract.mjs | 100ms |
| 62 | three-setup-zero-caller-dewindowing-contract.mjs | 116ms |
| 63 | scene-atmosphere-contract.mjs | 106ms |
| 64 | motion-state-contract.mjs | 113ms |
| 65 | demo-state-sync-contract.mjs | 100ms |
| 66 | three-visual-polish-contract.mjs | 107ms |
| 67 | search-peek-expanded-render-contract.mjs | 32.69s |
| 68 | semantic-guide-payload-contract.mjs | 294ms |
| 69 | connection-analysis-render-state-contract.mjs | 307ms |
| 70 | reduced-motion-interruption.spec.js | 12.44s |
| 71 | gemma-fallback-error.spec.js | 14.59s |
| 72 | selected-card-dom-ownership-contract.mjs | 302ms |

---

## 2. Unit Tests (`npm run test:unit`)

36 test files, 339 tests. All passed. Duration: ~21s.

No individual test failures to report.

---

## 3. Fast Static Checks (`npm run test`)

All 9 sub-checks plus typecheck passed:

| Check | Result |
|---|---|
| `check:shell` | vector-explorer-polished.html is the only app shell |
| `check:manifest` | CSS manifest OK, 251 script targets OK, CSS self-reference OK |
| `check:cache` | Cache-buster check OK |
| `check:config-topology` | 6/6 topology checks passed (api/config.php, deploy.sh, deploy.ps1, .gitignore, .env.example, alignment) |
| `check:ownership` | CSS ownership OK, focus-stage ownership OK, transient state OK, composition state OK, map-focus-search RETIRED, search-sheet OK, mobile-chrome OK, info-panel RETIRED |
| `check:tokens` | Design token doc contract OK (126 root tokens), JS/WebGL tokens OK |
| `check:surface-styles` | Surface style matrix OK (27 visual states) |
| `check:semantic-space` | Semantic space audit OK (8406 rows, 100872 edges, 0 missing refs), relationship role contract OK (7 active roles) |
| `typecheck` | tsc --noEmit OK (0 errors) |

### Retired Contracts (not failures)

Two ownership contracts are intentionally retired after chrome migration:
- `map-focus-search-content-owner-contract.mjs` — moved to Svelte
- `info-panel-surface-ownership-contract.mjs` — moved to Svelte

---

## 4. Surface Contract Assertions (`npm run qa:contract:all`)

20 surfaces, 225 assertions, 0 failures. All headed.

| Surface | Pass | Fail | Duration |
|---|---|---|---|
| mobile-idle | 7 | 0 | 5.4s |
| desktop-idle | 5 | 0 | 5.8s |
| launch-focus | 7 | 0 | 7.5s |
| search-error | 8 | 0 | 5.3s |
| search-no-results | 14 | 0 | 33.7s |
| map-trail | 9 | 0 | 3.8s |
| focus-pocket | 11 | 0 | 6.1s |
| field-node | 24 | 0 | 8.0s |
| info-panel-empty | 10 | 0 | 5.6s |
| compass-rail | 12 | 0 | 4.9s |
| loading-overlay | 11 | 0 | 1.5s |
| mode-grid | 9 | 0 | 4.0s |
| filters | 11 | 0 | 4.5s |
| thread-inspector | 6 | 0 | 5.2s |
| controls | 9 | 0 | 5.2s |
| search-chrome | 32 | 0 | 5.3s |
| mobile-product-focus-route | 7 | 0 | 11.1s |
| mobile-product-preview-route | 6 | 0 | 9.5s |
| info-panel-populated | 17 | 0 | 6.7s |
| global-spacing | 10 | 0 | 4.9s |

**Total: 225 pass / 0 fail**

---

## Notes

- All suites were run sequentially on a single machine with no background servers pre-started.
- The test runner auto-starts its own static server where needed (test:contract, qa:contract:all).
- No source files were modified during this QA run.
- `ExperimentalWarning: --experimental-loader` warnings are cosmetic Node.js warnings, not test failures.
- `search-no-results` is the slowest surface (33.7s) due to search-result rendering timing.
- Previously-failing surfaces (thread-inspector, focus-pocket, field-node, info-panel-empty, compass-rail, search-no-results, mode-grid) all pass as of this run.
