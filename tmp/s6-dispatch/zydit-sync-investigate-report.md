# ZYDIT-SYNC-INVESTIGATE Report

## Investigation findings

### Step 1: Route-ID allowlist / denylist
- **No allowlist or denylist.** `DENIED_AGENT_CATALOG_MODELS` (index.ts:165) = empty Set.
- `providerIdForBaseUrl()` (lines 928-929): `/zydit/v4` → `"router-zydit-v4"`, `/zydit/` → `"router-zydit"`. Zydit IS mapped.

### Step 2: `/v4` exclusion filter — **FOUND at index.ts:883-885**
```ts
const activeKeys = route.status?.activeKeys;
if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) return undefined;
```
- `/zydit/v1`: `status.activeKeys=2` → passes ✅
- `/zydit/v4`: `status.activeKeys=0` → **filtered OUT** ❌

### Step 3: Zydit catalog response
- `/zydit/v1/models` → **200 OK, 119 models** (`{object:"list", data:[...]}`). Parsed correctly by `parseCatalogModels` (line 724).
- `/zydit/v4/models` → returns `{"error":"Zydit v4 router has no keys currently off cooldown"}` — NOT an array. Even if v4 passed the gate, `parseCatalogModels` would return `[]`.

### Step 4: Provider-name mapping
- `providerKeyForRouterProviderId("router-zydit")` → `"zydit"` (line 317). ✅
- `providerKeyForRouterProviderId("router-zydit-v4")` → `"zyditv4"` (line 319). ✅
- Both in `REASONING_EFFORT_MAPS` (lines 520-521).

### Step 5: Recent failure handling
- Sync does NOT check `recentFailures`. Only checks `activeKeys` (line 883) or fallback `keys` (line 885). v4's `activeKeys=0` is the blocker.

### Step 6: Model-level zydit filtering
- `isAllowedForRouterProvider("router-zydit", ...)` → always `true` (zydit not in free-only list). ✅
- `modelEntryFromCatalog` lines 548-551: selectively blocks minimax-m3 on v4 only — no general block.
- Line 798-800: blocks one specific model (`inclusionai/ring-2.6-1t:free`) — not a pattern.

## Root cause hypothesis

**Primary:** `/zydit/v4` is dropped by `activeKeys<=0` gate at index.ts:884. The V4 route has all keys on cooldown (`activeKeys: 0`), so sync skips it entirely. This is intentional design — skip cold routes.

**Secondary (if user reports NO router-zydit models at all):** Dual-sync conflict. `~/.pi/agent/model-providers.json` contains models from BOTH:
1. The index.ts extension (should register as `router-zydit`)
2. An external-subagent sync (writes `"provider":"zydit"` with `"normalizedModel.source":"external_subagent_sync_models"`)

These two syncs write different provider names for the same route. One source may overwrite the other.

## Recommended fix specs

**Fix A (low risk):** Remove the `activeKeys<=0` dead-route gate at index.ts:884. Allow model fetch even when all keys are cooled-down. If upstream errors, `parseCatalogModels` returns `[]` silently. Trade-off: wasted cycles every sync, but models appear regardless of cooldown state.

**Fix B (medium risk, addresses dual-sync):** Identify which process writes model-providers.json and ensure exactly ONE writer. The index.ts extension and the external-subagent sync both produce zydit entries with different provider names. This naming mismatch is likely why `router-zydit/<model>` IDs aren't resolving — Pi CLI may expect one naming convention but gets the other.

**Fix C (acceptance):** v4 being dropped is correct behavior (all keys on cooldown upstream). If v1 models are also missing, the problem is purely the dual-sync naming collision.

## Constraints note
- READ-ONLY investigation. No edits to index.ts. No process kills.

---

## ZYDIT-SYNC-INVESTIGATE WORKER — FINAL REPORT

| Root-cause candidate | Probability | Evidence |
|---|---|---|
| `/zydit/v4` dropped by `activeKeys<=0` gate (index.ts:884) | **HIGH** (100%) | Confirmed: catalog shows `status.activeKeys: 0`; route hits early-return before model fetch |
| Dual-sync conflict writing model-providers.json with different provider names | **MEDIUM** | File contains `"provider":"zydit"` from ext-subagent sync AND should contain `router-zydit` from index.ts |
| Zydit v1 blocked by model parsing/filtering | **LOW** | v1 passes all gates; 119 models parse correctly; denylist empty; isAllowedForRouterProvider=true |

**Easiest-to-land fix:** Resolve dual-sync naming collision first (Fix B). If verified that v1 SHOULD work but doesn't appear in `pi ls-models` output, the issue is one sync overwriting the other. Time: ~5 minutes once root confirmed.

Time taken: 12 min | Cost: agnes-2.0-flash = $0
