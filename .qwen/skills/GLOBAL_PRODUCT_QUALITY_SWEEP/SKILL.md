---
name: Global Product Quality Sweep
description: Systematic cross-layer audit for Unicode handling, encoding integrity, normalization consistency, and localization readiness in web applications with search, caching, and data ingestion pipelines.
source: auto-skill
extracted_at: '2026-06-06T23:15:55.000Z'
---

# Global Product Quality Sweep — Unicode, Encoding, Normalization, i18n Audit

Use this when you need a **systematic internationalization and data quality audit** covering four layers: Unicode stress testing, normalization traceability, encoding verification in the data pipeline, and localization readiness. This is not a general bug sweep — it targets the specific failure modes that arise when non-ASCII data enters a system built for ASCII-only defaults.

## When to Use

- The application has search, text indexing, or data ingestion that must handle multi-byte characters (emojis, CJK, accented Latin, non-Latin scripts).
- You're migrating from a legacy stack to a new one (e.g., JS → TypeScript/Svelte) and need to verify that Unicode handling wasn't silently dropped in the port.
- A user reports garbled text, missing search results, or incorrect deduplication for non-ASCII queries.
- You're preparing for internationalization and need a hardcoded-string inventory and locale-dependency audit.
- Before a release that touches data parsing, search, or UI display paths.

## When NOT to Use

- **General bug sweep:** Use `STRUCTURED_BUG_SURGERY` for that.
- **Logic/state audits:** Use `DEEP_DIVE_LOGIC_AUDIT` for race conditions, deadlocks, and memory leaks.
- **Migration completeness check:** Use `SVELTE_MIGRATION_PARITY_AUDIT`.
- **Project status snapshot:** Use `PROJECT_STATUS_READ`.
- **Specific state desync fixes:** Use `STATE_DESYNC_PARITY_SURGERY`.

## The Four-Layer Audit

### Layer 1: Unicode Stress Test — Search & Tokenization

Verify that the search engine, tokenizer, and query pipeline handle multi-byte characters without corruption, splitting, or incorrect matching.

**Procedure:**

1. **Trace the tokenization path.** Read both the production tokenizer and any migrated/ported version in parallel:
   ```bash
   # Find all tokenizer implementations
   find . -name "search-tokenizer.*" -o -name "tokenizer.*"
   ```
   For each implementation, check:
   
   a. **NFC normalization:** Is `.normalize('NFC')` applied BEFORE `.toLowerCase()`? (Required so "é" (NFC U+00E9) and "e\u0301" (NFD) map to the same token.)
   
   b. **Grapheme-aware segmentation:** Does the tokenizer use `Intl.Segmenter` (preferred) or fallback regex? If regex: does it use `\p{L}` (Unicode property escape) or `[a-zA-Z]` (ASCII-only)? `[a-zA-Z]` silently drops every non-English letter.
   
   c. **Stop-word removal:** Does the stop-word set only contain ASCII words? If so, non-English queries won't have stop-word filtering applied (asymmetrical with English). Evaluate whether that's intentional.
   
   d. **Smart-quote handling:** Does normalization strip curly/smart quotes (`'\u2019`, `\u201c`, `\u201d`) before tokenization? Otherwise "O'Brien" and "O'Brien" (different apostrophe chars) produce different tokens.

2. **Cross-reference implementations.** If the project has both `.js` and `.ts` tokenizers:
   - Does the `.ts` version have the same `Intl.Segmenter` branch? If it only uses regex, it lost the superior grapheme-aware path.
   - Do both versions apply NFC normalization at the same point in the pipeline?
   - Are the stop-word sets identical?

3. **Check the mock/test fallback path.** If the app has a mock search backend (static dev fallback), does it normalize? Mock paths that skip NFC may produce different search results than production, masking Unicode bugs during development.

**Key question:** Can user search queries containing `é`, `ñ`, `ü`, `€`, emoji, or CJK characters reach the production backend uncorrupted and yield correct results?

**Evidence format:**
```
### Layer 1 Finding — <title> — SEVERITY
- **Path:** file:line for the tokenizer(s)
- **Gap description:** what's missing or different between implementations
- **Impact:** what goes wrong (silent missing results, false matches, garbled output)
- **Example:** "Searching for 'café' (NFD) returns 0 results because the cache key is 'cafe' but the stored key for the NFC input is 'café'"
```

### Layer 2: Normalization Audit — Cache Key Consistency

Verify that NFC normalization is applied **consistently at every boundary** where a user-facing string becomes a cache key, database key, or comparison token.

**Procedure:**

1. **Identify all cache key derivation functions.** Grep for patterns that transform query text into stored keys:
   ```bash
   grep -rn "normalize\|cacheKey\|cache.*key\|getKey\|\.trim()\|\.toLowerCase()" --include="*.js" --include="*.ts" .
   ```
   Typical locations: search cache modules, auto-complete caches, session storage wrappers.

2. **Verify store/lookup symmetry.** For each cache, check:
   - **Store path:** Does `storeSemanticSearchPayload("café")` produce the same key as...
   - **Lookup path:** `getCachedSemanticSearchPayload("café")`?
   - **IDB reload path:** On page reload, `initSearchCache()` loads keys from IndexedDB — are those keys already NFC-normalized (because they were normalized at store time)?
   - **Diagram the full flow:**
     ```
     User input → trim → NFC → lowercase → key → IDB store
     User input → trim → NFC → lowercase → key → IDB lookup
     ```

3. **Check IndexedDB key handling.** IndexedDB stores string keys as UTF-16. No encoding transform occurs. But if the IDB wrapper does any `.toString()`, `JSON.stringify`, or custom serialization on keys, that's a risk:
   - Grep for `store.put(value, key)` in IDB wrappers — keys should pass through verbatim.
   - Check if the `entries()` function that restores cache on reload preserves key identity.

4. **Check the tokenization-to-cache alignment.** If the tokenizer uses NFC but the cache skips it, a query like "café" might find cached results via token matching but miss the cache (or vice versa). They must be on the same normalization basis.

5. **Check normalization in the data loading path.** Business names, cities, and descriptions loaded from JSON files — is there any normalization applied during ingestion? If a JSON file contains "Straße" (U+00DF) vs "Strasse", does the system treat them as distinct? That may be correct (they're distinct spellings) but confirm it's intentional.

**Key question:** For every path where a user-entered string becomes an internal key or token, is NFC normalization applied exactly once, at a consistent point, and verifiably idempotent?

### Layer 3: Encoding Verification — Data Ingestion Pipeline

Audit the full data loading path from raw file to in-memory structures for encoding drift, sentinel leakage, and silent data loss.

**Procedure:**

1. **Map the data flow:**
   ```
   Data source (JSON/gzip) → Fetch → JSON.parse → Worker postMessage / main-thread → Data objects → State/Stores
   ```

2. **At each boundary, verify encoding fidelity:**
   
   a. **Fetch + JSON.parse:** `response.json()` decodes the HTTP body as UTF-8 per the Fetch spec. If the source file was compressed (`.gz`), does the decompression produce correct UTF-8 bytes? Check the server's `Content-Type` — it must include `charset=utf-8` or default to UTF-8 for JSON.
   
   b. **Worker postMessage:** For strings passed through Web Worker messages, the structured clone algorithm correctly handles all UTF-16 code points. However, if the worker does manual `String(value)` or regex transforms before posting, those transforms could introduce encoding errors. Check the worker's message handler.
   
   c. **Transferables vs. strings:** If binary data (Float32Array, Uint16Array) is transferred via `postMessage(..., [buffers])`, and string data is side-by-side in the same payload object, verify the transfer list doesn't include the string payload. (It shouldn't — strings aren't transferable.)

3. **Audit the `cleanOptionalValue` / sentinel stripping layer.**
   
   This is the single highest-risk encoding boundary in most data pipelines. Some raw data sources include sentinel strings representing "no data" — `"unknown"`, `"not found"`, `"n/a"`, `"none"`, `"none detected"`, `"null"`, `"NULL"`. These must be normalized to `null` to prevent displaying "unknown" as a business name or city.
   
   **Critical check:** Compare every implementation of `cleanOptionalValue` in the project:
   ```bash
   grep -rn "function cleanOptionalValue\|function _cleanOptionalValue" --include="*.js" --include="*.ts" .
   ```
   For each, check:
   
   | Implementation | Sentinels | Behavior when value is a sentinel |
   |---|---|---|
   | `data-loader.js` | `undefined`, `null`, `''`, `'NULL'` + `NULLISH_SENTINELS` Set | Returns `null` |
   | `data-loader.ts` (same folder) | `undefined`, `null`, `''`, `'NULL'` | Returns `null` |
   | `semantic-threads.ts` `_cleanOptionalValue` | `undefined`, `null` | Returns `String(value)` — **no sentinel check** |
   | `src/lib/data-loader.ts` | Same as `.js` with `NULLISH_SENTINELS` | Returns `null` |
   
   **Drift pattern:** When a `.ts` shadow is less strict than its `.js` counterpart, sentinel values like `"unknown"` or `"n/a"` pass through as valid data, polluting the UI.

4. **Check bounds/validation functions for encoding awareness.** Functions that validate data bounds (like `checkDataBounds` for 3D coordinates) should not assume string inputs are ASCII. If they use regex like `/^[a-z0-9]+$/i` to validate names, non-ASCII names will fail validation.

**Key question:** For every parallel implementation (`.js` vs `.ts` shadow), do they treat sentinel/empty values identically? Are there data-cleaning differences that would cause the same record to display differently depending on which loader path was used?

### Layer 4: Localization Readiness — Hardcoded Strings & i18n Gap

Inventory all user-facing strings that would need translation and assess the existing i18n infrastructure.

**Procedure:**

1. **Check for i18n infrastructure:**
   ```bash
   # Quick scan for i18n libraries, locale files, or translation utilities
   grep -rn "i18n\|i18next\|formatjs\|intl\|locale\|translation" package.json --include="*.json" -l
   find . -name "*.po" -o -name "*.pot" -o -name "locale*" -o -name "translations*" 2>/dev/null
   ```
   If none exist, the entire UI display layer is hardcoded English — a full i18n adoption is needed.

2. **Hardcoded string census.**
   
   Identify the files with the highest string density. These are the priority targets for extraction:
   ```bash
   # Most common patterns for hardcoded English strings in UI code
   grep -rn "textContent =\|innerHTML =\|innerText =\|\.placeholder =\|\.title =" --include="*.js" --include="*.ts" --include="*.svelte" \
     js/modules/ src/ --include="*.js" --include="*.ts" --include="*.svelte" \
     | grep -v "node_modules\|\.test\|\.spec\|debug\|console\." \
     | head -50
   ```
   
   For each relevant file, manually extract the strings and categorize them:
   - **Status messages** (e.g., "Type at least 2 characters to search")
   - **Error messages** (e.g., "Search failed. Try again.")
   - **UI labels** (e.g., "Skip", "Retry", "Trail", "Peer", "Bridge")
   - **Loading states** (e.g., "Gathering records...", "Raising the cloud...")
   - **Descriptive copy** (e.g., "Pick a business, then explore its nearby neighbors.")

3. **Check for translation-ready patterns in strings.**
   
   Are hardcoded strings built with:
   - **Template literals** with embedded variables? (Good — easy to parameterize in i18n) e.g., `` `1 match for "${query}"` ``
   - **String concatenation** with hardcoded English fragments? (Bad — hard to translate) e.g., `"Found " + count + " results."`
   - **Pluralization built into strings?** (Needs proper plural handling) e.g., `count === 1 ? "1 match" : count + " matches"`

4. **Assess the `relationship-roles` / copy-table pattern.**
   
   Structured copy tables (role → {label, title, reason}) are the easiest i18n target because the data is already key-value pairs. Check:
   - Can the table be extracted into a JSON locale file?
   - Are there multiple versions of the table (legacy `.js` vs migrated `.ts`) that need reconciliation before extraction?
   - Are the labels referenced by surface variant (`rail`, `title`, `inside`) — do all variants need translation?

5. **Check locale-sensitive API usage.**
   ```bash
   grep -rn "toLocaleString\|localeCompare\|toLocaleLowerCase\|toLocaleUpperCase\|Intl\." --include="*.js" --include="*.ts" --include="*.svelte" .
   ```
   For each match:
   - Is an explicit locale argument passed? If not, it uses the browser's default locale, which is untestable cross-browser.
   - Is it used for number formatting (OK) or string display (needs review)?

6. **Check `nearDuplicateKey` / deduplication for Unicode stripping.**
   Many deduplication functions strip non-ASCII characters with `[^a-z0-9]` regex. This collapses distinct accented names into the same key, potentially merging unrelated businesses. The fix is `[\p{L}0-9]` with the `u` flag.

**Key question:** Which file(s) have the most hardcoded English strings? What's the easiest extraction target for phase 1 of i18n adoption?

## Cross-Cutting Analysis: Parallel Implementation Drift

Global quality bugs most often live not in a single file but in the **differences between parallel implementations** (.js vs .ts, legacy vs migration). After completing all four layers, synthesize findings across tracks:

1. **Compare the export surfaces** of every `.js` → `.ts` pair mentioned in findings:
   ```bash
   diff <(grep "^export " js/modules/search-tokenizer.js | sort) <(grep "^export " src/lib/search/tokenizer.ts | sort)
   ```
2. **Check for silent behavior changes:** A `.ts` file that skips NFC normalization, drops a sentinel check, or uses a narrower regex is the most common source of encoding bugs in migration projects.
3. **For each parallel pair, ask:** "If the app randomly used one or the other, would the user see different results?" If yes, that's a HIGH severity finding.

## Output Format

Structure the final report with one section per layer, each containing a table of findings. Each finding:

```
### Finding N — Title — SEVERITY
- **Layer:** 1 / 2 / 3 / 4 (Unicode / Normalization / Encoding / i18n)
- **Paths:** primary file and affected files with line numbers
- **Evidence:** the exact code excerpt or grep result showing the gap
- **Impact:** what the user would experience (missing results, garbled text, data leakage)
- **Fix approach:** concise recommendation with estimated complexity
- **Cross-track:** is this bug also present in the parallel implementation? (If yes, it needs fixing in both tracks.)
```

End with a **Risk Register** table and a **Recommended Fix Sequence** ordered by severity and dependency (e.g., fix the `cleanOptionalValue` sentinel drift that causes data corruption before fixing the tokenizer parity gap that degrades search quality on non-ASCII queries).

## Self-Verification

After writing the report:
1. **"Did I check both the `.js` AND `.ts` versions of every tokenizer/cache/cleaner function?"** — the gap is often between them, not within either one.
2. **"Did I verify every cache key derivation path has NFC normalization at both store and lookup?"** — if either path lacks normalization, cache poisoning occurs.
3. **"Did I check the IDB wrapper for key mangling?"** — IndexedDB string keys are safe by spec, but a wrapper that serializes keys with `JSON.stringify` would corrupt multi-byte strings.
4. **"Is the `nearDuplicateKey` function stripping non-ASCII?"** — this deduplication bug is extremely common and silently merges businesses with accented names.
5. **"What happens on the error/fallback path?"** — the main path may be clean, but the retry handler, degraded state, or mock fallback often skips normalization entirely.
6. **"Would the answer embarrass me?"** — If the system handles "cafe\u0301" and "café" differently in even one code path, the normalization audit is incomplete. Re-read every normalization boundary.
