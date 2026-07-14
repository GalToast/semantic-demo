# State & Focus Consolidation Plan — _Remaining Work_

**Author:** main-lane (architect) · **Date:** 2026-07-14
**Status:** Scaffolded by the parallel session; this plan covers the **remaining** consolidation.
**Hard gate:** do **NOT** start until the parallel session's current 12-file dirty set has landed (see §4).

> Note: this doc was written directly by the main lane because the external-subagent
> dispatch (model `hy3-free`) crashed the subagent manager in json-mode (`full_allow=yolo`,
> no output, no file writes, no tree damage — verified). The `mimo-free` re-dispatch could
> not connect (`Not connected`). The content below is grounded in `git log`, `git diff --stat`,
> and `rg`/`wc` evidence gathered 2026-07-14. Re-validate the inventory (§2) against the tree
> at execution time — the parallel session is still moving.

---

## 0. Why this plan exists

Two chronic architectural smells were identified (see `tmp/shitty-ui-sweep-report.md` and the
integration-baseline note):

- **(A) App-state dual-source-of-truth** — ~2,682 lines across 9 modules in `src/lib/state/`
  plus a 1,196-line parity shim. The Svelte-5 migration left _legacy + mirror + app + session +
  parity shim_ all alive at once.
- **(B) Focus fragmentation** — ~4,549 lines across **15 files / 4+ subsystems** with no single
  owner. One word ("focus") means camera focus, business detail card, journey phase, and DOM a11y focus.

The parallel session has **already committed 7 batches** doing much of this. This plan builds on
them; it does **not** re-propose finished work.

### What the parallel session already landed (DONE — do not re-do)

| commit     | what it consolidated                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| `161194f1` | committed `plans/parity-layer-exit-plan.md` — the parity-layer **exit strategy now exists** |
| `0745206a` | **focus:** async focus-settle on `CAMERA_NODE_FOCUSED` + WeakMap search-state registry      |
| `4084f7b4` | **state:** narrow `ViewName` to `galaxy\|map`; retire dead `myceliumLines` field            |
| `7147f089` | engine: `forceContextLoss` on WebGL teardown (stops journey-test context leaks, W53)        |
| `7e6c1e0f` | de-jargon copy in journey handoffs + compass states                                         |
| `d3b2ce7b` | prettier + eslint/brace cleanup                                                             |
| `18147d5b` | null-guard `captureTimeout` in SpectorInspector + correct stale `ViewName` comment          |

**Action:** at execution time, re-confirm each "DONE" item actually removed the debt (the plan
assumes it did). If a step is already complete, skip it.

---

## 1. Current parallel-session dirty set (must land first — §4 gate)

12 files, 84 insertions / 61 deletions — coherent in-progress work, **not** rogue edits:

```
css/clusters.css            css/layout_base.css
src/components/SearchInput.svelte        (focus idiom tweak, +29)
src/lib/components/header/mode-nav.ts
src/lib/engine/mycelium-engine.ts        (-11, engine cleanup)
src/lib/search/api-cache.ts   (+7, lazy cache init flag)
src/lib/search/cache.ts       (~37, cache rework)
src/lib/search/mock-catalog.ts
src/lib/search/scoring.ts     (~25)
tests/integration/a11y-baseline.spec.js
tests/unit-active/component-SearchInput.test.ts
tests/widget-journey.spec.js
```

Baseline to re-establish after they land: journey **19 passed / 1 skipped**, contract **65/67**
(the 2 failures are their engine/search-state files), `npm run lint` **0 errors**,
`npm run audit:a11y` **0 findings**.

---

## 2. Remaining debt — inventory with evidence

### 2A. State / parity (what is probably still alive)

| file                                                  | lines | role                                 | likely fate                              |
| ----------------------------------------------------- | ----- | ------------------------------------ | ---------------------------------------- |
| `src/lib/state/state-types.ts`                        | 874   | central type defs                    | **keep**                                 |
| `src/lib/state/app.svelte.ts`                         | 760   | Svelte-5 app state (source of truth) | **keep**                                 |
| `src/lib/state/state-validation.ts`                   | 548   | validation                           | **keep**                                 |
| `src/lib/state/create-state-mirror.ts`                | 199   | **mirror layer**                     | delete if superseded                     |
| `src/lib/state/legacy-state.ts`                       | 116   | **legacy representation**            | delete                                   |
| `src/lib/state/legacy-state-adapter.ts`               | 23    | bridges legacy→new                   | delete with legacy                       |
| `src/lib/state/with-state-mutation.ts`                | 59    | mutation wrapper                     | fold into app.svelte or keep as pure fns |
| `src/lib/state/mutators.ts`                           | 43    | pure mutators                        | **keep** (or fold)                       |
| `src/lib/state/session.svelte.ts`                     | 60    | session state                        | **keep**                                 |
| `src/lib/orchestration/parity/parity-attrs.svelte.ts` | 766   | **parity shim**                      | delete per `parity-layer-exit-plan.md`   |
| `src/lib/orchestration/parity/parity-resolvers.ts`    | 326   | parity resolvers                     | delete                                   |
| `src/lib/orchestration/parity/parity-context.ts`      | 104   | parity context                       | delete                                   |

**Open question to resolve at execution:** after `4084f7b4`, are `legacy-state.ts` /
`legacy-state-adapter.ts` / `create-state-mirror.ts` still imported anywhere outside their own
adapter? `rg -l "legacy-state|create-state-mirror"` decides whether Phase 1.1–1.2 are still needed.

### 2B. Focus (what is probably still disjoint)

| file                                                                             | lines | subsystem                 |
| -------------------------------------------------------------------------------- | ----- | ------------------------- |
| `src/lib/engine/camera-choreography/focus.ts`                                    | 305   | camera focus              |
| `src/lib/focus/anchor-indicator.ts`                                              | 191   | focus-pocket card         |
| `src/lib/focus/personality.ts`                                                   | 225   | focus-pocket card         |
| `src/lib/focus/stage-renderer.ts`                                                | 316   | focus-pocket card         |
| `src/lib/focus/pocket-personality.ts`                                            | 160   | focus-pocket card         |
| `src/lib/focus/pocket.ts`                                                        | 30    | focus-pocket card         |
| `src/lib/journey/focus-ui.ts`                                                    | 667   | journey focus UI          |
| `src/lib/journey/focus-pocket-geometry.ts`                                       | 864   | journey focus geometry    |
| `src/lib/journey/focus-pocket.ts`                                                | 540   | journey focus card        |
| `src/lib/journey/focus-stage-dom.ts`                                             | 299   | journey focus DOM         |
| `src/lib/journey/focus-anchor-indicator.ts`                                      | 195   | journey focus anchor      |
| `src/lib/journey/focus-pocket-personality.ts`                                    | 16    | journey focus personality |
| `src/lib/stores/focus.svelte.ts`                                                 | 584   | focus state store         |
| `src/lib/utils/focus-trap.ts`                                                    | 106   | DOM a11y focus trap       |
| `src/lib/utils/focus-trap-bindings.ts`                                           | 51    | DOM a11y focus trap       |
| `src/components/Header.svelte` (3 focus `$effect`s, incl. W50 mobile-focus)      | —     | entry-point focus         |
| `src/components/SearchInput.svelte` (`requestAnimationFrame(()=>focus())` idiom) | —     | entry-point focus         |

**Open question to resolve at execution:** did `0745206a`'s async focus-settle become a **single
coordinator**, or just an add-on hook? `rg -n "CAMERA_NODE_FOCUSED|focusSettle|focus-coordinator"`
decides whether Phase 2.1 is "create coordinator" or "extend existing one". The 4 subsystems
(camera / pocket-card / journey / DOM-a11y) likely still have disjoint entry points.

---

## 3. Phased remaining-consolidation approach

### Phase 0 — Gate & re-baseline

1. Parallel session lands the 12-file dirty set (§1).
2. Re-run `git diff --stat` + `rg` to **re-confirm the §2 inventory** (tree may have moved).
3. Re-establish green: `npm run qa:journey:headless` (19 passed/1 skipped), `npm run test:contract`
   (65/67), `npm run lint` (0 errors), `npm run audit:a11y` (0 findings).

### Phase 1 — State / parity finish (build on `4084f7b4` + `161194f1`)

- **1.1** `rg -l "legacy-state|legacy-state-adapter"`; if only the adapter imports them, delete
  `legacy-state.ts` + `legacy-state-adapter.ts`, redirect importers to `app.svelte.ts`.
- **1.2** `rg -l "create-state-mirror|with-state-mutation"`; if mirror is fully superseded, delete
  both; fold `mutators.ts` in or keep as pure functions.
- **1.3** Execute `plans/parity-layer-exit-plan.md`: delete `parity-attrs.svelte.ts` +
  `orchestration/parity/*`; redirect all parity-attr consumers to real attributes.
- **1.4** Confirm `state-types.ts` + `state-validation.ts` + `app.svelte.ts` + `session.svelte.ts`
    - `mutators.ts` are the **single source of truth**.
- **Per-step verification:** `npm run lint` · `npm run audit:a11y` · `npm run test:contract` ·
  `npm run qa:journey:headless`.

### Phase 2 — Focus finish (build on `0745206a`)

- **2.1** Decide coordinator shape from §2B open question. If disjoint, create
  `src/lib/focus/focus-coordinator.ts` keyed off explicit lifecycle signals:
  `scene-ready`, `surface-change`, `dialog-close`. If `0745206a` already started one, extend it.
- **2.2** Absorb `Header.svelte` mobile-focus `$effect` + `SearchInput.svelte` `rAF` focus idiom
  into the coordinator (single entry-point focus path).
- **2.3** Resolve naming collisions: `camera-focus` vs `DOM-focus` vs `journey-focus`. Rename to
  explicit prefixes or document hard boundaries; never let two subsystems fight over
  `document.activeElement`.
- **2.4** Keep `focus-trap.ts` for a11y, but route activation through the coordinator.
- **Per-step verification:** `npm run audit:a11y` · `npm run qa:journey:headless` (guards **W50**
  mobile-focus + **W51** SelectedBusinessDetails) · `npm run test:contract`.

---

## 4. Sequencing relative to the parallel session (DO NOT START UNTIL)

- **Gate:** their 12-file dirty set (§1) must be committed/landed first.
- **Intersections to re-base onto:** `SearchInput.svelte` (focus idiom), `mycelium-engine.ts`
  (engine), `api-cache.ts`/`cache.ts`/`mock-catalog.ts`/`scoring.ts` (search-state — relates to
  the WeakMap registry from `0745206a`), `css/*`, tests.
- **If they also delete the parity layer in their next batch**, skip Phase 1.3.
- **Workflow:** after they land → `git` rebase/pull → re-run §2 inventory → start Phase 1.
- **Coordinate, don't clash:** the 3 repo **off-limits** files are
  `src/lib/engine/three-engine-core.ts`, `src/lib/utils/relationship-roles.ts`, `AGENTS.md`.
  If focus/state changes require touching them, flag the parallel session first.

---

## 5. Risks

- **Drift during migration** — state shape can change mid-flight. Mitigation: the contract tests
  `tests/unit-active/state-mirror-drift-contract.test.ts` + `state-validation-wiring.test.ts`
  guard this; keep them green every step.
- **Two known contract failures** (`three-visual-polish-contract.mjs`,
  `reduced-motion-interruption.spec.js`) live in the parallel session's dirty files — ensure they
  are resolved as part of their landing, not inherited into Phase 1/2.
- **Off-limits files** — never edit `three-engine-core.ts` / `relationship-roles.ts` / `AGENTS.md`.
- **Focus regression** — the W50/W51 journey tests are the guard; if they go red, a focus path
  regressed. Do not bypass them.

---

## 6. Verification per phase (exact commands)

```bash
npm run lint                      # 0 errors
npm run audit:a11y                # 0 findings (HIGH/MED/LOW)
npm run test:contract             # 65/67 -> 67/67 after parallel session lands
npm run qa:journey:headless       # 19 passed / 1 skipped (includes W50 + W51)
# targeted:
npx playwright test tests/widget-journey.spec.js --grep "W50-A11y"
npx playwright test tests/widget-journey.spec.js --grep "W51-SelectedBusinessDetails"
```

---

## 7. Definition of done

- [ ] **One** state source of truth: `legacy-state*`, `create-state-mirror`, `with-state-mutation`,
      and the entire `orchestration/parity/*` + `parity-attrs.svelte.ts` shim are **deleted**;
      `state-types` + `state-validation` + `app.svelte` + `session` + `mutators` remain.
- [ ] **One** focus coordinator owns entry-point focus; `Header.svelte` + `SearchInput.svelte`
      focus effects are folded in; no duplicate `document.activeElement` logic across subsystems.
- [ ] All four suites green (lint 0 / a11y 0 / contract 67/67 / journey 19+1skip).
- [ ] The 3 off-limits files are untouched.
- [ ] No regressions in W50 / W51 journey tests.
