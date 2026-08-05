# task-6 — Sliding window max (size 3)

**Goal:** Fix `slidingMax3(arr)` in `src/task.js` so it returns, for each index i, the max of arr[i], arr[i+1], arr[i+2] (treating out-of-range as -Infinity).

**Repro:** `node test/test.js` (expect FAIL with the bug)

**Expected:** `[1,5,3]` -> `[5,5,3]`; `[1,5,3,2]` -> `[5,5,3,2]`; `[7]` -> `[7]`; `[]` -> `[]`; `[2,9,1,8,4]` -> `[9,9,8,8,4]`

Bug: the loop iterates i from 0..len-2 (missing the last index's window), so the last element is dropped. Fix: loop to len-1.
