# S4 — Data-Enrichment Decision Doc (feature-depth audit, 2026-08-19)

**Status:** DRAFT for owner decision · **Owner:** product (user) · **Author:** pi-main-lane
**Inputs:** `tmp/data-depth-audit/REPORT.md` (verified), `tmp/thread-provenance-audit/REPORT.md`,
`docs/ops/DEPLOY_STATUS.md`, task-142 evidence (public/data consumer audit).

## 1. Why this decision exists

The feature-depth audit proved the "semantic web" is fresh-kNN + role labels, not
verified relationships. S1 already shipped the honest framing ("similar businesses",
"local data"). This doc is about the OTHER direction: **making the data itself richer**
instead of (or in addition to) framing down.

## 2. Measured baseline (all verified by rerun)

| Metric                                                                                    | Value                | Gap                                                                      |
| ----------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Records                                                                                   | 8,406                | —                                                                        |
| Placeholder `what` ("Local business" / "Registry or thin" / "Montgomery County business") | 3,888 (46.25%)       | enrichment target                                                        |
| NAICS-coded                                                                               | 4,058 (48.28%)       | 4,348 uncoded                                                            |
| Phone present                                                                             | 2,983 (35.49%)       | contact signal drives `signal_score` in reranker                         |
| Website / email                                                                           | 2,164 / 1,355        | sparse                                                                   |
| Geocoded                                                                                  | 8,219 (97.78%)       | solid                                                                    |
| City concentration                                                                        | Conroe = 4,120 (49%) | deg density of same-city edges                                           |
| Relationship roles defined                                                                | 27                   | only 7 produced; `same_owner/address_match/phone_match/web_match/…` dead |
| Thread edge degree                                                                        | uniform k=12/24      | fix-k signature                                                          |

## 3. Options (cost ↑ approx; each row is a decision the owner can say yes/no to)

### Option 0 — Defer (zero cost, already shipped)

Keep S1's honest framing; treat the graph as "similarity + co-location". No data work.
**Do this regardless of the other options** (S1 already did).

### Option 1 — Enrich the thin rows from data already in the repo (WEEK 1)

`leadEnrichment.public.json` (18 MB) exists and `data-loader.ts:505` partially consumes it.
`extract-crm-sqlite.py` / `extract-lead-enrichment.mjs` regenerated 5 live files used by the build.

- Action: dry-run coverage of the 3,888 thin rows against enrichment (count how many get a
  real `what`/NAICS/phone out of it) BEFORE deciding to wire a column refresh.
- Success metric: ≥60% of thin rows gain a descriptive `what` or NAICS; regression-safe
  (data.dat schema unchanged: stays 16 columns).
- Cost: one analysis script + possible data re-gen → low, reversible (data only).

**Option 2 — County-level ownership/property joins (WEEK 2+, needs data procurement)**
Montgomery CAD / TX SOS ownership or assessed-owner files → populate `same_owner`,
`address_match`, `phone_match` edge roles that are currently dead code.

- Why: verifiably "real" edges (co-ownership) — the only way to legitimately claim
  "business relationships" again.
- Risk: procurement + PII handling; TX SOS bulk files are licensing/paid; CAD owner names
  need entity normalization. Validate on a 100-pair spot-: precision of ownership edges
  ("actual sibling LLC") ≥ 80%.
- Cost: high (data licensing + normalization pipeline) — **must clear owner approval**.

**Option 3 — LLM backfill of thin rows (medium, reuses existing infra)**
Qwen3-Embedding-0.6B is already on disk (1,024-dim). An LLM pass with the SAME box:

- Generate `what` description for thin from name/type/context; NAICS for none.
- Re-embed → leads to better kNN neighbors (the reranker weights `signal_score`).
- Cost: one background corpus job + rerun pipeline; compute ≈ local (no new infra).
- Precision gate: sample-format 25/25 rows judge "what is now reasonable".

## Option 1 dry-run verdict (2026-08-19, worker + main-lane rerun verified)

Join is perfect (8,406/8,406 = 100%, key = lead_id int ↔ string; zero orphans).
Thin-row rescue from leadEnrichment.public.json, loader-faithful access:

- (a) real `what` from `snapshot`: **2,198 / 3,888 (56.5%)**
- (b) NAICS: **1,257 (32.3%)** · (c) phone: **1,286 (33.1%)** · (d) website: **948 (24.4%)**
- Best slice: `Montgomery County business` 71.8% → what; worst: `Registry or thin business record`
  9.1% (954 of 1,050 have snapshot `Pending research` — genuinely no public signal).
- **Gate: 2,411/3,888 (62.0%) gain `what` OR NAICS → ≥60% → ✅ GO.**
  Placeholder-what rate drops 46.25% → 20.10% after refresh.
- Remaining 1,477 hard rows = LLM backfill (Option 3) candidates, not free joins.

**Execution blocker:** wiring the refresh touches `src/lib/data-loader.ts` merge code — currently
OTHER-LANE WIP (columnar-TDBU wave). Hand the loader edit to the owning lane or wait for
lane-clear before implementing. Data regen scripts live in `scripts/` (extract-*); a corpus
re-embed changes neighbor quality, so re-gen threads needs the python + rerank pipeline and
a re-run of `semantic-space-audit.mjs` expectations post-regen.

## 3. Recommendation (to the owner)

1. **Week 1 do Option 1** (coverage dry-run, cheap, data-only) + ship 0.
2. **Decide Option 3** (LLM backfill) if the dry-run shows <10% coverage pick.
3. **Defer Option 4 (ownership) as a product-plan step** — only armed with a recruitment
   story (a real "find businesses with the same owner" feature) and procurement sanity.

## 4b. Guardrails

- NEVER scrap the existing artifact contract (`semantic_threads_ui.dat` manifest
  `edges:100872` is contract-tested by `semantic-space-audit.mjs`); only re-generate
  the pipeline, and re-run those contracts after.
- Degree uniformity: after any re-gen, **expect** non-uniform degree; update
  `manifest` and any wait that hard-codes 8,406×12 (currently `semantic_tdb.ts` reads
  limits from config, so only the degree check in `semantic-space-audit.mjs` needs care).
- PII: never ship `phone/email/owner` beyond field level the app already exposes; keep
  internal fields `.internal.` suffix convention (leadops split pattern).

## 5. Open questions for the owner

- Q1: Det — persist with leveraged 'similarity map' brand or pursue real-ownership
  graph (Option 2 even if it takes months)?
- Q2: Budget for data procurement: $0 (Options 1/3 only) vs paid (Option 2)?
- Q3: Is 'same-owner' a feature users ask for, or is 'find similar businesses' the
  actual job? (this determines whether Option 2's ownership roles are worth their cost)

---

_Appendix: S1 commit `a844a90c` (copy honesty), design links: `data-loader.ts:505`,
`extract-lead-enrichment.mjs`, `public/data/leadEnrichment.public.json` (18 MB),
`semantic_threads_ui.dat` manifest contract._
