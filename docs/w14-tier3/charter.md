# W14 Tier 3 — Search Domain Retirement Charter

**Date:** 2026-06-16
**Cross-refs:** `docs/w14-legacy-kernel-retirement-charter-2026-06-15.md`, `docs/w14-tier2/legend-ui-port-completion-2026-06-16.md`

---

## Scope

Retire 10 search-domain kernel files in `js/modules/` (1,482 LOC) and 9 bridge files (224 LOC). Canonical replacements exist in `src/lib/search/` (12 files, 2,173 LOC), `src/lib/orchestration/` (2 files, 539 LOC), `src/lib/stores/` (2 files, 202 LOC), plus 2 standalone canonical files (1,105 LOC).

**Total retirement target:** ~1,587 LOC (kernel + bridge).

---

## File Classification

| File                              | LOC | Category              | Canonical exists?      | Rewires needed |
| --------------------------------- | --- | --------------------- | ---------------------- | -------------- |
| `search-chrome-island.ts`         | 43  | ready-to-retire       | No (island retired)    | 1              |
| `filter-chrome-island.ts`         | 53  | ready-to-retire       | No (island retired)    | 1              |
| `semantic-search-cache.ts`        | 202 | ready-to-retire       | Yes (cache.ts)         | 0              |
| `search-panel-adapter.ts`         | 98  | ready-to-retire       | Yes (panel-adapter.ts) | 0              |
| `search-trail-cue-renderer.ts`    | 54  | ready-to-retire       | Yes (via bridge)       | 3              |
| `semantic-search-api-cache.ts`    | 216 | ready-to-retire       | Yes (api-cache.ts)     | 0              |
| `semantic-search-mock-catalog.ts` | 167 | ready-to-retire       | Yes (scoring.ts)       | 0              |
| `lifecycle-search-sync.ts`        | 93  | needs-port-completion | Partial (3/4 exports)  | 3              |
| `cluster-filter.ts`               | 227 | needs-port-completion | Partial (8/9 exports)  | 11             |
| `three-search-animations.ts`      | 329 | blocked (WebGL)       | No                     | 3              |

---

## Retirement Waves

### Wave A — Quick wins (parallel, no dependencies)

1. `search-chrome-island.ts` — delete + remove 1 import
2. `filter-chrome-island.ts` — delete + remove 1 import
3. `semantic-search-cache.ts` + bridge — delete + delete bridge

### Wave B — Bridge-mediated (parallel after Wave A)

4. `search-panel-adapter.ts` + bridge — delete + delete bridge + rewire 2
5. `search-trail-cue-renderer.ts` + bridge — port type + delete + rewire 3
6. `semantic-search-api-cache.ts` + bridge — delete + delete bridge
7. `semantic-search-mock-catalog.ts` + bridge — delete + delete bridge

### Wave C — Port-completion (serial, after WIP `0643ce53+1` lands)

8. `lifecycle-search-sync.ts` — port 2 missing exports + rewire 3
9. `cluster-filter.ts` — port 1 missing export + rewire 11

### Wave D — Full port (blocked, independent)

10. `three-search-animations.ts` — full WebGL port (~329 LOC) + rewire 3

---

## WIP Off-Limits

HEAD `0643ce53` has 22 WIP-modified files from a parallel lifecycle/canvas refactor. Key search-domain-adjacent WIP files:

- `js/modules/lifecycle.ts`, `js/modules/lifecycle-reset.ts` — blocks Wave C ticket 8
- `src/lib/orchestration/url-state.ts` — blocks Wave C ticket 9
- `src/lib/stores/filter.svelte.ts` — adjacent to cluster-filter retirement

Wave C must wait for the WIP to land before proceeding.

---

## Risks

1. **cluster-filter breadth** — 11 consumers is the largest rewire set; good test coverage (7 files) mitigates
2. **three-search-animations** — WebGL code requires visual QA; cannot retire without full port
3. **Bridge retirement sequencing** — `search-state-bridge.ts` has 15 importers (not in this tier, but adjacent)
4. **Parallel session race** — Wave C blocked on WIP commit

---

## Estimated Total LOC Reduction

| Wave      | Kernel LOC | Bridge LOC | Total     |
| --------- | ---------- | ---------- | --------- |
| A         | 298        | 32         | 330       |
| B         | 535        | 65         | 600       |
| C         | 320        | 0          | 320       |
| D         | 329        | 8          | 337       |
| **Total** | **1,482**  | **105**    | **1,587** |

---

## Next Steps

1. Fire Wave A + B as a single subagent batch (tickets A1-A3, B1-B4)
2. After WIP lands, fire Wave C (tickets 8-9)
3. Wave D is independent — can be dispatched anytime but requires WebGL visual QA
