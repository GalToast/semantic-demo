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
    - **Git-mutation guard (measured 2026-08-13):** ALWAYS include an explicit "NEVER `git init`/`reset` (hard or soft)/`stash`/`rebase`/`switch`/`checkout` of the whole working tree/`git restore .`/`git clean` — doing so wipes other lanes' in-flight worktree edits. Read-only `git status`/`diff`/`log` fine; `git restore --staged <file>` OK for a single file." Workers attempt "cleanups" when the tree looks dirty to them; the no-reflog `git diff`/`git checkout -- .` wipe path is invisible to forensics. Main lane: snapshot `git status --porcelain` + `git stash list` pre-dispatch and re-check on every poll; if the tree loses edits or a worker leaves its seam, stop the fleet immediately and re-apply from worker reports + carve commits.
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

### Worker skill visibility (2026-08-05, root-caused)

External subagents receive skill paths **only** from explicitly-listed extensions; the `-ne` flag disables auto-discovery, so `pi-hermes-memory`, `pi-lens`, and `projects-memory` contributions are absent unless those extensions are listed. Historically this left workers with only the ~21 user skills in `~/.pi/agent/skills` while a ~62-skill library existed on disk but was never injected — worker prompts that reference a skill by name may silently ignore it (mitigation: embed mandatory rules in the prompt; treat skills as default-shapers only).

Fix: a skills-only extension (`~/.pi/agent/local-packages/pi-worker-skills/index.ts`) registers `resources_discover` for the global + project skills dirs with zero memory/hooks; add it to the worker `--extension` list.

Hygiene rule: after any change to worker extension wiring or the skill library, verify by probing a live worker's own `<skill list` (spawn a probe worker asking it to list its injected skills); do not assume.

**A/B preflight gate (2026-08-05, from skill-efficacy A/B #2/#3):** before any skill-efficacy measurement, confirm the treatment worker demonstrably has the target skill in its injected context. Two cheap confirmations, either suffices: (a) post-run grep the treatment worker's stdout for the skill's description string (workers apply skills from the injected name+description without reading the body file — that's normal Pi design), or (b) spawn a one-shot probe worker that enumerates its own `<available_skills>` and asserts the skill name. A run recorded without this confirmation is INVALID — A/B #2 was invalidated this way (neither group had the skill; the apparent "signal" was prompt-priming from the treatment text). Workers launched with the deterministic `pi-worker-skills` extension in args satisfy this trivially; spot-check one log after the run.

**Main-session resume snapshot:** a resumed main Pi session restores its session-start `<available_skills>` block; skills authored mid-session are invisible to that resumed session until a fresh boot. Workers (always fresh spawns) and fresh main sessions see the full current library. Do not confuse a stale resumed-snapshot (~50 skills) with a loader failure — all skill dirs load clean via `npm run check:skills` (92 skills, exit 0) and a fresh-boot one-shot sees 98. The resumed-session gap is cosmetic (on-demand skill reads still work via the file path); start a new conversation when you need the main lane to carry the full library natively.

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

### Deliverable-first protocol (prevents the ×5 settle-before-write failure, 2026-08-10)

Measured: pi-harness workers (logfare AND nvidia routes) frequently settle/abort after ~3-4 min of real tool work WITHOUT writing the final report — transcripts show completed verification + a final message, but the file never lands. Standard "write your findings to X" briefs schedule the write LAST, and the settle cuts it.

**Proven fix — restructure every artifact-producing brief as deliverable-FIRST:**

1. `STEP 1 (WRITE FIRST)`: create the report file immediately with the table/structure + all rows prepopulated `PENDING`.
2. `STEP 2`: do the per-item work.
3. `STEP 3`: **rewrite the file after EACH item** (never batch at end).
4. Literal line: `CRITICAL: keep <file> on disk at all times, even if you settle early.`

Guarantee: even a mid-sweep settle leaves a valid partial artifact to harvest. Verified: header-sweep-C (write-first via live-steer) landed a 4,989-byte report; identical-brief A/B (write-at-end) both settled with 200KB transcripts and no file. `external_subagent_steer({prompt_text: 'write now'})` works as live input while a worker is alive.

## Vision Capability Matrix (empirically re-probed 2026-08-05, full-sweep replacement for the 2026-06-26 set)

**> IMPORTANT — two different image paths (2026-08-05 discovery):**

> This matrix probes the **direct router chat** path (`node tmp/vision-ask.mjs <slug> <model> <img>` -> base64 -> `127.0.0.1:8788/<slug>/v1/chat/completions`). That path ALWAYS worked.
> The **subagent-worker path** (worker's `read` tool -> image part -> model) was silently dropping images until 2026-08-05 because modelscope/logfare-style router catalogs return bare `{id}` rows with NO `input_modalities`, so Pi's `pi-model-providers` extension inferred `input:["text"]` and `openai-completions` discarded tool-result image parts. FIX: `~/.pi/agent/local-packages/pi-model-providers/index.ts` now falls back to a model-id pattern (`visionInputFromModelId`: `-vl`/`vision`/`internvl`/`phi-3-vision`/`glm-4.6v`/`glm-5v`/`minimax` etc.) when catalog modality data is absent. Verified end-to-end with a worker probe on `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` returning "PIXELS OK — business card for Angel Fire Coffee".
> Implication: a lane read of "VISION UNAVAILABLE" pre-2026-08-05 does NOT mean the model lacks vision — re-probe on the current harness if the model id matches a VL pattern.

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

## Direct-API NIM jury (2026-08-09; the fix for subagent-vision 400-payload wall)

The subagent harness re-sends every image the worker has read so far on each subsequent API call; on the nvidia NIM lane that accumulates past the request-size limit → `400 status code (no body)` mid-review (reproduced across 3 dispatch rounds, ~20 workers, 2026-08-09). The mechanism beats the whole `external_subagent_*` path for multi-image vision work regardless of batch size.

**Reliable pattern — direct per-image API calls, no harness accumulation:**

- `scripts/visual-jury-nim-direct.mjs <slice> <slices> <out-suffix> [jobs.json]` — one HTTP call per image to `router-nvidia` (`meta/llama-3.2-90b-vision-instruct`, free NIM tier), each writes its own `direct-jury-slice-<suffix>.md`. Run N slices concurrently (e.g. 4) for full coverage in minutes.
- `scripts/build-jury-jobs.mjs` — emits the shared `jobs.json` (label, filename, focus-hint per surface).
- `scripts/visual-pixel-variance.mjs` — cheap PNG inflate variance scan to flag near-blank frames BEFORE vision spend (variance < ~500 = suspect; healthy 6000+).
- Full-res JPEG q90 at identical dimensions is a ~5.6× payload win with negligible quality loss; keeps the "no downscale" bar.

**VLM-discipline note:** layout/overlap/clipping verdicts are reliable; low-contrast + "overlap with backdrop" verdicts on dark glassy UIs are frequent false positives. Always close the loop with DOM truth (`getBoundingClientRect` + `elementFromPoint`) — see `visual-audit-false-positive-watchlist` skill. Do NOT dispatch 20 workers; one direct runner with concurrency is cheaper and deterministic.

## Recursive Delegation — policy (set 2026-08-11, measured basis)

**CURRENT MODE (user steer, 2026-08-11): NESTED DELEGATION ENABLED.** The flat-only default
was overturned by the user ("our subagents will delegate their own subagents"); nested
fan-out is now a supported operating mode. The measured cautions below (settle rates,
join probability, blind-redelegate risk) still apply to HOW the tree is shaped, but a
flat-only restriction is no longer in force.

Nested operating rules (upgraded from the old "safe reopening" conditions to always-on
nested norms):

1. Child must deliver a DISK FILE (not text); parent verifies it exists and integrates
   it into its own REPORT — same deliverable-first protocol as 1st-gen.
2. Child spawn is bounded to ONE level for now (main → parent-worker → child-worker);
   parent never waits unbounded (hard timeout, explicit at spawn).
3. Parent's REPORT must carry child lineage (names + worker ids) — enables followup.
4. Fan-out for genuinely independent slices; keep per-level fan-out modest (2-3 max)
   until measured.

The 2026-08-10 wave's measured-basis concerns use to be fleet-flat; adopting nested does
NOT relax the deliverable-first protocol, per-level verification, or the main-lane
final-verify on everything.

- 1st-gen settle-without-deliverable rate was high in both waves: L-wave 6/6 attempts
  settled without deliverables (rate-limit, recon-loop, text-only replies); M2 settled
  without its REPORT even with the improved deliverable-locked prompt (recovered via
  same-session followup).
- Join probability of a 2-level tree is multiplicative, NOT additive; a parent waiting
  on a hung child burns its own budget; recovery is ambiguous (follow up parent or child?).
- M1's honest adopt-and-reverify behavior (discovered the seam was already executed,
  re-ran gates, reported — did NOT duplicate the migration) is the quality bar: a lane
  that re-delegates blindly loses that discernment.
  Safe reopening condition (only when these ALL hold):

1. Child must deliver a DISK FILE (not text); parent must verify it exists and
   integrate it into its own REPORT.
2. Child spawn is bounded to ONE level; parent never waits unbounded (hard timeout).
3. Parent's REPORT must carry child lineage (names + worker ids).
4. Fan-out only for genuinely independent slices — logfare lanes run one-at-a-time
   in practice, so parallel fan-out gains little today.

### Stacked goal tiers (the "beast" file-path protocol — live 2026-08-11)

The goal TOOL is not surfaced in worker schemas (worker tool-filter blocks it; mmx
extension injection does NOT add it — probed + reverted). BUT goal-state.json at
~/.pi/agent/extensions/goal-state.json is a plain read-fileSync/writeFileSync file:
ANY worker + nested child can read/write it with ordinary bash/node-fs — no tool.

Beast stacking = every tier writes its own namespaced sub-goal alongside the main
goal; the main lane evaluates all-tiers-ACHIEVED. Live: parent tier written BY a
worker via node-fs (tmp/beast-subgoals/parent.json: {worker,status,ticks}), child tier
same shape. The main extension's condition-eval can read any path.

PROVEN-GOOD: worker file-ticks its sub-goal (self-write, no tool) — full control.
STILL-CLOGGED: a worker's SELF-spawn detours into model-catalog discovery (LaunchRef
grep) that burns its settle budget — for child spawns, use a parent brief with the
EXACT model string + tool name pre-baked (the nested-profile parent did this and
succeeded), or main-lane-direct the child tier.

### LIVE COMPLETE (2026-08-11, 02:55Z): the full nested + recursive stack

The beast-file-probe parent FULLY executed the nested flow: it spawned child
ocw_d468266d (a REAL sub-worker), polled it to completion (exit 0), read the
child's disk state tmp/beast-subgoals2/child.json
({worker:beast-child,status:done,ticks:3}), verified CHILD_TICKED reply, and
wrote final: parent-in-progress + child-done = STACKED to its report. The
goal-tool absent-from-events verdict (sampled first-hand by a worker:
GOAL_TOOL=absent — only read/bash/write/flight_recorder in-session) confirms
the file-path is the worker-reachable medium; the tool is harness-side-only.
Pept. Child spawn was hard-won (model-discovery detour) — bake the exact
model string + tool name in the parent brief.

### Ratification note (main lane, 2026-08-11)

The nested-ENABLED amendment above (003dffa3) supersedes the flat-only default; main lane
ratifies it AS POLICY (the user's delegation question + the fleet's live 2-level proof with
disk-file checksum). The measured cautions remain load-bearing: in the same session, N1 ×2
and N2 ×1 settled without deliverables even at level 1 — nested trees must not assume a
lower settle rate. Verdict standard stays: verify by disk-file + git log, not worker exit.

## Landmine classes — spec/test hygiene (consolidated 2026-08-11)

Six failure classes this session cost the most debugging time. Each: class | symptom | prevention.

1. **Phantom functions** (72-test regression, 5a8bde32): migration left CALL SITES while the
   DEFINITION was lost (demo abortDemoLifecycle/resetDemoLifecycle; never in git history —
   JS throws only when the caller runs). Prevention: after a migration, grep for
   called-but-never-defined identifiers (bare `name(` where `name` has no def + no import).
2. **Spec-level @lib imports** (the 3d battery's real blocker, afc81073): specs importing
   `@lib/*.svelte.ts` at TOP-LEVEL crash the Node runner at LOAD (raw $state, no Svelte
   transform). Prevention: specs drive the browser bridge (window.**navActions**) + load
   /dist/svelte/index.html — never import app source.
3. **Full-mocks leaking into shared graphs** (2119c117): a full `vi.mock('@lib/utils/env')`
   (no importOriginal-spread) dropped exports other suites' transitive imports needed →
   order-dependent 'X is not a function' in batch. Prevention: importOriginal-spread for
   widely-imported modules; per-file isolation doesn't shield shared leaves.
4. **Parallel-convergence** (×3: dead-re-exports, camera-poll, search): the fleet commits a
   byte-identical fix; re-applying wastes time + orphans. Prevention: `git merge-base
--is-ancestor <mine> HEAD` + `git diff <mine> HEAD -- <file>` before re-committing.
5. **Audit-staleness** (5 instances: F1/F2/F3/M3/O1): lane audits written against an earlier
   tree — their claims (identity-cache works, double-snapshot, zero-consumers, deps-free)
   failed live verification. Prevention: re-verify every audit claim against the CURRENT
   tree before executing; audits are hypotheses, not facts.
6. **Stale-dist / webServer-rebuild** (battery ×4): the playwright webServer's in-process
   build serves a broken bundle under fleet's concurrent vite config. Prevention:
   PLAYWRIGHT_REUSE_SERVER=1 + a pre-started `node scripts/test-server.mjs` serving the
   verified dist.
