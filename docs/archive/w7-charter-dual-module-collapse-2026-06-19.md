# W7 Charter — Dual-Module Collapse + Symptomatic Svelte-5 Hardening

(2026-06-19)

> **Status:** Charter drafted (not yet started). Parallel session continues W6 (Splash + lazy Canvas). Bulk-data public-data migration worker `ocw_d1b6ef51-...` is in flight for W7-A.

## Context

The 5-worker bugsweep (see `tmp/bugsweep-synthesis-2026-06-19.md`) flagged **two systematic problems**:

1. **Duplicate/divergent file pairs across `focus/` ↔ `journey/`** — 4 pairs of files _supposed_ to be one module have diverged; consumers see different behavior (incl. a different RNG for pocket placement).
2. **Store/kernel mirror drift in nav + search state layer** — partially shipped in W6 (`44f3a37`); 28 unmapped fields remain.

Item 1 is the next biggest leverage after the bulk-data migration lands. Four pairs × ~580 LoC of code with hidden behavioral split is a defect-attractor.

## Charter scope

**W7-A (already in flight, worker):** Bulk-data → `public/data/` (286 MB out of git).
**W7-B (this charter):** Reconcile the 4 focus/ ↔ journey/ file pairs into one home each.
**W7-C (concurrent with W7-B, separate):** Close the remaining MED drift items not on parallel session's hot path.

## W7-B: Dual-module collapse — pair-by-pair

> Source: `tmp/bugsweep-journey-focus.md` (verified by parallel worker). Re-verified scope below.

### Pair 1: `focus/stage-renderer.ts` ↔ `journey/focus-stage-renderer.ts` _(~140 LoC)_

- **Symptom:** `syncSelectedCardContentVariant(variant, els?)` — focus/ loads (maybe DOM-injectable), journey/ hard-codes `document.getElementById`.
- **Canonical home:** `src/lib/focus/stage-renderer.ts`
- **Stale:** `src/lib/journey/focus-stage-renderer.ts`
- **M-flagged files in flight (parallel session):** `src/lib/journey/focus-stage-renderer.ts` IS currently dirty (`M` in `git status`). Wait for parallel to commit, or coordinate merge-before-delete.
- **Action:**
    1. Add the optional `els?` param to `focus/stage-renderer.ts:141` if not present (verify signature parity).
    2. Update `src/lib/engine/adapters/lifecycle-bridge.ts:142` (and any siblings) to import `@lib/focus/stage-renderer` instead of `@lib/journey/focus-stage-renderer`.
    3. Delete `src/lib/journey/focus-stage-renderer.ts`. Confirm `rg "focus-stage-renderer" src/ js/ tests/` returns only the new focus/ reference.
    4. Verify: `npm run lint`, `npm run test`.

### Pair 2: `focus/geometry.ts` ↔ `journey/focus-pocket-geometry.ts` _(~300 LoC, RNG bug)_

- **Symptom:** `seededUnit(...values)` 4-arg variant `journey/focus-pocket-geometry.ts:29` vs 2-arg variant in `utils/seeded-random.ts:10`. Callers pass ≥4 args; truncated on 2-arg. **Two import chains → different pocket placement for identical inputs.**
- **Canonical home:** `src/lib/journey/focus-pocket-geometry.ts` (already lives in journey/ and is the larger of the two; fix its use of seededUnit by importing the canonical 2-arg from `@lib/utils/seeded-random`).
- **Action:**
    1. In `journey/focus-pocket-geometry.ts:29` delete the inline `seededUnit` and replace with `import { seededUnit } from '@lib/utils/seeded-random'`. Patch ALL call sites in this file to use 2-arg form (any ≥3-arg callers currently get silently truncated results).
    2. Update `focus/geometry.ts:16` re-export to also use the canonical `seededUnit`.
    3. Verify the geometry output for a fixed seed matches the focus/ chain (snapshot 8,406-point constellation for the same seed; tests in `tests/focus-pocket-*` should already cover this — run them, expect identity).
    4. If `focus/geometry.ts` keeps its own divergent logic beyond seededUnit, evaluate further merge or delete-then-stale.

### Pair 3: `focus/pocket.ts` ↔ `journey/focus-pocket.ts` _(~200 LoC)_

- **Symptom:** journey/focus-pocket.ts is the larger, more complete. focus/pocket.ts is a partial sub-import.
- **Canonical home:** `src/lib/journey/focus-pocket.ts`
- **Action:**
    1. Find every importer of `@lib/focus/pocket`. If they only need the surface that journey/ also exports, switch to journey/ import.
    2. If focus/pocket contains behavior NOT in journey/ (verify by import-graph), port that subset, then delete focus/pocket.ts.
    3. M-flag check: focus/pocket.ts is NOT in the dirty tree as of this writing — safe to refactor.

### Pair 4: `focus/pocket-personality.ts` ↔ `journey/focus-pocket-pocket-personality.ts` _(~80 LoC)_

- **Symptom:** Dual state-source split — focus/ reads `appState` (Svelte 5), journey/ reads `state-bridge` (legacy).
- **Canonical home:** `src/lib/focus/pocket-personality.ts` (Svelte 5 native). Migrate `journey/focus-pocket-personality.ts` consumers.
- **Action:**
    1. Add to `journey/focus-pocket.ts` (the canonical module post-Pair-3) a re-export that reads from `appState` and is the ONLY personality fn.
    2. Update `journey/focus-pocket-geometry.ts` to call the canonical personality fn (not the local legacy).
    3. Delete `journey/focus-pocket-personality.ts`. Verify `rg "pocket-personality" src/ js/` returns only one definition.

## Risk controls

- **M-flagged file (`src/lib/journey/focus-stage-renderer.ts`):** Wait for parallel session to commit/stabilize. Coordinate before delete.
- **Compile, lint, test, and visual diff after each pair.** Delete only after the canonical lives in main + builds + tests pass.
- **8,406-point mycelium invariant (`state.rawPositionsBuffer`):** Visual snapshot before/after Pair 2 is mandatory — RNG fix must not punch a hole in the existing constellation.

## Expected outcome

- 4 stale `journey/focus-*` files gone (or merged).
- One canonical pocket/personality/geometry per concern.
- 8,406-point mycelium layout unchanged.
- All H4 + M1 + M7 latent bugs concurrently resolved.
- Estimated −600 LoC and a closure of the "two import chains" defect class.

## Verification

```bash
# Pre-flight
npm run lint
npm run test
node scripts/qa.mjs contract --surface=focus-pocket --headed
node scripts/qa.mjs contract --surface=thread-inspector --headed

# After each pair
npm run test:contract
npm run check
# Verify no remaining focus-* imports from journey/:
rg "from\s+['\"]@lib/journey/focus-" src/ js/ tests/
# Should return ONLY journey-internal imports.

# After all 4 pairs
node scripts/qa.mjs contract --all --headed
```

---

## W7-C: MED drift items (low-conflict, parallel-lane-available)

These are non-file-overlapping with parallel session's dirty tree:

| Priority | Item                                                                                                                                          | Effort                        | Source                                                                                                    |
| -------: | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
|        1 | `triggers.ts:391` — `TOOLTIP_HIDE_REQUESTED` no-op (TODO Wave 2)                                                                              | 1-2h                          | bugsweep synthesis                                                                                        |
|        2 | `lifecycle.ts:204-227` — 3 semantic-lane stubs (`probeSemanticLane`, `setSemanticLaneUiState`, `syncSearchStatusForFocus`)                    | 2-4h, coordinated             | bugsweep synthesis + docs/migration-plan.md § "Do not remove legacy stubs until bridge retirement phase." |
|        3 | `audio-scape.ts` — missing null guard on double-`initAudio` + non-null freshness check on `mainOsc.frequency.setTargetAtTime`                 | 30 min                        | bugsweep (mine) — already on W6 audio-scape cleanup track                                                 |
|        4 | `surface-style-matrix.md:29` — bare `npm run qa:surface` ghost (sister to my migration-plan.md fix)                                           | 5 min                         | bugsweep (mine)                                                                                           |
|        5 | Orphan script cleanup (14 scripts in `scripts/` no callers) — sub-dispatch to a worker                                                        | 30 min worker + 10 min review | bugsweep (mine)                                                                                           |
|        6 | Thread-inspector activation bug (canonical `pinThreadNeighbor(<focusedIndex>)` returns `active:false`) — needs Playwright interactive session | 1 wave                        | bug-thread-inspector-baseline 2026-06-18                                                                  |
|        7 | Svelte 5 strict-mode `!==` leak audit & enforce                                                                                               | 1 wave                        | npm script `lint:svelte5-strict-mode`                                                                     |
|        8 | Lighthouse 92% pass — depends on W7-A worker landing + Three.js named-imports audit                                                           | 1 wave                        | three-bundle-re-audit 2026-06-19                                                                          |

## Coordination notes

- **Parallel session:** leaving 26 dirty files at last check. Stay out of `css/animations.css`, `src/lib/engine/camera-choreography/cursor.ts`, `src/lib/engine/lifecycle-bridge.ts`, `src/lib/engine/state-bridge.ts`, `src/lib/journey/focus-*.ts`, `src/lib/stores/lifecycle.ts`, `scripts/bridge-audit.mjs`, `npm run qa:contract:*` tests.
- **`MIGRATION-STATUS.md`:** update when W7-A (worker) lands — bump "Deploy-script decoupling" line to W7 status and remove the explicit "Known Blockers" entry.

---

## Owned by

W7 charter drafted: bumps `MIGRATION-STATUS.md` Wave → W7 upon W7-A landing.
