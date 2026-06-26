# Subagent Delegation — Semantic Explorer

Moved from `AGENTS.md` (2026-06-26) to keep the hot-path context file lean.

These rules are referenced from `AGENTS.md` → "Subagents" section. Read this file when
dispatching subagents; it is not loaded into every model call.

---

## Runway / Rate / Polish rule (set 2026-06-26, persistent)

1. **Runway** — Give subagents real space to cook. Don't cancel + take over before they've had 10-15 min on a meaningful task. Slow streaming is normal for the kilo/openrouter/owl-alpha lane; agnes-2.0-flash can also be slow. Only intervene on evidence the worker is truly wedged (no progress for several minutes, repeated identical tool errors).
2. **Rate quality** — When the worker finishes, evaluate the diff against the brief. Score 1-10. Look for: scope creep, broken types/tests, missing a11y, formatting drift, half-applied edits, parallel-session interference, missing evidence in `tmp/`.
3. **Polish to 10/10** — If the score is below 10, take over on the main lane and finish the gap. Do **not** hand the gap back to the user. Examples: missing styles → add them; failing test → fix it; scope creep → revert and re-apply tightly; whitespace drift in unrelated files → revert that drift.
4. **End result is what matters** — Don't preserve bad work quietly because authorship is murky. If something is wrong, fix or revert with a brief explanation in chat.

## Always Delegate (set 2026-06-26, persistent)

We always delegate work to increase throughput and quality. Default mode is decomposition + delegation via `external_subagent_*`. Don't ask "should I delegate?" — assume yes. Only do main-lane work directly when the task is trivial (single edit, single command), needs sub-second response, or the user explicitly asked for main-lane execution.

Delegate → runway → rate 1-10 → polish to 10/10 on main lane → ship.

## Delegation Lifecycle (behavioral rule, persistent)

When a task arrives, run this loop on the main lane before touching anything:

1. **Investigate** — read files, search for the relevant patterns, identify the seam. Use `rg` for text search, `ast-grep` for structural TypeScript/Svelte, `ctx_*` for output-heavy probes, `memory_search` for durable context. Note: parallel-session dirty files, recent commits touching the same surface, contract tests that will gate the work.
2. **Plan** — design the solution in main-lane head. Identify scope, allowed files, no-revert boundaries, verification commands. Write the design to a `tmp/<topic>-<date>/worker-prompt.md` if it will be delegated.
3. **Decompose** — split into sub-tasks. For each sub-task, ask: is this bigger than ~50 LOC of code or ~100 LOC of test, OR does it require more than one read cycle of investigation? If yes → delegate. If no → main-lane is faster. Don't ask permission, just decide.
4. **Delegate** — `external_subagent_start` with `model: kilo/openrouter/owl-alpha` (primary) or `agnes-2.0-flash` (registered) or a free fallback. Provide: scope, allowed files, no-revert boundaries, expected evidence (diff + verification output + tmp/report.md), verification commands. `timeout_seconds: 900`. `mode: yolo`. `mcp_profile: subagent`. `owner_tag: kimi-main`. Acquire session lock if multi-commit.
5. **Judge** — when the worker finishes, read `tmp/<topic>/report.md` + `git diff`. Score 1-10 against the brief. Look for: scope creep, broken types/tests, missing a11y, formatting drift, half-applied edits, parallel-session interference, missing evidence.
6. **Polish** — if score <10, take over on the main lane and finish the gap. Examples: missing styles → add them; failing test → fix it; scope creep → revert and re-apply tightly; whitespace drift in unrelated files → revert that drift. If score =10, ship (commit + push).

Discriminator for main-lane vs delegate: smaller tasks (single edit, single command, <50 LOC, scoped to 1-2 files) go main-lane because the delegation overhead (worker ramp-up, evidence roundtrip, judge step) costs more than the time saved. Everything else delegates.

## Parallel Divide-and-Conquer (set 2026-06-26, persistent)

Subagents aren't only for implementation — they're for ANY cognitive work: research, investigation, planning, design, review, implementation, polish. Use them as 2nd/3rd/4th/... parallel "me" to divide and conquer.

When to parallelize:

- Multi-file investigation → multiple subagents, each a slice
- Independent features → multiple subagents, each one
- Research questions → multiple subagents, then synthesize
- Competing designs → 2-3 workers explore alternatives, pick winner
- Wide task → N workers in parallel on different surfaces

How:

- Fire N `external_subagent_start` calls in one turn (no waiting between)
- Each gets its own `worker_id`, `owner_tag` (e.g. `kimi-research-N`), `tmp/` subdir
- Each gets a tight scoped prompt with allowed files + no-revert boundaries
- Main lane synthesizes results + judges + polishes

Examples:

- "Investigate Phase 9a error boundary" + "Investigate Phase 9c cancel UX" → 2 parallel investigations
- "Implement error store" + "Install handlers" + "Write contract tests" → 3 parallel implementations (independent files only)
- "Research Svelte 5 patterns" + "Research React patterns" → parallel research, synthesize

CONSTRAINT: independent scopes only. If two tasks touch the same files, serialize or merge into one worker.

## Visual Verification (set 2026-06-26, persistent)

We ALWAYS visually verify anything that has a visually verifiable output. This agent is multimodal and can see images via the `read` tool.

When UI work lands (Svelte components, CSS, animations, Three.js scenes, error overlays, dialogs, toasts, etc.):

1. Capture screenshot via headless browser or Playwright (`playwright_*` MCP tools, or `npm run qa:visual`, or `tests/visual-state-audit.mjs`)
2. Use the `read` tool on the screenshot path to actually view it
3. Confirm the work renders as designed: no broken layout, no z-index eats, no missing affordances, no overflow, no contrast issues
4. If broken → fix on main lane before commit

Required for:

- New buttons / overlays / affordances in existing components
- New error fallback components
- Animation / transition changes
- Z-index / positioning changes
- Any component a user can see

Worker contract: workers doing UI work should capture a screenshot and include the path in `tmp/<topic>/report.md`. Main lane verifies by reading the image. If the screenshot is missing, the work is incomplete.

## Vision Capability Matrix (set 2026-06-26, precisely scoped after user correction)

The original 400 error was `kimi-k2.7-code` via **freeinference.org** specifically. Do NOT generalize one provider's behavior to other providers or to the whole model family.

CONFIRMED NO VISION (precisely scoped, user-verified 2026-06-26):

- `kimi-k2.7-code` via `freeinference.org` ✗ (returns 400 on image input)

CONFIRMED HAS VISION (user-verified 2026-06-26):

- `kimi-k2.6` (provider not specified — has vision)
- `agnes-2.0-flash` ✓
- `mimo-v2.5` ✓
- `MiniMax-M3` (main lane — this model) ✓
- `google/gemini-*` (2.5-flash/pro, 3-flash, 3.5-flash) ✓
- `google/models/gemini-*` (direct Google API) ✓
- `google/models/aqa` (visual QA tuned) ✓
- `anthropic/claude-3-7-ch-exp`, `claude-opus-4-7` ✓
- `openai/gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.3-codex` ✓
- `meta/llama-3.2-90b-vision-instruct`, `llama-3.2-11b-vision-instruct` ✓
- `google/gemma-3-4b-it`, `gemma-3-12b-it`, `gemma-3-27b-it` ✓

UNVERIFIED — default to UNVERIFIED, not text-only, until empirically tested:

- `kimi-k2.7-code` via other providers (neuralwatt, moonshotai, zydit) — only freeinference.org was tested
- `kimi-k2.5` (any provider)
- `owl-alpha` (openrouter stealth — unknown)
- `deepseek-v4-flash`, `deepseek-v4-pro`
- `qwen3-coder`, `qwen3.5+`, `qwen3.6-*`
- `llama-3.1`, `llama-3.2-1b`, `llama-3.2-3b`
- `mixtral`, `mistral-code-*`, `mistral-large`, `mistral-medium`

LESSON: One provider's failure does NOT generalize to other providers of the same model. One model's failure does NOT generalize to its family. Default to UNVERIFIED when not directly tested. Don't over-correct from n=1 evidence.

## Subagent Lane Inventory

(from `model-providers.json` → `allowed_models`)

**Vision-capable (use these for visual work AND for workers that need to see images):**

- `MiniMax-M3` (main lane — always has vision)
- `google/gemini-3-flash` (free, best default for visual work)
- `google/gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`
- `google/models/gemini-2.5-flash`, `gemini-3-flash-preview`, `gemini-3-pro-preview` (direct Google API)
- `google/models/aqa` (visual QA tuned)
- `anthropic/claude-3-7-ch-exp`, `claude-opus-4-7`
- `openai/gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.3-codex`
- `meta/llama-3.2-90b-vision-instruct`, `llama-3.2-11b-vision-instruct`
- `kimi-k2.6` (vision-capable — useful as worker when image input needed)
- `agnes-2.0-flash` (vision-capable — useful as worker when image input needed)
- `mimo-v2.5` (vision-capable — useful as worker when image input needed)

**Text/code work (vision status unverified or known text-only — fine for non-visual tasks):**

- `kilo/openrouter/owl-alpha` (UNVERIFIED — assume no vision, fine for code work)
- `kimi-k2.7-code` (NO vision on freeinference.org; UNVERIFIED on other providers — fine for code)
- `deepseek-v4-flash-free`, `nemotron-3-ultra-free`, `qwen3.6-plus-free`, `north-mini-code-free`

**Text-only confirmed (DO NOT use for images):**

- `kimi-k2.7-code` via `freeinference.org` (specific 400 error — see matrix above)

**Worker contract for visual work:** if a worker task explicitly requires vision, dispatch with a confirmed vision-capable model. Otherwise default to `owl-alpha` for text/code work.

**Empirical probe rule:** before claiming a model has or lacks vision, actually probe it with an image. Catalog name strings are NOT proof of capability.
