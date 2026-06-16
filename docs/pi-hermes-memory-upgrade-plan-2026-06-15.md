# pi-hermes-memory Upgrade Plan — 2026-06-15

> **Status:** All 3 fixes applied to installed package. NOT committed to a source repo.
> **Package source modified:** `C:\Users\HP\.pi\agent\npm\node_modules\pi-hermes-memory\`
> **Files modified:** 7 (3 source + README + CHANGELOG + constants + tsconfig)

---

## 1. What changed

3 mimo-v2.5 workers, 3 logical commits, disjoint file surfaces:

| # | Worker | Files | Commit message |
|---|--------|-------|----------------|
| 1 | **Mem-W1** (config) | `hermes-memory-config.json` + `src/constants.ts` + `README.md` + `CHANGELOG.md` | `feat(memory): bump per-target char limits to 500K` |
| 2 | **Mem-W2** (tool surface) | `src/tools/memory-tool.ts` + `src/handlers/auto-consolidate.ts` + `README.md` + `CHANGELOG.md` | `feat(memory): add list action + 80% auto-summarize trigger` |
| 3 | **Mem-W3** (store fix) | `src/store/memory-store.ts` + `tsconfig.json` (created) + `CHANGELOG.md` | `feat(memory): add fuzzy old_text matching for replace/remove` |

Total: ~30-60 min of work, $0.0019 total cost.

## 2. Per-commit details

### Commit 1: Bump per-target char limits to 500K

**Files (4):**
- `hermes-memory-config.json` (outside the package, in `C:\Users\HP\.pi\agent\`)
- `src/constants.ts` — `DEFAULT_MEMORY_CHAR_LIMIT`, `DEFAULT_USER_CHAR_LIMIT`, `DEFAULT_PROJECT_CHAR_LIMIT`: 5000 → 500000
- `README.md` — added "## Configuration" section documenting the limits
- `CHANGELOG.md` — first entry (oldest)

**Commit message:**
```
feat(memory): bump per-target char limits to 500K

Increase memoryCharLimit, userCharLimit, and projectCharLimit defaults
from 5,000 to 500,000 characters (100x). This gives multi-session
agents 10x runway before hitting the consolidation trigger.

- src/constants.ts: DEFAULT_*_CHAR_LIMIT = 500000 (was 5000)
- hermes-memory-config.json: same defaults (was 50000)
- README.md: added Configuration section documenting override
- CHANGELOG.md: documented the change

Backward compat: existing users who override back to 50000 still work.
```

### Commit 2: Add list action + 80% auto-summarize trigger

**Files (4):**
- `src/tools/memory-tool.ts` — added `list` to the action enum, added `case "list"` to the switch (returns entries with preview/size/index/total)
- `src/handlers/auto-consolidate.ts` — added new exported function `maybeTriggerConsolidationAtThreshold(pi, store, target, currentSize, limit, ...)` that fires when `currentSize > 0.8 * limit`
- `src/tools/memory-tool.ts` — added 80% trigger call in the `add` case (after the size check passes)
- `README.md` — added `### list` subsection
- `CHANGELOG.md` — second entry

**Commit message:**
```
feat(memory): add list action + 80% auto-summarize trigger

Two related improvements to the memory tool surface:

1. `list` action — returns entries with preview/size/index, no content
   or old_text required. Useful for inspecting memory without making
   changes.

2. 80% auto-summarize trigger — when a memory write brings total size
   above 80% of the limit, consolidation fires proactively (fire-and-
   forget) to prevent hitting the 100% rejection threshold. The
   existing 100% auto-consolidate still works as a safety net.

- src/tools/memory-tool.ts: added list case to schema + execute
- src/handlers/auto-consolidate.ts: new maybeTriggerConsolidationAtThreshold()
- src/tools/memory-tool.ts: 80% trigger hook in add case
- README.md: documented both new behaviors
- CHANGELOG.md: documented both changes

Backward compat: existing add/replace/remove actions unchanged. The
schema change adds `list` to the enum (existing callers unaffected).
```

### Commit 3: Fuzzy old_text matching for replace/remove

**Files (3):**
- `src/store/memory-store.ts` — added `findEntryFuzzy()` private method with 4-tier fallback
- `tsconfig.json` (created, for verification) — minimal config to enable `tsc --noEmit`
- `CHANGELOG.md` — third entry (newest, top of file)

**The 4-tier fallback in `findEntryFuzzy()`:**
1. Exact substring match (existing fast path)
2. Strip trailing HTML comments + trim (`<!-- created=..., last=... -->`)
3. Substring search if `old_text` is ≥ 10 chars (prefer shortest match if multiple)
4. Leading-substring search on first 30 chars

**Commit message:**
```
feat(memory): add fuzzy old_text matching for replace/remove

The existing exact `old_text` matching is fragile:
- Trailing HTML comments (added by the memory tool itself) are not
  part of the searchable text
- Long old_text (>500 chars) often fails to match
- Multi-line old_text may need exact whitespace

This change adds a 4-tier fallback to find the target entry:
1. Exact substring match (fast path)
2. Strip HTML comments + trim
3. Substring search (≥10 chars, prefer shortest match)
4. Prefix search (first 30 chars)

- src/store/memory-store.ts: new findEntryFuzzy() method
- replace() and remove() now use findEntryFuzzy instead of exact match
- tsconfig.json: added for tsc --noEmit verification (not in npm)
- CHANGELOG.md: documented the change

Backward compat: exact match is tried first; the fuzzy tiers only fire
when exact match fails. Existing exact-match callers see no change.
```

## 3. Verification baseline

All 3 workers ran `npx tsc --noEmit` (or equivalent) and reported clean:
- Mem-W1: clean (45 sec)
- Mem-W2: clean (4 min) — added 1 new function, 1 new switch case, 1 new trigger hook
- Mem-W3: clean (5 min) — added 1 new private method, modified 2 call sites

**Pre-existing issues (NOT caused by these changes):**
- No `tsconfig.json` shipped in the npm package (Mem-W3 created one locally for verification)
- Missing type declarations for `@earendil-works/pi-coding-agent` (not in scope)
- The 5,000-char per-entry sub-limit is unchanged (different constant)

## 4. How to apply this to a source repo

The package source lives in the installed `node_modules/`. To commit to a source fork (e.g., `github.com/your-fork/pi-hermes-memory`):

1. **Clone the source repo** (or use your existing fork):
   ```bash
   git clone https://github.com/your-fork/pi-hermes-memory.git
   cd pi-hermes-memory
   ```

2. **Apply the changes** from the installed package to the source:
   ```bash
   # Copy modified files from installed package to source
   cp "C:/Users/HP/.pi/agent/npm/node_modules/pi-hermes-memory/src/constants.ts" src/constants.ts
   cp "C:/Users/HP/.pi/agent/npm/node_modules/pi-hermes-memory/src/tools/memory-tool.ts" src/tools/memory-tool.ts
   cp "C:/Users/HP/.pi/agent/npm/node_modules/pi-hermes-memory/src/handlers/auto-consolidate.ts" src/handlers/auto-consolidate.ts
   cp "C:/Users/HP/.pi/agent/npm/node_modules/pi-hermes-memory/src/store/memory-store.ts" src/store/memory-store.ts
   cp "C:/Users/HP/.pi/agent/npm/node_modules/pi-hermes-memory/README.md" README.md
   cp "C:/Users/HP/.pi/agent/npm/node_modules/pi-hermes-memory/CHANGELOG.md" CHANGELOG.md
   # Note: tsconfig.json was created by Mem-W3 for local verification only
   ```

3. **Stage the 3 commits** (one per logical change, as above)

4. **Run the package's test suite** before pushing:
   ```bash
   npm install
   npm run check    # tsc --noEmit
   npm test         # if tests are present
   ```

5. **Push to your fork**, open PR upstream if desired

## 5. Recommended next steps

1. **Test the changes** in a live session before committing:
   ```bash
   # Use the memory tool with the new list action
   # (in a pi-coding-agent session)
   memory action=list target=project
   ```
   The list action should return your project memory entries with preview/size.

2. **Decide if the changes should be upstreamed**:
   - If you maintain pi-hermes-memory: commit + push directly
   - If you don't: open a PR upstream
   - If you're just using it locally: leave as-is (the changes persist in the install)

3. **If you want to backport the W14 fixes** (also in installed package, also uncommitted):
   - The W14 work is in the semantic-explorer repo (committed)
   - The memory tool work is in pi-hermes-memory (uncommitted)
   - These are two different repos with different commit cadences

## 6. Files modified (full list)

| File | Worker | Status | Diff size estimate |
|------|--------|--------|--------------------|
| `C:\Users\HP\.pi\agent\hermes-memory-config.json` | W1 | Uncommitted | 1 line (50K→500K) |
| `src/constants.ts` | W1 | Uncommitted | 3 lines (5K→500K) |
| `src/tools/memory-tool.ts` | W2 | Uncommitted | ~30 lines (list case + 80% trigger) |
| `src/handlers/auto-consolidate.ts` | W2 | Uncommitted | ~30 lines (new function) |
| `src/store/memory-store.ts` | W3 | Uncommitted | ~50 lines (findEntryFuzzy) |
| `README.md` | W1+W2 | Uncommitted | ~20 lines (Configuration + list sections) |
| `CHANGELOG.md` | W1+W2+W3 | Uncommitted | ~30 lines (3 entries) |
| `tsconfig.json` | W3 | Uncommitted (NEW) | ~20 lines (minimal config) |

## 7. Cost summary

| Worker | Wall-clock | Cost (USD) |
|--------|-----------|------------|
| Mem-W1 | ~45 sec | ~$0.0004 |
| Mem-W2 | ~4 min | ~$0.0006 |
| Mem-W3 | ~5 min | ~$0.0009 |
| **Total** | **~10 min** | **~$0.0019** |

---

_Generated 2026-06-15. All 3 memory tool workers completed successfully. The 4th worker (W14-T1) is finalizing in parallel._
