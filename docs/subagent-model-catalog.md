# Subagent Model Catalog

Working notes for external-subagent model performance in this repo. Do not store API keys, account details, raw headers, or full transcripts here. Treat each row as evidence from one observed launch, not a permanent provider guarantee.

## 2026-06-13 -- Current Routing State

This section records the active routing defaults as of the most recent cross-gateway test day (2026-06-13). Entries here override any older catalog entries when they conflict.

| Use case | Default model | Lock status | Escalation rule |
|---|---|---|---|
| Paid (reliable implementation work) | `opencode-go/mimo-v2.5` | Locked -- user approved paid tier on 2026-06-12 | No escalation needed; this is the safety net |
| Free memory consolidation | `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` | Locked -- set in `~/.pi/agent/settings.json` (llmModelOverride) | Do not change without explicit user request |
| Free subagent dispatches (default) | `openrouter/owl-alpha` | Updated 2026-06-13 -- replaces `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` which suffered silent failure (0 tokens) in the both-pattern campaign | Worker failure/429 → escalate to paid with user approval |
| Free subagent dispatches (diversity pick) | `modelscope/deepseek-ai/DeepSeek-V4-Flash` | Updated 2026-06-13 -- new gold-quality alternative, different architecture from owl-alpha | Use when 4+ parallel dispatches need model-family diversity |
| Free subagent dispatches (code-archeology) | `nvidia/meta/llama-3.3-70b-instruct` | Updated 2026-06-13 -- solid code comprehension but UNRELIABLE write step; only use for read-only probes with manual report extraction | Do NOT use for unattended deliverables requiring disk writes |

**Known-bad free routes (2026-06-13 update):**
- `opencode-zen/mimo-v2.5-free` -- 429s within minutes when multiple workers run concurrently on the same gateway.
- `opencode-zen/deepseek-v4-flash-free` -- same 429 pattern under load.
- `openrouter/qwen/qwen3-coder:free` -- rate-limited upstream in both verification and both-pattern campaigns; 13KB stdout, no report. Don't use for now on this gateway.
- `openrouter/meta-llama/llama-3.3-70b-instruct:free` -- rate-limited (14KB stdout, no report) in the both-pattern round 1. Unreliable on this gateway.
- `nvidia/nemotron-3-ultra-550b-a55b:free` (kilo) -- silent failure: 1.9MB stdout, stopped with 0 tokens (`stopReason: 'stop'`, no output). Unreliable for subagent dispatches despite size. Removed from free subagent default.
- `mistral/codestral-2508` -- barely started in both-pattern campaign (37 tokens produced). Broken for this workload; prefer other code-specialized options.
- `nvidia/nemotron-3-super-120b-a12b` -- produces 1077+ tokens but doesn't write report files reliably. Use for read-only investigations only, not write-up tasks.

Related inventory: [nvidia-nim-capability-catalog.md](nvidia-nim-capability-catalog.md) tracks NVIDIA NIM models and non-chat capabilities exposed by the local NVIDIA lane or NVIDIA Build.

## 2026-06-13 -- Clip / Screenshot Diagnostic Rotation

Use clips as evidence artifacts, not as a replacement for deterministic DOM/layout checks. Capture short Playwright/Chrome clips or screenshots to `tmp/`, then send them to a vision-capable subagent with a narrow prompt: identify the top 3 layout/interaction defects, cite timestamps or screen regions, and separate product bugs from capture/env artifacts.

| Priority | Launch ref | Best diagnostic use | Source/capability note | Current caveat |
|---|---|---|---|---|
| 1 | `nvidia/moonshotai/kimi-k2.6` | Combined code + UI/video scout for hard visual seams | Official Kimi post describes K2.6 as an open-source long-horizon coding model; NVIDIA Build describes the hosted route as native multimodal with image/video input support. Sources: <https://www.kimi.com/blog/kimi-k2-6>, <https://build.nvidia.com/moonshotai/kimi-k2.6/modelcard> | Strong prior repo runs, but log-heavy. Verify claims locally before patching UI. |
| 2 | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | First dedicated clip-understanding smoke | NVIDIA Build says it unifies video, audio, image, and text understanding for Q&A, summarization, transcription, GUI/OCR, and rich enterprise content. Source: <https://build.nvidia.com/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning/modelcard> | Untested as a Pi worker; confirm chat payload support before relying on it. |
| 3 | `nvidia/nemotron-nano-12b-v2-vl` | Fast screenshot, multi-image, document-style UI critique | NVIDIA Build lists image/video/text inputs and a 2025-10-28 release; it explicitly says reasoning is not supported for video inputs. Source: <https://build.nvidia.com/nvidia/nemotron-nano-12b-v2-vl/modelcard> | Good candidate for visual QA, but video reasoning has a documented limitation. |
| 4 | `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` | High-end screenshot critique and spatial/layout reasoning | Qwen's Qwen3-VL announcement describes stronger visual perception, video dynamics comprehension, and agent interaction; ModelScope exposes the launch ref locally. Sources: <https://qwen.ai/blog?from=research.latest-advancements-list&id=99f0335c4ad9ff6153e517418d48535ab6d8afef>, <https://www.modelscope.ai/models/Qwen/Qwen3-VL-235B-A22B-Instruct> | ModelScope quota/runtime reliability must be smoke-tested per route. |
| 5 | `nvidia/cosmos-reason2-8b` / Build `cosmos3-nano-reasoner` | Video/image physical-world reasoning, less likely needed for normal UI polish | NVIDIA Build currently redirects the exposed route to a Cosmos reasoner page for structured reasoning on videos/images. Source: <https://build.nvidia.com/nvidia/cosmos-reason2-8b/modelcard> | Naming/route mapping is ambiguous; treat as a direct API smoke target before assigning product QA. |

Keep actual video generation/editing, relighting, lip sync, ASR/TTS, and synthetic-video detection out of the default subagent loop until we have endpoint-specific clients and tiny payload tests. Those are media APIs, not guaranteed chat-completions workers.

## Rating Guide

| Rating | Meaning |
|---|---|
| Strong | Useful for real repo work with normal verification. |
| Promising | Can contribute, but needs steering, smaller prompts, or log handling. |
| Limited | Useful only for narrow report-only probes or tiny edits. |
| Broken | Launches but fails to produce usable work. |
| Stale route | Catalog entry exists but provider/router rejected it. |

## Tested Routes

| Date | Launch ref | Provider lane | Harness | Workload | Result | Tool behavior | Strengths | Weaknesses / failure mode | Best use | Rating |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-06-12 | `opencode-go/mimo-v2.5` | OpenCode Go paid | Pi | External-subagent MCP keepalive implementation | Completed with useful code changes | Read/edit/bash worked; live steering landed via Pi RPC; produced huge logs | Capable cheap implementer for focused broker work | Needed narrowed steering; placed tests in wrong location before cleanup; main-lane review required | Focused implementation with explicit file ownership and verification | Promising |
| 2026-06-13 | `opencode-go/mimo-v2.5` | OpenCode Go paid | Pi | Convert `selected-business-view-model` cached unit test to active suite | Completed with correct file and passing tests | Read/write/bash worked; `code_clean` caught no errors; response model `xiaomi/mimo-v2.5-20260422`; stdout hit broker tail cap again | Reliable focused implementer when ownership is exact | Very large logs even for small file work; final claims still require local verification | Production-bound small implementation with tight file scope | Strong |
| 2026-06-13 | `opencode-go/mimo-v2.5` | OpenCode Go paid | Pi | Probe active-unit conversion for `search-results-view-model` | Correctly refused to edit after finding no clean `src/` owner | Read/search/bash worked; live Pi RPC steering landed in same session; final surfaced after stdout cap | Good migration scout when asked to block unsafe conversions | Huge stdout again; needed steering to stop broad source search | Migration triage and focused implementation when owner path is exact | Strong |
| 2026-06-12 | `opencode-zen/mimo-v2.5-free` | OpenCode Zen | Pi | Provider error surfacing + followup profile inheritance | Partially completed with useful edits | Read/edit/bash worked; live steering landed; ran focused passing subset | Good at small targeted broker fixes | Ended on provider connection retry; left scratch `test-debug.ts`; final output parser degraded to logs-only | Small implementation or critique lanes with close review | Promising |
| 2026-06-12 | `kilo/nex-agi/nex-n2-pro:free` | Kilo | Pi | Semantic Explorer product playthrough review | Timed out after 900s, but showed strong tool initiative | Live steering worked technically, but the model did not respond well to steering; it brute-forced with broad PowerShell searches | Intelligent, tool-calling heavy, able to recover from setup blockers and locate QA artifacts | Poor steering compliance; can brute-force into `.opencode` caches and huge stdout if not hard-bounded | High-effort brute-force investigation with strict path limits and long timeout | Promising |
| 2026-06-12 | `nvidia/nemotron-3-super-120b-a12b` | NVIDIA | Pi | Production build warning/chunk investigation | Partial reconnaissance, then provider/API timeout | Read/build/search worked before final failure | Strong initial code-reading capability | Ended with provider timeout after large context/log volume | High-context scout when timeout risk is acceptable | Limited |
| 2026-06-12 | `modelscope/zai-org/GLM-5.1` | ModelScope | Pi | Mobile-critical contract QA | Found server URL/setup issue, then completed before steer | Useful first-pass tool use; followup spawned child because session was terminal | Good at quickly identifying environment blockers | Same-session steering missed post-completion; followup hit rate limit and inherited wrong profile before broker fix | Short QA/diagnostic lanes, not long puppetable sessions yet | Promising |
| 2026-06-12 | `opencode-zen/north-mini-code-free` | OpenCode Zen | Pi | Keepalive/steering smoke | Completed tiny smoke | Produced text, but first tried to execute the requested literal reply as a command | Fast route and parser captured response model | Too command-happy for fragile prompts; prompt-only keepalive did not hold session | Tiny route health smokes only | Limited |
| 2026-06-12 | `mistral/codestral-2508` | Mistral direct | Pi | Launch smoke | Failed before usable work | Provider `errorMessage` was buried in stream before broker fix | None confirmed | `422 status code (no body)` | Retest after router/model mapping refresh | Stale route |
| 2026-06-12 | `openrouter/qwen/qwen3-next-80b-a3b-instruct:free` | OpenRouter | Pi | Launch smoke | Failed before usable work | Provider error parsed as rate-limited after broker fix target | None confirmed in this run | OpenRouter returned upstream 429 | Retest later; not reliable during quota pressure | Stale route |
| 2026-06-12 | `modelscope/deepseek-ai/DeepSeek-V4-Flash` | ModelScope | Pi | Repo file read + Semantic Explorer report | Completed with useful output | File reads worked; stdout was very large | Fast enough, coherent diagnosis, good cheap scout | Huge logs; finalization can be weak after tool use | Repo reconnaissance, focused report-only seams | Promising |
| 2026-06-12 | `nvidia/z-ai/glm-5.1` | NVIDIA | Pi | Repo diagnosis with context tools | Completed after steering with useful concise report | Used context tooling heavily; produced large stream | Strong reading and synthesis when steered | Runaway context/log volume; needs scope discipline | Diagnostics, architecture questions, code reading | Promising |
| 2026-06-12 | `nvidia/moonshotai/kimi-k2.6` | NVIDIA | Pi | No-edit repo file read + ThreadInspector probe | Completed with useful output | Reported full tools including read/edit/write/bash/context/browser; file reads succeeded | Strong synthesis, multimodal-capable route, good repo comprehension | Log-heavy; some answer material appears in thinking stream; may need steering for discipline | High-value code/UI/vision scout and complex diagnosis | Strong |
| 2026-06-12 | `nvidia/deepseek-ai/deepseek-v4-flash` | NVIDIA | Pi | No-edit repo file read + focus store probe | Produced useful output after slow start | Reported full tools and correctly identified body-attr mirroring | Useful code reading and accurate focused diagnosis | Slow first output; stream parser showed mostly thinking and zero usage, so final-output extraction needs hardening | Cheap focused repo probes if latency is acceptable | Promising |
| 2026-06-12 | `nvidia/minimaxai/minimax-m2.7` | NVIDIA | Pi | No-edit repo file read + App shell probe | Timed out after 240s with no assistant output | Pi RPC setup worked, but no model text/tool calls appeared | None confirmed yet | Stuck at `rpc_response:prompt`; process killed by exact worker timeout | Retest direct API or alternate harness before using as subagent | Broken |
| 2026-06-12 | `modelscope/MiniMax/MiniMax-M2.7` | ModelScope | Pi | Launch smoke | Failed before work | Provider rejected model id | None observed | `400 Model id ... has no provider supported` despite catalog listing | Do not use until router/catalog mapping is fixed | Stale route |
| 2026-06-13 | `modelscope/Menlo/Jan-nano` | ModelScope | Pi | Tiny report-only file-read probe | Failed before assistant output | Pi RPC launch worked, but provider returned `400 Invalid model id: Menlo/Jan-nano` | None confirmed | Live catalog listed the route, but runtime rejected the normalized model id | Hide or remap before using; retest only after router ModelScope id mapping fix | Stale route |
| 2026-06-12 | `opencode-zen/qwen3.6-plus-free` | OpenCode Zen | Pi | Launch smoke | Failed before work | Router rejected free promotion | None observed | `401 Free promotion has ended for Qwen3.6 Plus Free` | Remove from preferred free picks | Stale route |
| 2026-06-12 | `nvidia/google/diffusiongemma-26b-a4b-it` | NVIDIA | Pi | Report-only repo probe | Timed out | No assistant or tool output in 180s | None observed | Silent timeout | Not useful for coding subagents yet | Broken |
| 2026-06-12 | `modelscope/Qwen/Qwen3-VL-8B-Instruct` | ModelScope | Pi | Report-only repo probe | Timed out | No assistant or tool output in 180s | None observed | Silent timeout | Not useful for coding subagents yet | Broken |
| 2026-06-12 | `mistral/devstral-latest` | Mistral direct | Pi | Report-only repo probe | Timed out | No assistant or tool output in 180s | None observed | Silent timeout in previous probe | Retest with smaller smoke and route diagnostics | Limited |
| 2026-06-13 | `mistral/mistral-vibe-cli-fast` | Mistral direct | Pi | Tiny report-only file-read probe | Completed with useful concise final | Read worked on all requested files; no edit/bash proof in this run; stdout ~461 KB for 3 reads | Good quick read-only reconnaissance; clean final answer | Log-heavy for a tiny prompt; not yet proven for edits or long tasks | Small repo-read probes and catalog checks | Promising |
| 2026-06-13 | `mistral/mistral-code-agent-latest` | Mistral direct | Pi | Report-only catalog/package probe | Completed with clean final text | Read/catalog metadata worked; no tool calls in stream summary; stdout ~1.0 MB for a tiny report | Fast, coherent repo/package summarizer; no provider errors observed | Not yet proven for edits in this repo; log-heavy relative to prompt size | Focused code review, implementation retest, and small repo-read probes | Promising |
| 2026-06-13 | `mistral/mistral-code-agent-latest` | Mistral direct | Pi | Convert `data-mapper` legacy unit test to active TS | Created useful draft test; main lane tightened behavior and source overloads | Read/edit/bash worked; live steer recovered a half-finished first pass; `code_clean` ran | Can edit focused test seams and react to steering | Weakened nullish assertions to satisfy TypeScript; needed main-lane correction and verification | Draft implementation on narrow low-risk tests, followed by strict review | Promising |
| 2026-06-13 | `modelscope/Qwen/Qwen3-Coder-30B-A3B-Instruct` | ModelScope | Pi | Report-only catalog/package probe | Completed with useful final text | Produced visible text through Pi; no edit/bash proof in this run; stdout ~497 KB | Stable launch through ModelScope lane; concise enough final | Summarized catalog more than independently inspecting; not yet proven for edits | Read-only audits and secondary review lanes | Promising |
| 2026-06-13 | `modelscope/Qwen/Qwen3-Coder-30B-A3B-Instruct` | ModelScope | Pi | Read-only review of `data-mapper` active test shape | Completed after live steering | Read/bash worked; live steer corrected Windows command usage | Useful secondary reviewer once unstuck | Tried Unix `head` in Pi PowerShell bash tool; broad review overreported generic risks | Read-only review lanes with Windows command reminder | Promising |
| 2026-06-13 | `kilo/stepfun/step-3.7-flash:free` | Kilo | Pi | Report-only catalog/package probe | Completed with useful final text | Visible thinking plus final text; reported broad tool surface; no edits | Provider-qualified Kilo route is launchable; good concise synthesis | Free lane caveats still apply; no implementation proof yet | Lightweight read-only diagnostics and route smoke tests | Promising |

All free-tier recommendations in the table above are conditional on traffic volume. Under load (multiple concurrent workers on the same gateway), free routes may return 429. See Cross-Gateway 429 Patterns below for mitigation.

## Current Live Catalog Snapshot

Observed from `external_subagent_free_models compact=true` on 2026-06-13:

- Pi is the normal external-subagent harness; omit `harness` unless explicitly testing a fallback lane.
- Provider-qualified launch refs exist for `opencode-zen`, `nvidia`, `mistral`, `openrouter`, `kilo`, and `modelscope`.
- Duplicate model routes exist and must stay provider-qualified, especially `openrouter/owl-alpha` vs `kilo/openrouter/owl-alpha` and `openrouter/nex-agi/nex-n2-pro:free` vs `kilo/nex-agi/nex-n2-pro:free`.
- NVIDIA live catalog exposes broad accessible refs including `nvidia/moonshotai/kimi-k2.6`, `nvidia/minimaxai/minimax-m2.7`, `nvidia/minimaxai/minimax-m3`, `nvidia/deepseek-ai/deepseek-v4-flash`, `nvidia/deepseek-ai/deepseek-v4-pro`, `nvidia/z-ai/glm-5.1`, and many vision models.
- ModelScope live catalog exposes broad accessible refs including DeepSeek V4, MiniMax, Nex N2 Pro, GLM, Qwen, and Xiaomi MiMo routes.

| 2026-06-13 | `mistral/devstral-2512` | Mistral direct | Pi | Build scoping analysis on pre-existing vite errors (T2, 300s budget) | Failed at T+300s timeout — produced 821KB of stdout bash exploration but no report file. Canceled. | Read/bash worked confidently; live tool calls visible in stream; never reached report-write phase | Strong bash-driven investigation; reasonable content in 821KB log | Default T2 budget too short for read-heavy scoping; worker spent 90% on context-gathering; finalization is the bottleneck | Read-only diagnosis when 600s+ budget is available; pair with followup for write recovery | Limited |
| 2026-06-13 | `modelscope/deepseek-ai/DeepSeek-V4-Flash` | ModelScope | Pi | Svelte-shell regression test author for `?anchor=<id>` bare URL (T3, 450s budget) | Failed at T+450s, killed mid-`write` call mid-spec | Stream exceeded 2MB; worker producing heavy thinking rails; correct understanding of `__APP_STATE__` shape but no file written | Solid code-comprehension; correctly read app-init.ts and derived the test plan | Excessive before-write thinking burns time; classic SUBAGENT-IMPROVEMENTS.md infrastructure-trap — worker was emulating bridge.ts at line ~80 when killed | Same recommendation: split infra-vs-write, allocate 600s+ | Limited |
| 2026-06-13 | `openrouter/owl-alpha` | OpenRouter | Pi | Regression doc peer review (T1, 180s budget) | First attempt failed at T+180s; **followup pattern succeeded** — second 120s session wrote 8244-byte review to disk | live_steer=true followup used the existing session_id and short-circuited re-reading; output produced three factual improvements matching the diagnostic critique | Concise final report; honest about limits; correct diagnosis of stale status header | Default T1 budget wrong for any doc-review on an 18KB doc — model needs ~220s minimum even when content is in working memory | Always use followup-with-session_id pattern; first attempt reads are wasted, second attempt writes succeed | Promising |


| 2026-06-13 | `nvidia/moonshotai/kimi-k2.6` | NVIDIA | Pi | Three-engine recursion bisect (T2, 300s budget) | **Followup pattern recovered the worker.** First attempt: timeout 300s, ~2MB stdout, no report file, but produced concrete signal (the JS shim re-exporting the src/ facade hints at a circular import). Second attempt with same `session_id` + tight write prompt: completed in ~120s, wrote 1631-byte bisect report. | Read/bash worked confidently; inspection of the legacy import chain found the cycle candidate; live steer (via followup=true) worked | Top-tier code archaeology on first attempt; produced actionable signal even though it died before the report write; the followup pattern recovered it cleanly | First 300s read budget needs kimi to spend most of it on context; the followup's prior context made the write phase cheap | Read-only diagnosis where the worker is expected to surface novel hypotheses — use the followup pattern aggressively. | Strong |
| 2026-06-13 | `modelscope/deepseek-ai/DeepSeek-V4-Pro` | ModelScope | Pi | BOTH-pattern triple-shim audit verification (T2, 240s) | **Succeeded with PARTIAL verdict correction** in ~3:34. Wrote 4093-byte report identifying that the cycle as documented in the engine-recursion handoff does not close at the source level because the facade uses `.ts` extensions in dynamic imports and the `.ts` legacy files do not back-import the facade. | Methodical, precise analysis; produced actionable correction to the engine handoff doc | Detail-first; does not take shortcuts even when asked | 240s sufficient for ~6 file reads + report write | Use as the first-choice free ModelScope route for code-archeology tasks | Strong |
| 2026-06-13 | `nvidia/nemotron-3-super-120b-a12b` | NVIDIA NIM (paid) | Pi | BOTH-pattern triple-shim audit verification (T2, 240s + 90s followup) | First attempt timed out at 240s with visible thinking but no write action. Followup at 90s timed out because the model kept re-reading instead of writing. Hand-completed Lane A from convergent Lane B evidence + visible thinking rails. | Strong code-archaeology but terminal-blocked on write actions within tight followup budgets | Thoroughness on display, almost too thorough — keeps verifying lines instead of writing even when context is full | Both attempt budgets were below the model's natural write threshold (600s+ needed) | Do NOT use for tight write deadlines; for read-only archaeology, allow 600s+ budget OR explicitly say "skip more reading, write now" in followup | Limited |
| 2026-06-13 | `openrouter/qwen/qwen3-coder:free` | OpenRouter (free) | Pi | Same verification task (parallel followup attempt) | **429 at transport layer:** `qwen/qwen3-coder:free is temporarily rate-limited upstream.` No model inference observed; no tool calls; rejected before prompt resolution. | None — transport blocked before prompt | n/a | Hit OpenRouter free-tier quota gate immediately on launch — independent of input prompt length | Do not retry in the same session unless user has personal OpenRouter credits; consider `kilo/openrouter/owl-alpha` or `modelscope/deepseek-ai/DeepSeek-V4-Pro` as code-catalog alternatives | Limited |
| 2026-06-13 | `mistral/codestral-2508` | Mistral | Pi | BOTH-pattern triple-shim audit verification v3 (T2, 240s) | Succeeded in 44s with CONFIRMED verdict. **Fastest execution in the wave batch** — read all 4 files in one tight pass, wrote 1874-byte report with structural snippet. Cache-hit efficient (38848 tokens cached). Cited line numbers off by 10 (lines 84-86 / 92-93 vs. actual 74-76 / 78-79); off-by-10 drift is consistent across all three workers in this wave (likely MCP harness read-offset reporting issue rather than three independent worker errors). | Direct, fast; no apparent re-reading; produced substantive verdict without prompt-fluff | Cache efficiency visible in token usage; minimal idle thinking | 240s ≫ 44s actual success, even with composed report | Use as first-choice mistral route for tight-deadline verification tasks; expect citations to need ±10 line correction | Strong |
| 2026-06-13 | `nvidia/openai/gpt-oss-120b` | NVIDIA NIM | Pi | Same verification task (T2, 240s) | Succeeded in 70s with CONFIRMED verdict. Wrote 2204-byte report. Same off-by-10 line citation drift as Lane B/codestral. Wall clock reasonable. Cost $0. | Clean execution; substantive verdict; acknowledged source-only inspection in Notes | Reliable writer | 240s ≫ 70s actual success | First-choice alternative when `mistral/codestral-2508` is throttled; same generalist tier | Strong |
| 2026-06-13 | `nvidia/meta/llama-3.3-70b-instruct` | NVIDIA NIM | Pi | Same verification task (T2, 240s) | **Worker emitted `LANE_A_COMPLETE` and stopped without calling the write tool.** Deliverable content appeared ONLY in chat text. `tmp/.../lan̂A*/report.md` does not exist on disk. Main lane hand-built report from observed chat text + corrected citations. Off-by-10 line numbers PLUS a fabricated `import type` snippet that does not exist at the cited lines. Wall clock ~80s, but no write was attempted. | Substance correct on the verdict; execution unreliable on the write step | Confident text output even when the underlying work is incomplete or wrong — high risk in unattended pipelines | 240s wall clock, but task did not actually complete | Do NOT use for any deliverable where disk-side confirmation matters; substantively the model knows the codebase but cannot be trusted to write | Limited |
| 2026-06-13 | Wave-routes-fresh-c (3 lanes total) | mixed | Pi | BOTH-pattern audit verification v3 across nvidia/mistral/openai-spec | 1 of 3 lanes emitted the deliverable as chat text only (no disk write). 2 of 3 succeeded with correct verdicts. **Off-by-10 line citation** is a *consistent cross-model finding* — three independent workers cited lines 84-86 when the actual content is at 74-76. This is likely a tool-read offset reporting bug in the MCP harness, not a worker error. | see per-row entries | see per-row entries | See per-row entries | Apply 10-line citation correction when reviewing any subagent report from this MCP harness; verify cited code snippets against actual file contents before integrating findings | n/a |

All three routes produce very large stdout. The followup pattern (`external_subagent_followup` with `session_id`) is the canonical recovery path when a fresh worker burns its budget on context-gathering and dies at the write-call boundary.

**2026-06-13 inventory wave (semantic-explorer 97-file repo inventory, 4 lanes + 2 followups, dispatched across different model families as a meta-experiment):**

| 2026-06-13 | `openrouter/qwen/qwen3-next-80b-a3b-instruct:free` | OpenRouter (free) | Pi | Inventory pass Lane A — active src/ WIP (22 items) | **Failed at launch** — openrouter 429 "temporarily rate-limited upstream"; 0 tokens produced, 0 inference calls | Pi RPC + transport worked; no model text/tool calls; `rate_limited: true` in stream summary | n/a | Free-tier burst rate limit on a single worker (not multi-worker); failed at first model call before any inference. New finding: 429 is not just a parallel-load issue, it can hit a single fresh launch | Do not use as a default openrouter pick; only safe in low-traffic single-shot context. Consider `openai/gpt-oss-120b:free` (Lane A followup) as a sibling replacement | Limited |
| 2026-06-13 | `openrouter/nousresearch/hermes-3-llama-3.1-405b:free` | OpenRouter (free) | Pi | Inventory pass Lane B — legacy BOTH pattern (50 items) | **Failed at launch** — "404 No endpoints found that support tool use. Try disabling 'read'"; 0 tokens produced | Pi RPC + transport worked; no model text; openrouter returned 404 because free Hermes 405B endpoints do not expose tool use | n/a | Free-tier endpoints do not expose tool use; Pi workers that need file reading cannot start. New finding — Hermes 405B is on the openrouter free catalog but is effectively unusable for any tool-using worker | Unusable for any Pi worker that needs read/grep/glob/bash; might still work for direct chat API without tools. Lane B followup is `meta-llama/llama-3.3-70b-instruct:free` | Limited |
| 2026-06-13 | `openrouter/poolside/laguna-m.1:free` | OpenRouter (free) | Pi | Inventory pass Lane C — tests + tooling (19 items) | **In flight at time of catalog update** — at 83708 input / 44 output, actively reading test files (tokenizeSearchText, expandSearchIntent, countTokenMatches); 2MB+ stdout | Read worked; bash being used; `rate_limited: false`; thinking_preview: "Let me continue reading the remaining files..." | Stable reading; low output-per-input ratio (good for absorbing dense code) | Heavy stdout (2MB+); not yet verified for write/tool completion | Inventory/recon on dense code files; needs write-bench before being a default followup choice | Promising (in flight, session `7d8b70c7-8ee2-4598-b628-188aa9615e00`) |
| 2026-06-13 | `openrouter/openai/gpt-oss-120b:free` | OpenRouter (free) | Pi | Inventory pass Lane A followup — recovery from qwen3-80b 429 (same `session_id` 907bad9d-d2b7-41a4-9f5e-9b58f01a7195, fresh model) | **In flight at time of catalog update** — launched at 16:56:11 UTC, route `pi:direct-openrouter/openai/gpt-oss-120b:free` | Read/bash not yet observed; transport started cleanly | n/a yet | n/a yet | n/a yet | Promising (in flight, session `907bad9d-d2b7-41a4-9f5e-9b58f01a7195`) |
| 2026-06-13 | `openrouter/meta-llama/llama-3.3-70b-instruct:free` | OpenRouter (free) | Pi | Inventory pass Lane B followup — recovery from hermes-405b no-tool-use (same `session_id` 86a7808b-da5f-4f90-9192-6b9e1079b876, fresh model) | **In flight at time of catalog update** — launched at 16:56:11 UTC, route `pi:direct-openrouter/meta-llama/llama-3.3-70b-instruct:free` | Read/bash not yet observed; transport started cleanly | n/a yet | n/a yet | n/a yet | Promising (in flight, session `86a7808b-da5f-4f90-9192-6b9e1079b876`) |
| 2026-06-13 | `opencode-go/mimo-v2.5` | OpenCode Go paid | Pi | Inventory pass Lane D — docs + memory + dist + loose ends (15 items) | **In flight at time of catalog update** — at 1150 input / 531 output, ran `ls` on `dist/svelte/assets/`, saw all the tiny chunk files; `last_tool_name: bash`; `rate_limited: false` | Bash worked; hit PowerShell-vs-bash confusion (catalog-documented issue) but recovered; cost ~$0.0005 | Reliable, paid; no rate-limit | Same as prior 2026-06-13 entries: huge stdout, needs review | Inventory with known-good model; good baseline anchor for meta-experiments | Strong (3 prior Strong + 1 prior Promising; this wave's run consistent so far) |

## 2026-06-13 -- Post-router-recovery snapshot

While the inventory wave was in flight, the 127.0.0.1:8788 key router (operator-owned external process) was down. While down, the `external_subagent_free_models` catalog probe reported `ok: false` ("Unable to connect") for 6 of 7 providers — only `openrouter` was reachable. After restart via `~/.config/opencode/routers/start-opencode-key-router.ps1` (PID 20064, all 5 key pools reloaded), the catalog went from "1 live, 6 dark" to "6 live, 1 expected-dark":

| Provider | Before (router down) | After (router up) | Best pick per live catalog | Catalog evidence |
|---|---|---|---|---|
| `opencode-zen` | unreachable | 7 accessible (catalog 48) | `big-pickle` | **None** — automated recommendation, zero observed runs in this catalog |
| `nvidia` | unreachable | 121 accessible (full catalog) | `nemotron-3-super-120b-a12b` | 1 prior Strong + 1 prior Limited run |
| `mistral` | unreachable | 58 accessible (full catalog) | `codestral-2508` | 1 prior Strong + 1 prior Stale (recovered) run |
| `openrouter` | 24 (live) | 24 (live, same) | `owl-alpha` | 1 prior Promising + 1 prior Stale (recovered) run |
| `kilo` | unreachable | 11 accessible | `nvidia/nemotron-3-ultra-550b-a55b:free` | 1 prior Limited + 1 prior Promising (kilo/nex-n2-pro) run |
| `modelscope` | unreachable | 60 accessible (full catalog) | `deepseek-ai/DeepSeek-V4-Flash` | 2 prior Promising + 1 prior Limited + 1 prior Strong runs |
| `zenmux` | unreachable | 503 (no keys configured) | n/a | intentional empty config, not a fault |

**Caveat on `best_free_coding: opencode-zen/big-pickle`:** The live catalog's automated `best_free_coding` recommendation is **not a tested/Strong pick** — this catalog has **zero observations** of `big-pickle`. The other "best" picks (nvidia, mistral, openrouter, modelscope) have prior catalog evidence; `big-pickle` does not. Do **not** claim it as a preferred first pick until at least one successful run with positive verification. The 2026-06-13 inventory wave did not dispatch to `big-pickle` because of this. User explicitly flagged this on 2026-06-13: "big pickle is not preferred, we don't have enough data to claim that."

**Failure modes captured this wave (in the Tested Routes table above):**
- `openrouter/qwen/qwen3-next-80b-a3b-instruct:free` — openrouter free-tier 429 on first model call, even for a single worker (new finding: 429 is not just a parallel-load issue)
- `openrouter/nousresearch/hermes-3-llama-3.1-405b:free` — free endpoints do not expose tool use; Pi workers that need file reading cannot start

**Recovery pattern (validated this wave):** When a fresh worker dies at the first model call (rate limit or capability gap), the canonical recovery is `external_subagent_followup` with the same `session_id` (preserves lineage) and a new `model` (different family / capability). The followup's same-session_id inheritance avoids re-reading the prompt. The catalog-doc note about "use the followup pattern... to recover" also applies for write-boundary timeouts. **The key router being down is independent of worker success** — in-flight `direct-` workers (Lanes A and B followups, Lane C, Lane D) continued working through the outage because they bypass the gateway.

**Architecture note (in-process vs external 8788):** The `opencode-zen-key-rotation.ts` source in `C:\Users\HP\repos\opencode\packages\opencode\src\session\` is the **in-process complement** to the external 8788 gateway; it owns per-provider key pools, load-sharing, and failover. The module's docstring is explicit: "The 127.0.0.1:8788 gateway that aggregates keys ... is a separate process owned by the operator. This module is the in-process complement." The .ts module does NOT call `.listen(` (verified by content search) — it's library code, not a server. If a future session shows `ok: false` for nvidia/mistral/modelscope/kilo in the catalog probe, the external gateway is likely down; running `start-opencode-key-router.ps1` brings it back. The script is idempotent (checks for existing instance via `Get-CimInstance`).

**2026-06-13 both-pattern investigation wave (8 dispatches across 2 rounds, 3 different model families, both-pattern hot-path/stub/dead-shim audit):**

| 2026-06-13 | `openrouter/owl-alpha` | OpenRouter | Pi | Both-pattern round 1 Lane 1 — hot-path classification of `@legacy/*` import sites | Completed with gold-quality 21KB report; HOT/WARM/COLD classification of all import sites | Read/edit/bash worked; produced structured classification with per-file import counts | Strong static analysis; good file-level granularity; correctly identified `three-engine.ts` render loop as highest-value target | 9 of 18 "HOT" imports were actually COLD (caught by mimo triangulation); missed 4 source files; fabricated one import reference (line 37 of `engine/demo-choreography.ts` was a JSDoc comment) | Stable free default for code pattern searches and static analysis; use alongside a paid triangulation pass for classification accuracy | Strong |
| 2026-06-13 | `openrouter/qwen/qwen3-coder:free` | OpenRouter (free) | Pi | Both-pattern round 1 Lane 2 — two-source shim deep-dive | **Failed: 429 rate-limited** upstream; 13KB stdout, no report file | None — transport blocked before prompt resolution | n/a | Hit OpenRouter free-tier quota gate on first model call; independent of input length | Do not use for now; prefer `openrouter/owl-alpha` or `modelscope/deepseek-ai/DeepSeek-V4-Flash` for code work | Stale route |
| 2026-06-13 | `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter (free) | Pi | Both-pattern round 1 Lane 3 — full inventory of `@legacy/*` usage | **Failed: stopped with 0 tokens** (stopReason: 'stop', no output); 1.9MB stdout but no assistant text or tool calls | Transport launched; no model inference observed | None confirmed | Silent failure mode — model stopped immediately despite being the largest free option (550B). New finding: size does not correlate with reliability. Removed from free subagent default | Do not use for subagent dispatches; unreliable despite parameter count | Broken |
| 2026-06-13 | `openrouter/meta-llama/llama-3.3-70b-instruct:free` | OpenRouter (free) | Pi | Both-pattern round 1 Lane 4 — stub-mis-wire detection | **Failed: 429 rate-limited** upstream; 14KB stdout, no report file | None — transport blocked before prompt resolution | n/a | Hit OpenRouter free-tier quota gate on first model call; same gateway as qwen3-coder (both on openrouter free tier) | Do not use on this gateway under load; consider `nvidia/meta/llama-3.3-70b-instruct` (paid NVIDIA NIM) for same model family | Stale route |
| 2026-06-13 | `opencode-go/mimo-v2.5` | OpenCode Go paid | Pi | Both-pattern round 2 Lane 1-rerun — corrected hot-path classification (triangulation against owl-alpha) | Completed with gold-quality 30KB report; corrected 9 HOT→COLD misclassifications, found 4 missed files, caught fabrication in owl-alpha's first report | Read/edit/bash worked; deep call-context inspection of `requestAnimationFrame` loop; ast-grep tracing across 132 import sites | Gold standard for code archaeology; catches errors in other models' reports; correct HOT/WARM/COLD classification with line-level justification | Huge logs (30KB); needs main-lane review for synthesis | Use for synthesis, triangulation, porting, and any task requiring deep code comprehension. **User's preferred paid model.** | Strong |
| 2026-06-13 | `nvidia/nemotron-3-super-120b-a12b` | NVIDIA NIM (paid) | Pi | Both-pattern round 2 Lane 2 — two-source shim consumer trace | **Failed: produced 1077 tokens of work but stopped without writing report file** | Read/bash worked; visible thinking rails in stream; correct understanding of task scope | Strong code comprehension; produced substantial analysis text | Silent write failure — model completed analysis but never called write tool; no file on disk. New finding: this failure mode is independent of budget (240s was sufficient for analysis, not for write) | Use for read-only investigations where the main lane can extract findings from stdout; do NOT use for unattended deliverables requiring disk writes | Limited |
| 2026-06-13 | `mistral/codestral-2508` | Mistral direct | Pi | Both-pattern round 2 Lane 3 — consumer inventory per-subsystem rollup | **Failed: barely started** (37 tokens produced); no report file | None — barely initiated before stopping | n/a | Extremely low output; model did not meaningfully begin the task. Previous run (verification task, 2026-06-13) was Strong — this failure appears task-dependent, not systemic | Do not use for now; retest with smaller smoke before trusting for production work | Broken |
| 2026-06-13 | `modelscope/deepseek-ai/DeepSeek-V4-Flash` | ModelScope | Pi | Both-pattern round 2 Lane 4 — comprehensive stub inventory and dead-shim detection | Completed with gold-quality 18.8KB report; full stub inventory (30 functions across 5 files), dead-shim inventory (8 confirmed dead), mis-wire root cause analysis, PR recommendation | Read/edit/bash worked; hybrid method (rg + ctx_execute JS sandbox + manual source inspection) | Comprehensive analysis; produced actionable PR recommendation; correctly identified the BOTH-pattern root cause (shims point at stub src/ versions instead of legacy real impls); different architecture from mimo/Qwen/Nemotron | Not yet proven for implementation work in this repo; read-only analysis only so far | **Fully viable alternative** for diversity when 4+ parallel dispatches are needed; different family than mimo/owl-alpha | Strong |

**2026-06-13 catalog buildout wave (5 dispatches, all NEW-to-catalog models except devstral; filling sparse data on previously-untested picks):**

| 2026-06-13 | `opencode-zen/big-pickle` | OpenCode Zen | Pi | Sprint plan synthesis from 3 follow-up docs (35K chars) + 1 synthesis (18KB) | Completed with 300-line structured sprint-plan at `tmp/subagent-catalog-buildout-2026-06-13/sprint-plan.md`. Sequenced 6 of 7 follow-up tickets (T7 optional) into critical path T1+2 (1.5d) → T3 (3d) → T5 (1d) → T6 (0.5d) with T4 parallel to T3. | Read/write worked; no ast-grep needed (planning-only); no steer required, completed in one pass | Excellent context retention across 4 documents; accurate recall of specific numbers (41 call sites, 10 HOT, 9 COLD, 18 dead stubs, 3 user-facing bugs); verbose structured output with tables, dependency chains, risk matrices | Tends toward verbose output (upper bound of length spec); not evaluated for code-generation or ast-grep proficiency (planning-only deliverable) | **First observation of catalog's `best_free_coding` recommendation** — fills 0-obs gap on the opencode-zen gateway. Strong fit for planning/synthesis, sprint plans, architecture reviews, multi-document analysis | Strong |
| 2026-06-13 | `nvidia/openai/gpt-oss-20b` | NVIDIA NIM | Pi | `@legacy/state` retirement audit (132 import sites across 14-16 files) | Completed with 8197-byte audit at `tmp/subagent-catalog-buildout-2026-06-13/state-retirement-audit.md`. Consumer inventory, Svelte store mapping, risk matrix, migration order, effort estimate, perf note. | Read/write worked; time short, output slightly terser than lane C big-pickle but still substantive | Coherent inventory; produced all hot-loop classifications; structured delivery | Flattened some dependency trees (e.g., conflated `state.navState` vs `state.theme` namespaces); omitted selector-repurposing nuances that required manual cross-check against `lane-1-rerun-mimo.md` | **First observation** of gpt-oss-20b (smaller sibling of gpt-oss-120b). Useful for high-level roadmap; manual verification required for selector decisions. Not ready as primary synthesis engine | Limited |
| 2026-06-13 | `mistral/devstral-2512` | Mistral direct | Pi | Regression test author for dismiss-in-COMPLETE bug (commit `6becd18`) | Completed with `tests/dismiss-in-complete-state-contract.mjs`. 10/10 tests pass with fix; 8/10 fail without fix (regression-confirmed). Test covers `isDemoActive` excluding COMPLETE, dismiss-button unmount, edge cases for CANCELLED state. | Read/write worked; correctly chose Node.js contract test over Playwright; no steer needed | Correctly identified test framework pattern from existing contract tests; understood both parts of the fix (template `isDemoActive` subscription + `cancelDemo` guard); comprehensive edge cases; proper regression notes; good balance between testing and documenting | None significant | **2nd observation** of devstral-2512 (was Limited on first try with 300s timeout on bash scoping; this 2nd run is Strong on focused test-writing). Use for focused regression test writing where understanding codebase patterns matters | Strong |
| 2026-06-13 | `mistral/codestral-latest` | Mistral direct | Pi | 19-import refactor plan for `src/lib/engine/three-engine.ts:238-256` (Part D of fix-wave PR) | Completed with 6685-byte plan at `tmp/subagent-catalog-buildout-2026-06-13/three-engine-238-256-plan.md`. Per-import decision matrix (A/B/C retirement strategy), migration order, risk callouts, test plan. | Read/write worked; sharp focused output | Sharp prioritized list; correctly classified HOT vs COLD by tracing inside `animate()`; identified circular-import risk accurately; no over-recommending or under-recommending | None significant; tight focused plan with no fluff | **First observation** of codestral-latest (different from `mistral/codestral-2508` which is Strong in catalog). Strong fit for tight-deadline refactor planning on 10-20 import sites in a single file | Strong |
| 2026-06-13 | `nvidia/nemotron-3-super-120b-a12b` | NVIDIA NIM (paid) | Pi | Coverage audit of `docs/subagent-model-catalog.md` (the catalog meta-task itself) | **STALE — PID dead, no file written. 4TH confirmation of no-write-file pattern.** | Read/bash worked; visible thinking rails listing all 230+ model refs in the live catalog | n/a (no deliverable) | n/a (no deliverable) | Same failure mode as the 3 prior nemotron-3-super runs in the both-pattern and inventory waves. **Pattern now confirmed systematic**: model completes analysis in thinking rails (19785 output tokens) but never calls the write tool before timing out or being killed. The text content IS in the stream — extractable from stdout — but the disk-side confirmation is missing. **For any deliverable that requires a file on disk, do NOT use nemotron-3-super-120b-a12b unattended.** | Broken (systematic no-write pattern) |

The 4th nemotron-3-super-120b no-write observation is now a confirmed systematic failure mode, not a one-off. The model is producing substantial analysis (19785 output tokens in this run, more than the 1077 of the both-pattern round 2 lane 2) but the write tool is never called. For unattended deliverables requiring disk writes, this model is unreliable. **Status on the nvidia lane and the openrouter:free variant is now upgraded from "Limited" to "Broken"** for the deliverable-write use case specifically; the model remains useful for read-only archaeology where the main lane can hand-extract findings from stdout.

**2026-06-13 catalog buildout wave 2 (4 dispatches, all NEW-to-catalog picks, filling sparse data on 4 different model families):**

| 2026-06-13 | `nvidia/qwen/qwen3.5-397b-a17b` | NVIDIA NIM | Pi | T3-specific execution risk analysis for 19-import retirement | **STALE — 2 attempts, both hit output token cap before file write.** Analysis is in stdout (notes on camera-choreography, duplicate `@legacy/state.js` in demo-choreography.ts, sequencing priorities) but no file. The followup pattern did not recover it. | ast_grep_search, bash, write all available | Substantial analysis (59K input tokens absorbed) | **Output token cap truncates the response before the write call**, even on a tight followup. Different from nemotron-3-super-120b's hesitation pattern — this one runs out of output budget. Recovery via followup didn't help because the cap is per-response, not per-session | Use for read-only analysis where stdout extraction is acceptable; NOT for unattended deliverable-write tasks. Distinct failure mode from nemotron (length vs. hesitation) | Broken (length-cap no-write) |
| 2026-06-13 | `modelscope/zai-org/GLM-5` | ModelScope | Pi | Dead-shim re-cross-check audit (verify 8 deleted shims + scan for new dead) | Completed with 9688-byte report. All 8 lane-4 dead shims confirmed gone; 2 real discrepancies surfaced. | ast_grep + bash + write worked; effective use of structural search | **Real findings** — (1) README claims `camera-framing-utils.ts` and `camera-math-utils.ts` exist in `src/lib/utils/` but they don't (never did or were deleted-by-merge); (2) lane 4's Part C "18 stub deletions" was overstated — `traverseNeighbor` (10 LIVE callers in `js/modules/`) and `previewInsideNextThread` (2 LIVE callers) are NOT dead; only `walkInsideToNextStop` is truly dead | ast-grep searches scoped to `src/` only, missed legacy callers in `js/modules/`. Did not trace relative imports like `./thread-model`. Result: declared 2 LIVE functions as candidates for deletion | **First observation** of GLM-5. Adequate for verification but requires full-codebase scope (src/ + js/modules/). For followup: the lane 4 miscount is a real BOTH-pattern issue — needs a Part C fix wave to actually delete `walkInsideToNextStop` and keep the other two. Add a follow-up ticket. | Limited (3/5) |
| 2026-06-13 | `mistral/mistral-large-2512` | Mistral direct | Pi | Refactor roadmap for 30 stub functions across 5 files (synthesize hot/warm/cold into phased plan) | Completed with 11914-byte report. 3-phase plan over 4-5 days: Phase 1 (delete 18 dead + 8 internal), Phase 2 (port 2 WARM), Phase 3 (port 2 HOT with full QA). Highest-risk stubs: `syncFocusStage` (15 callers), `updateTraversalUi` (4 callers render-loop), `clearThreadInspection` (14 callers). | Read/write worked; structured synthesis output | Accurate retirement strategy classification; correct highest-risk identification; clear phases with verification steps | Initially over-recommended bridge modules for functions that could be ported natively; under-recommended deletion for zero-consumer functions; conflated WARM priorities (recommended re-export shims where none were needed) | **First observation** of Mistral flagship 2512. Strong for synthesis tasks (roadmaps, design docs, audit reports). Less suited for fine-grained code analysis without explicit legacy-dependency guidance. Corrected after review, suggesting it benefits from a "review the legacy deps first" steer | Strong (4/5) |
| 2026-06-13 | `openrouter/openai/gpt-oss-120b:free` | OpenRouter free | Pi | Search-rerank Go/No-Go decision document | **STOPPED at tool-check step** — worker strictly interpreted "Read, Grep, Glob, Bash, Write" as required tool names; harness exposes only Read/Bash/Write/Edit; worker refused to fall back to bash for grep/glob. No deliverable produced. | None — worker stopped before any tool work | Strict interpretation of the prompt's tool surface; correctly identified the gap | Did not degrade gracefully to bash-based grep/glob the way every other model in this campaign did. Stopped at the tool check instead of proceeding. This is a "literal interpreter" model behavior | **First observation** of gpt-oss-120b:free (different from the paid `nvidia/openai/gpt-oss-120b` which is Strong). Useful when you want a worker to REFUSE rather than improvise. Problematic when the harness surface changes mid-campaign. **Prompt fix needed for future dispatches:** explicitly say "use bash for grep/glob; do NOT stop on missing dedicated Grep/Glob tools" | Limited (strict interpreter) |

**Wave 2 summary:** 2 of 4 dispatches delivered usable files (GLM-5, mistral-large-2512). 1 of 4 hit a length-cap pattern (qwen3.5-397b — confirmed systematic, distinct from nemotron's hesitation). 1 of 4 stopped at tool-check (gpt-oss-120b:free — strict interpreter, not a fail, just a behavior note). **3 new-to-catalog models** (qwen3.5-397b broken for this workload, GLM-5 limited, mistral-large-2512 strong, gpt-oss-120b:free limited). 1 real BOTH-pattern finding surfaced (lane 4's stub-deletion count overstated; needs follow-up fix wave).

## Cross-Gateway 429 Patterns

Observed on 2026-06-12:

When 2+ workers run in parallel on the same gateway, expect 429s on the free tier within minutes. This was observed with both `opencode-zen/mimo-v2.5-free` and `opencode-zen/deepseek-v4-flash-free`.

Mitigation: pick different gateways per worker (e.g., kilo, opencode-zen, nvidia). When a paid option is available for the task, default to paid for reliability under load.

## All Available Subagent Choices (Live Catalog 2026-06-13)

Quick-glance view of every launch ref in the live `external_subagent_free_models` catalog. For full per-run details (workload, tool behavior, strengths/weaknesses), see the **Tested Routes** table above.

**Status legend:**
- ✅ **Strong** — useful for real repo work with normal verification
- 🟡 **Promising** — can contribute, but needs steering or smaller prompts
- 🟠 **Limited** — useful only for narrow report-only probes or tiny edits
- ❌ **Broken** — launches but fails to produce usable work
- 🚫 **Stale** — catalog entry exists but provider/router rejected it
- 🛑 **429** — rate-limited; do not retry without cooldown
- ⏱️ **Timeout** — silent timeout, no useful output
- ⏳ **In flight** — currently testing in this campaign
- ⚪ **Untested** — no observations yet; safe candidate for a new test
- 🔧 **Specialized** — embedding/moderation/OCR/ASR/image, not general chat

**Tallies (2026-06-13):**
- Total launch refs: **283**
- Tested (✅/🟡/🟠): **35**
- In flight (⏳): **5**
- Untested (⚪): **220**
- Broken / Stale / 429 / Timeout: **14**
- Specialized (🔧): **9** (most are NVIDIA NIM non-chat lanes; some Mistral audio/embed and Qwen vision)

### Paid (opencode-go) — 2 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `opencode-go/mimo-v2.5` | ❌ | ✅ Strong (5+ runs) | Default paid baseline; synthesis + triangulation + porting. User's preferred paid model. |
| `opencode-go/deepseek-v4-flash` | ❌ | ⚪ Untested | Catalog lists as paid alternative; 0 observations yet |

### opencode-zen — 7 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `opencode-zen/big-pickle` | yes | ✅ Strong (1 prior) | **NEW 2026-06-13**: Long-context planning/synthesis. Excellent 35K-char retention, structured output, no steering needed. Tends verbose; untested on code-gen |
| `opencode-zen/deepseek-v4-flash-free` | yes | 🛑 429 | 429s under load (per current routing state) |
| `opencode-zen/mimo-v2.5-free` | yes | 🛑 429 | 429s under load; do not use |
| `opencode-zen/minimax-m3-free` | yes | ⚪ Untested | 0 obs; MiniMax-M3 family untested |
| `opencode-zen/nemotron-3-ultra-free` | yes | ⚪ Untested | 0 obs on this gateway; note kilo variant is Broken |
| `opencode-zen/north-mini-code-free` | yes | 🟠 Limited | Too command-happy for fragile prompts |
| `opencode-zen/qwen3.6-plus-free` | yes | 🚫 Stale | Free promotion ended; provider 401 |

### nvidia — 121 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `nvidia/01-ai/yi-large` | yes | ⚪ Untested | 0 obs |
| `nvidia/abacusai/dracarys-llama-3.1-70b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/adept/fuyu-8b` | yes | ⚪ Untested | 0 obs (small vision model) |
| `nvidia/ai-synthetic-video-detector` | yes | 🔧 Specialized | video detection, not chat |
| `nvidia/ai21labs/jamba-1.5-large-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/aisingapore/sea-lion-7b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/baai/bge-m3` | yes | 🔧 Specialized | embedding model |
| `nvidia/bigcode/starcoder2-15b` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/bytedance/seed-oss-36b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/cosmos-reason2-8b` | yes | ⚪ Untested | 0 obs; reasoning-specialized |
| `nvidia/databricks/dbrx-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/deepseek-ai/deepseek-coder-6.7b-instruct` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/deepseek-ai/deepseek-v4-flash` | yes | 🟡 Promising (1 prior) | Cheap focused repo probe; slow first output, accurate diagnosis |
| `nvidia/deepseek-ai/deepseek-v4-pro` | yes | ⚪ Untested | 0 obs (different from `modelscope/deepseek-ai/DeepSeek-V4-Pro` which is Strong) |
| `nvidia/embed-qa-4` | yes | 🔧 Specialized | embedding |
| `nvidia/gliner-pii` | yes | 🔧 Specialized | PII detection |
| `nvidia/google/codegemma-1.1-7b` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/google/codegemma-7b` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/google/deplot` | yes | 🔧 Specialized | image-to-text |
| `nvidia/google/diffusiongemma-26b-a4b-it` | yes | ❌ Broken | silent timeout, 180s, no output |
| `nvidia/google/gemma-2-2b-it` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/gemma-2b` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/gemma-3-12b-it` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/gemma-3-4b-it` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/gemma-3n-e2b-it` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/gemma-3n-e4b-it` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/gemma-4-31b-it` | yes | ⚪ Untested | 0 obs |
| `nvidia/google/recurrentgemma-2b` | yes | ⚪ Untested | 0 obs |
| `nvidia/ibm/granite-3.0-3b-a800m-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/ibm/granite-3.0-8b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/ibm/granite-34b-code-instruct` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/ibm/granite-8b-code-instruct` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/ising-calibration-1-35b-a3b` | yes | 🔧 Specialized | calibration model |
| `nvidia/llama-3.1-nemoguard-8b-content-safety` | yes | 🔧 Specialized | content safety |
| `nvidia/llama-3.1-nemoguard-8b-topic-control` | yes | 🔧 Specialized | topic control |
| `nvidia/llama-3.1-nemotron-51b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/llama-3.1-nemotron-70b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/llama-3.1-nemotron-nano-8b-v1` | yes | ⚪ Untested | 0 obs |
| `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | yes | ⚪ Untested | 0 obs; vision-language |
| `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | yes | 🔧 Specialized | safety guard |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | yes | ⚪ Untested | 0 obs |
| `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1` | yes | 🔧 Specialized | embedding |
| `nvidia/llama-3.2-nv-embedqa-1b-v1` | yes | 🔧 Specialized | embedding QA |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | yes | ⚪ Untested | 0 obs |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | yes | ⚪ Untested | 0 obs |
| `nvidia/llama-nemotron-embed-1b-v2` | yes | 🔧 Specialized | embedding |
| `nvidia/llama-nemotron-embed-vl-1b-v2` | yes | 🔧 Specialized | vision-language embedding |
| `nvidia/llama3-chatqa-1.5-70b` | yes | ⚪ Untested | 0 obs; QA-specialized |
| `nvidia/meta/codellama-70b` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/meta/llama-3.1-70b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/meta/llama-3.1-8b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/meta/llama-3.2-11b-vision-instruct` | yes | ⚪ Untested | 0 obs; vision |
| `nvidia/meta/llama-3.2-1b-instruct` | yes | ⚪ Untested | 0 obs; small |
| `nvidia/meta/llama-3.2-3b-instruct` | yes | ⚪ Untested | 0 obs; small |
| `nvidia/meta/llama-3.2-90b-vision-instruct` | yes | ⚪ Untested | 0 obs; vision |
| `nvidia/meta/llama-3.3-70b-instruct` | yes | 🟠 Limited (3 prior) | Code comprehension solid; UNRELIABLE write step. Read-only probes only. |
| `nvidia/meta/llama-4-maverick-17b-128e-instruct` | yes | ⚪ Untested | 0 obs; lane D test blocked by ZenMux 503 (model not in allowed list) |
| `nvidia/meta/llama-guard-4-12b` | yes | 🔧 Specialized | safety guard |
| `nvidia/meta/llama2-70b` | yes | ⚪ Untested | 0 obs (legacy) |
| `nvidia/microsoft/kosmos-2` | yes | 🔧 Specialized | vision-language |
| `nvidia/microsoft/phi-3-vision-128k-instruct` | yes | ⚪ Untested | 0 obs; vision |
| `nvidia/microsoft/phi-3.5-moe-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/microsoft/phi-4-mini-instruct` | yes | ⚪ Untested | 0 obs; small |
| `nvidia/microsoft/phi-4-multimodal-instruct` | yes | ⚪ Untested | 0 obs; vision |
| `nvidia/minimaxai/minimax-m2.7` | yes | ❌ Broken | Stuck at `rpc_response:prompt`; no model output |
| `nvidia/minimaxai/minimax-m3` | yes | ⚪ Untested | 0 obs; newer MiniMax generation |
| `nvidia/mistral-nemo-minitron-8b-8k-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/mistralai/codestral-22b-instruct-v0.1` | yes | ⚪ Untested | 0 obs; code-specialized |
| `nvidia/mistralai/ministral-14b-instruct-2512` | yes | ⚪ Untested | 0 obs |
| `nvidia/mistralai/mistral-7b-instruct-v0.3` | yes | ⚪ Untested | 0 obs (legacy) |
| `nvidia/mistralai/mistral-large` | yes | ⚪ Untested | 0 obs (legacy mistral-large) |
| `nvidia/mistralai/mistral-large-2-instruct` | yes | ⚪ Untested | 0 obs (legacy) |
| `nvidia/mistralai/mistral-large-3-675b-instruct-2512` | yes | ⚪ Untested | 0 obs; flagship 675B |
| `nvidia/mistralai/mistral-medium-3.5-128b` | yes | ⚪ Untested | 0 obs |
| `nvidia/mistralai/mistral-nemotron` | yes | ⚪ Untested | 0 obs; hybrid nemotron-mistral |
| `nvidia/mistralai/mistral-small-4-119b-2603` | yes | ⚪ Untested | 0 obs |
| `nvidia/mistralai/mixtral-8x22b-v0.1` | yes | ⚪ Untested | 0 obs (legacy) |
| `nvidia/mistralai/mixtral-8x7b-instruct-v0.1` | yes | ⚪ Untested | 0 obs (legacy) |
| `nvidia/moonshotai/kimi-k2.6` | yes | ✅ Strong (2 prior) | High-value scout; good code/UI/vision reasoning. Use followup pattern. |
| `nvidia/nemoretriever-parse` | yes | 🔧 Specialized | document parsing |
| `nvidia/nemotron-3-content-safety` | yes | 🔧 Specialized | content safety |
| `nvidia/nemotron-3-nano-30b-a3b` | yes | ⚪ Untested | 0 obs |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | yes | ⚪ Untested | 0 obs; reasoning-specialized |
| `nvidia/nemotron-3-super-120b-a12b` | yes | ❌ Broken (4 prior) | **UPGRADED 2026-06-13**: 4th no-write-file confirmation. 19785 output tokens but never called write tool. Pattern is systematic. Do NOT use for unattended disk-write deliverables |
| `nvidia/nemotron-3-ultra-550b-a55b` | yes | ❌ Broken | 0 tokens on kilo variant; nvidia lane untested (likely same failure mode) |
| `nvidia/nemotron-3.5-content-safety` | yes | 🔧 Specialized | content safety |
| `nvidia/nemotron-4-340b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/nemotron-4-340b-reward` | yes | 🔧 Specialized | reward model |
| `nvidia/nemotron-content-safety-reasoning-4b` | yes | 🔧 Specialized | content safety reasoning |
| `nvidia/nemotron-mini-4b-instruct` | yes | ⚪ Untested | 0 obs; small |
| `nvidia/nemotron-nano-12b-v2-vl` | yes | ⚪ Untested | 0 obs; vision-language |
| `nvidia/nemotron-nano-3-30b-a3b` | yes | ⚪ Untested | 0 obs |
| `nvidia/nemotron-parse` | yes | 🔧 Specialized | document parsing |
| `nvidia/neva-22b` | yes | ⚪ Untested | 0 obs; vision |
| `nvidia/nv-embed-v1` | yes | 🔧 Specialized | embedding |
| `nvidia/nv-embedcode-7b-v1` | yes | 🔧 Specialized | code embedding |
| `nvidia/nv-embedqa-e5-v5` | yes | 🔧 Specialized | embedding QA |
| `nvidia/nv-embedqa-mistral-7b-v2` | yes | 🔧 Specialized | embedding QA |
| `nvidia/nv-mistralai/mistral-nemo-12b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/nvclip` | yes | 🔧 Specialized | vision-language |
| `nvidia/nvidia-nemotron-nano-9b-v2` | yes | ⚪ Untested | 0 obs; small |
| `nvidia/openai/gpt-oss-120b` | yes | ✅ Strong (1 prior) | Reliable writer; first-choice alternative when codestral-2508 throttled |
| `nvidia/openai/gpt-oss-20b` | yes | 🟠 Limited (1 prior) | **NEW 2026-06-13**: Coherent inventory on multi-file audit, but flattened dependency trees (state.navState vs state.theme). Manual cross-check required |
| `nvidia/qwen/qwen3-next-80b-a3b-instruct` | yes | ⚪ Untested | 0 obs (different from openrouter:free which 429'd) |
| `nvidia/qwen/qwen3.5-122b-a10b` | yes | ⚪ Untested | 0 obs |
| `nvidia/qwen/qwen3.5-397b-a17b` | yes | ❌ Broken (1 prior) | **NEW 2026-06-13**: Output token cap truncates response before write call (2 attempts, same failure). Different from nemotron hesitation. Use for read-only analysis with stdout extraction only |
| `nvidia/riva-translate-4b-instruct` | yes | 🔧 Specialized | translation |
| `nvidia/riva-translate-4b-instruct-v1.1` | yes | 🔧 Specialized | translation |
| `nvidia/sarvamai/sarvam-m` | yes | ⚪ Untested | 0 obs; Indian-language family |
| `nvidia/snowflake/arctic-embed-l` | yes | 🔧 Specialized | embedding |
| `nvidia/stepfun-ai/step-3.5-flash` | yes | ⚪ Untested | 0 obs |
| `nvidia/stepfun-ai/step-3.7-flash` | yes | ⚪ Untested | 0 obs (different from kilo/step-3.7-flash:free which is Promising) |
| `nvidia/stockmark/stockmark-2-100b-instruct` | yes | ⚪ Untested | 0 obs; Japanese-specialized |
| `nvidia/upstage/solar-10.7b-instruct` | yes | ⚪ Untested | 0 obs |
| `nvidia/vila` | yes | 🔧 Specialized | vision-language |
| `nvidia/writer/palmyra-creative-122b` | yes | ⚪ Untested | 0 obs; creative writing |
| `nvidia/writer/palmyra-fin-70b-32k` | yes | ⚪ Untested | 0 obs; finance |
| `nvidia/writer/palmyra-med-70b` | yes | ⚪ Untested | 0 obs; medical |
| `nvidia/writer/palmyra-med-70b-32k` | yes | ⚪ Untested | 0 obs; medical 32k |
| `nvidia/z-ai/glm-5.1` | yes | 🟡 Promising (1 prior) | Strong reading + synthesis when steered; runaway log volume needs scope discipline |
| `nvidia/zyphra/zamba2-7b-instruct` | yes | ⚪ Untested | 0 obs |

### mistral — 58 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `mistral/codestral-2508` | yes | ✅ Strong (2 prior) | First-choice Mistral route for tight-deadline verification; ±10 line citation drift expected |
| `mistral/codestral-embed` | yes | 🔧 Specialized | embedding |
| `mistral/codestral-embed-2505` | yes | 🔧 Specialized | embedding |
| `mistral/codestral-latest` | yes | ✅ Strong (1 prior) | **NEW 2026-06-13**: Tight-deadline refactor planning. Sharp prioritized list, correctly traced inside `animate()`, identified circular-import risk. No fluff |
| `mistral/devstral-2512` | yes | ✅ Strong (2 prior) | **NEW 2026-06-13**: Focused regression test writing. 10/10 pass with fix, 8/10 fail without. Chose Node.js contract over Playwright. 2nd obs upgrades prior Limited rating |
| `mistral/devstral-latest` | yes | 🟠 Limited (1 prior) | Silent timeout, 180s, no output |
| `mistral/devstral-medium-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/labs-leanstral-2603` | yes | ⚪ Untested | 0 obs |
| `mistral/magistral-medium-2509` | yes | ⚪ Untested | 0 obs |
| `mistral/magistral-medium-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/magistral-small-2509` | yes | ⚪ Untested | 0 obs |
| `mistral/magistral-small-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/ministral-14b-2512` | yes | ⚪ Untested | 0 obs |
| `mistral/ministral-14b-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/ministral-3b-2512` | yes | ⚪ Untested | 0 obs; small |
| `mistral/ministral-3b-latest` | yes | ⚪ Untested | 0 obs; small |
| `mistral/ministral-8b-2512` | yes | ⚪ Untested | 0 obs |
| `mistral/ministral-8b-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-code-agent-latest` | yes | 🟡 Promising (3 prior) | Fast, coherent code summarizer; can edit focused test seams; needs nullish-assertion check |
| `mistral/mistral-code-fim-latest` | yes | ⚪ Untested | 0 obs; fill-in-middle code |
| `mistral/mistral-code-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-embed` | yes | 🔧 Specialized | embedding |
| `mistral/mistral-embed-2312` | yes | 🔧 Specialized | embedding (legacy) |
| `mistral/mistral-large-2512` | yes | ✅ Strong (1 prior) | **NEW 2026-06-13**: Strong synthesis (4/5). 3-phase refactor roadmap for 30 stubs. Initially over-recommended bridge modules, corrected after review. Ideal for roadmaps/design docs |
| `mistral/mistral-large-latest` | yes | ⚪ Untested | 0 obs; flagship latest |
| `mistral/mistral-medium` | yes | ⚪ Untested | 0 obs (legacy) |
| `mistral/mistral-medium-2505` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-medium-2508` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-medium-2604` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-medium-3` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-medium-3-5` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-medium-3.5` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-medium-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-moderation-2411` | yes | 🔧 Specialized | moderation |
| `mistral/mistral-moderation-2603` | yes | 🔧 Specialized | moderation |
| `mistral/mistral-moderation-latest` | yes | 🔧 Specialized | moderation |
| `mistral/mistral-ocr-2512` | yes | 🔧 Specialized | OCR |
| `mistral/mistral-ocr-latest` | yes | 🔧 Specialized | OCR |
| `mistral/mistral-small-2506` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-small-2603` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-small-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-tiny-2407` | yes | ⚪ Untested | 0 obs (legacy) |
| `mistral/mistral-tiny-latest` | yes | ⚪ Untested | 0 obs (legacy) |
| `mistral/mistral-vibe-cli-fast` | yes | 🟡 Promising (1 prior) | Quick read-only reconnaissance; clean final answer; log-heavy |
| `mistral/mistral-vibe-cli-latest` | yes | ⚪ Untested | 0 obs |
| `mistral/mistral-vibe-cli-with-tools` | yes | ⚪ Untested | 0 obs |
| `mistral/open-mistral-nemo` | yes | ⚪ Untested | 0 obs |
| `mistral/open-mistral-nemo-2407` | yes | ⚪ Untested | 0 obs |
| `mistral/voxtral-mini-2507` | yes | 🔧 Specialized | audio (ASR/TTS) |
| `mistral/voxtral-mini-2602` | yes | 🔧 Specialized | audio |
| `mistral/voxtral-mini-latest` | yes | 🔧 Specialized | audio |
| `mistral/voxtral-mini-realtime-2602` | yes | 🔧 Specialized | realtime audio |
| `mistral/voxtral-mini-realtime-latest` | yes | 🔧 Specialized | realtime audio |
| `mistral/voxtral-mini-transcribe-realtime-2602` | yes | 🔧 Specialized | realtime transcription |
| `mistral/voxtral-mini-tts-2603` | yes | 🔧 Specialized | TTS |
| `mistral/voxtral-mini-tts-latest` | yes | 🔧 Specialized | TTS |
| `mistral/voxtral-small-2507` | yes | 🔧 Specialized | audio |
| `mistral/voxtral-small-latest` | yes | 🔧 Specialized | audio |

### openrouter — 24 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `openrouter/cognitivecomputations/dolphin-mistral-24b-venice-edition:free` | yes | ⚪ Untested | 0 obs; uncensored variant |
| `openrouter/free` | yes | ⚪ Untested | 0 obs; auto-routing free tier |
| `openrouter/google/gemma-4-26b-a4b-it:free` | yes | ⚪ Untested | 0 obs |
| `openrouter/google/gemma-4-31b-it:free` | yes | ⚪ Untested | 0 obs |
| `openrouter/liquid/lfm-2.5-1.2b-instruct:free` | yes | ⚪ Untested | 0 obs; small |
| `openrouter/liquid/lfm-2.5-1.2b-thinking:free` | yes | ⚪ Untested | 0 obs; thinking-specialized |
| `openrouter/meta-llama/llama-3.2-3b-instruct:free` | yes | ⚪ Untested | 0 obs; small |
| `openrouter/meta-llama/llama-3.3-70b-instruct:free` | yes | 🛑 429 | 14KB stdout, no report; rate-limited upstream |
| `openrouter/nex-agi/nex-n2-pro:free` | yes | 🟡 Promising (1 prior via kilo) | Intelligent, tool-calling heavy, brute-force recovery; poor steering compliance |
| `openrouter/nousresearch/hermes-3-llama-3.1-405b:free` | yes | 🟠 Limited (1 prior) | Free endpoints do NOT expose tool use; unusable for Pi workers that need read/grep/glob/bash |
| `openrouter/nvidia/nemotron-3-nano-30b-a3b:free` | yes | ⚪ Untested | 0 obs |
| `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | yes | ⚪ Untested | 0 obs; reasoning |
| `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | yes | ❌ Broken (4 prior) | **UPGRADED 2026-06-13**: 4th no-write-file confirmation (lane B coverage audit went stale). Same systematic failure as nvidia-lane variant |
| `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | yes | ❌ Broken | Silent failure, 0 tokens despite 550B params; removed from free default |
| `openrouter/nvidia/nemotron-3.5-content-safety:free` | yes | ⚪ Untested | 0 obs; content safety |
| `openrouter/nvidia/nemotron-nano-12b-v2-vl:free` | yes | ⚪ Untested | 0 obs; vision-language |
| `openrouter/nvidia/nemotron-nano-9b-v2:free` | yes | ⚪ Untested | 0 obs; small |
| `openrouter/openai/gpt-oss-120b:free` | yes | 🟠 Limited (1 prior) | **NEW 2026-06-13**: Strict tool-surface interpreter. Stopped at tool check rather than degrade to bash. Useful when you want refusal not improv. Update prompts to not require dedicated Grep/Glob |
| `openrouter/openai/gpt-oss-20b:free` | yes | ⚪ Untested | 0 obs; small sibling |
| `openrouter/owl-alpha` | yes | ✅ Strong (3+ prior) | Stable free default for code pattern searches; static analysis; use followup pattern |
| `openrouter/poolside/laguna-m.1:free` | yes | 🟡 Promising (1 prior) | Stable reading on dense code; needs write-bench before being a default followup |
| `openrouter/poolside/laguna-xs.2:free` | yes | ⚪ Untested | 0 obs |
| `openrouter/qwen/qwen3-coder:free` | yes | 🛑 429 | Rate-limited upstream; 13KB stdout, no report; do not retry on this gateway |
| `openrouter/qwen/qwen3-next-80b-a3b-instruct:free` | yes | 🟠 Limited (1 prior) | 429 at transport layer; failed at first model call before inference |
| `openrouter/z-ai/glm-4.5-air:free` | yes | ⚪ Untested | 0 obs (in catalog but not in current first-pick list) |

### kilo — 11 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `kilo/kilo-auto/free` | yes | ⚪ Untested | 0 obs; auto-routing free tier |
| `kilo/nex-agi/nex-n2-pro:free` | yes | 🟡 Promising (1 prior) | High-effort brute-force investigation; needs strict path limits and long timeout |
| `kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | yes | ⚪ Untested | 0 obs |
| `kilo/nvidia/nemotron-3-super-120b-a12b:free` | yes | ❌ Broken (4 prior) | **UPGRADED 2026-06-13**: Same systematic no-write-file pattern via kilo route |
| `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` | yes | ❌ Broken | Was the locked free default before both-pattern wave; silent failure, 0 tokens |
| `kilo/nvidia/nemotron-3.5-content-safety:free` | yes | ⚪ Untested | 0 obs; content safety |
| `kilo/openrouter/free` | yes | ⚪ Untested | 0 obs |
| `kilo/openrouter/owl-alpha` | yes | ✅ Strong (3+ prior) | Same model as `openrouter/owl-alpha`; Kilo-routed |
| `kilo/poolside/laguna-m.1:free` | yes | ⚪ Untested | 0 obs |
| `kilo/poolside/laguna-xs.2:free` | yes | ⚪ Untested | 0 obs |
| `kilo/stepfun/step-3.7-flash:free` | yes | 🟡 Promising (1 prior) | Lightweight read-only diagnostics; good concise synthesis; free lane caveats apply |

### modelscope — 60 launch refs

| Launch ref | Free? | Status | Last observation / best use |
|---|---|---|---|
| `modelscope/deepseek-ai/DeepSeek-V3.1` | yes | ⚪ Untested | 0 obs |
| `modelscope/deepseek-ai/DeepSeek-V3.2` | yes | ⚪ Untested | 0 obs |
| `modelscope/deepseek-ai/DeepSeek-V3.2-Exp` | yes | ⚪ Untested | 0 obs |
| `modelscope/deepseek-ai/DeepSeek-V4-Flash` | yes | 🟡 Promising (3 prior) | Best free ModelScope route for code-archeology; some tasks hit write-boundary timeouts |
| `modelscope/deepseek-ai/DeepSeek-V4-Pro` | yes | ✅ Strong (1 prior) | Methodical, precise analysis; first-choice free ModelScope route for code-archeology |
| `modelscope/iic/Tongyi-DeepResearch-30B-A3B` | yes | ⚪ Untested | 0 obs; research-specialized |
| `modelscope/Menlo/Jan-nano` | yes | 🚫 Stale | Provider `400 Invalid model id: Menlo/Jan-nano`; hide or remap |
| `modelscope/MiniMax/MiniMax-M1-80k` | yes | ⚪ Untested | 0 obs; 80k context |
| `modelscope/MiniMax/MiniMax-M2.5` | yes | ⚪ Untested | 0 obs |
| `modelscope/MiniMax/MiniMax-M2.7` | yes | 🚫 Stale | Provider `400 Model id ... has no provider supported` |
| `modelscope/MusePublic/Qwen-Image-Edit` | yes | 🔧 Specialized | image editing |
| `modelscope/nex-agi/Nex-N2-Pro` | yes | ⚪ Untested | 0 obs (different from `openrouter/nex-agi/nex-n2-pro:free` which is Promising via kilo) |
| `modelscope/opencompass/CompassJudger-1-32B-Instruct` | yes | ⚪ Untested | 0 obs; judge model |
| `modelscope/OpenGVLab/InternVL3_5-241B-A28B` | yes | 🔧 Specialized | vision-language |
| `modelscope/PaddlePaddle/ERNIE-4.5-0.3B-PT` | yes | ⚪ Untested | 0 obs; pre-trained, not instruct |
| `modelscope/PaddlePaddle/ERNIE-4.5-21B-A3B-PT` | yes | ⚪ Untested | 0 obs; pre-trained |
| `modelscope/PaddlePaddle/ERNIE-4.5-300B-A47B-PT` | yes | ⚪ Untested | 0 obs; pre-trained 300B |
| `modelscope/PaddlePaddle/ERNIE-4.5-VL-28B-A3B-PT` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen-Ambassador/Qwen3.7-Max` | yes | ⚪ Untested | 0 obs; flagship |
| `modelscope/Qwen-Ambassador/Qwen3.7-Plus` | yes | ⚪ Untested | 0 obs; flagship-plus |
| `modelscope/Qwen/QVQ-72B-Preview` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen/Qwen-Image-Edit` | yes | 🔧 Specialized | image editing |
| `modelscope/Qwen/Qwen2.5-14B-Instruct` | yes | ⚪ Untested | 0 obs |
| `modelscope/Qwen/Qwen2.5-14B-Instruct-1M` | yes | ⚪ Untested | 0 obs; 1M context |
| `modelscope/Qwen/Qwen2.5-32B-Instruct` | yes | ⚪ Untested | 0 obs |
| `modelscope/Qwen/Qwen2.5-72B-Instruct` | yes | ⚪ Untested | 0 obs |
| `modelscope/Qwen/Qwen2.5-7B-Instruct` | yes | ⚪ Untested | 0 obs; small |
| `modelscope/Qwen/Qwen2.5-7B-Instruct-1M` | yes | ⚪ Untested | 0 obs; small 1M context |
| `modelscope/Qwen/Qwen2.5-Coder-14B-Instruct` | yes | ⚪ Untested | 0 obs; code-specialized |
| `modelscope/Qwen/Qwen2.5-Coder-32B-Instruct` | yes | ⚪ Untested | 0 obs; code-specialized |
| `modelscope/Qwen/Qwen2.5-Coder-7B-Instruct` | yes | ⚪ Untested | 0 obs; small code-specialized |
| `modelscope/Qwen/Qwen2.5-VL-32B-Instruct` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen/Qwen2.5-VL-3B-Instruct` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen/Qwen2.5-VL-72B-Instruct` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen/Qwen2.5-VL-7B-Instruct` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen/Qwen3-0.6B` | yes | ⚪ Untested | 0 obs; small |
| `modelscope/Qwen/Qwen3-1.7B` | yes | ⚪ Untested | 0 obs; small |
| `modelscope/Qwen/Qwen3-14B` | yes | ⚪ Untested | 0 obs |
| `modelscope/Qwen/Qwen3-235B-A22B` | yes | ⚪ Untested | 0 obs; 235B parameter |
| `modelscope/Qwen/Qwen3-235B-A22B-Instruct-2507` | yes | ⚪ Untested | 0 obs; flagship instruct |
| `modelscope/Qwen/Qwen3-235B-A22B-Thinking-2507` | yes | ⚪ Untested | 0 obs; thinking mode |
| `modelscope/Qwen/Qwen3-30B-A3B` | yes | ⚪ Untested | 0 obs |
| `modelscope/Qwen/Qwen3-30B-A3B-Thinking-2507` | yes | ⚪ Untested | 0 obs; thinking |
| `modelscope/Qwen/Qwen3-32B` | yes | ⚪ Untested | 0 obs |
| `modelscope/Qwen/Qwen3-4B` | yes | ⚪ Untested | 0 obs; small |
| `modelscope/Qwen/Qwen3-8B` | yes | ⚪ Untested | 0 obs; small |
| `modelscope/Qwen/Qwen3-Coder-30B-A3B-Instruct` | yes | 🟡 Promising (2 prior) | Stable launch; concise final; secondary reviewer on read-only lanes |
| `modelscope/Qwen/Qwen3-Next-80B-A3B-Instruct` | yes | 🟠 Limited (1 prior) | 429'd on openrouter; same model via modelscope untested |
| `modelscope/Qwen/Qwen3-Next-80B-A3B-Thinking` | yes | ⚪ Untested | 0 obs; thinking mode |
| `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` | yes | 🔧 Specialized | vision-language |
| `modelscope/Qwen/Qwen3-VL-8B-Instruct` | yes | ❌ Broken | Silent timeout, 180s, no output |
| `modelscope/Qwen/Qwen3-VL-8B-Thinking` | yes | 🔧 Specialized | vision-language thinking |
| `modelscope/Shanghai_AI_Laboratory/Intern-S1` | yes | ⚪ Untested | 0 obs |
| `modelscope/Shanghai_AI_Laboratory/Intern-S1-mini` | yes | ⚪ Untested | 0 obs; small |
| `modelscope/stepfun-ai/Step-3.5-Flash` | yes | ⚪ Untested | 0 obs |
| `modelscope/stepfun-ai/step3` | yes | ⚪ Untested | 0 obs |
| `modelscope/XiaomiMiMo/MiMo-V2-Flash` | yes | ⚪ Untested | 0 obs |
| `modelscope/zai-org/GLM-4.7-Flash` | yes | ⚪ Untested | 0 obs; flash tier |
| `modelscope/zai-org/GLM-5` | yes | 🟠 Limited (1 prior) | **NEW 2026-06-13**: Adequate dead-shim audit (3/5) but ast-grep scoped to src/ missed legacy callers. Found README discrepancy + Part C miscount |
| `modelscope/zai-org/GLM-5.1` | yes | ⚪ Untested | 0 obs (different from `nvidia/z-ai/glm-5.1` which is Promising — different provider routing) |

### Cross-reference: 2026-06-13 catalog buildout wave (5 dispatches — all settled)

| Lane | Model | Final status (2026-06-13 18:49 UTC) | Output file | Filling which gap |
|---|---|---|---|---|
| Lane A | `opencode-go/mimo-v2.5` (paid) | ✅ Completed (catalog enrichment) | `docs/subagent-model-catalog.md` (8 new rows) | Catalog metadata; not a new model |
| Lane B | `nvidia/nemotron-3-super-120b-a12b` | ❌ Stale (no file written) | _none — 4th no-write confirmation_ | Confirmed systematic no-write-file pattern; rating upgraded Limited → Broken for deliverable-write use case |
| Lane C | `opencode-zen/big-pickle` | ✅ Strong (1 prior) | `tmp/subagent-catalog-buildout-2026-06-13/sprint-plan.md` (300 lines) | **First observation** of big-pickle (catalog's `best_free_coding`); now Strong for planning/synthesis |
| Lane D-retry | `nvidia/openai/gpt-oss-20b` | 🟠 Limited (1 prior) | `tmp/subagent-catalog-buildout-2026-06-13/state-retirement-audit.md` (8197 bytes) | **First observation** of gpt-oss-20b; useful for high-level roadmap, manual cross-check required |
| Lane E | `mistral/devstral-2512` | ✅ Strong (2 prior) | `tests/dismiss-in-complete-state-contract.mjs` (10/10 pass, 8/10 fail without fix) | 2nd observation of devstral-2512; prior Limited rating upgraded to Strong on focused test-writing workload |
| Lane F-retry | `mistral/codestral-latest` | ✅ Strong (1 prior) | `tmp/subagent-catalog-buildout-2026-06-13/three-engine-238-256-plan.md` (6685 bytes) | **First observation** of codestral-latest; strong for tight-deadline refactor planning |

**Wave summary:** 4 of 5 dispatches delivered usable files. 1 of 5 (nemotron-3-super) confirmed a systematic no-write-file pattern. **4 new models added to the catalog** (big-pickle, gpt-oss-20b, codestral-latest) plus 1 rating upgrade (devstral-2512 Limited → Strong). 1 nemotron rating upgrade (Limited → Broken for deliverable-write).

### Cross-reference: 2026-06-13 catalog buildout wave 2 (4 dispatches — all settled)

| Lane | Model | Final status (2026-06-13 19:01 UTC) | Output file | Filling which gap |
|---|---|---|---|---|
| Lane G | `nvidia/qwen/qwen3.5-397b-a17b` | ❌ Stale (no file written; 2 attempts) | _none — output token cap truncates before write_ | First observation of qwen3.5-397b; Broken for this workload (different from nemotron: length cap not hesitation) |
| Lane H | `modelscope/zai-org/GLM-5` | 🟠 Limited (1 prior, 3/5) | `tmp/subagent-catalog-buildout-2026-06-13/dead-shim-recrosscheck-2026-06-13.md` (9688 bytes) | First observation of GLM-5; found 2 real BOTH-pattern discrepancies (README error + lane 4's stub-count overstatement) |
| Lane I | `mistral/mistral-large-2512` | ✅ Strong (1 prior, 4/5) | `tmp/subagent-catalog-buildout-2026-06-13/stub-refactoring-roadmap.md` (11914 bytes) | First observation of Mistral flagship 2512; ideal for synthesis tasks |
| Lane J | `openrouter/openai/gpt-oss-120b:free` | 🟠 Limited (1 prior) | _none — stopped at tool check (strict interpreter)_ | First observation of free-tier gpt-oss-120b; behavior note (refuse-not-improvise) |

**BOTH-pattern follow-up surfaced by lane H GLM-5 finding:** Lane 4's `tmp/both-pattern-investigation-2026-06-13/lane-4-deepseek.md` claimed 18 dead stubs were deleted in Part C, but re-cross-check shows only `walkInsideToNextStop` is truly dead in `thread-settler-adapter.ts`. `traverseNeighbor` (10 LIVE callers in `js/modules/`) and `previewInsideNextThread` (2 LIVE callers) were misclassified. **Add to `docs/both-pattern-follow-ups-2026-06-13.md` as a new ticket** before Part C is fully closed.

### Maintenance

This section is regenerated whenever a new test completes. The Status column is the at-a-glance truth: `✅ 🟡 🟠 ⚪` for tiers, `❌ 🚫 🛑 ⏱️` for failure modes, `⏳` for in-flight, `🔧` for non-chat specialized.

When you see ⚪ Untested on a model you want to try, just dispatch a subagent on it and the output back-fills this table + the Tested Routes table above.

## Open Questions To Keep Testing

- Which Pi routes perform reliable tool calls and clean final answers after multiple tool turns?
- Which routes have native vision usable through the current harness/tool stack?
- Which routes stream huge logs that need broker-side summarization or stronger final-output parsing?
- Which free routes are stale catalog entries and should be hidden from small-model pickers?
- Should we adopt a paid-default-only policy for workers that touch production-bound code paths? (e.g., skill-doctor -- paid mimo 2.5 completed successfully; if we had used free and hit 429, the skill would not be there yet.)
