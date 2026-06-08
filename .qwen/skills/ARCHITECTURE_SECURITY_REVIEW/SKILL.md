---
name: ARCHITECTURE_SECURITY_REVIEW
description: Systematic first-principles review of data ingestion, legacy-to-modern bridge seams, silent-failure catch blocks, and parity drift between parallel JS/TS implementations.
source: auto-skill
extracted_at: '2026-06-06T23:45:00.000Z'
---

# Architecture & Security Review — First-Principles Audit

Use this when you need a **ground-up adversarial review** of the integration seams in a multi-track (legacy + migration) front-end application. This is not a bug sweep for known issues — it uncovers systemic risks that unit tests won't catch: data corruption in typed store wrappers, production-silent error reporting, memory leaks in bridge lifecycle management, and silent behavior drift between parallel implementations.

## When to Use

- Before a release that touches data ingestion, IndexedDB caching, or legacy-to-modern bridge layers
- After a large migration phase (JS → Svelte/TS) to verify the integration seams haven't developed hidden contradictions
- When the user asks for a "final look-over" or "devil's advocate" review before ship
- When you suspect error paths are being silently swallowed in production
- After completing a `DEEP_DIVE_LOGIC_AUDIT` or `STRUCTURED_BUG_SURGERY` and want a fresh lens focused specifically on data integrity and security boundary violations

## When NOT to Use

- **Fixing known bugs:** Use `STRUCTURED_BUG_SURGERY`.
- **General logic audit (deadlocks, races, memory leaks):** Use `DEEP_DIVE_LOGIC_AUDIT`.
- **Unicode/encoding/i18n audit:** Use `GLOBAL_PRODUCT_QUALITY_SWEEP`.
- **Migration parity check:** Use `SVELTE_MIGRATION_PARITY_AUDIT`.
- **State desync fixes:** Use `STATE_DESYNC_PARITY_SURGERY`.

## The Four-Pillar Review

### Pillar 1: Data Ingestion Corruption Risk

Audit the full data flow from source file → fetch → parse → typed stores for:
- **Race conditions in typed store wrappers** over IndexedDB
- **Sentinel/value drift** between parallel `.js` and `.ts` implementations
- **Typed array buffer corruption** from misaligned strides or partial writes

**Procedure:**

1. **Map the data flow chain:**
   ```
   Data source (.dat/.json/.gz) → Fetch → JSON.parse → Worker postMessage (if applicable) → Data mapper → Store set()
   ```
   Identify every boundary where the data shape could change.

2. **Check IndexedDB wrapper for request-level races.**

   Read the `entries()` and `keys()` functions specifically. The most common bug pattern:
   - A function issues two IDBRequest objects (`getAllKeys()` and `getAll()`) in the same transaction.
   - It reads `valsReq.result` inside `keysReq.onsuccess`, *before* `valsReq` completes.
   - This produces `[key, undefined]` pairs under load.

   **Verification:** For each IDB request pair in the same transaction:
   - Does the code read values from `valsReq` inside `keysReq.onsuccess`? → **Race condition.**
   - Does the code read values inside `transaction.oncomplete`? → **Correct.**
   - Does the code read values inside `valsReq.onsuccess`? → **Correct.**

3. **Compare every `cleanOptionalValue` implementation across all files.**

   ```bash
   grep -rn "function cleanOptionalValue\|function _cleanOptionalValue" --include="*.js" --include="*.ts" .
   ```
   For each, build a comparison table:

   | Implementation | Sentinels checked | Length checks | Returns |
   |---|---|---|---|
   | `js/old-loader.js` | `undefined, null, '', 'NULL' + unknown/not found/none/n/a/none detected/null` | Yes | `null` |
   | `src/lib/new-loader.ts` | Same or subset? | Same or stricter? | `null` or falls through? |

   **The critical finding:** If the `.ts` shadow has a *smaller* sentinel set than the `.js` original, sentinel values like `"unknown"` pass through as valid data. This is HIGH severity — it pollutes the UI with "unknown" as a business name or city.

4. **Verify typed array bounds and stride.**

   For Float32Array/Uint16Array buffers constructed from parsed data:
   - Is the stride correct? (Float32Array positions: `count * 3` elements, cluster assignments: `count` elements)
   - Are out-of-bounds values checked? (3D positions should be in `[0, 1]` unit cube)
   - Is the sample strategy robust? (Stride-sampling can miss single-point corruption; full-buffer scan is safer for production data)
   - Are NaN/Infinity values caught at parse time?

5. **Check enrichment/data fetch error handling.**

   When an optional side-channel fetch fails (e.g., enrichment JSON):
   - Is the error logged to a path that is **visible in production** (not only `debugWarn`)?
   - Does the main data load *actually* continue correctly without enrichment?
   - Is there a test that verifies the degraded-fallback path?

**Evidence format:**
```
### Finding — Title — SEVERITY
- **Pillar:** 1 (Data Ingestion)
- **Path:** file:line(s) of the race or drift
- **Evidence:** exact code excerpt showing the problem
- **Impact:** what the user experiences (data corruption, wrong values displayed, production throw)
- **Fix:** concise approach (e.g., "Move read inside valsReq.onsuccess")
- **JS/TS parity:** is the bug in one track or both?
```

### Pillar 2: Bridge Seam Analysis (Memory Leaks & Lifecycle)

Audit the legacy-to-modern bridge for:
- **Init/destroy symmetry** — every side effect created in `init()` must be reversed in `destroy()`
- **Dynamic import side-effect races** — subscriptions that fire before the bridge is fully initialized
- **Closed-over stale references** — callback closures that capture old state after re-init
- **Graph cycles** — whether the bridge can be garbage-collected when the owning Svelte component is destroyed

**Procedure:**

1. **Map the init → ready → destroy lifecycle.**

   Read the factory function (e.g., `createEngineBridge()`) end to end. For each phase:

   | Phase | Side effects created | Module references captured | Subscriptions registered |
   |---|---|---|---|
   | `init()` | DOM element creation (#canvas-container), dynamic module imports, state sync, event bus subscriptions, DOM event listeners, RAF start | 7+ legacy modules, state singleton | 3+ event bus + 1 DOM event |
   | `destroy()` | What's reversed: event unsubs, DOM listener removal, mycelium disposal, engine deinit, module nulling | Should null ALL refs | Should clear ALL unsubs |
   | Error path | If `init()` throws mid-way, does it clean up partially-registered subscriptions? | Module refs may be half-nulled | Event unsubs may be incomplete |

2. **Find the "import race" pattern.**

   Some bridges use dynamic `import()` for the event bus module *inside* a lifecycle function:
   ```ts
   async function bindEventBridge(): Promise<void> {
     const mod = await import('...event-bus.js');
     // subscribe...
   }
   ```
   **Risk:** If `destroy()` is called before this `import()` resolves, the subscription registers *after* cleanup, leaking. Check:
   - Is there a guard (`_destroyed` flag) that prevents subscription after destroy?
   - Or is the import awaited inside init() before status changes to 'ready'?
   - **Fix pattern:** await the bus import as part of the main init sequence, not in a fire-and-forget function.

3. **Check `withStateMutation` acquisition path.**

   Some bridges read `window.withStateMutation` (a side effect set by the legacy state module) rather than importing it directly:
   ```ts
   function _acquireWithMutation(): void {
     if (typeof window !== 'undefined' && (window as any).withStateMutation) {
       _withMutation = (window as any).withStateMutation;
     }
   }
   ```
   **Risks:**
   - If `window.withStateMutation` is set after the bridge reads it → the bridge silently falls back to `fn => fn()` (no-op wrapper)
   - Every critical-property write then becomes an illegal direct mutation → `[State Error]` throws in production
   - **Fix:** import `withStateMutation` directly from the legacy state module's export, not via window.

4. **Check exported interface completeness vs implementation.**

   For every method in the bridge's public interface:
   - Does the implementation exist?
   - Does it call `assertReady()` (defensive) or silently return?
   - Are the return types consistent (no `undefined` where `number` is declared)?

5. **Verify event subscription cleanup integrity.**

   Read the unsubscribe loop:
   ```ts
   for (const unsub of _eventUnsubs) {
     try { unsub(); } catch (_) { /* best-effort */ }
   }
   ```
   - Are all `subscribe()` calls' return values stored in `_eventUnsubs`?
   - Is `_eventUnsubs` cleared after iteration?
   - If `bindEventBridge()` throws mid-way, are the already-registered unsubs cleaned up?

**Evidence format:**
```
### Finding — Title — SEVERITY
- **Pillar:** 2 (Bridge Seam)
- **Path:** file:line(s) of the leak, race, or gap
- **Lifecycle phase:** init / ready / destroy / error recovery
- **Evidence:** code excerpt or lifecycle diagram
- **Impact:** what happens after N init/destroy cycles (leak accumulates, stale listeners fire, GC blocked)
- **Fix:** concise approach
```

### Pillar 3: Silent-Failure Catch Block Audit

This is the highest-ROI pillar. Trace every `catch` block in the critical path and classify whether the error is **surfaced, logged to visible channel, or silently swallowed.**

**Procedure:**

1. **Catalog every catch block in the review scope.**

   ```bash
   grep -rn "catch" --include="*.ts" --include="*.js" src/lib/ js/modules/ | grep -v "node_modules\|\.test\|\.spec"
   ```

   For each catch block, answer:
   - What is logged? `console.error(...)`, `debugWarn(...)`, `console.warn(...)`, or nothing?
   - Is the logging function **gated** by a debug/production check?
   - Does the application state change on error? (degraded mode? retry? fallback?)
   - Can the user tell something went wrong?

2. **Determine if `debugWarn` is production-silent.**

   Read the diagnostic-adapter or debug utility:
   ```ts
   export function debugWarn(...args: unknown[]): void {
     if (!isDebugProbesEnabled()) return;  // ← RETURNS EARLY IN PRODUCTION
     console.warn(...args);
   }
   ```
   If `isDebugProbesEnabled()` is `false` for non-localhost hosts, **every** call to `debugWarn` is silent in production.

3. **Map each debugWarn call to the error severity.**

   | Error | Current logging | Production visibility |
   |---|---|---|
   | IDB transaction timeout | `debugWarn` | **SILENT** |
   | IDB transaction error | `debugWarn` | **SILENT** |
   | IDB open failure | `debugWarn` | **SILENT** |
   | Fetch retry failure (3 attempts) | `debugWarn` | **SILENT** |
   | Semantic thread load failure | `debugWarn` | **SILENT** |
   | Canvas interaction binding failure | `console.warn` | Visible |
   | Bridge init failure | `console.error` | Visible |

4. **Check for swallowed errors with no diagnostic at all.**

   The most dangerous pattern is a catch that does **nothing** except a no-op comment:
   ```ts
   } catch { /* storage full — ignore */ }
   ```
   Or:
   ```ts
   try { tx.abort(); } catch (_) { /* best-effort */ }
   ```
   These are *silent by design* — which is acceptable for best-effort cleanup but dangerous for data integrity operations.

5. **Assess the "silent capability loss" pattern.**

   Some errors are logged via `console.warn` but with no fallback behavior. The app reports "ready" but a critical capability is broken:
   - Canvas interaction bindings failed → clicks do nothing → engine is "ready"
   - Event bus subscription failed → camera callbacks never fire → Svelte store never updates on focus → engine is "ready"

   **This is the worst failure mode:** the app appears functional but core interactions don't work, and there's no user-facing signal.

**Evidence format:**
```
### Finding — Title — SEVERITY
- **Pillar:** 3 (Silent Failure)
- **Path:** file:line(s)
- **Error path:** the condition that triggers the catch (timeout, network error, etc.)
- **Current logging:** `debugWarn` / `console.warn` / `nothing`
- **Production surface:** visible or silent
- **Impact:** what the user sees (nothing → blank screen → broken interaction)
- **Fix:** e.g., "Split debugWarn into a gated debug log and an always-on error reporter"
```

### Pillar 4: Parity Drift Verification (JS ↔ TS)

The most common source of bugs in migration projects: a `.ts` shadow file that *almost* matches its `.js` original but has a subtle behavior difference.

**Procedure:**

1. **Identify parallel file pairs.**

   Look for files with the same base name in `js/modules/` and `src/lib/`:
   ```bash
   diff <(find js/modules -name "*.ts" -exec basename {} \; | sort) <(find src/lib -name "*.ts" -exec basename {} \; | sort)
   ```

2. **For each pair, check function-by-function for drift.**

   The highest-risk functions:
   - `cleanOptionalValue` — sentinel set differences
   - Tokenizers / search helpers — normalization steps, regex patterns
   - `normalizeLeadId` / `normalizeRole` — trimming, empty-string handling
   - `entries()` — IDB request ordering (see Pillar 1)
   - `escapeHtml` — escaping completeness

3. **Use grep to verify specific patterns across both tracks.**

   ```bash
   # Check if sentinel list matches
   grep -o "unknown\|not found\|none\|none detected\|n/a\|null" js/modules/data-loader.js | sort -u
   grep -o "unknown\|not found\|none\|none detected\|n/a\|null" src/lib/data-loader.ts | sort -u
   ```

4. **Check for stale memory/notes about differences.**

   If a memory or sweep document claims a specific difference exists (e.g., "the TS shadow only checks `value === 'NULL'`"), verify the claim against the current file. The bug may have been fixed already, making the memory stale.

**Evidence format:**
```
### Finding — Title — SEVERITY
- **Pillar:** 4 (Parity Drift)
- **Path:** .js file:line vs .ts file:line
- **Difference:** what the .js does vs what the .ts does
- **Impact:** when would this matter in production
- **Status:** CONFIRMED (drift exists) / STALE_MEMORY (claimed drift already fixed)
```

## Prioritization Framework

| Severity | Criteria | Example |
|----------|----------|---------|
| 🔴 **HIGH** | Data corruption; production throw; capability loss with no user signal | IDB entries() race produces [key, undefined]; `debugWarn` gates all error reporting in prod; bridge throws `[State Error]` on correct usage |
| 🟠 **MEDIUM** | Silent degradation under edge case; catch blocks swallow recoverable errors; memory leak on repeated init/destroy | Enrichment fetch fails silently; stale event subscriptions accumulate per session |
| 🟢 **LOW** | Code smell; maintenance burden; foot-gun for future refactors | `_acquireWithMutation` windows global; `hoverHighlightIndex` direct write; stale memory files |

## Output Format

Structure the report with one section per pillar, each containing a table of findings. End with:

1. **Risk Register** (table sorting findings by severity)
2. **Recommended Fix Sequence** (ordered by dependency — e.g., fix the `debugWarn` gate before fixing the IDB entries race, because the IDB fix's success is unverifiable without the error channel)
3. **Things checked and found clean** (explicitly list what was audited and passed, so stakeholders know which areas were verified)

### Finding Block Template

```
### Finding N — Title — [HIGH / MEDIUM / LOW]
- **Pillar:** 1 / 2 / 3 / 4
- **Path:** file:line(s)
- **Evidence:** exact code excerpt
- **Impact:** production symptoms
- **Fix:** concise approach
```

## Self-Verification

After completing all findings:

1. **"Would this answer embarrass me?"** — Check each severity claim. Is the evidence strong enough that you would defend it to the team? If you're unsure, re-read the file.
2. **"Did I check the `.js` version?"** — For every finding in a `.ts` file, you must read the corresponding `.js` file. The bug may be in both tracks (affecting fix complexity) or only in one (indicating drift).
3. **"Did I trace the error path end to end?"** — For every catch block, trace what the user experiences. A `debugWarn` call in an IDB timeout handler means "user sees a hanging cache with zero diagnostic information." Don't stop at "it logs."
4. **"Did I check destroy/cleanup?"** — For every init-time side effect (import, subscription, listener), you must find where it's cleaned up. If cleanup is missing, that's a memory leak finding regardless of whether the leak is "small."
5. **"Is there a simpler explanation?"** — If a finding requires a three-way chain of coincidences to manifest, it's probably LOW. If it's a single unguarded path that happens every time, it's HIGH. Be honest about probability.
6. **"Did I verify memory claims?"** — If a memory file or bug report claims a specific difference exists, verify it against the current code. Memories go stale; stale claims waste everyone's time.

## Adjacent Skills

- **DEEP_DIVE_LOGIC_AUDIT** — Run before this skill if you need broader logic/deadlock/race coverage; this skill focuses on data integrity and security boundaries.
- **STRUCTURED_BUG_SURGERY** — Use after this skill to fix confirmed findings.
- **GLOBAL_PRODUCT_QUALITY_SWEEP** — Use when findings from this review include Unicode/internationalization concerns.
- **STATE_DESYNC_PARITY_SURGERY** — Use when Pillar 4 (Parity Drift) reveals state synchronization gaps.
