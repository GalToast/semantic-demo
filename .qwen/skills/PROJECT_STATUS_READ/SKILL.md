---
name: PROJECT_STATUS_READ
description: Multi-angle adversarial project status assessment: reads docs, plans, code, tests, visual critiques, and bug sweeps to build an honest gap list from scratch with limited prior knowledge.
source: auto-skill
extracted_at: '2026-06-06T21:31:02.399Z'
---

# Comprehensive Project Status Assessment

Use this when you're new to a project or coming back after time away and need to answer "what's the real state of things?" Not a quick glance — a systematic read across five angles, with adversarial skepticism built in.

## When to use

- User asks "what do we have to do to get this to 100%?" (or any open-ended project-goal question)
- Returning to a project after days or weeks; the code changed and the docs may be stale
- Taking over a half-finished migration, bugsweep, or refactor handoff
- About to make a significant decision (deploy, rewrite, new worker wave) and need to know what's really true

## The Five-Angle Read

### Angle 1: Durable Doc Surface

Read the **intended-state docs** first — these tell you what the project *thinks* it's doing, which is rarely the same as what's actually true.

| What to read | What it tells you |
|---|---|
| `CHANGELOG.md` (most recent entries) | What actually shipped, in what order, and what version the bundle is at |
| `DEPLOY_STATUS.md` or release notes | Per-sweep narrative: bugs found, what was fixed, what was deferred, decisions made along the way |
| `DEPLOY.md` | How to ship — reveals deploy automation, rollback plan, contract guards |
| `ARCHITECTURE.md`, docs/*migration*.md | Intended architecture and migration plan |

**Adversarial questions for each:**
- Is this doc up to date with what's actually on disk? (Cross-reference file paths and function names against grep results.)
- Does the doc claim something is "fixed" or "complete" — and is that claim still the truth given git activity since?
- Does the doc's "proposed" or "recommended" path match the real tool constraints? (E.g., does it recommend a model or harness that doesn't match agent instructions?)
- Do plans reference destructive operations (directory deletion, entry-point flips) without feature flags or rollback?

**2026-06-09 observed state for this repo:** TS migration functionally complete (152/152 runtime, 0 drift, `app.ts` init). Main production gaps are: live bundle deploy lag, svelte-check strictness errors in TS shadows after `@ts-nocheck` removal, and unaddressed visual critique items. Surface contracts can stil show stale-deferred status in docs even after fixes land.

### Angle 2: Active Plans and WIP Files

Check for files the project is actively working on but hasn't shipped — these are the highest-risk items because they're mid-change.

1. **List untracked files:** `git status` shows what's been modified but not committed, and new files that aren't tracked yet. Plans (`plans/*.md`), draft reports (`reports/*.md`), and generated artifacts (`tmp/`, `build/`) live here.
2. **Check for extracted/split modules:** If a recent refactor split a big file (e.g., `lifecycle.js` → `lifecycle-modes.js`, `lifecycle-reset.js`), search for the new files and check whether they're fully wired.
3. **Read uncommitted plans critically.** Ask: does this plan reference tools or models that don't exist? Does it propose destructive steps (deleting directories, flipping entry points) without rollback or feature flags? Is the phasing upside-down (architectural work before trivial bug fixes)?

### Angle 3: Migration / Task Status From Files, Not Doc Tables

Doc tables lie. Always verify claimed completeness against actual files.

1. **Component status:** For each component listed as "Complete," does it actually render content? Check:
   - Grep the root component template for the component tag — is it `visible={false}` or commented out?
   - Does the component read from stores that are actually populated, or from stub/no-op setter functions?
   - Does the component have real DOM/markup or is it a shell with `{#if false}` or `<!-- TODO -->`?
2. **TypeScript migration:** For each `.ts` file:
   - Is there still `@ts-nocheck` at the top? (Means it failed strict type checking.)
   - Do `npm run typecheck` or `svelte-check` actually pass?
   - Are there `.js` counterparts that have drifted ahead of their `.ts` versions? Use `git log --oneline -- <both versions>` and `diff` the export surfaces.
3. **Bug sweep claims:** For each bug listed as "Resolved" or "Fixed":
   - Grep for the actual fix: is the function, signal parameter, or dispose call in place?
   - Check whether the test that was supposed to verify the fix actually exists and passes.
   - Trust contract runner output over doc tables; previously-deferred surfaces may already be green.

### Angle 4: Current Test Health

Never trust "all tests pass" claims from docs. Run the real pipeline, or at least grep recent test output.

1. **Run the fast static checks** (`npm run test:fast` or equivalent): shell contracts, manifest, cache busters, config topology, ownership contracts, tokens, surface styles. These are the gate that CI would hit first.
2. **If the cache-buster check fails**, the bundle is stale relative to source — rebuild with `npm run build && npm run refresh:cache` before any further verification.
3. **Check for pre-existing contract failures:** `AGENTS.md` or sweep docs often list surfaces "under investigation" — verify which are still failing by running `npm run test:contract` or individual surface checks.
4. **Distinguish genuine failures** (code broken) from **environment mismatches** (stale build, missing init calls) and **pre-existing baselines** (known failures from before the current work cycle).

### Angle 5: Visual / Quality critiques

If the project has touched visual polish recently (sweep audits, visual audits, UX reviews), read those:

1. Look for the most recent visual critique — check `docs/visual-critique-*.md` or `docs/ui-quality-*.md`.
2. Note what **grade** or **summary** the critique gives and whether its specific item recommendations have been implemented.
3. Cross-reference each recommendation: is it code that's been committed, a task that's open, or deferred?
4. Check the critique's own "unexamined states" section — areas it didn't review.

## Categorization Framework

Once you have raw findings from all five angles, categorize them into three bands:

| Band | Definition | What to do |
|---|---|---|
| **Blocker** | Broken now. Test failure, init call missing, stale build, regression. | Fix immediately before any new work. |
| **Incomplete** | Not finished. Partial component, missing WebGL integration, migration gap. | Requires continued effort — schedule it. |
| **Polish** | Shipped but under-commits. Fine print: workable but not beautiful. | Defer or scope as Phase 2/3. |

If the user asked "what does 100% take," add a **Target States** section that defines multiple possible end states with tradeoffs:

```
| Target | What it means | Effort | Risk |
|---|---|---|---|
| A. Production-stable | Blockers fixed, tests green, deploy clean | Hours~Days | Low |
| B. Feature-complete | All features shipped and functional | Days~Weeks | Medium |
| C. Visually polished | Polish items from critique landed | Hours | Low |
| D. Migration complete | Full Svelte/TS migration done | Weeks | High |
| E. Data/infra upgrade | Data regen, architecture change | Days~Weeks | High |
```

## What to Push Back On

When reading plans and docs, these patterns reliably indicate stale or hallucinated content:

- **Wrong model/tool names:** A plan that recommends "Nemotron Ultra" when agent instructions say "MiniMax-backed Claude workers" is either stale or generated without checking the agent harness.
- **Destructive one-way operations:** "Delete the `js/modules/` directory entirely once 100% of logic is verified." This breaks the app shell, every island mount, and the deploy pipeline. Feature-flag or soft-delete only.
- **Upside-down phasing:** Architectural LOD/Line2 work before trivial opacity/lighting fixes. The highest-impact work is usually the cheapest (trivial code changes to materials and lighting); the architectural work should come after the team sees whether the cheap fixes are sufficient.
- **Untracked "PROPOSED" plans marked with today's date:** Plans are hypotheses, not facts. Treat them as sketches to argue with, not sequences to execute.

## Output Style

Present the assessment as a structured report with sections per angle and a final synthesis. Keep it terse but actionable — every finding should either be:
- A **specific command** the user can run to verify it
- A **file:line reference** they can inspect
- A **categorization** (Blocker/Incomplete/Polish) with a clear next step

Do not prettify the state. The most valuable thing you offer in this read is honest bad news — tests that fail, migration that's stalled, plans that are wrong. If everything is fine, say that too, but be sure you've verified it.

**Anchoring rule:** When memory claims a production gap, verify with current runner output before repeating it as fact; stale memory often overstates remaining work after fixes have landed.
