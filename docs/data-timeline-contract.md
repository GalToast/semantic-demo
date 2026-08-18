# Data timeline / before-after story — renderer contract (product-audit #6)

Status (2026-08-18): SCHEMA-READY, DATA-EMPTY. The record schema already
carries the fields a before/after story needs:

```
leadEnrichment.public.json -> <id> -> {
  snapshot: { 0..15 },      // time-ordered state captures  — ALL "-" today
  observations: { 0..7 },   // qualitative notes               — ALL "-"
  operational_status,       // current status                 — populated
  manual_audit, website_audit, performance_tech, evidence    — populated
}
```

## The renderer (build when the feed fills)

- Surface: a per-business "How has this business been doing?" card — near the
  focus details — that renders operational_status now vs the earliest snapshot
  (open → closed / expanded / new-owner signals), with observations as the
  human voice.
- Honest empty state (until then): if all snapshot/observation entries are the
  "-" placeholder, show a subtle "No historical depth for this business yet"
  line — never fake a timeline.
- Data-age honesty is ALREADY live: `src/lib/rail/rail-status.ts
dataFreshness()` + tests (2026-08-18): the app can stamp "Data snapshot
  2026-06-04 (74d old) · 8,406 businesses" from the manifest's generated_at.

## The renew contract (product-audit #1)

When the source owner lands fresh graph JSONs (the parent pipeline's output),
`node scripts/ingest-refresh.mjs --apply` regenerates every tier (TDB bins,
rows, dist-ensure, fidelity check) in one command. Dry-run mode reports the
graph age and exits 2 when stale. Nothing else blocks a renewal in-repo.

Open ends owned by the source side: fresh CRM/data feed → parent pipeline →
the two graph JSONs (this repo consumes + truth-surfaces the rest).
