# Parts A + C retirement — 2026-06-13

## What this archive contains

Commit `c5a04a3` closed Part A (port 4 LIVE stub-mis-wires) and Part C (delete 15 dead stub functions) of the 2026-06-13 fix-wave PR. The retirement artifacts preserved here:

1. **`*.ts.stub-before`** (4 files) — the OLD Svelte file content from `git show c5a04a3^:...`, capturing the stub bodies that were either deleted (15 dead) or replaced (4 LIVE re-exports).
2. **`15-deleted-dead-stubs.md`** — per-function summary of the 15 dead stubs that were deleted, with their original stub bodies as text + the LIVE-consumer case for the 3 that were restored.

## How to retrieve the OLD content of a file from git

The `.stub-before` files are provided for convenience. To retrieve from git directly:

```bash
git show c5a04a3^:src/lib/journey/selected-card.ts
git show c5a04a3^:src/lib/journey/focus-ui.ts
git show c5a04a3^:src/lib/journey/thread-inspector.ts
git show c5a04a3^:src/lib/journey/thread-settler-adapter.ts
```

## What was NOT retired

- The 4 LIVE functions (`syncFocusStage`, `updateSelectedBusiness`, `updateTraversalUi`, `clearThreadInspection`) are now Svelte-path **re-exports from the legacy real impl** via the BOTH chain. They are not retired — they're still active. The Svelte path file is just a thin pass-through.
- The 3 "dead" stubs in `thread-settler-adapter.ts` (traverseNeighbor, walkInsideToNextStop, previewInsideNextThread) turned out to have LIVE consumers and were **restored as stubs** with `debugWarn`. They are not stubbed, they are awaiting real impl.

## Related archives

- `legacy-reference/dead-shims-2026-06-13.zip` — 8 dead BOTH-pattern shims deleted in commit `2a91873`

## Reference

- `docs/both-pattern-follow-ups-2026-06-13.md` — tickets 1, 2 (Part A, Part C) now closed
- `tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md` — corrected LIVE consumer counts
- `tmp/both-pattern-investigation-2026-06-13/lane-4-deepseek.md` — original stub inventory + recommendation
- `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS-FINAL.md` — unified consumer-surface map
