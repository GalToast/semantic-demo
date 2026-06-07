---
name: Deep-Dive Logic Audit
description: Systematic cross-module logic audit for deadlocks, race conditions, memory leaks, and facade inconsistencies in multi-track (legacy + migration) front-end applications.
source: auto-skill
extracted_at: '2026-06-07T01:30:00.000Z'
---

# Deep-Dive Logic Audit — Cross-Module Interaction Assurance

Use this when you need to find **elusive logical flaws** that span multiple modules: circular state dependencies, race conditions in async transitions, memory leaks from stale references, and architectural drift between parallel tracks. This is **not** a bug sweep for known issues — it's uncovering flaws the team hasn't noticed yet.

## When to Use

- A multi-tier architecture (stores ↔ bridge ↔ legacy engine) has accumulated over time and you suspect the seams are leaking.
- You're about to ship a major migration or release and want **pre-ship system-level assurance** beyond unit tests.
- The user asks specifically for a "deep-dive logic audit," "deadlock analysis," or "race condition review."
- After a long migration phase, you need to verify the orchestration layer hasn't developed hidden contradictions.

## When NOT to Use

- **Fixing known bugs:** Use `STRUCTURED_BUG_SURGERY` for that.
- **Migration completeness check:** Use `SVELTE_MIGRATION_PARITY_AUDIT`.
- **Project status snapshot:** Use `PROJECT_STATUS_READ`.
- **State desync fixes:** Use `STATE_DESYNC_PARITY_SURGERY`.
- **Parallel worker verification:** Use `DOUBLE_WORKER_VERIFICATION`.

## The Four-Pillar Audit

### Pillar 1: Deadlock Analysis — State Mutation Cycles

Look for **bidirectional state dependencies** that can lock up under sequence.

**Procedure:**
1. **Map the write topology.** For each stateful module (stores, bridge, legacy state singleton), list every module it writes to:
   - Svelte stores → `store.update()` calls
   - Bridge → legacy state writes via `withStateMutation()`
   - Legacy → event bus publishes that trigger store updates
   - Legacy → direct `state.*` mutations (unwrapped)

2. **Identify mutual dependency pairs.** Look for patterns where Module A writes Module B's state, and Module B writes Module A's state in the **same** event or RAF tick.

3. **Check the mutation guard contract.** In legacy state singletons with Proxy-based mutation guards:
   - Read the `CRITICAL_KEYS` set — which fields require `withStateMutation()`?
   - Grep for direct writes to those keys (e.g., `state.navState.* =`) across all legacy modules.
   - **Key insight:** The Proxy's `set` trap throws if `!_isMutating` and the key is critical. Every legacy module that writes these fields must wrap the write in `withStateMutation()`.
   - `grep -rn "state\.navState\." js/modules/ --include="*.js"` — count each write and verify the enclosing call context.

4. **Check nested Proxy return values.** If the state singleton returns a nested Proxy for sub-objects (Tracked Sub Keys), verify that:
   - The nested Proxy's `set` trap also checks `_isMutating`.
   - Modules that reach into nested objects (e.g., `state.navState.mode = 'focus'`) don't bypass the guard.
   - The Proxy's `get` returns a nested Proxy for TRACKED_SUB_KEYS — verify the recursive path doesn't double-wrap (dev vs production).

5. **Check `.js` vs `.ts` compliance divergence (Svelte migration anti-pattern).** In projects with parallel JS and TS tracks:
   - Read the `.js` file and check whether writes to `state.navState.*` are wrapped in `withStateMutation()`.
   - Read the corresponding `.ts` file (if it exists) and check the same writes.
   - **Pattern to catch:** `.ts` shadow files that were ported without the `withStateMutation()` wrapper, while the `.js` original has it. The TS side will throw in production because the production Proxy enforces the guard.
   - **Scale the find:** `grep -rn "state\.navState\.\w\+\s*=" --include="*.ts" js/modules/ | grep -v "withStateMutation"` — every match is a production throw waiting to happen.
   - Common offenders: `focus-pocket.ts`, `navigation-state.ts`, `micro-demo.ts`, `url-state.ts`, `loading-ui.ts`.
   - Note: `.js` files may also violate the contract if they weren't audited in the original sweep. Compare both tracks.

6. **Audit the parity layer subscription chain as a circular dependency vector.** If a parity-attrs module computes body `data-*` attributes from store snapshots:
   - Read the `installParityAttributeSync()` function and count how many stores it subscribes to.
   - **Danger threshold:** more than 5 raw subscriptions means any single store update triggers a full recompute, which writes DOM, which legacy code reads — creating a multi-path cycle.
   - For each subscription, trace whether the subscriber's `recomputeAndApply()` reads `document.body.dataset` (circular smell) or only store values (safe).
   - **Evidence format:**
     ```
     ### <title> — MEDIUM-HIGH
     - **Cycle:** store A updates → parity recompute → body.dataset.X changes → legacy code reads body.dataset.X → legacy calls store A.update() → cycle repeats
     - **Subscription count:** N stores in installer
     - **DOM-dependent derivation:** list the attr keys computed from body.dataset (not from stores)
     ```

**Evidence format:**
```
### Finding — <title> — SEVERITY
- **Cycle path:** A writes → B reads → B writes → A reads (diagram or chain)
- **File locations:** file:line for each mutation in the chain
- **Guard gap:** specific critical field written without `withStateMutation()`
- **Production impact:** what happens when this cycle fires (throw, silent state corruption, double-sync)
```

### Pillar 2: Race Condition Deep-Dive — Timing Vulnerabilities

Look for **unguarded async operations** where the outcome depends on timing of concurrent actions.

**Procedure:**

1. **Catalog all async transitions:**
   ```bash
   grep -rn "setTimeout\|setInterval\|requestAnimationFrame\|transition\|animate.*To\|settle\|prelude" src/lib/ js/modules/ --include="*.ts" --include="*.js"
   ```
   For each timeout/RAF/transition, record: duration, what state it changes on completion, and what could interrupt it.

2. **Identify timeouts that change state.** These are the highest risk:
   - Timeouts that update `document.body.dataset` (visual phase transitions)
   - Timeouts that call store update functions
   - Timeouts nested in conditional guards that check transient state (e.g., `if (phase === 'transitioning')`)

3. **Test each guard's interrupt resistance.** For each guarded timeout:
   ```
   User action → timeout queued → different user action BEFORE timeout → does the guard catch it?
   ```
   - If guard reads a transient flag (e.g., `dataset.phase === 'transitioning'`), what happens when the flag was already changed by the interrupting action?
   - If guard reads a store value with `get()`, what happens if the store was updated by the interrupt?

4. **Check for competing writers.** If multiple modules write the same DOM attribute or store field:
   - Can they fire in the same microtask?
   - Is there a last-writer-wins problem where the wrong one fires second?
   - Do timeouts from the first writer fire AFTER the second writer clears state?

5. **Look for transition token gaps.** Some stores have monotonically increasing tokens (`focusTransitionToken`, `requestSequence`). Check:
   - Does the bridge consume these tokens before acting?
   - If Module A increments the token and Module B ignores it, B's stale callback can overwrite A's fresh state.

6. **Analyze bridge event → store → bridge re-entrancy (deadlock cycle).** If a bridge module subscribes to legacy engine events that trigger Svelte store updates, check for re-entrant call paths:
   - Read the bridge's `bindEventBridge()` function. For each event subscription, trace the chain:
     ```
     Legacy engine fires event → bridge callback → callbacks.onNodePicked() →
     Svelte store.update() → $effect/subscriber → may call bridge.focusNode() again →
     engine processes → event fires again → ...
     ```
   - **Three patterns to catch:**
     1. **Direct re-entrancy:** `CAMERA_NODE_FOCUSED` → store → `$effect` calls `bridge.focusNode()` → same event fires again. No guard = infinite loop.
     2. **Indirect re-entrancy via parity:** event → store → parity recompute writes `body.dataset` → legacy code reads `body.dataset` → triggers another engine action → fires more events. Hard to trace because the cycle passes through DOM.
     3. **Dynamic import timing hazard:** bridge uses `import()` inside `bindEventBridge()` for the event bus module. If the bus isn't loaded yet (race with engine init), subscriptions silently fail and events are silently dropped.
   - **Fix pattern:** add a re-entrancy guard (counter or flag blocking re-entry while processing), or use a microtask queue that batches store updates and prevents re-entrant dispatch.
   - **Evidence format:**
     ```
     ### <title> — SEVERITY
     - **Cycle:** bridge event → callback → store → $effect → bridge → event (chain)
     - **Trigger event:** specific event name and which subscriber fires it
     - **Whether guarded:** does a monotonic token or flag prevent cycles, or is it unbounded?
     - **Import hazard:** does the bridge use dynamic import() for the event bus, creating a race condition?
     ```

**Evidence format:**
```
### Finding — <title> — SEVERITY
- **Timeline:** event sequence that triggers the race
- **Unguarded path:** specific function + line without interrupt guard
- **Failure mode:** stale state, wrong index, orphaned timeout, visual desync
- **Reproduction:** exact step sequence to trigger (>50% chance)
```

### Pillar 3: Memory/Object Graph Audit — Stale References

Look for **objects held past their useful lifetime** — the hardest runtime bugs because they're silent until memory pressure or stale events cause unpredictable failures.

**Procedure:**

1. **Check init/destroy symmetry.** For every module with an `init()` pair:
   - Does `destroy()` or `deinit()` exist?
   - Does it reverse every side effect: unsubscribe from event buses, remove DOM listeners, clear timer IDs, null module references, dispose GPU resources?
   - **Critical:** Does `init()`'s error path call cleanup? If `init()` throws after partial initialization, subscriptions and listeners leak.

2. **Trace event bus subscriptions across init cycles.** Two patterns to catch:
   - **No unsubscription in cleanup:** module subscribes at init but never unsubscribes. Each re-init duplicates listeners.
   - **Module-load-time subscriptions:** `subscribe()` called at module evaluation time (not inside a cleanup-managed lifecycle). Each hot-reload or context-restore cycle creates new listeners without removing old ones.

3. **Check timer ID tracking.** For modules that create `setTimeout`/`setInterval`:
   - Are timer IDs stored in a Map or array?
   - Is there a `clearAllTimers()` function?
   - Is `clearAllTimers()` called during reset? During destroy?
   - Grep for timers that are stored in module-level variables but never part of a cleanup registry.

4. **Identify bridge/module reference nulling.** After dispose:
   ```bash
   grep -n "= null" src/lib/engine/bridge.ts | head -20
   ```
   - Are all module references set to null?
   - Are DOM element references cleared?
   - Is the event bus unsubscribe array cleared?

5. **Check Map/Set growth without eviction.** Module-level Maps that grow monotonically:
   - `_timers`, `_bloomIndices`, `_bridgeIndices`, `_clusterSizeCache`
   - Are they ever cleared? Under what conditions?
   - Do they grow unbounded during normal operation?

6. **Check Proxy caches.** Proxy-based state singletons often use `WeakMap` caches:
   - `_prodProxyCache`, `_devProxyCache`
   - WeakMap doesn't prevent GC of keys, but Proxy closures retain string `path` references.
   - On repeated sub-object replacement (e.g., store `set()` replacing the whole state), old proxy entries accumulate.

**Evidence format:**
```
### Finding — <title> — SEVERITY
- **Leak source:** specific init path + unclosed subscription/ listener/timer
- **Leak rate:** per-session or per-cycle (e.g., "4 subscriptions per failed init attempt")
- **Trigger condition:** what reliably causes accumulation (e.g., "WebGL context restore calls init() again")
- **Cleanup gap:** what should be called but isn't
```

### Pillar 4: Architectural Gap Analysis — Facade Inconsistencies

Look for **interfaces that promise behavior but deliver none**, and **parallel implementations that compete**.

**Procedure:**

1. **Map all "bridge to nowhere" interfaces.** Grep for:
   - `// Legacy stub`, `// No-op`, `return null`, `return false`, `// Placeholder` in orchestration/module files.
   - For each stub, find the callers: `grep -rn "functionName" src/ js/`.
   - Classify each stub:
     - **Dead stub (no callers)** — safe to delete
     - **Live stub (has callers)** — calling code gets nothing back → silent degradation
     - **Bridge interface mismatch** — TypeScript interface declares return type, stub returns `null`

2. **Detect duplicate implementations.** For functions that exist in both legacy `.js` and ported `.ts`:
   - Read both. Do they have the same behavior?
   - Are both consumed by different callers?
   - If both mutate the same DOM/store, they are **racing implementations** — last writer wins non-deterministically.

3. **Check export surface completeness.** For each module ported from JS → TS:
   - `diff <(grep "^export " js/old.js | sort) <(grep "^export " src/lib/new.ts | sort)`
   - Every function missing from the TS side is either deliberately omitted (verify with a grep for callers) or a gap.
   - Every stub on the TS side is either an intentional placeholder (verify with a migration task) or a silent behavior change.

4. **Inventory concurrent writers of shared state.** For the legacy state singleton and Svelte stores that mirror the same logical data:
   - Is there an **invalidation protocol** — when legacy code mutates the state, does it signal the Svelte store through a known path?
   - Or are the two tracks **unsynchronized**, diverging silently when either track writes independently?
   - The most dangerous pattern: bridge writes to **both** tracks in `methodA()` but only the legacy track in `methodB()`.

**Evidence format:**
```
### Finding — <title> — SEVERITY
- **Interface:** file:line of the interface declaration
- **Implementation:** file:line of the stub or no-op
- **Callers:** `grep` results showing who consumes this function
- **Impact:** what breaks when the stub returns null / the duplicate races
- **Resolution:** clear next step (delete stub and interface, implement, or remove callers)
```

## Prioritization Framework

Classify each finding by impact:

| Severity | Criteria | Example |
|----------|----------|---------|
| 🔴 **CRITICAL** | Production throw; data loss; user-visible crash | Proxy traps throw on normal mutation; stale callback overwrites correct state |
| 🟠 **HIGH** | Silent state corruption; test contract failure; degraded UX | Dual writers race on DOM; bridge stub returns null to search callers; init leak accumulates |
| 🟡 **MEDIUM** | Predictable but rare; timer leak under specific sequence; missing test coverage | View switch prelude timer survives counter-switch; overflow handler not wired |
| 🟢 **LOW** | Code smell; maintenance burden; cosmetic desync under race | Dead code false-signals intent; WeakMap proxy cache accumulation |

## Output Format

Each finding in the report must include:

```
### Finding N — Title — SEVERITY
- **Pillar:** 1 / 2 / 3 / 4 (Deadlock / Race / Memory / Architecture)
- **Files:** primary and affected file paths with relevant line numbers
- **Evidence:** exact code excerpt showing the problem
- **Impact:** what happens in production or under test
- **Resolution:** fix approach with approximate complexity (Low/Medium/High)
```

End with a **Prioritized Risk Register** table sorting findings by severity, and a **Recommended Remediation Sequence** grouping fixes into phases that respect dependency order (e.g., don't remove dual writers before the parity layer is owner).

## Self-Verification

After completing all findings, ask:
1. **"What would make this report wrong?"** — if you missed the true state mutation cycle because you only read the Proxy `get` but not the `set` path, the report is incomplete. Re-read both.
2. **"Did I check the cleanup path?"** — for every init error path and destroy function, did I verify it reverses all side effects?
3. **"Did I test the interrupt path?"** — for every timeout/transition, did I consider what happens if the user acts again before it fires?
4. **"Is there a simpler explanation?"** — a race condition that requires three specific timings to trigger may be less harmful than a 1-step deadlock that always throws. Don't inflate rare races; don't miss certain deadlocks.

## Adjacent Skills

- **SVELTE_MIGRATION_PARITY_AUDIT** — Run before this skill if you suspect migration gaps; this skill assumes the migration structure exists and looks for logical flaws within it.
- **STRUCTURED_BUG_SURGERY** — Use after this skill to fix confirmed findings.
- **STATE_DESYNC_PARITY_SURGERY** — Specialized fix pattern for certain findings from Pillar 4 (facade inconsistencies leading to state desync).
- **DOUBLE_WORKER_VERIFICATION** — Use for high-risk fix implementation after this audit identifies the gaps.
