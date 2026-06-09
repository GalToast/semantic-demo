---
name: SVELTE_MIGRATION_ORPHAN_PORT_TRIAGE
description: Audit and recommend fate for Svelte/TS ports (legacy JS family members) that compile cleanly but have no consumers, and produce a concise QA/report-style triage result.
source: auto-skill
---

# Svelte Migration Orphan Port Triage

Use this when inspecting a ported TS/Svelte module pair that compiled successfully but may be disconnected from the app.

## Procedure

1. **Run the cheap canonical check**
   - Prefer `npm run check:svelte`.
   - Treat 0 errors/0 warnings as a passing baseline; do not stop there.

2. **Find consumer surface**
   - Grep for imports of the candidate files in `src/` and `js/`.
   - Check both `.svelte` and `.ts` files, plus any bridge files in `src/lib/engine/`.
   - Identify whether the ported symbols are actually invoked at runtime.

3. **Classify the state**
   - **Orphan but wired-in principle**: the file compiles, has clear intent, but no consumer exists yet (e.g., personality/geometry logic waiting for a component contract).
   - **Active dead code**: no consumer and the live app uses an alternative native implementation (e.g., separate `pocket.ts` controller, Svelte store-based flow).
   - **Stub-only or unsupported imports**: references to removed globals/stores with fallbacks that make the module non-functional.

4. **Check lane overlap**
   - Inspect current branches, recent diffs, and any open writer scope touching the candidate.
   - If no overlap, the files are safe to either delete or keep; note this explicitly.

5. **Recommend fate**
   - **Keep**: if algorithm/contract is load-bearing and will be consumed next.
   - **Reroute**: if another implementation already owns the behavior but this port should replace it.
   - **Delete**: if dead, duplicated, or superseded by a store-backed parallel.

6. **Deliver the minimum viable report**

   - Whether the tool run succeeded.
   - Top 3 concrete findings: paths, symptoms, and why they matter.
   - Whether any finding overlaps active writer lanes.
   - Recommended next fix order (keep/reroute/delete + which file first).

## Guardrails

- Do not edit files during this audit unless the task explicitly asks you to touch code.
- If deleting files, verify zero consumer imports first; do not rely on grep absence alone—check bridge/engine files too.
- If rerouting, name the exact replacement consumer and the symbol clash points.
