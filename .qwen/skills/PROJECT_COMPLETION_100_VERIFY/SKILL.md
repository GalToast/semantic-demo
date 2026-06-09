---
name: PROJECT_COMPLETION_100_VERIFY
description: Verify current progress against docs/migration-plan.md and open bugsweeps, then derive the shortest honest roadmap to 100% completion for this repo.
source: auto-skill
extracted_at: '2026-06-09T05:22:26.944Z'
---

# Project Completion 100% Verification

Use this when the user asks what’s left to finish/release/complete the project, or requests a concise roadmap to 100%.

## Inputs to load first
- `docs/migration-plan.md`
- Latest `docs/semantic-demo-bugsweep-*.md`
- `docs/semantic-demo-bugsweep-wave*-2026-06-07.md` if present
- `AGENTS.md` Svelte/TS/QA sections
- `package.json` scripts that indicate current verification surface (`check`, `build:svelte`, `qa:*`, `test:contract:*`)

## Current calibration (2026-06-09 verified)
- Runtime/build: `npm run build` passes for the legacy bundle as of this session. `npm run check:svelte` is `0 errors / 0 warnings`. `npm run build:svelte` also passes; `dist/svelte/index.html` includes legacy CSS links, but those links are unresolved from Vite’s build root and depend on the deploy server layout.
- TS progress: `npm run check:ts-progress` reports 152/152 runtime TS files, 0 JS-only, 0 dual, 0 drift, with active entry `js/modules/app.ts`; `npm run ts-readiness` shows coverage at 100%. This remains a migration metric, not a release guarantee.
- Release gates today: `npm run test` fails early in `check:shell`. `npm run check:cache` fails with a stale bundle hash. `npm run test:unit` is not fully green: current run was 337/338 with a failing lifecycle mode test. `npm run test:contract` remains 32/72 and includes both stale `.js`-file assertions and real ownership/behavior gaps. Browser-backed `npm run qa:contract:all` was blocked locally because `127.0.0.1:8795` returned `net::ERR_EMPTY_RESPONSE`.
- Migration churn: the repo still shows large JS→TS churn in working tree/status. Do not assume the checkout is clean or deployment-ready until `git status`, contracts, and deploy guards converge.
- Documentation risk: durability docs can lag the code. Prior completion claims have underestimated remaining work when taken as release evidence. Verify from source/runners first.

## Procedure
1. **Audit claimed completion before stating it**
   - Many docs claim items are resolved (e.g., dead CSS, dead `.ts` shadows, component parity). Treat these as hypotheses, not facts.
   - Verify with minimal shell evidence: `git status`, `git diff --stat`, existence checks for claimed-deleted files, current line counts, and actual runner output for key quality gates.
   - Reject or downgrade any claim that doesn’t survive source verification.

2. **Distinguish migration completeness from release completeness**
   - This repo’s 100% state is partly a TS/Svelte migration finish line and partly a production release gate.
   - A fully migrated codebase can still be not production-ready if contract tests, deploy surface, QA gates, repo cleanliness, or shell target are unresolved.
   - Bridge/legacy seams that remain intentional should be documented as accepted debt, not ignored.

3. **Produce a concrete next-move roadmap**
   - Group remaining work into: cleanup, contract stabilization, migration finalization, QA gating, and deploy target decision.
   - Name the files/tests to fix, the verification command to run after, and the risk if any.
   - Keep it honest: if near 100% on one track but not another, say so explicitly.

4. **Call out stale documentation as a blocker**
   - `AGENTS.md`, component tables, migration readiness docs, and deployment notes often lag the code. Include doc correction as a real step when they misrepresent current state.

## Verification priority order
1. `npm run test:fast`
2. `npm run test:unit`
3. `npm run test:contract:smoke`
4. `npm run check`
5. `npm run build:safe`
6. targeted browser/headed QA only after 1–5 are known

## Output format
- Completion % estimate with track breakdown
- Top remaining blockers
- Next 3–6 ordered actions with verification
- Anything flagged as done-but-unverified that should be rechecked before the next commit/release

## Anti-patterns to avoid
- Trusting component tables in durable docs, then hitting edge entry paths (`bridge.ts` re-export facade, adapter files, `/main.ts` boot via vite root) that the canonical table omits. Browser-route discovery should be part of every completion assessment, not assumed from `AGENTS.md` component inventory.
- Assuming Windows path tooling matches Linux/Mac POSIX conventions. On Windows, `2>nul` is likely to fail in shell invocations; prefer PowerShell `Test-Path` / `Get-ChildItem` / `Select-String` for file existence, listing, and grep-equivalent checks.
- Claiming "0 failures" before seeing actual runner output. A skill should distinguish "no output" from "verified green"; include a fallback command if first probe returns nothing.
- Treating file-count TS coverage as proof of release readiness. When linear contract tests fail against deleted source files, that is a higher-signal blocker than 100% migration stats.
