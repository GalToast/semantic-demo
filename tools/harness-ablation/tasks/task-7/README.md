# task-7 — Wrong comparator in sort

**Goal:** Fix `topThree(arr)` in `src/task.js` so it returns the 3 LARGEST numbers (descending).

**Repro:** `node test/test.js` (expect FAIL)

**Expected:** `[1,9,4,7,2]` -> `[9,7,4]`; `[5]` -> `[5]`; `[]` -> `[]`; `[3,1,2]` -> `[3,2,1]`

Bug: the sort comparator is ascending (or reversed), so the largest aren't picked.