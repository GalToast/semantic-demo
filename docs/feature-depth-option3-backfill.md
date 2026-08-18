# Option 3 — LLM Backfill Plan for the 1,477 Hard Rows (feature-depth, 2026-08-19)

**Status:** DRAFT · **Owner:** product go/no-go (stick on switchboard task 182)
**Prerequisite:** S4 Option-1 loader merge applies first (saves the 2,411 free rows);
Option 3 rescues what that leaves behind.

## Target population (measured)

After Option 1, thin rows = ~1,477: the `Registry or thin business record` bucket
(1,050; ~954 with `snapshot = "Pending research"`) + ~472 empty/`"-"` snapshot rows,
mostly no NAICS (67.7%), no phone (66.9%), no website (75.6%).

Goal: generate a plausible descriptive `what` (+ NAICS where derivable) from
**name + legal form + city + zip + registry type** — the fields we DO have.

## Pipeline (with in-repo anchors)

1. **Sample precision check (BEFORE anything runs at scale)**
    - Take 30 stratified hard rows; generate `what` via the local chat lane
      (router, `agnes` or `nvidia/gpt-oss-20b` — curve cheap, no new infra).
    - Hand-check: ≥ 24/30 generated `what` reads as a true business descriptor
      ("roofing contractor", "child care center") and NOT guessy fiction.
    - Gate: PASS → full run; FAIL → decide stale vs human-only curation for those rows.
2. **Backfill job** (one main-lane worker, ~1,477 rows)
    - Prompt: name, "Registry or thin business record", address city/zip → "what"
      ≤8 words + optional 6-digit NAICS. Strict 2-field JSON per row, one line.
    - Accept heuristic: drop rows whose generation echoes the placeholder text or
      name verbatim. Append-only: write `refined.what`/`refined.naics` into
      `leadEnrichment.public.json` (new keys `backfill_v1`), NEVER overwrite
      existing non-placeholder fields. Original values preserved for revert.
3. **Corpus + thread regeneration (the actual value)**
    - Regenerate the corpus line for these rows: `ask_moco_corpus.from-leadops.jsonl`
      (path from `semantic_threads*.dat` meta `source_index_manifest.corpus_path`).
    - Re-embed (Qwen3-0.6B, 1,024-dim, cache on disk) → rerank (`rule-based-v1`) →
      emit `semantic_threads_ui.dat` (k=12) — this is what improves NEIGHBOR
      QUALITY: thin-row vectors are currently embedding-placeholder text.
    - Convert/verify: `scripts/tdb1-generate.mjs`/`tdb1-ui.mjs` + `scripts/check-thread-data.mjs` +
      `tests/semantic-space-audit.mjs` (expect: same 8,406×12 shape, better scores).
4. **Fallback + rollback**
    - Any pipeline failure or gate miss → ship current artifacts unchanged
      (loader merge still ships; backfill is strictly additive on enrichment JSON).

## Cost estimate

- Compute: ~1,500 × ~200 tokens ≈ 300k in / ~100k out total — single-digit minutes
  on the local lane; $0 infra (existing router/GPU).
- Human cost: one 30-row review (~10 min).
- Risk: generation drift on legal-registry names (e.g. invented industry). Mitigated by
  the precision gate + append-only + rollback.

## Ship order (after go)

1. Precision sample (this doc's §3.1 gate) → main lane, today.
2. Backfill worker writes `leadEnrichment.public.json` (append-only) + `refined` fields.
3. Option-1 loader merge (handoff doc `tmp/s4-enrichment-merge-handoff.md`) lands the
   `snapshot`→`what` path; Option 3's `refined.what` rides the same read path.
4. Re-embed + re-gen threads + audits (runs against the private/index pipeline; needs
   those scripts located — meta path above — they are NOT the tracked tdb1 packers).

## Interaction with lanes

- `data-loader.ts` columnar lane: only §3 merge touches it (handoff).
- `scripts/tdb1-*` + `semantic-space-audit.mjs` are not lane WIP — fine to run.
- The embedding/rerank steps run out of-repo (phase: locate script by corpus_path meta
  in the thread artifact; if missing → document the exact steps from the existing
  artifacts instead of guessing).

## Decision needed from product

- Go/no-go on backfill for the 1,477 (recommended GO — it is the difference between
  "20% still thin" and "95%+ described" at near-zero cost).
- If GO: whether §3 should run on the MAIN lane immediately (needs router batch credits)
  or as a background worker task.

---

_Inputs: tmp/s4-enrichment-dry-run/REPORT.md · docs/feature-depth-enrichment-options.md ·
scripts/tdb1-_.mjs · tmp/thread-provenance-audit/REPORT.md (corpus & rerank facts).*
