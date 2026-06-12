# Subagent Model Catalog

Working notes for external-subagent model performance in this repo. Do not store API keys, account details, raw headers, or full transcripts here. Treat each row as evidence from one observed launch, not a permanent provider guarantee.

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
| 2026-06-12 | `opencode-zen/mimo-v2.5-free` | OpenCode Zen | Pi | Provider error surfacing + followup profile inheritance | Partially completed with useful edits | Read/edit/bash worked; live steering landed; ran focused passing subset | Good at small targeted broker fixes | Ended on provider connection retry; left scratch `test-debug.ts`; final output parser degraded to logs-only | Small implementation or critique lanes with close review | Promising |
| 2026-06-12 | `kilo/nex-agi/nex-n2-pro:free` | Kilo | Pi | Semantic Explorer product playthrough review | Timed out after 900s | Live steering worked, but tool use drifted into broad PowerShell recursive searches | Could recover from initial server issue and locate QA artifacts | Ignored scoped-search steering, crawled `.opencode` caches, generated 142MB stdout, no trustworthy final | Avoid long repo QA until scoped-search discipline improves | Limited |
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
| 2026-06-12 | `opencode-zen/qwen3.6-plus-free` | OpenCode Zen | Pi | Launch smoke | Failed before work | Router rejected free promotion | None observed | `401 Free promotion has ended for Qwen3.6 Plus Free` | Remove from preferred free picks | Stale route |
| 2026-06-12 | `nvidia/google/diffusiongemma-26b-a4b-it` | NVIDIA | Pi | Report-only repo probe | Timed out | No assistant or tool output in 180s | None observed | Silent timeout | Not useful for coding subagents yet | Broken |
| 2026-06-12 | `modelscope/Qwen/Qwen3-VL-8B-Instruct` | ModelScope | Pi | Report-only repo probe | Timed out | No assistant or tool output in 180s | None observed | Silent timeout | Not useful for coding subagents yet | Broken |
| 2026-06-12 | `mistral/devstral-latest` | Mistral direct | Pi | Report-only repo probe | Timed out | No assistant or tool output in 180s | None observed | Silent timeout in previous probe | Retest with smaller smoke and route diagnostics | Limited |

## Current Live Catalog Snapshot

Observed from `external_subagent_free_models compact=true` on 2026-06-12:

- Pi is the normal external-subagent harness; omit `harness` unless explicitly testing a fallback lane.
- Provider-qualified launch refs exist for `opencode-zen`, `nvidia`, `mistral`, `openrouter`, `kilo`, and `modelscope`.
- Duplicate model routes exist and must stay provider-qualified, especially `openrouter/owl-alpha` vs `kilo/openrouter/owl-alpha` and `openrouter/nex-agi/nex-n2-pro:free` vs `kilo/nex-agi/nex-n2-pro:free`.
- NVIDIA live catalog exposes broad accessible refs including `nvidia/moonshotai/kimi-k2.6`, `nvidia/minimaxai/minimax-m2.7`, `nvidia/deepseek-ai/deepseek-v4-flash`, `nvidia/deepseek-ai/deepseek-v4-pro`, `nvidia/z-ai/glm-5.1`, and many vision models.
- ModelScope live catalog exposes broad accessible refs including DeepSeek V4, MiniMax, Nex N2 Pro, GLM, Qwen, and Xiaomi MiMo routes.

## Open Questions To Keep Testing

- Which Pi routes perform reliable tool calls and clean final answers after multiple tool turns?
- Which routes have native vision usable through the current harness/tool stack?
- Which routes stream huge logs that need broker-side summarization or stronger final-output parsing?
- Which free routes are stale catalog entries and should be hidden from small-model pickers?
