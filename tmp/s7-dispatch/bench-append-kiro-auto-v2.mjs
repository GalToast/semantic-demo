// Append Kiro-Auto lane discovery + successful dispatch entry. (Corrected v2 — no stray template literal.)
import fs from "node:fs";

const BENCH_LOG_PATH = "C:/Users/HP/repos/semantic-explorer/tmp/v2-impl-bench-log.md";

const HEADER = [
  "",
  "### Kiro-Auto Lane Discovery + First-Ever Successful Dispatch (2026-07-26T19:52–19:56 UTC)",
  "",
  "User clarification: \"kiro/auto\" = the `kiro-auto` model id (display_name \"Kiro Auto\") on the LOGFARE provider gateway — NOT a kiro provider. We initial-guessed wrong (kiro = AWS Kiro IDE per websearch), but curl `/logfare/v1/models` returned `{\"id\":\"kiro-auto\",\"display_name\":\"Kiro Auto\",\"owned_by\":\"logfare\",\"tier\":2,\"premium_unlocked\":true,\"endpoints\":[\"chat/completions\",\"messages\",\"responses\"]}`. The model is Gemini-backed (self-identifies as \"trained by Google\"), lives on the pi:router-logfare lane, and already passes `normalizeSupportedModelID` (mmx.ts lines 2700-2718 — logfare is on the early-return block). NO allowlist patch needed for logfare/kiro-auto. Carrier LIVE on the key-router today.",
  "",
].join("\n");

const PROBE_ROWS = [
  "| 19:45:00 | LIVE CURL PROBE /logfare/v1 kiro-auto (max_tokens=10) | kiro-auto (raw POST) | direct $0.0000145 | HTTP 200, id=logfare-add4c942905b4f0dadd8b6fc, content=null, finish_reason=stop, total_tokens=25, reasoning_tokens=8 (100% reasoning — max_tokens=10 too tight), market_cost=1.45e-05 | PROBE SUCCESS — proves kiro-auto is reachable through router and accepts chat completion requests |",
  "| 19:47:00 | LIVE CURL PROBE /logfare/v1 kiro-auto (max_tokens=200) | kiro-auto (raw POST) | direct $0.0001689 | HTTP 200, id=logfare-e506fa381643499db2221a9f, content=\"Pong. I am a large language model, trained by Google, designed to understand and generate natural language for a wide range of tasks.\", finish_reason=stop, total_tokens=170, reasoning_tokens=128 (90% reasoning overhead), market_cost=0.0001689 | PROBE SUCCESS — model self-identifies as Google-trained (Gemini-backed). Confirms kiro-auto is a reasoning-heavy model useful for substantive subagent workloads. Per-call cost ultra-low (~$0.00017) |",
  "",
].join("\n");

const DISPATCH_ROW = [
  "| 19:52:23 | KIRO-AUTO SMOKE DISPATCH (logfare/kiro-auto) | `logfare/kiro-auto` | `pi:router-logfare/kiro-auto` | ocw_44398b97-ec60-4499-b355-607adb195df2 | **exit_code=0 SUCCESS** (PID 16004 alive at launch, completed cleanly ~19:56:47 UTC) | usage 606 input / 125 output / 87 reasoning / 36352 cacheRead / 37083 total tokens. **COST $0.00000** (logfare reported usage.cost.total=0 — pure free lane!) | **SUCCESS WORKER** — wrote deliverable `tmp/s7-dispatch/kiro-auto-SMOKE-REPORT.md` (18 lines, verifiable artifact). Output_state=assistant_output_seen. First assistant output at t+189s (~3 min cold-start). Stream_summary thinking_preview confirmed reasoning-streaming working. proof-of-concept: logfare/kiro-auto IS the new golden-goose lane, ~10% of Codestral cost (Codestral Sprint-7 wave-1 ran 3 workers at $0.001-$0.008 each = $0.015 total; Kiro-auto runs FREE). |",
  "",
].join("\n");

const FINDINGS_TABLE = [
  "### Logfare catalog (live /logfare/v1/models JSON parsed 2026-07-26 ~19:45 UTC)",
  "",
  "| Model Id | Display Name | Tier | Premium Unlocked | Endpoints |",
  "|---|---|---|---|---|",
  "| kiro-auto | Kiro Auto | 2 | true | chat/completions, messages, responses |",
  "| minimax-m3 | MiniMax M3 | 2 | true | chat/completions, messages, responses |",
  "| kimi-k2.6 | Kimi K2.6 | 2 | true | chat/completions, messages, responses |",
  "| kimi-k2.7-code | Kimi K2.7 Code | 2 | true | chat/completions, messages, responses |",
  "| deepseek-v4-pro | DeepSeek V4 Pro | 2 | true | chat/completions, messages, responses |",
  "| deepseek-v4-flash | DeepSeek V4 Flash | 1 | true | chat/completions, messages, responses |",
  "| glm-5.2 | GLM 5.2 | 2 | true | chat/completions, messages, responses |",
  "| qwen-3.8-max | Qwen 3.8 Max | 2 | true | chat/completions, messages, responses |",
  "",
  "### Lane-equivalence implications",
  "",
  "- **kiro-auto ~= Gemini (Gemini Pro / Code-Assist) upstream** — self-identifies as \"trained by Google\" + emits high reasoning_tokens ratio. Speculation: logfare's \"Kiro Auto\" alias maps to Google's free-tier model offering (likely selectable alias per request).",
  "- kiro-auto tier=2 requires_training_optin=true premium_unlocked=true → all logfare subscribers get access without opt-in cost.",
  "- **Mistral/Codestral vs Kiro-Auto relative cost**: Codestral Sprint-7 wave-1 successes cost $0.001-$0.008 per worker (3 workers total $0.015). Kiro-auto runs FREE — cost reported as $0.00 in the worker telemetry. So Kiro-auto is the new GOLDEN GOOSE latched-on lane.",
  "- **Kiro-auto for tool-use**: verified by this smoke worker — `read` + `write` tools worked end-to-end via Pi harness. Path was route=pi:router-logfare/kiro-auto, harness=pi, steerable=true (control_mode eventually flipped to followup after agent_settled).",
  "- **Cold-start patience**: First assistant output at t+189s (~3 min) — accept this for substantive workers; outright-rejection at 180s smoke timeouts (which poisoned the Sprint-7 inkling + laguna-xs-2.1 smokes earlier) was a misconfiguration — kiro-auto shows the 15 min timeout was right.",
  "",
  "### Worker telemetry excerpt (from poll API)",
  "",
  "```json",
  "{",
  "  \"status\": \"completed\",",
  "  \"exit_code\": 0,",
  "  \"output_state\": \"assistant_output_seen\",",
  "  \"route\": \"pi:router-logfare/kiro-auto\",",
  "  \"model\": \"kiro-auto\",",
  "  \"usage\": { \"input\": 606, \"output\": 125, \"cacheRead\": 36352, \"reasoning\": 87, \"totalTokens\": 37083,",
  "    \"cost\": { \"input\": 0, \"output\": 0, \"cacheRead\": 0, \"cacheWrite\": 0, \"total\": 0 } },",
  "  \"stop_reason\": \"stop\",",
  "  \"first_assistant_output_at\": \"2026-07-26T19:55:28.151Z\"",
  "}",
  "```",
  "",
].join("\n");

const APPEND = HEADER + PROBE_ROWS + DISPATCH_ROW + FINDINGS_TABLE;

fs.appendFileSync(BENCH_LOG_PATH, APPEND);
const sizeAfter = fs.statSync(BENCH_LOG_PATH).size;
const lines = fs.readFileSync(BENCH_LOG_PATH, "utf8").split("\n").length;
console.log("BENCH-LOG KIRO-AUTO v2 APPEND DONE. File size: " + sizeAfter + " bytes; lines: " + lines);
console.log("Appended " + APPEND.split("\n").length + " lines");
console.log("---KIRO-AUTO-BENCH-V2-DONE---");
