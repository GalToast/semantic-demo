---
name: TRIAD_VERIFICATION_PROTOCOL
description: Protocol for independently addressing triad elements: verification-first funnel, falsification check, and tool-use behavior before publishing
source: auto-skill
extracted_at: '2026-06-09T06:20:50.885Z'
---

# Triad Verification Protocol

Use this when the user has set up three parallel work streams (triad) that must be independently addressed before any final reporting — particularly when the user calls out overselling, expects real falsification checks, or warns that tool-use behavior has been sloppy.

## When to Use

- User explicitly scopes three parallel tasks and insists they be addressed independently
- User flags that prior output was "overselling" or lacked real falsification
- User emphasizes tool-use behavior must be on-point
- Final synthesis is blocked until all three elements are independently verified with authoritative tools

## The Triad

1. **Verification-first funnel** — Start with checks that can falsify the claim before doing fill-in work. Don't build out a positive case first and then look for holes; look for holes first.
2. **Falsification check** — Before publishing or synthesizing, actively search for evidence that would make the claim wrong, incomplete, or outdated.
3. **Tool-use behavior** — Use authoritative tools (not memory, not chat history, not assumptions). If tool calls were thin or deferential, redo them with direct verification.

## Procedure

### Step 1: Identify the three elements

Clarify what the three parallel streams are:
- Work stream A (e.g., independent verification)
- Work stream B (e.g., secondary analysis)
- Work stream C (e.g., synthesis or follow-up action)

Each stream must be addressed on its own merits. Do not let findings from one stream substitute for another.

### Step 2: Verification-first ordering

For each stream, order checks from most falsifying to least:

1. **Direct source check** — Does the primary source/artifact actually exist?
2. **Cross-reference check** — Does it match independent records?
3. **Behavioral check** — Would the claim hold under a different interpretation?

Do not stop at step 3 if steps 1-2 are inconclusive.

### Step 3: Falsification check before publish

Before reporting, run at least one check that could prove the claim wrong:

- "What evidence would invalidate this finding?"
- "Is there a counter-example in the data?"
- "Would a different tool/timestamp contradict this?"

If no falsification check was actually run (e.g., only memory recall, only chat history, only optimistic reasoning), repeat with a real tool call.

### Step 4: Authoritative tool-use

Use tools that produce hard evidence:
- Read files at specific paths
- Run shell commands that output verifiable text
- Check git state, build artifacts, config files

Avoid:
- Inferring from conversation memory alone
- Repeating claims from earlier in the same turn
- Using "probably" or "likely" without a check

### Step 5: Independent addressing

Address each of the three streams independently:
- Do not combine findings from stream A and B to cover up gaps in stream C
- If one stream is weak, own that weakness rather than letting it be obscured

### Step 6: Final synthesis gate

Do not publish a synthesized answer until:
- All three streams have at least one falsification check
- Each stream has authoritative tool evidence (not just reasoning)
- Any weak stream has been explicitly flagged

## Output Format

When complete, report:

1. **Stream A status** — What was checked, what tool evidence supports it, what it still can't confirm
2. **Stream B status** — Same structure
3. **Stream C status** — Same structure
4. **Falsification results** — What checks could have disproven each stream, and what they actually showed
5. **Remaining gaps** — What's still unverified or missing tool evidence

## Why This Works

Users flag "overselling" when they see:
1. Positive claims built before falsification checks
2. Synthesis that hides weak streams
3. Thin tool calls that don't produce real evidence

The triad protocol enforces independent verification of each stream, explicit falsification attempts, and authoritative tool use before any final reporting.

## Adjacent Skills

- **DOUBLE_WORKER_VERIFICATION** — Parallel worker dispatch with main-lane falsification; use when workers are involved
- **BUGSWEEP_CLAIM_FALSIFICATION_CHECK** — Similar falsification mindset applied to bug-sweep claims
- **PROJECT_STATUS_READ** — Solo analysis; use before dispatching parallel workers
