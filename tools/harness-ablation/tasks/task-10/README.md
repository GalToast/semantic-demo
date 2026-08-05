# task-10 — Aggregation bug (sum of negatives)

**Goal:** Fix `sumPositive(arr)` in `src/task.js` so it sums ONLY positive numbers.

**Repro:** `node test/test.js` (expect FAIL)

**Expected:** `[1,-2,3]` -> `4`; `[-1,-2]` -> `0`; `[0,5]` -> `5`; `[]` -> `0`

Bug: it sums all numbers (or skips incorrectly).