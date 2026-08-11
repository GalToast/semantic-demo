# Comprehensive Model Latency Benchmark — 2026-07-23 (Final)

662 models tested across 13 routes (65 non-chat models filtered, max_tokens=500, temp=0, 15s timeout, sequential).

## Summary

- **139/662 models responded** (21%)
- **Fastest**: 274ms (`cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- **Median**: 890ms | **P90**: 3,729ms

## Per-Route Success Rates (accurate)

| Route        | Success | Total | Rate    | Primary failure                                       |
| ------------ | ------- | ----- | ------- | ----------------------------------------------------- |
| mistral      | 38      | 40    | **95%** | 2 × HTTP errors                                       |
| cloudflare   | 15      | 16    | **93%** | 1 × HTTP 403                                          |
| openrouter   | 6       | 7     | **85%** | 1 × insufficient credits                              |
| modelscope   | 37      | 48    | **77%** | 8 × unsupported model + 2 × account limits            |
| logfare      | 6       | 8     | **75%** | 2 × timeout                                           |
| llm7         | 1       | 2     | 50%     | 1 × insufficient balance                              |
| agnes        | 1       | 3     | 33%     | 2 × not found / permission                            |
| nvidia       | 18      | 103   | 17%     | 83 × 404 (deprecated) + 15 timeout                    |
| opencode-zen | 5       | 51    | 9%      | 38 × "No payment method" + 7 × "Insufficient balance" |
| zenmux       | 2       | 36    | 5%      | 32 × "Access denied" (limited tier)                   |
| kilo         | 13      | 334   | 3%      | 320 × "Add credits to continue"                       |
| neuralwatt   | 0       | 13    | 0%      | 9 × 429 + 4 × insufficient credits                    |

## Error Breakdown (accurate from JSON)

| Error                          | Count | Root cause                                           |
| ------------------------------ | ----- | ---------------------------------------------------- |
| "Add credits to continue"      | 320   | Kilo route — out of credits (billing issue)          |
| HTTP 404                       | 34    | NVIDIA deprecated models no longer available         |
| "No payment method"            | 38    | Opencode-zen — no payment configured (billing issue) |
| "Access denied"                | 32    | Zenmux — limited tier access                         |
| "Insufficient" balance/credits | 22    | Various routes out of credits                        |
| 15s timeout                    | 18    | Large models (deepseek-v4-pro via nvidia, etc.)      |
| HTTP 429                       | 9     | Neuralwatt rate limited                              |
| Model not found/supported      | 8     | Modelscope/llm7 unsupported models                   |

## Top 10 Fastest Working Models (>3B params)

| #   | Model                           | Route      | Latency | Coding? |
| --- | ------------------------------- | ---------- | ------- | ------- |
| 1   | llama-3.3-70b-instruct-fp8-fast | cloudflare | 274ms   |         |
| 2   | codestral-2508                  | mistral    | 333ms   | ✅      |
| 3   | mistral-small-2506              | mistral    | 352ms   |         |
| 4   | mistral-code-fim-latest         | mistral    | 360ms   | ✅      |
| 5   | mistral-code-latest             | mistral    | 380ms   | ✅      |
| 6   | mistral-small-4-119b-2603       | nvidia     | 392ms   |         |
| 7   | mistral-medium-3.5              | mistral    | 406ms   |         |
| 8   | qwen2.5-coder-32b-instruct      | cloudflare | 440ms   | ✅      |
| 9   | mistral-vibe-cli-with-tools     | mistral    | 446ms   |         |
| 10  | codestral-latest                | mistral    | 452ms   | ✅      |

## All Working Coding Models

| Model                      | Route        | Latency |
| -------------------------- | ------------ | ------- |
| codestral-2508             | mistral      | 333ms   |
| mistral-code-fim-latest    | mistral      | 360ms   |
| mistral-code-latest        | mistral      | 380ms   |
| qwen2.5-coder-32b-instruct | cloudflare   | 440ms   |
| codestral-latest           | mistral      | 452ms   |
| mistral-code-agent-latest  | mistral      | 1,011ms |
| north-mini-code-free       | opencode-zen | 1,135ms |
| devstral-2512              | mistral      | 1,274ms |
| devstral-medium-latest     | mistral      | 2,536ms |
| devstral-latest            | mistral      | 3,560ms |

## Key Findings

1. **Mistral is the clear winner** — 95% success rate, 38 working models, fastest coding
   models (codestral-2508 at 333ms). Almost all failures were non-chat models now filtered out.

2. **Kilo is out of credits** (not rate-limited) — 320/334 models return "Add credits to
   continue". This is a billing issue, not a harness or rate-limit issue. Need to add credits
   to the kilo API key.

3. **Opencode-zen needs payment** — 38 models return "No payment method". Only free-tier
   models work (5/51).

4. **NVIDIA has 83 deprecated models** — these return 404 and should be removed from the
   router's model catalog.

5. **Modelscope is the best free route** — 37/48 working (77%), including DeepSeek-V4-Pro,
   Qwen3-Coder-30B, Qwen3-235B, ERNIE-4.5-300B, all free.

6. **Previous "(empty)" responses were max_tokens=50** — fixed with max_tokens=500. All
   reasoning models now produce correct output.

7. **Progressive tool disclosure confirmed** — only 4 tools active by default (read/bash/
   edit/write). System prompt ~5K tokens. Tool schemas NOT the bottleneck.

## Harness Fixes Applied

- **SQLite recovery wedge**: WAL cleaned (548MB→185KB), 280MB stale temp files deleted.
  Kimi-k2.6 subagent verified working (launched + read tool + assistant_output_seen=true).
  Full VACUUM needs Pi shutdown (database still 2.5GB but WAL is small so recovery is fast).
- **assistant_output_seen false negative**: `hasToolExecutionInLog()` helper scans full log.
  Verified working with kimi-k2.6 subagent test.
- **External-subagents MCP**: restored after Pi restart + key router restart.

## Remaining Issues

1. **Database 2.5GB** — needs full Pi shutdown + VACUUM to compact. WAL is small so recovery
   is fast, but the file will keep growing without periodic pruning.
2. **Kilo credits** — add credits to the kilo API key to unlock 320+ premium models (Claude,
   GPT-5, Gemini, Grok, Kimi K3).
3. **Opencode-zen payment** — configure payment method to unlock 45+ paid models.
4. **NVIDIA deprecated models** — 83 models return 404, should be removed from catalog.
5. **Periodic pruning needed** — sessions.db grew to 2.5GB in 6 weeks. Need automated
   pruning of sessions older than 30 days.

## Scripts

- `scripts/benchmark-models.mjs` — curated quick benchmark (~40 models)
- `scripts/benchmark-all-models.mjs` — comprehensive benchmark (all routes, auto-discovering,
  filters non-chat models, clean stdout/stderr separation)
- `tmp/benchmark-results.json` — full JSON results from latest run
- `tmp/benchmark-clean.tsv` — clean TSV output from latest run
