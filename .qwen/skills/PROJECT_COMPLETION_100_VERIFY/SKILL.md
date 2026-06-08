---
name: PROJECT_COMPLETION_100_VERIFY
description: Verify current progress against docs/migration-plan.md and open bugsweeps, then derive the shortest honest roadmap to 100% completion for this repo.
source: auto-skill
extracted_at: '2026-06-08T05:46:44.034Z'
---

# Project Completion 100% Verification

Use this when the user asks what’s left to finish/release/complete the project, or requests a concise roadmap to 100%.

## Inputs to load first
- `docs/migration-plan.md`
- Latest `docs/semantic-demo-bugsweep-*.md`
- `docs/semantic-demo-bugsweep-wave*-2026-06-07.md` if present
- `AGENTS.md` Svelte/TS/QA sections
- `package.json` scripts that indicate current verification surface (`check`, `build:svelte`, `qa:*`)

## Procedure
1. **Audit claimed completion before stating it**
   - Many docs claim items are resolved (e.g., dead CSS, dead `.ts` shadows, component parity). Treat these as hypotheses, not facts.
   - Verify with minimal shell evidence: `git status`, `git diff --stat`, existence checks for claimed-deleted files, and current line counts for claimed-complete components.
   - Reject or downgrade any claim that doesn’t survive source verification.

2. **Distinguish migration completeness from bug completeness**
   - This repo’s 100% state is mostly a TS/Svelte migration finish line, not a feature feature-complete line.
   - Legacy JS bugs that exist in files queued for TS port should be routed into the TS migration, not fixed in-place.
   - Bugs outside the TS queue need explicit triage: fix-in-legacy vs wait-for-port.

3. **Produce a concrete next-move roadmap**
   - Group remaining work into: cleanup, mid-tier migration, and root migration, with the smallest verifiable action first.
   - Name the files to port or delete, the verification command to run after, and the risk if any.
   - Keep it honest: if near 100% on one track but not another, say so explicitly.

4. **Call out stale documentation as a blocker**
   - `AGENTS.md`, component tables, and principle notes often lag the code. Include doc correction as a real step when they misrepresent current state.

## Output format
- Completion % estimate with track breakdown
- Top remaining blockers
- Next 3–6 ordered actions with verification
- Anything flagged as done-but-unverified that should be rechecked before the next commit/release

## Anti-patterns to avoid (verified during 2026-06-08)
- Trusting component tables in durable docs, then hitting edge entry paths (`bridge.ts` re-export facade, adapter files, `/main.ts` boot via vite root) that the canonical table omits. Browser-route discovery should be part of every completion assessment, not assumed from `AGENTS.md` component inventory.
- Assuming Windows path tooling matches Linux/Mac POSIX conventions. On Windows, `2>nul` is likely to fail in shell invocations; prefer PowerShell `Test-Path` / `Get-ChildItem` / `Select-String` for file existence, listing, and grep-equivalent checks.
- Claiming "0 failures" before seeing actual runner output. A skill should distinguish "no output" from "verified green"; include a fallback command if first probe returns nothing.
