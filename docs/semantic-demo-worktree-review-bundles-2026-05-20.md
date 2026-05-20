# Semantic Demo Worktree Review Bundles — 2026-05-20

Status: draft review map — do not commit until active workers finish

## Purpose

The worktree contains changes from multiple accepted worker waves plus three active follow-up workers. This document maps all modified and new files into coherent review bundles, identifies verification commands per bundle, and flags cross-worker ownership risks.

---

## Active Follow-Up Workers (do not re-work until they sign off)

| Worker ID | Owner | Scope |
|---|---|---|
| `semantic-gemma-fallback-followup-1779287625817` | Gemma/story fallback completeness + deterministic fallback tests | `tests/semantic-guide-fallback-contract.spec.js`, `js/modules/semantic-guide-payload.js` |
| `semantic-a11y-focus-followup-1779287626643` | Focus restoration + ARIA fixes | info panel, legend, related controls |
| `semantic-reduced-motion-interrupt-followup-1779287627752` | Reduced-motion interruption/recovery proof | `tests/reduced-motion-*.mjs` |

Do not edit files in the above scopes unless coordinating via switchboard.

---

## Bundle A — CSS/UI Ownership

### Changed CSS files (12 files, net +476 / -243 lines)

| File | Notable changes | Risk |
|---|---|---|
| `css/controls.css` | +54 lines | new controls surface |
| `css/time_weather.css` | large rewrite (-221 / +offset) | highest churn |
| `css/strands.css` | restructured (-76 / +offset) | cascade ownership |
| `css/mobile_premium_surfaces.css` | +150 lines — new file? | new surface added |
| `css/mobile_premium_state.css` | +110 lines | mobile state ownership |
| `css/search.css` | +54 / -offset | search surface |
| `css/journey_active.css` | +24 / -offset | journey active state |
| `css/clusters.css`, `css/layout_base.css`, `css/animations.css`, `css/progressive_disclosure.css`, `css/mobile_premium.css` | small deltas | low risk |

### New CSS-adjacent

| File | Notes |
|---|---|
| `semantic-demo.css` | monolithic artifact — verify if still needed vs. modular CSS |

### Verification commands

```powershell
# CSS diff check
git diff --stat css/

# Check no new !important regressions
rg "important" css/ --no-heading | rg "!important"
```

---

## Bundle B — JS Extraction / Runtime

### Core JS modules (22 files, net +681 / -1250 lines — large reduction)

| File | Notable changes | Risk |
|---|---|---|
| `js/three-setup.js` | largest rewrite, -667 lines net | scene/render core — high risk |
| `js/lifecycle.js` | -344 lines, extracted to other modules | bridge ownership shift |
| `js/search-state.js` | -420 lines, stripped | semantic lane extraction |
| `js/focus-pocket.js` | +81 / -offset | focus motion |
| `js/journey.js` | +67 lines | journey orchestration |
| `js/event-bindings.js` | +42 lines | event bridge |
| `js/camera-controls.js` | +99 lines — new or expanded? | camera control surface |
| `js/micro-demo.js` | +42 lines | micro-demo state |
| `js/cluster-labels.js` | +34 lines | label rendering |
| `js/weather.js` | +28 lines | weather surface |
| `js/utils.js` | +18 lines | utility additions |
| `js/modules/loading-ui.js`, `js/modules/semantic-lane.js`, `js/modules/semantic-threads.js`, `js/modules/semantic-search-api-cache.js`, `js/modules/app.js`, `js/modules/audio-scape.js`, `js/modules/tooltip.js`, `js/modules/journey-thread-model.js`, `js/modules/pathfinding.js` | small deltas | low risk |
| `js/state.js` | +1 line | state entry |

### New JS modules (untracked, 1010 lines total)

| File | Lines | Purpose | Ownership |
|---|---|---|---|
| `js/modules/ui-renderers.js` | 489 | UI rendering utilities | new — not yet assigned owner |
| `js/modules/mycelium-engine.js` | 347 | Mycelium engine logic | new — not yet assigned owner |
| `js/modules/connection-analysis.js` | 115 | Connection analysis | new — not yet assigned owner |
| `js/modules/semantic-guide-payload.js` | 59 | Gemma/story payload | owned by `semantic-gemma-fallback-followup` |

### Verification commands

```powershell
# JS module diff check
git diff --stat js/modules/ js/state.js js/three-setup.js js/utils.js

# Check lifecycle extraction completeness
rg "window\." js/modules/lifecycle.js | Measure-Object

# New module syntax check
node --check js/modules/ui-renderers.js
node --check js/modules/mycelium-engine.js
node --check js/modules/connection-analysis.js
node --check js/modules/semantic-guide-payload.js
```

---

## Bundle C — 3D Scene / Rendering

### Scene files

| File | Changes | Risk |
|---|---|---|
| `js/three-setup.js` | massive rewrite (-667 net lines) | highest risk — 3D scene core |
| `js/modules/camera-controls.js` | +99 lines | camera interaction surface |
| `js/modules/cluster-labels.js` | +34 lines | label rendering in scene |
| `js/modules/journey-thread-model.js` | -1 line | thread model trimming |

### Verification commands

```powershell
# Check three-setup exports
rg "export" js/three-setup.js | Measure-Object

# Verify no orphaned window bridges in scene
rg "window\." js/three-setup.js | Measure-Object
```

---

## Bundle D — QA Contracts

### Modified test files (10 files, +389 / -44 lines)

| File | Changes | Owner |
|---|---|---|
| `tests/surface-contract-check.mjs` | +71 lines | likely surface owner |
| `tests/loading-ui-contract.mjs` | +50 lines — new contract? | loading-ui owner |
| `tests/visual-state-audit.mjs` | +247 lines — large addition | visual audit |
| `tests/css-ownership-check.mjs` | +20 lines | CSS ownership |
| `tests/micro-demo-verify.js`, `tests/shell-contract-check.js`, `tests/demo-init-seam.spec.js`, `tests/micro-demo-contract.mjs`, `tests/focus-pocket-motion-contract.mjs`, `tests/scene-atmosphere-contract.mjs` | small deltas | various |

### New test files (untracked, ~20 new files)

Notable new contracts:
- `tests/extraction-contracts.spec.js` — extraction contract suite
- `tests/semantic-guide-fallback-contract.spec.js` — **owned by follow-up worker**
- `tests/focus-pocket-composition-contract.mjs` — focus pocket composition
- `tests/reduced-motion-interruption-contract.mjs`, `tests/reduced-motion-transition-contract.mjs`, `tests/reduced-motion-scene-diagnostic.mjs` — **owned by follow-up worker**
- `tests/ui-renderers-validation.spec.js` — UI renderers validation
- `tests/polish-adversarial.spec.js` — adversarial polish checks
- `tests/inspect_element.js` — debug helper
- `tests/info-panel-collapsed-render-contract.mjs`, `tests/mode-chip-state-render-contract.mjs`, `tests/focus-stage-render-contract.mjs`, `tests/search-peek-expanded-render-contract.mjs` — render contracts
- `tests/weather-surface-ownership-contract.mjs`, `tests/weather-widget-render-contract.mjs` — weather surface contracts
- `tests/window-bridge-gaps-contract.mjs` — window bridge gaps
- `tests/three-scene-playtest.mjs`, `tests/three-visual-polish-contract.mjs` — 3D scene contracts

### Verification commands

```powershell
# Run contract suite
npm run test:contract

# Or run individual new contracts
node tests/extraction-contracts.spec.js
node tests/ui-renderers-validation.spec.js
```

---

## Bundle E — Docs / Cache / Build Artifacts

### Docs (modified)

| File | Changes |
|---|---|
| `docs/semantic-demo-css-ownership-map.md` | +10 lines |
| `docs/semantic-demo-qa-scripts.md` | +50 lines |
| `docs/semantic-demo-next-seams-2026-05-20.md` | new audit note |

### New docs

| File | Notes |
|---|---|
| `docs/lifecycle-window-bridge-map.md` | new — documents window bridge architecture |
| `docs/semantic-demo-next-seams-2026-05-20.md` | new — current active audit note |

### Build / Config

| File | Changes | Risk |
|---|---|---|
| `dist/bundle.js` | +267 / -offset | build artifact — verify rebuild |
| `package.json` | +23 lines | verify no breaking script changes |
| `package-lock.json` | lockfile churn | normal |
| `.gitignore` | +4 lines | verify new ignores are correct |
| `AGENTS.md`, `README.md`, `TEST_STRATEGY.md` | small doc updates | low risk |
| `vector-explorer-polished.html` | +18 / -offset | verify no content conflicts |

### Verification commands

```powershell
# Verify gitignore entries
git diff .gitignore

# Verify package.json scripts are valid
npm run

# Verify bundle is consistent
node --check dist/bundle.js 2>&1 | Select-String "error" -SimpleMatch
```

---

## Bundle F — Accessibility / Fallback (Follow-up Pending)

**Do not touch until active follow-up workers sign off.**

### Files pending follow-up worker ownership

| File | Follow-up worker |
|---|---|
| `js/modules/semantic-guide-payload.js` | `semantic-gemma-fallback-followup` |
| `tests/semantic-guide-fallback-contract.spec.js` | `semantic-gemma-fallback-followup` |
| `tests/reduced-motion-*.mjs` (4 files) | `semantic-reduced-motion-interrupt-followup` |
| info panel, legend, related controls (ARIA state) | `semantic-a11y-focus-followup` |

---

## Proposed Commit Order

1. **Bundle E first** — docs, gitignore, package.json updates. Low risk, sets context.
2. **Bundle A** — CSS/UI ownership changes. Standalone visual contracts protect this.
3. **Bundle C** — 3D scene / rendering. Run `tests/three-scene-playtest.mjs` and `tests/three-visual-polish-contract.mjs` first.
4. **Bundle B** — JS extraction / runtime. Verify `tests/extraction-contracts.spec.js` passes.
5. **Bundle D** — QA contracts. Run full `test:contract` suite.
6. **Bundle F last** — after follow-up workers sign off. Merge their branches, run semantic-guide fallback tests, then commit.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Active follow-up workers may re-edit Bundle A/B files | Medium | Wait for sign-off before committing A/B |
| `js/three-setup.js` massive rewrite | High | Dedicated scene playtest + visual QA before commit |
| `css/time_weather.css` large churn | Medium | Full visual regression check on weather surface |
| `dist/bundle.js` is a build artifact — may conflict | Low | Rebuild from source before commit rather than committing modified artifact |
| Many new untracked test files (~20) | Medium | Ensure each has an owner before merge |
| `semantic-demo.css` monolithic vs. modular CSS overlap | Low | Verify it's dead or intentional before commit |
| CRLF/LF mixed line endings throughout | Low | Run `git add --renormalize .` before commit to normalize |

---

## Verification Result

```powershell
git diff --check docs/semantic-demo-worktree-review-bundles-2026-05-20.md
```

No output = clean. Any conflict markers or diff-check errors = fix before committing doc.
