# Semantic Explorer — Roadmap to Completion

**Current date:** 2026-06-17  
**Mission:** Complete Svelte migration: all canonical paths, no legacy `js/modules/` imports in `src/`.  
**Status:** ~85% complete. Three subagent waves currently in flight clearing the last bindings.

---

## Phase I: Current (In Progress) — Bindings Clearance

Three subagent workers dispatched at 00:18 UTC are clearing the `js/modules/bindings/` directory.

| Worker                               | Target                                                       | Risk   | Est. Remaining   |
| ------------------------------------ | ------------------------------------------------------------ | ------ | ---------------- |
| **Inline** (`w15-event-inline`)      | Inline 6 simple bindings into `src/lib/ui/event-bindings.ts` | Low    | ~Merge in 10 min |
| **Medium** (`w15-event-medium-port`) | Port 4 med-risk bindings to `src/lib/ui/`                    | Medium | ~15 min          |
| **High** (`w15-event-high-port`)     | Port 2 hairy bindings (panel, journey)                       | High   | ~20 min          |

**Deliverable after Phase I:**

- `js/modules/bindings/` directory empty and deleted
- All `src/` imports directed to `src/lib/ui/` canonical locations
- Event-bindings bridge flipped

---

## Phase II: Deep Kernel Bridges (~3 work sessions)

After bindings are cleared, the remaining blockers are **deep kernel modules** with no canonical equivalent yet. These are the actual business logic heavyweights.

### Kernel bridges to create/port (15 identified)

| Module                  | Legacy Path                               | Bridge Target                                      | Why It Matters              |
| ----------------------- | ----------------------------------------- | -------------------------------------------------- | --------------------------- |
| Camera Controls Restore | `js/modules/camera-controls-restore.ts`   | `src/lib/engine/camera-controls-restore.svelte.ts` | Camera handoff, focus reset |
| Camera Core             | `js/modules/camera-controls-core.ts`      | `src/lib/engine/camera-controls-core.svelte.ts`    | Pan, zoom, orbit kernel     |
| Journey Lifecycle       | `js/modules/journey-lifecycle-adapter.ts` | `src/lib/journey/lifecycle-adapter.ts`             | Journey state transitions   |
| Journey Focus UI        | `js/modules/journey-focus-ui.ts`          | `src/lib/journey/focus-ui.ts`                      | Focus-stage DOM updates     |
| Journey Route Trace     | `js/modules/journey-route-trace.ts`       | `src/lib/journey/route-trace.ts`                   | Trail visualization         |
| Thread Inspector        | `js/modules/thread-inspector-adapter.ts`  | `src/lib/journey/thread-inspector.ts`              | WebGL thread connections    |
| Map State               | `js/modules/map-state.ts`                 | `src/lib/orchestration/map-state.ts`               | Route/embodiment state      |
| View Controller         | `js/modules/view-controller.ts`           | `src/lib/orchestration/view-controller.ts`         | View switching logic        |
| Search Panel Adapter    | `js/modules/search-panel-adapter.ts`      | `src/lib/ui/search-panel-adapter.ts`               | Mobile search sheet         |
| Navigation State        | `js/modules/navigation-state.ts`          | `src/lib/stores/navigation-state.ts`               | Mode/depth transitions      |
| Composition State       | `js/modules/composition-state.ts`         | Not yet planned                                    | State tree composition      |
| Lifecycle Reset         | `js/modules/lifecycle-reset.ts`           | Not yet planned                                    | Experience reset logic      |
| Lifecycle Modes         | `js/modules/lifecycle-modes.ts`           | Not yet planned                                    | Mode dispatch table         |
| Scene Reveal            | `js/modules/scene-reveal.ts`              | Not yet planned                                    | Progressive loading         |
| Loading UI              | `js/modules/loading-ui.ts`                | `src/lib/ui/loading-ui.ts` exists                  | Already canonical           |

**These are NOT the same as bridge files.** Each of these is a 100-500 LOC module that needs to be either:

- **A.** Ported entirely to `src/` (if it has `src/` consumers)
- **B.** Rerouted through an existing canonical module (if logic overlaps)
- **C.** Retired if dead (if no consumers found in audit)

**Power move for this phase:**  
For each kernel module, the recon subagent should:

1. Find ALL consumers (in `js/modules/`, `src/`, and tests)
2. Check if a canonical `src/` consumer already exists
3. Decide: Port, Inline, or Retire
4. If port: create canonical file + update consumers
5. Verify: `grep -r "from.*js/modules" src/` → 0 for that module

---

## Phase III: Test Infrastructure Modernization (~1 session)

After all canonical paths are clean, tests need updating.

| Task           | Where                      | What                                             |
| -------------- | -------------------------- | ------------------------------------------------ |
| Contract tests | `tests/`                   | Repoint `js/modules/` imports to `@lib/`         |
| Unit tests     | `tests/unit-active/`       | Verify bridge contract tests pass with new paths |
| Test config    | `vitest.config.ts`         | Ensure `@lib` alias resolves to `src/lib`        |
| CI             | `.github/workflows/ci.yml` | Already committed; verify it fails clean         |

**Quality gate:** `npm run test` and `npm run test:unit` should both pass with 0 failures and no warnings.

---

## Phase IV: The Final Purge (~1 session)

Once `src/` imports no legacy, the `js/modules/` directory can be emptied.

### Purge checklist

1. **Verify zero imports from `src/`**

    ```bash
    grep -r "from.*js/modules" src/ tests/
    # Expected: 0 results
    ```

2. **Verify zero imports to `js/modules` from anywhere**

    ```bash
    grep -r "from.*js/modules" src/ tests/ --include="*.ts" --include="*.svelte"
    # Expected: 0 results
    ```

3. **Delete empty directories**

    ```bash
    rm -rf js/modules/bindings/
    rm -rf js/modules/  # if completely empty
    ```

4. **Move `js/modules/` to `legacy-reference/` or delete outright**
    - If any file might still have documentary value: `git mv` to `legacy-reference/`
    - Otherwise: `git rm` directly

5. **Update `docs/` and `README.md`**
    - Remove references to `js/modules/` as active paths
    - Update architecture diagrams
    - Note in migration docs that the BOTH pattern is retired

6. **Final `svelte-check` and build**

    ```bash
    npm run check      # svelte-check + tsc
    npm run build      # production Vite build to dist/svelte/
    ```

---

## Timeline Estimates

| Phase                    | Duration        | Subagent Waves         | Status                           |
| ------------------------ | --------------- | ---------------------- | -------------------------------- |
| I — Bindings Clearance   | 1 session       | 3 workers dispatched   | **In progress**                  |
| II — Deep Kernel Bridges | 3 sessions      | 4-5 recon + port waves | Not started                      |
| III — Test Modernization | 1 session       | In-lane updates        | Not started                      |
| IV — Final Purge         | 1 session       | In-lane + verification | Not started                      |
| **Total**                | **~6 sessions** | **~10 subagent waves** | **~2 weeks at current velocity** |

---

## Success Criteria (Definition of Done)

- [ ] `grep -r "from.*js/modules" src/ tests/` → 0 results
- [ ] `svelte-check` exits with 0 errors (as always)
- [ ] `npm run test:unit` → all pass
- [ ] `npm run build` → completes without errors
- [ ] `git log --oneline --since="1 day ago"` contains a "Final purge: remove js/modules" commit
- [ ] `README.md` updated to reflect `src/` as the single canonical tree
- [ ] No `dist/bundle.js` referenced anywhere (verified by grep)

---

## Next Action (This Session)

1. Wait for all 3 binding subagents to report back
2. Merge inline changes if tests pass
3. Staging check before committing
4. Queue up Phase II subagents based on worker reports

---

_Generated: 2026-06-17 00:25 UTC_
_Last updated by: main lane status check_
