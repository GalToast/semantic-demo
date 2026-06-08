# Subagent Timeout & Policy Audit

## Objective
Audit the subagent dispatch system to understand why the ThreadInspector worker timed out at 600s despite doing valuable infrastructure work, and propose concrete fixes.

## Background
We dispatched a mimo-v2.5 worker to complete ThreadInspector.svelte WebGL integration. The worker accomplished:
1. Added ThreadOverlayDiagnostics type to src/lib/types/state.ts
2. Extended bridge.ts with syncInspectedStrand()/disposeInspectedStrand()
3. Created src/lib/stores/engine-bridge.ts shared store
4. Wired Canvas.svelte to publish bridge to store
5. Ran build successfully

But it timed out at 600s before completing the actual ThreadInspector.svelte $effect hookup (a ~10-line change). The worker spent most of its budget reading 250+ lines of Three.js shader code and building infrastructure.

## Scope
Read the following and produce recommendations:
1. `.opencode/opencode-workers/` directory structure and metadata format
2. The actual mimo worker start API and its timeout behavior
3. The subagent prompts we used (`.subagent-prompts/thread-inspector-prompt.md` and `map-summary-prompt.md`)

## Deliverables
- Analysis of why 600s was insufficient for the ThreadInspector task
- Recommended default timeout per task complexity (simple/research vs WebGL/shader vs full feature)
- Suggested prompt structure changes to avoid "infrastructure trap" where workers spend all time on setup
- Should we split complex tasks into "infra" + "hookup" phases? How?
- Any tool/config changes needed in the project to support better subagent behavior

Write findings to `.subagent-prompts/SUBAGENT-IMPROVEMENTS.md`
