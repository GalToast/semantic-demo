# task-14 — circular index wrap

**Goal:** Fix `wrap(i, n)` in `src/task.js` so any integer `i` (including
negative and beyond-range) maps into `[0, n)` — the circular-index semantics.

**Repro:** `node test/test.js` (expect FAIL — the naive `i % n` keeps negatives).

**Expected (pinned only by test asserts):**

- `wrap(0, 5)` → `0`
- `wrap(3, 5)` → `3`
- `wrap(7, 5)` → `2` (maps mod-5)
- `wrap(-1, 5)` → `4` — **JS `%` gives `-1`, but circular-index says the index one step BEFORE 0 is 4**
- `wrap(-7, 5)` → `3`
- `wrap(20, 4)` → `0`

Bug: JS remainder keeps the dividend's sign for negatives. The read-world circular
contract requires non-negative result for ALL inputs. The fix: `((i % n) + n) % n`
(or a branch on sign). The negative cases are the ones that expose it — any fix with
`return i % n` will fail them.
