# task-15 — deepMerge semantics

**Goal:** Fix `deepMerge(a, b)` in `src/task.js` to a DEEP merge with the
project's specific semantics, all pinned ONLY by test asserts:

- **Arrays CONCATENATE** (`a.tags + b.tags`), they do not replace.
- **Nested plain objects** merge recursively (b wins on scalar conflicts).
- **Scalars**: `b` wins.
- **null/undefined**: treat as empty (no throw; values from the other side).
- Inputs are never mutated.

**Repro:** `node test/test.js` (expect FAIL — current shallow merge fails at the
first nested-object assert).

**Expected examples (uncover all from failing messages):**

- `deepMerge({a:1}, {b:2})` → `{a:1, b:2}`
- `deepMerge({a:1}, {a:2})` → `{a:2}`
- `deepMerge({tags:['x']}, {tags:['y']})` → `{tags:['x','y']}` (concat — the
  naive spread yields `['y']`)
- `deepMerge({n:{p:1,q:2}}, {n:{p:9}})` → `{n:{p:9, q:2}}` (deep: `q` survives)
- `deepMerge({a:null}, {b:1})` → `{b:1}` (null treated as absent)
- `deepMerge(null, {c:3})` → `{c:3}` (no throw)

Bug: top-level spread is strictly shallow — arrays replace, nested objects
overwrite wholesale, and `null` spreads fail. Implement recursive merge: for
`{...} == [object Object]` (not array, not null) recurse; array → concat; else
`b` wins. Mind: arrays are objects too (`Array.isArray` before object recurse).
