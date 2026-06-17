# W20 Wave 4 Verification — 2026-06-17

**Status:** in progress
**Current HEAD:** `f342c02` — chore(w20-wave4): delete js/modules/journey.ts
**origin/master HEAD:** `8be8a2f` — chore(w20-wave4-prep-r2): rewire 5 deep-relative imports in components/ and utils/

## Files deleted (W19+W20 cumulative — 7 of 10 targets)

| File | Commit | Date |
|------|--------|------|
| `app-svelte-island.ts` | `11e4c68` | 2026-06-17 |
| `three-node-manager.ts` | `11e4c68` | 2026-06-17 |
| `loading-ui.ts` | `ac14b34` | 2026-06-17 |
| `composition-state.ts` | `ac14b34` | 2026-06-17 |
| `exploration-mode.ts` | `ac14b34` | 2026-06-17 |
| `map-state.ts` | `79b2576` | 2026-06-17 |
| `journey.ts` | `f342c02` | 2026-06-17 |

## Files still in WIP (3 remaining)

These are the lifecycle files the parallel session is finishing:

- **`lifecycle.ts`** — still exists; 5 files still import from `./lifecycle.ts`:
  - `journey-compass-controller.ts`
  - `journey-focus-ui.ts`
  - `journey-thread-settler.ts`
  - `thread-inspector.ts`
  - `url-state.ts`
- **`lifecycle-modes.ts`** — still exists; Wave 4 readiness test checks for deletion
- **`lifecycle-reset.ts`** — still exists; Wave 4 readiness test checks for deletion

These 3 files plus the 5 importers above constitute the remaining Wave 4 cleanup work.

## Deep-relative imports

3 deep-relative `../../src/lib/` imports remain in `js/modules/`:

- `journey-compass-controller.ts` → `../../src/lib/journey/semantic-dive.ts`
- `lifecycle.ts` → `../../src/lib/journey/thread-settler-adapter`
- `lifecycle.ts` → `../../src/lib/journey/semantic-guide.ts`

The `lifecycle.ts` entries will resolve when that file is deleted. The `journey-compass-controller.ts` entry is the last non-lifecycle deep-relative import.

## Test results

### Wave 4 readiness test

```
Tests  16 passed | 6 failed (22)
```

All 6 failures are expected and tracked:
- 3 file-existence checks (lifecycle.ts, lifecycle-modes.ts, lifecycle-reset.ts still on disk)
- 1 deep-relative import check (../../src/lib/ still present)
- 1 cross-module import check (journey-* files have ./ relative imports)
- 1 deleted-module importer check (5 files import from ./lifecycle.ts)

Was 15/7 before today's commits. Now 16/6 — one additional pass from the `map-state.ts` deletion.

### Full vitest suite

```
Test Files  3 failed | 64 passed (67)
Tests       9 failed | 711 passed (720)
```

- 6 of the 9 failures are from the Wave 4 readiness test (expected — see above)
- 3 additional failures are in other test files (pre-existing or parallel-session WIP related)
- 64/67 test files pass, 711/720 individual tests pass

## Net W20 stats

- **Commits landed (2 days):** 20+
- **Files deleted:** 7 of 10 W19+W20 targets
- **Canonicals created:** 3 (`@lib/orchestration/composition-state`, `@lib/orchestration/exploration-mode`, `@lib/lifecycle/lifecycle-modes`)
- **Regression tests added:** 5 (wave4-readiness, composition-state lock, store-parity-mirror, body-attr probe, contract-test info-panel-empty fix)

## Remaining work for Wave 4 closure

1. **Delete `lifecycle.ts`** — requires rewiring the 5 remaining importers to `@lib/stores/lifecycle` or other canonicals
2. **Delete `lifecycle-modes.ts`** — requires confirming zero consumers
3. **Delete `lifecycle-reset.ts`** — requires confirming zero consumers
4. **Rewire `journey-compass-controller.ts`** — last non-lifecycle deep-relative `../../src/lib/` import
5. **Verify readiness test passes 22/0** after all deletions and rewires

## References

- `docs/w19-charter-2026-06-17.md` — Wave 1-4 plan
- `docs/w20-cross-import-map.md` — the rewiring plan
- `notes/w19-lane-a-b-handoff-2026-06-17.md` — W19 lessons
- `notes/w20-prompt-2026-06-17.md` — W20 prompt context
