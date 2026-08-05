# task-8 — Missing null guard

**Goal:** Fix `safeLength(x)` in `src/task.js` so it returns `0` for `null`/`undefined` and the length for strings/arrays.

**Repro:** `node test/test.js` (expect FAIL)

**Expected:** `safeLength(null)` -> `0`; `safeLength(undefined)` -> `0`; `safeLength('abc')` -> `3`; `safeLength([1,2])` -> `2`

Bug: no null/undefined guard (throws TypeError).