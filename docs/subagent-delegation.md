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
4. **Delegate** — call `external_subagent_free_models` first, then pass an exact provider-qualified `launch_ref` to `external_subagent_start`. Provide: scope, allowed files, no-revert boundaries, expected evidence (diff + verification output + tmp/report.md), verification commands. Worker timeouts have a 30-minute minimum (`timeout_seconds` values below 1800 are clamped). `mode: yolo`. `mcp_profile: subagent`. `owner_tag: kimi-main`. Acquire session lock if multi-commit. For progressive MCP research, also pass a scoped `mcp_config_path` containing only the needed server (for example websearch); after the broker refresh, Pi workers can discover `mcp__websearch__web_search` through `tool_search` without loading browser MCPs.
    - **Quick model lookup**: `node scripts/list-subagent-models.mjs` filters the live catalog to project-relevant refs.
    - **Steer tool**: `external_subagent_steer` requires `prompt_text` (not `message`).
5. **Judge** — when the worker finishes, read `tmp/<topic>/report.md` + `git diff`. Score 1-10 against the brief. Look for: scope creep, broken types/tests, missing a11y, formatting drift, half-applied edits, parallel-session interference, missing evidence.
6. **Polish** — if score <10, take over on the main lane and finish the gap. Examples: missing styles → add them; failing test → fix it; scope creep → revert and re-apply tightly; whitespace drift in unrelated files → revert that drift. If score =10, ship (commit + push).

### Startup scope

The external-subagent broker keeps a historical worker-root registry for recovery, but
normal admission, polling, and current-launcher listing stay scoped to roots touched by
the current broker. This avoids scanning old projects on every start. Use an explicit
`out_dir` for a worker in another root, or enable `EXTERNAL_SUBAGENT_GLOBAL_ADMISSION=1`
and `EXTERNAL_SUBAGENT_GLOBAL_WORKER_SCAN=1` only for cross-project audits.

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

## Vision Capability Matrix (empirically re-probed 2026-08-05, full-sweep replacement for the 2026-06-26 set)

**Method:** 670+ live probes on 2026-08-05 — deterministic red-circle PNG sent via direct OpenAI-compat chat calls through the key router (19 routes with live keys), then a 2× confirmation pass. Evidence: `tmp/vision-probe/` (sweep + gap + confirm result JSONs). A model only counts as STABLE vision if BOTH confirmation probes described the image.

**Method limits (recorded honestly):** the family-name greps used to build the sweep (`/gemini|grok|kimi|minimax|mimo|vision|vl|vlm|llava|phi-3|internvl|glm-4|glm-5|omni|nova|ernie|qwen.*vl|gemma|step|mistral-medium|nemotron|agnes-image|image/i`) did NOT include claude/gpt-5/gpt-4o/o3/o4 — a second frontier wave (2026-08-05) probed those separately. Routes whose /models endpoint lists nothing (freemodel) or is Google-native (gemini) were probed by direct id. Any catalog entry not probed through one of those three paths is explicitly NOT covered.

**STABLE VISION — verified 2× each on 2026-08-05 (use these for UI/visual work):**

Free/cheap routes first:

- `zenmux/stepfun/step-3.7-flash` — free, ~4-17s, excellent
- `zenmux/sapiens-ai/agnes-2.0-flash` — free, ~9s
- `zenmux/z-ai/glm-4.6v-flash-free` — free (the ONLY glm-v that sees images on our routes)
- `agnes/agnes-2.5-flash` — free, ~8s
- `cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct` — free, llama-4 native multimodal
- `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` — free
- `openrouter/google/gemma-4-26b-a4b-it:free` — free
- `zen/mimo-v2.5-free` — free (opencode-zen route; works even though other zen models are billing-blocked)
- `groq/qwen/qwen3.6-27b` — free
- `llm7/gemini-3.1-flash-lite` — free
- `kilo/stepfun/step-3.7-flash:free` — free
- `mistral/mistral-medium` (+ all 7 dated variants incl. `mistral-medium-3.5`) — free tier
- `modelscope/Qwen/Qwen3-VL-8B-Instruct` — free, ~2s
- `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` — free
- `nvidia/minimaxai/minimax-m3` — slow (41-120s first call) but stable; still the best-reasoning vision default
- `nvidia/meta/llama-3.2-90b-vision-instruct` — ~4-5s
- `zydit/meta/llama-3.2-90b-vision-instruct`, `zydit/stepfun-ai/step-3.7-flash`

**REJECTED — actually no vision on our routes (probe said "VISION UNAVAILABLE" / empty / no image endpoints):**

- `openai/gpt-oss-20b`, `gpt-oss-120b` — text-only on nvidia/zydit; openrouter "no endpoints support image input"; llm7 explicitly rejects
- GLM family (`z-ai/glm-4.5`, `4.5v`, `4.6`, `4.6v`, `5`, `5.1`, `5.2` on kilo/nvidia/neuralwatt/zenmux/openrouter) — "VISION UNAVAILABLE" or reasoning-only content. Exception: `zenmux/z-ai/glm-4.6v-flash-free` (above)
- `agnes/agnes-2.5-pro` — thinking-only output, never describes pixels
- `kilo/google/gemini-3.6-flash`, `kilo/google/gemini-2.5-pro` — flaky/negative (one sweep hit saw pixels, 2× confirmation says VISION UNAVAILABLE)
- `cloudflare/@cf/google/gemma-4-26b-a4b-it` — flaky (1 vision hit, 2× confirmation thinking-only)
- modelscope `OpenGVLab/InternVL3_5-241B-A28B`, `PaddlePaddle/ERNIE-4.5-VL-28B-A3B-PT`, `zai-org/GLM-4.7-Flash`, `stepfun-ai/Step-3.5-Flash`, `MiniMax/MiniMax-M1-80k` — empty output on image prompts (route defect)
- `openrouter/nvidia/nemotron-nano-12b-v2-vl:free` — flaky

**Frontier families (claude / gpt-5 / gpt-4o / o3 / o4) — catalogued but ALL billing-blocked 2026-08-05, so no vision verdict possible today:**

- claude (91 ids: kilo/openrouter/zenmux/llm7/zen/infron — opus-4.1..5, sonnet-4..5, haiku-4.5, fable-5), gpt-5 (132 ids incl. 5.6-luna/terra/sol, 5.5, 5.4), gpt-4o/4.1/o3/o4-mini (60 ids) — multimodal by design, but every live probe returned no-credit / insufficient-balance (kilo, openrouter, zenmux 402, zen CreditsError, llm7 insufficient quota, freemodel keys on cooldown). llm7 served `claude-sonnet-5`/`gpt-5.5` but explicitly "does not support vision input" (text-only endpoint). Once any of these lanes get credits, re-probe before trusting — the pair `docs/subagent-model-benchmarks.md` 2026-06-26 user-verified claude-opus-4-7 / gpt-5.5 as vision-capable upstream.
- gemini route (direct Google API, native format): first probe "VISION UNAVAILABLE", then 429 credits-depleted — not a usable vision lane today despite "google/models/gemini-\*" in the old matrix.

**Previously confirmed 2026-06-26 — now DEAD or unreachable (removed from active list):**

- `kimi-k2.6` — 404 "Function not found" on kilo/openrouter/zenmux/nvidia; unavailable on cloudflare; logfare timeouts
- `kimi-k3`, `grok-4.5`, `xiaomi/mimo-v2.5(-pro)` — paid-only (no-credit) or no image endpoints on every live route
- `owl-alpha` — already dead (see lane inventory)

**NEW LESSON (key-rotation flakiness):** the same route+model can return pixels on one call and "VISION UNAVAILABLE" on the next (observed: zenmux/gemini-3.5-flash vision at 12:19, no-vision at 12:25; kilo/gemini-3.6-flash the reverse). Routes round-robin multiple keys with different upstream image support. **Never trust a single probe — confirm with 2+ calls before using a lane for real visual work.**

**Empirical probe rule (unchanged):** before claiming a model has or lacks vision, actually probe it with an image. Catalog name strings are NOT proof of capability (`gpt-oss` and `glm-4.6v` prove this both directions).

## Subagent Lane Inventory

(from `model-providers.json` → `allowed_models`)

**Vision-capable (empirically verified 2026-08-05 — see Vision Capability Matrix in `subagent-delegation.md`; use for visual work AND workers that need to see images):**

- Free: `zenmux/stepfun/step-3.7-flash`, `zenmux/sapiens-ai/agnes-2.0-flash`, `zenmux/z-ai/glm-4.6v-flash-free`, `agnes/agnes-2.5-flash`, `cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct`, `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `openrouter/google/gemma-4-26b-a4b-it:free`, `zen/mimo-v2.5-free`, `groq/qwen/qwen3.6-27b`, `llm7/gemini-3.1-flash-lite`, `kilo/stepfun/step-3.7-flash:free`, `mistral/mistral-medium(-3.5)`, `modelscope/Qwen/Qwen3-VL-8B-Instruct`, `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct`
- Slow/paid but stable: `nvidia/minimaxai/minimax-m3` (best-reasoning vision default), `nvidia/meta/llama-3.2-90b-vision-instruct`, `zydit/meta/llama-3.2-90b-vision-instruct`, `zydit/stepfun-ai/step-3.7-flash`
- DEAD as of 2026-08-05: `kimi-k2.6` (404 everywhere), `owl-alpha`, `gpt-oss-*` (no image endpoints), GLM-v family except zenmux `glm-4.6v-flash-free`

**Text/code work (vision status unverified or known text-only — fine for non-visual tasks):**

- `kilo/openrouter/owl-alpha` (UNVERIFIED — assume no vision, fine for code work)
- `kimi-k2.7-code` (NO vision on freeinference.org; UNVERIFIED on other providers — fine for code)
- `deepseek-v4-flash-free`, `nemotron-3-ultra-free`, `qwen3.6-plus-free` (not in live free catalog 2026-07-15), `north-mini-code-free`, `hy3-free` (new free-tier lane, bare ref → `opencode-zen/hy3-free`)

**Text-only confirmed (DO NOT use for images):**

- `kimi-k2.7-code` via `freeinference.org` (specific 400 error — see matrix above)

**Worker contract for visual work:** if a worker task explicitly requires vision, dispatch with a confirmed vision-capable model. Otherwise default to `owl-alpha` for text/code work.

**Empirical probe rule:** before claiming a model has or lacks vision, actually probe it with an image. Catalog name strings are NOT proof of capability.
