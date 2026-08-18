# Feature-Depth Audit — Synthesis (2026-08-19, all lanes landed)

Decomposed + delegated read-only audit of "what is undercooked" in semantic-explorer.
3 lanes (agnes/agnes-2.5-flash): data-depth ✅ · prod-surface ✅ · thread-provenance ✅.

## Headline

The app **looks** finished (surface, copy counts, artifact, dev tooling) — and its
**claims are oversold at the data layer**: the "web of relationships" is embedding
similarity + a rule-based role label, not verified business relationships. Two
users-visible degraded strings say "Demo data" when the backend is unreachable.

## Lane results (verified by main lane)

| Lane              | Report                                                                   | Key numbers                                                                                                                                                    | Recommendation                                                                             |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| data-depth        | `tmp/data-depth-audit/REPORT.md` (rerun-verified: all numbers reproduce) | 8,406 recs · 46.25% placeholder `what` (3,888) · NAICS 48.28% · phone 35.49% · email 16.12% · geocoded 97.78% · Conroe=49%                                     | Re-label first ("semantic proximity map"), enrich the 3,888 thin rows on next lead refresh |
| prod-surface      | `tmp/prod-surface-audit/REPORT.md`                                       | Dev tools MODE-gated + tree-shaken (0 bundle hits); case-study.html tracked+polished; "8,406" accurate at 8/8 copy sites; only 2 prod-visible degraded strings | Fix degraded copy; case-study local dead link; hub build-note                              |
| thread-provenance | `tmp/thread-provenance-audit/REPORT.md`                                  | Edges = Qwen3-0.6B 1024-dim k-NN, k=12/24 uniform; roles 27 defined → 7 produced (20 dead); `sameCity` free pass to wispy; 3 over-claiming copy sites          | Option A: re-label/reposition copy; role taxonomy slimmed to real ones                     |

## The 3 over-claiming copy sites (thread lane)

1. `ThreadInspectorPanel.svelte:122` — "Connection Preview" (connection = similarity edge)
2. `CompassDiveSurface.svelte:141` — "Explore the neighborhood around this business"
3. `semantic-dive.ts:270` — "Explore related businesses in the neighborhood"

The codebase is self-aware (docs `public_note`, `relationship-roles.ts:223`) — the gap is only in surface copy.

## The 2 degraded-mode warts (prod-surface lane)

1. `src/lib/rail/rail-status.ts:21` — "Demo data — live API unreachable" pill
2. `src/components/SearchBar.svelte:125-136` — amber "…sample of 20 local businesses" banner

## Strike candidates

- [ ] **S1 — Copy-honesty strike** (DISANG, worker): 5 copy sites above → "similar businesses"/"similarity network" framing + "local cache" degraded copy + extend `tests/unit-active/thread-lens-friendly-copy.test.ts` pin. Contract-pinned; reversible.
- [ ] **S2 — Case-study local dead link** (`case-study.html:653,700,905` → absolute deployed URL, or stub file) — small.
- [ ] **S3 — Hub gate**: repo root `index.html` "requires a build" — meta-redirect to dist when present, else case study.
- [ ] **S4 — Data enrichment plan** (medium): county-clerk ownership/property joins to populate the dead `same_owner/address_match/phone_match` roles + thin-row wphat backfill. Decision doc first (cost/benefit), no code.
- [ ] **S5 — Mobile posture decision**: 2D "Preview → open on desktop" is deliberate; decide desktop-first vs WebGL2-mobile enablement.

## Files flagged NOT in lane-WIP (from 2026-08-18 17:50 snapshot + S1 conflict check)

rail-status.ts, SearchBar.svelte, ThreadInspectorPanel.velte, CompassDiveSurface.svelte, semantic-dive.ts,
thread-lens-friendly-copy.test.ts, case-study.html, index.html — SAFE to strike now.
(`src/lib/data-store.ts`, `three-micro-demo-bridge.ts`, `css/strands.css`, `scripts/test-server.mjs` = other-lane WIP — do not touch.)

---

_Owner: pi-main-lane · dispatched 2026-08-18 22:56Z · line closed 2026-08-19_
