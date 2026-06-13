# Subagent Model Catalog

Working notes for external-subagent model performance in this repo. Do not store API keys, account details, raw headers, or full transcripts here. Treat each row as evidence from one observed launch, not a permanent provider guarantee.

## 2026-06-12 -- Current Routing State

This section records the active routing defaults as of the most recent cross-gateway test day (2026-06-12). Entries here override any older catalog entries when they conflict.

| Use case | Default model | Lock status | Escalation rule |
|---|---|---|---|
| Paid (reliable implementation work) | `opencode-go/mimo-v2.5` | Locked -- user approved paid tier on 2026-06-12 | No escalation needed; this is the safety net |
| Free memory consolidation | `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` | Locked -- set in `~/.pi/agent/settings.json` (llmModelOverride) | Do not change without explicit user request |
| Free subagent dispatches | `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` | Locked -- replaces prior `opencode-zen/nemotron-3-ultra-free` preference | Worker failure/429 → escalate to paid with user approval |

**Known-bad free routes under load (2026-06-12):**
- `opencode-zen/mimo-v2.5-free` -- 429s within minutes when multiple workers run concurrently on the same gateway.
- `opencode-zen/deepseek-v4-flash-free` -- same 429 pattern under load.

Related inventory: [nvidia-nim-capability-catalog.md](nvidia-nim-capability-catalog.md) tracks NVIDIA NIM models and non-chat capabilities exposed by the local NVIDIA lane or NVIDIA Build.

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

All three routes produce very large stdout. The followup pattern (`external_subagent_followup` with `session_id`) is the canonical recovery path when a fresh worker burns its budget on context-gathering and dies at the write-call boundary.

## Cross-Gateway 429 Patterns

Observed on 2026-06-12:

When 2+ workers run in parallel on the same gateway, expect 429s on the free tier within minutes. This was observed with both `opencode-zen/mimo-v2.5-free` and `opencode-zen/deepseek-v4-flash-free`.

Mitigation: pick different gateways per worker (e.g., kilo, opencode-zen, nvidia). When a paid option is available for the task, default to paid for reliability under load.

## Open Questions To Keep Testing

- Which Pi routes perform reliable tool calls and clean final answers after multiple tool turns?
- Which routes have native vision usable through the current harness/tool stack?
- Which routes stream huge logs that need broker-side summarization or stronger final-output parsing?
- Which free routes are stale catalog entries and should be hidden from small-model pickers?
- Should we adopt a paid-default-only policy for workers that touch production-bound code paths? (e.g., skill-doctor -- paid mimo 2.5 completed successfully; if we had used free and hit 429, the skill would not be there yet.)
