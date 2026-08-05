# task-5 — Binary search insert index

**Goal:** Fix `findInsertIndex(arr, target)` in `src/task.js` so it returns the index where `target` would be inserted to keep the sorted array sorted (first index with `arr[i] >= target`).

**Repro:** `node test/test.js` (expect FAIL with the bug)

**Expected (fixed):**

- `findInsertIndex([1,3,5,7], 4)` → `2`
- `findInsertIndex([1,3,5,7], 0)` → `0`
- `findInsertIndex([1,3,5,7], 8)` → `4`
- `findInsertIndex([1,3,5,7], 5)` → `2`
- `findInsertIndex([], 1)` → `0`

Bug: the loop correctly narrows `lo`, but the function `return mid` (the last compared index) instead of `lo`. On "not found" cases `mid` can differ from the correct insert position (e.g. `[1,3,5,7], 8`: `lo=4` but `mid=3`). The fix returns `lo`.
