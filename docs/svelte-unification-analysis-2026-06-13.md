# Svelte-unification analysis — 3 dual-impl functions

**Date:** 2026-06-13
**Related:** `docs/both-pattern-follow-ups-2026-06-13.md` (Ticket 4)
**Related:** `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS-FINAL.md`

After the 2026-06-13 shim retirement (commit `2a91873`), three functions have **parallel implementations** in the Svelte path and the legacy runtime. This doc analyzes each and recommends a unification path.

---

## TL;DR

| Function | Svelte path | Legacy path | Verdict |
|---|---|---|---|
| `normalizeRelationshipRole` (+ 3 related) | ✅ `src/lib/utils/relationship-roles.ts` (220 lines, 27 roles) | ✅ `js/modules/relationship-roles.ts` (66 lines, 8 roles) | **Divergent vocabularies** — Svelte is a SUPERSET, but legacy serves the trail/peer semantics. Coexistence is the right call; Svelte is the future, legacy is the past. |
| `syncSemanticDiveUi` (+ 1 init) | ❌ No Svelte path | ✅ `js/modules/semantic-dive-ui.ts` (251 lines, real impl) | **No Svelte impl to unify with** — Part A of the fix-wave PR ports to the Svelte path |
| `requestSemanticGuide` (+ 5 related) | ❌ No Svelte path | ✅ `js/modules/semantic-guide.ts` (302 lines, 6 exports) | **No Svelte impl to unify with** — Part A of the fix-wave PR ports to the Svelte path |

**Net action:** only `relationship-roles` has a real unification question. The other two are clean ports (legacy → Svelte) as part of Part A.

---

## 1. `relationship-roles` — the only real unification question

### Two parallel implementations

**Svelte:** `src/lib/utils/relationship-roles.ts` (220 lines)
- 27 role strings in `RELATIONSHIP_ROLES` (modern connection/link vocabulary)
- 4 functions: `normalizeRelationshipRole`, `getRelationshipRoleLabel`, `getRelationshipRoleCopy`, `describeRelationshipRoleReason`
- 27-entry `ROLE_COPY` with `label` / `title` / `reason` per role

**Legacy:** `js/modules/relationship-roles.ts` (66 lines)
- 8 role strings in `KNOWN_ROLES` (legacy trail/peer vocabulary: `core_peer`, `upstream`, `downstream`, `complement`, `same_market`, `geo_echo`, `bridge`, `unclassified`)
- 3 functions: `normalizeRelationshipRole`, `getRelationshipRoleCopy`, `describeRelationshipRoleReason`
- 8-entry `ROLE_COPY` with `rail` / `title` / `reason` per role (auto-derives `inside` from `title.toLowerCase()`)

### Vocabulary comparison

| Domain | Legacy (8 roles) | Svelte (27 roles) |
|---|---|---|
| Trail semantics | `core_peer`, `upstream`, `downstream`, `complement`, `same_market`, `geo_echo`, `bridge`, `unclassified` | (only `core_peer`, `upstream`, `downstream`, `complement`, `same_market`, `geo_echo`, `bridge`, `unclassified` — 8 overlapping) |
| Connection semantics | (none) | `direct`, `support`, `civic`, `competitor`, `vendor`, `client`, `partner`, `referral_source`, `referral_target`, `same_owner`, `shared_principal` |
| Match semantics | (none) | `address_match`, `phone_match`, `web_match` |
| Bridge semantics | `bridge` (single) | `semantic_bridge`, `category_bridge`, `city_bridge` (3 specialized) |
| Peer semantics | `core_peer` | `category_peer`, `local_peer` |

**The Svelte path is a SUPERSET.** It contains all 8 legacy roles PLUS 19 additional modern connection types. The two are NOT direct duplicates — they're divergent vocabularies with 8 roles overlapping.

### Callers (ast-grep verified)

**Legacy (8 callers across 5 files):**
- `js/modules/journey-thread-model.ts:158`
- `js/modules/relationship-roles.ts:47` (self)
- `js/modules/semantic-threads.ts:180, 207`
- `js/modules/journey-focus-ui.ts:170`
- `js/modules/thread-inspector.ts:125`

**Svelte (5 callers across 3 files):**
- `src/lib/data_loader.ts:437`
- `src/lib/journey/thread-model.ts:225`
- `src/lib/semantic-threads.ts:314, 364` (×2)

### Recommendation: **coexistence, with Svelte as the future**

The legacy 8-role vocabulary serves specific UI surfaces (`rail` field on the journey thread-rail component, the `bridge` color in the thread inspector). Porting those UI surfaces to use the Svelte 27-role vocabulary would be a content migration, not a code change.

**For the immediate fix-wave PR:** no action. Both files are alive and used. The shim retirement didn't create a gap here.

**For the longer term (Ticket 4 follow-up):**
1. Keep both files
2. Audit each UI surface that consumes a legacy role: is the 8-role vocabulary the right fit, or should it be migrated to the broader Svelte vocabulary?
3. As the journey surfaces get touched in future work, migrate them to the Svelte path. The legacy impl can be deleted when the last UI consumer migrates.
4. Estimated effort: 1-2 hours audit + 1-2 days of UI surface migrations spread across future PRs.

### Why not just delete the legacy?

- 8 active callers in 5 files import from the legacy path
- The legacy vocabulary is referenced from UI components and rendering logic
- Deleting without migration would silently change UI copy
- The right move is to migrate the UI first, then delete the legacy

---

## 2. `semantic-dive-ui` — no Svelte impl exists

### The current state

**Svelte path:** NO `syncSemanticDiveUi` impl in `src/lib/`. The function is only consumed by legacy callers.
- Ast-grep: 9 callers, ALL in `js/modules/` (no Svelte callers)

**Legacy:** `js/modules/semantic-dive-ui.ts` (251 lines, 2 exports)
- `initSemanticDiveUiSubscriptions()` — real impl
- `syncSemanticDiveUi()` — real impl with 250 lines of DOM update logic

### Why no Svelte impl?

The semantic-dive mode is currently driven by the legacy orchestration tree. Svelte components (in `src/components/`) handle the basic UI rendering, but the semantic-dive-specific DOM updates are in the legacy `syncSemanticDiveUi` function. The legacy `JourneyCompassController` and `JourneyThreadSettler` are the orchestrators that call it.

### Recommendation: **Part A of the fix-wave PR ports the legacy impl to the Svelte path**

Per deepsek's Part A recommendation, the stub at `src/lib/journey/focus-ui.ts:94` (`updateTraversalUi`) gets ported. A symmetric Part A port for `syncSemanticDiveUi` would land it in a new Svelte location, e.g., `src/lib/journey/semantic-dive.ts` (mirroring the Svelte `src/lib/journey/thread-settler-adapter.ts` pattern).

Once the Svelte impl exists, the legacy `semantic-dive-ui.ts` can be retired wholesale (delete the file, update 9 callers to use the Svelte path).

**Effort:** 2-3 hours (mostly mechanical port; the DOM logic is the same).

---

## 3. `semantic-guide` — no Svelte impl exists

### The current state

**Svelte path:** NO `requestSemanticGuide` or `setSemanticGuideButtonState` impl in `src/lib/`. The functions are only consumed by legacy callers.
- Ast-grep: 1 caller for `requestSemanticGuide` (`js/modules/bindings/utility-bindings.ts:21`) + 2 self-calls for `setSemanticGuideButtonState` (`js/modules/semantic-guide.ts:232, 273`)

**Legacy:** `js/modules/semantic-guide.ts` (302 lines, 6 exports)
- `semanticGuideIcon`, `setSemanticGuideButtonState`, `getSemanticGuideTitle`, `showSummaryCard`, `hideSummaryCard`, `requestSemanticGuide`

### Why no Svelte impl?

The semantic guide feature is an LLM-driven summary card. It calls `requestSemanticGuide` which makes an API call to a guide-summarization service. The Svelte path doesn't yet wire this up.

### Recommendation: **Part A of the fix-wave PR ports the legacy impl to the Svelte path**

Same pattern as semantic-dive-ui. The natural Svelte location would be `src/lib/journey/semantic-guide.ts` (mirroring the existing `src/lib/journey/thread-settler-adapter.ts`).

Once the Svelte impl exists, the legacy `semantic-guide.ts` can be retired wholesale (delete the file, update 1 caller to use the Svelte path).

**Effort:** 2-3 hours (port + test).

---

## Sequencing for the unification tickets

| # | Action | Effort | Risk |
|---|---|---|---|
| 1 | Part A: port 4 stub-mis-wires (already in fix-wave plan) | 1-2 days | Medium |
| 2 | Part of Part A: port `syncSemanticDiveUi` and `requestSemanticGuide` impls to Svelte path | 4-6 hours | Low (mechanical) |
| 3 | Retire legacy `semantic-dive-ui.ts` + `semantic-guide.ts` (one commit each, after #2 lands) | 1 hour | Low |
| 4 | Audit `relationship-roles` UI consumers, plan vocabulary migration | 1-2 hours | Low |
| 5 | Migrate `relationship-roles` UI surfaces to Svelte path (one PR per surface) | 1-2 days spread | Medium |
| 6 | Retire legacy `relationship-roles.ts` (after last UI consumer migrates) | 30 min | Low |

**Total unification effort:** ~4-5 days spread across future PRs.

---

## Completion Status (2026-06-13)

**Ticket 4 — IMPLEMENTED**

| Action | Status | Commit |
|---|---|---|
| Port syncSemanticDiveUi to src/lib/journey/semantic-dive.ts | ✅ Done | `4074ae1` |
| Port semantic-guide to src/lib/journey/semantic-guide.ts | ✅ Done | `b93e077` |
| Delete legacy semantic-dive-ui.ts + semantic-guide.ts | ✅ Done | `2cb6db2` |
| relationship-roles coexistence documented | ✅ Done | `2cb6db2` |

**Net retirement:** 553 lines of legacy code deleted (semantic-dive-ui.ts: 251L + semantic-guide.ts: 302L).
**relationship-roles:** both files alive; migration plan documented in legacy file comment.

**Net retirement of BOTH-pattern files:**
- 8 dead shims already deleted (commit `2a91873`)
- After #3: ~600 more lines of legacy code retired
- After #6: ~150 more lines
- Net: ~750 lines of legacy code gone in this multi-week arc
