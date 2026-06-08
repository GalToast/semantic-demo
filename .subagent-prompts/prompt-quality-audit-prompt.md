# Subagent Prompt Quality & Task Sizing Audit

## Objective
Review the subagent prompts we wrote for the MapSummary and ThreadInspector workers, identify structural problems, and create improved prompt templates.

## Background
We wrote two prompts for mimo-v2.5 workers:
- `thread-inspector-prompt.md` — led to a timeout despite doing valuable work
- `map-summary-prompt.md` — completed successfully in ~5 minutes

The ThreadInspector prompt asked for: WebGL line integration, lifecycle management, store integration, bridge API usage, types, and build verification. The worker did all the setup but couldn't finish the component itself.

## Scope
1. Read both prompts and compare their scope/ambition
2. Read the actual worker logs (stdout.log) to see what each worker spent time on
3. Analyze prompt structure: was the ThreadInspector prompt too broad? Should it have been split?
4. Look at AGENTS.md for any guidance on subagent delegation patterns

## Deliverables
- Side-by-side prompt comparison with scoring
- Root cause: why ThreadInspector failed but MapSummary succeeded
- Revised prompt template with explicit phases (Phase 1: read+plan, Phase 2: infra, Phase 3: hookup, Phase 4: verify)
- Best practices for estimating subagent task scope vs timeout budget
- Guidance on when to split a task across multiple workers vs one longer worker

Write findings to `.subagent-prompts/PROMPT-QUALITY-IMPROVEMENTS.md`
