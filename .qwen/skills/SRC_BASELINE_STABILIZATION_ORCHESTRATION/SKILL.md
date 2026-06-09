---
name: SRc Baseline Stabilization Orchestration
description: Document a concrete src/ work slice, align source-verified legacy findings, and leave a shippable next-wave baseline with an allowlist/boundary and least-residue plan.
source: auto-skill
extracted_at: 2026-06-08T16:57:10.000Z
---

# Src Baseline Stabilization Orchestration

Use when the migration has recent commits and the next step needs **executable** work: a concrete slice, a boundary so workers don't surge into off-limits surfaces, and a least-residue plan so the repo remains shippable after the wave.

## When to use

- After a stabilization commit restores build/test/runtime invariants and the next lane is which slice to execute next
- When a sweep produced findings that should be fixed in a specific change surface, but no worker has been assigned a bounded slice yet
- When the goal is not just to read more docs, but to produce *an executable action set*

## Working principles

1. **Concrete slice before another sweep.** If a sweep adds findings, immediately assign the smallest actionable slice in `src/` with a clear entrypoint, then plan for those findings — not the other way around.
2. **Source-verified legacy gets alignment postition in the plan.** Already-verified code paths should not be pushed aside. Recent verifications must be preserved in the least-residue plan so the stabilize/sweep work stays aligned.
3. **Workers need an explicit allowlist/boundary.** Allowlist the intended change surface; otherwise parallel workers will spill into off-limits files.
4. **Least residue over cosmetic churn.** Do not reformat unrelated files, and do not broaden the slice after the fact.

## Step-by-step procedure

### 1. Confirm the stabilized baseline

Before planning any new slice, verify whether the restore commit `ba7e838` (“restore app.ts entry”) is actually restored and whether `npm run build` / `npm run test` produce the expected artifacts. If an artifact-wide fix just landed, treat it as the new starting point.

### 2. Read the task plan from last stoppoint

Read the existing migration plan (`docs/migration-plan.md`) and identify whether it documents “next slice specifically.” Look inside the prompt/lane context to find the exact slice that was about to start but now needs formal orchestration.

### 3. Perform no-context bypass first

Before deep-diving docs, answer: “Is there a recent structured plan or yes/no decision already on file for this exact next slice?” If yes, use it and stop re-reading.

### 4. Reopen deeper context only if the direct AGENTS/doc path doesn’t contain a stopping rule

If and only if the slice itself or recent conversation indicates a stopping rule lives elsewhere, read the following files:
- `AGENTS.md`
- `docs/migration-plan.md`
- `docs/semantic-demo-css-ownership-map.md`
- `docs/semantic-demo-mobile-state-ownership.md`
- `docs/semantic-demo-bugsweep-2026-06-05.md` and the 2026-06-07 sweeping doc(s) in `docs/`
- `src/lib/state.ts` and `src/lib/stores/engine-bridge.ts` if the slice touches state/bridge
- `src/lib/css/z-layers.css`, `src/lib/z-index.ts`, and `src/components/Canvas.svelte` if the slice touches chrome, motion, or rendering
- `docs/semantic-demo-bugsweep-2026-06-05.md` for durable invariants (dispose, state mutation, deterministic geometry)
- `docs/semantic-demo-bugsweep-wave4-2026-06-07.md` for wave-4 findings that may need allowance in this slice

### 5. Document the slice with executable specifics

Create an `Executable Action Set` with:
- slice name
- component/store/bridge targets
- deliverable in `src/`
- verification commands (exact)
- explicit allowlist of files/line ranges
- explicit **off-limits list** — include mobile_premium CSS, deploy scripts, lifecycle/app shell unless explicitly allowed
- least-residue note: how many new files, how many deletions, and what stays to be cleaned in a follow-up pass

### 6. Align source-verified legacy findings into the plan

Read or scan the 2026-06-07 bugsweep docs (`docs/semantic-demo-bugsweep-2026-06-*.md`). For any HIGH/MEDIUM finding tied to the same surface:
- keep the source verification
- propose whether this slice should adopt the fix or explicitly defer it to a later named lane
- record why (e.g., missing type surface, dependency on bridge extension, needs separate worker)

### 7. Leave a shippable next-wave baseline

Return:
- The executable action set
- The worker splitting pattern (Infra + Hookup if the slice is > T4)
- The post-wave handoff checklist for verification
- A one-sentence “what changed on disk” summary
- A follow-up recommendation pair for verification

## Verification checklist for generated plans

- [ ] The slice is pin-point concrete (specific files, specific functions, specific store keys).
- [ ] Source-verified legacy findings are preserved in the plan, not buried.
- [ ] Workers have an explicit allowlist/boundary.
- [ ] No cosmetic changes are added beyond the slice.
- [ ] Residue is reported honestly (new files, deletions, follow-up work).
