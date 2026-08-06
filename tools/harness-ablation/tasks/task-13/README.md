# task-13 — dedupe: keep LAST occurrence

**Goal:** Fix `dedupeLast(arr)` in `src/task.js` so it deduplicates an array keeping the **LAST** occurrence of each value (with same-relative order).

**Repro:** `node test/test.js` (expect FAIL — the buggy version keeps the FIRST occurrence).

**Expected:**

- `dedupeLast([1, 2, 1, 3])` → `[2, 1, 3]` (value `1` appears twice; keep index 2, not index 0)
- `dedupeLast(['a','b','a','c','b'])` → `['a','c','b']` (both `b`'s: keep last → index 4; `a`: keep last → index 2, so order is a,c,b)
- `dedupeLast([5])` → `[5]`
- `dedupeLast([])` → `[]`

Bug: `seen.has()/continue` keeps first occurrences. To keep the LAST occurrence while preserving relative order, scan from the END (or track lastIndexOf) so each value survives at its final position — but keep the resulting relative order correct (see case 2: `a` last at idx 2 before `c` at idx 3, `b` last at idx 4 — expected output is `a,c,b` NOT `c,b,a`).
