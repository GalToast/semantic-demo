---
name: Cross-Track Data/Search Parity Fix
description: Fix data-processing and search-tokenization parity bugs between JS canonical and TS migration-track files during a JS→Svelte/TS migration. Verifies bugsweep claims at the source, fixes drift in utility functions, import chains, and tokenization logic, and adds verification tests.
source: auto-skill
extracted_at: '2026-06-07T03:16:12.663Z'
---

# Cross-Track Data/Search Parity Fix

Use this when a bugsweep report or audit finds **data-processing or search-tokenization parity bugs** between a legacy JS module and its TypeScript migration track shadow. The core pattern: utility functions like `cleanOptionalValue`, `tokenizeSearchText`, and normalization helpers drift apart between tracks, causing different behavior on the same data.

## When to Use

- A bugsweep report lists "drift" findings comparing JS and TS implementations of the same data-processing function.
- The bug report claims specific file:line pairs have local/shadow implementations that differ from the canonical version.
- The issue involves sentinel filters (`cleanOptionalValue`), tokenization pre-processing, or normalization logic.
- The bug crosses tracks: the JS file has one version of a helper and the TS file has a different (or no) version.
- You need to fix data parity bugs and add unit tests at the same time.

## When NOT to Use

- **DOM/element ownership bugs** — use `BUGSWEEP_CLAIM_FALSIFICATION_CHECK` instead (different verification method).
- **State desync (store-to-store)** — use `STATE_DESYNC_PARITY_SURGERY`.
- **General bug fix without cross-track drift** — use `STRUCTURED_BUG_SURGERY`.
- **Audit-only discovery** — use `SVELTE_MIGRATION_PARITY_AUDIT` Layer 10.

## The Parity Fix Pipeline

### Phase 1: Verify Bugsweep Claims Against Source

Before fixing anything, verify every claim in the bugsweep report by reading the actual source code. Bugsweep reports may have:

- **Wrong file paths** — e.g., claims `js/modules/data-mapper.ts` but the real file is `js/modules/utils/data-mapper.ts`
- **Wrong track** — claims the TS file has a bug that's actually in the JS file (or vice versa)
- **Stale line numbers** — code has changed since the sweep
- **False premises** — the "bug" may be that a local function exists but is never used (the TS file imports from dom-formatters instead)

**For each bug item, do:**
1. Read the actual file at the claimed path and line range. If the path doesn't exist, glob for it.
2. Determine whether the claimed code is in JS or TS (or both) — which track actually has the bug?
3. Check the **canonical implementation** — usually in `*/dom-formatters.{js,ts}` or the oldest JS module. What does the canonical function actually do?
4. Determine the real fix needed, which may differ from the report's suggestion.
5. Categorize: `NEEDS_FIX`, `ALREADY_FIXED` (code is correct), `FALSE_POSITIVE` (report was wrong), or `WRONG_TRACK` (bug is in the other track).

**Key insight:** During migration, TS files often either:
- Import from `./dom-formatters.js` (the JS canonical) — these are already correct
- Have a local copy of the function — these may have drifted
- Reference a function name that doesn't exist (import alias mismatch) — these are broken at runtime

### Phase 2: Fix by Bug Pattern

#### Pattern A: Local Shadow Drift (cleanOptionalValue sentinel mismatch)

The JS file has a local `cleanOptionalValue` function that only checks `'NULL'` instead of the full sentinel list: `['unknown', 'not found', 'none', 'none detected', 'n/a', 'null']` (case-insensitive).

**Diagnosis:** The local function was written before the canonical `dom-formatters.js` version was updated. The JS module never got updated to match.

**Fix:** Replace the local function body with the canonical implementation:

```javascript
function cleanOptionalValue(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (['unknown', 'not found', 'none', 'none detected', 'n/a', 'null'].includes(text.toLowerCase())) {
        return null;
    }
    return text;
}
```

**Verification:** The function now returns `null` for `'NULL'`, `'UNKNOWN'`, `'NOT FOUND'`, `'NONE'`, `'NONE DETECTED'`, `'N/A'`, and any case variation.

#### Pattern B: Import Alias Mismatch (semantic-threads _cleanOptionalValue)

The TS file imports `cleanOptionalValue` from dom-formatters but the code references `_cleanOptionalValue` (underscore-prefixed) — a function that doesn't exist in the TS file. The JS file has a local `_cleanOptionalValue` which is the one actually used.

**Diagnosis:** The TS import was written later and uses a different name than the code expects. The JS shadow has a private helper with a different name.

**Fix:** Alias the import to match the code's expected name:

```typescript
import { cleanOptionalValue as _cleanOptionalValue } from './utils/dom-formatters.js';
```

**Verification:** The function now exists and uses the canonical sentinel filtering from dom-formatters (better than the JS local version which had NO filtering at all).

#### Pattern C: Tokenization Pre-processing Gap

The TS tokenizer only does `normalize('NFC').toLowerCase().match(...)` while the JS tokenizer also strips smart quotes, replaces ampersands/slashes/hyphens/@/# with spaces, and collapses whitespace before segmentation.

**Diagnosis:** The TS port copied the basic regex pattern but missed the pre-processing pipeline.

**Fix:** Add the full pre-processing chain before word segmentation:

```typescript
const input = String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[''\u2019]/g, '')          // strip smart/straight quotes
    .replace(/[&]/g, ' ')               // ampersand → space
    .replace(/[/\\]/g, ' ')             // slash/backslash → space
    .replace(/[-_]+/g, ' ')             // hyphens/underscores → space
    .replace(/[@#]/g, ' ')              // at/hash → space
    .replace(/\s+/g, ' ')               // collapse all whitespace
    .trim();
```

#### Pattern D: Intl.Segmenter Missing

The TS tokenizer only uses the regex fallback (`match(/[\p{L}0-9]+/gu)`), missing the word-level grapheme-aware segmentation that `Intl.Segmenter` provides.

**Diagnosis:** The TS port simplified the tokenizer to always use the regex path, losing Intl.Segmenter for complex scripts.

**Fix:** Add the Intl.Segmenter branch with regex fallback:

```typescript
let words: string[];
if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    words = Array.from(segmenter.segment(input))
        .filter((s) => s.isWordLike)
        .map((s) => s.segment);
} else {
    words = input.match(/[\p{L}0-9]+/gu) || [];
}
```

### Phase 3: Add/Update Unit Tests

For each changed function, add tests that cover:

1. **The canonical behavior** — tests that pass for both JS and TS tracks after the fix.
2. **The specific sentinel/tokenization edge cases** that the bug report identified.
3. **Case-insensitive matching** for sentinels.
4. **Null/undefined/empty/whitespace input** for robustness.

**Testing non-exported helpers:** If the function isn't exported (Pattern A — local function in a JS module), test through the **public API**:

```javascript
// Instead of trying to import cleanOptionalValue (not exported),
// test through mapRawRecordToPoint:
const makeRow = (overrides) => { /* build a full row with overrides */ };

it('returns null for NULLISH_SENTINELS in name field', () => {
    for (const sentinel of ['NULL', 'unknown', 'NOT FOUND', 'none', 'N/A']) {
        const point = mapRawRecordToPoint(makeRow({ name: sentinel }));
        expect(point.name).toBeNull();
    }
});
```

**Tokenization test edge cases to watch for:**
- `"O'Brien"` → should produce `["obrien"]` (quotes stripped, no split)
- `"AT&T"` → `"at"` is a stop word → `[]` (ampersand→space split, stop-word filtering)
- `"co-op"` → `["co", "op"]` (hyphen→space split, both >1 char)
- `"a   b"` → `[]` (both are stop-word/short, filtered)
- Smart quotes: `"O\u2019Brien"` (right single quotation mark) → same as `"O'Brien"`

### Phase 4: Cross-Track Consistency Check

After fixing, verify that no other TS shadows have the same drift. Grep for:

```bash
# Find any local cleanOptionalValue-like functions that might have drifted
grep -rn "function cleanOptional\|function _cleanOptional\|NULL.*NOT FOUND\|value === 'NULL'" --include="*.ts" --include="*.js" .
```

Also check for import alias mismatches:

```bash
# Find places where a function is called with an underscore prefix but imported without
# This catches the semantic-threads.ts pattern
```

### Phase 5: Verification Gate

Run the full test suite and verify:

```bash
npm run test:unit          # All unit tests pass
npm run check              # TypeScript/Svelte check (if applicable)
```

**Known false positives to anticipate:**
- `cleanOptionalValue` in `data-mapper.ts` (TS) may already import from `dom-formatters` and be correct — verify before adding a non-existent fix.
- `data-loader.ts` may already use the imported function correctly — verify before changing.
- Tokenization tests for `"AT&T"` → empty `[]` because `"at"` is a stop word — this is correct behavior, not a test bug.
- Tokenization tests for `"a   b"` → empty `[]` because both tokens are filtered — correct behavior.

### Phase 6: Synthesis Report

```
## Cross-Track Data Parity Fix Results

| # | Item | Track | Pattern | Changed File | Verification |
|---|---|---|---|---|---|
| 1 | cleanOptionalValue sentinel drift | JS | A | data-mapper.js | ✅ test passes |
| 2 | cleanOptionalValue in data-loader.ts | TS | False positive | (no change) | ✅ already correct |
| 3 | import alias _cleanOptionalValue | TS | B | semantic-threads.ts | ✅ function now exists |
| 4 | tokenizer special-char pre-processing | TS | C | tokenizer.ts | ✅ O'Brien → obrien |
| 5 | tokenizer Intl.Segmenter | TS | D | tokenizer.ts | ✅ grapheme-aware |

**Tests:** +N tests (file: test-file.js)
**npm run test:unit:** ALL PASS (M/N tests)
**Remaining open items:** [list any findings outside scope or false positives]
```

## Common Pitfalls

| Trap | How to avoid |
|---|---|
| Fixing the TS file when the bug is in the JS file (or vice versa) | Read both files; determine which track the report is actually about |
| Assuming `data-loader.ts` has the same drift because the report says so | Verify by reading the file — it may already import from canonical |
| Testing a non-exported helper directly and getting "not a function" | Test through the public API instead |
| Writing a tokenizer test that produces `["att"]` when it should be `[]` | Account for stop-word filtering in the test expectation |
| Writing a tokenizer test that produces `["a", "b"]` when both would be filtered | Single-letter tokens and stop words are always filtered |

## Adjacent Skills

- **BUGSWEEP_CLAIM_FALSIFICATION_CHECK** — Run BEFORE this skill when the bug list comes from a sweep with broad claims about what code does.
- **STRUCTURED_BUG_SURGERY** — General multi-bug fix methodology with adversarial review; use when bugs span multiple layers beyond data parity.
- **SVELTE_MIGRATION_PARITY_AUDIT** — Layer 10 (Cross-Track Copy Detection) covers the *audit* side; this skill covers the *fix* side of the same pattern.
- **STATE_DESYNC_PARITY_SURGERY** — For store-level state desyncs, not data-processing parity.
