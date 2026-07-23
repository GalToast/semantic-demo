# Comprehensive Model Latency Benchmark — 2026-07-23

712 unique models tested across 13 routes (max_tokens=500, temp=0, 15s timeout, sequential).

## Summary

- **142/712 models responded** (20%)
- **Fastest**: 223ms (nvidia/meta/llama-3.2-1b-instruct)
- **Median**: 879ms | **P90**: 4558ms

## Per-Route Success Rates

| Route         | Success | Total | Rate | Primary failure                       |
| ------------- | ------- | ----- | ---- | ------------------------------------- |
| /cloudflare   | 15      | 16    | 93%  | 1 timeout                             |
| /logfare      | 6       | 8     | 75%  | 2 timeouts (kimi-k2.7-code, glm-5.2)  |
| /modelscope   | 74      | 100   | 74%  | 26 unsupported models                 |
| /openrouter   | 10      | 14    | 71%  | 4 unsupported                         |
| /mistral      | 40      | 60    | 66%  | 18 non-chat models (embed/OCR/vision) |
| /nvidia       | 22      | 119   | 18%  | 35 × 404 (old models), 14 timeouts    |
| /agnes        | 2       | 8     | 25%  | 6 non-text models                     |
| /llm7         | 2       | 12    | 16%  | 10 non-chat                           |
| /opencode-zen | 6       | 51    | 11%  | 45 × 401 (no payment method)          |
| /zenmux       | 4       | 83    | 4%   | 79 failures (various)                 |
| /kilo         | 12      | 498   | 2%   | 93 × 429 (entire route rate-limited)  |

## Error Breakdown

| Error            | Count | Root cause                                              |
| ---------------- | ----- | ------------------------------------------------------- |
| 429 Rate limited | 110   | 93 on kilo (route-level), 11 on neuralwatt, 3 on zenmux |
| 401 Unauthorized | 45    | All opencode-zen (no payment method configured)         |
| 404 Not found    | 35    | Old nvidia models no longer available                   |
| 400 Bad request  | 18    | Non-chat models (embed, OCR, voxtral, moderation)       |
| Timeout (15s)    | 24    | Large models (deepseek-v4-pro via nvidia, etc.)         |

## Top 20 Fastest Working Models (significant size)

| #   | Model                      | Route           | Latency | Coding?   |
| --- | -------------------------- | --------------- | ------- | --------- |
| 1   | codestral-2508             | mistral         | 339ms   | ✅ Coding |
| 2   | laguna-xs-2.1              | nvidia/poolside | 345ms   |           |
| 3   | mistral-small-3.1-24b      | cloudflare      | 366ms   |           |
| 4   | llama-3.3-70b-instruct-fp8 | cloudflare      | 370ms   |           |
| 5   | mistral-code-latest        | mistral         | 373ms   | ✅ Coding |
| 6   | codestral-latest           | mistral         | 376ms   | ✅ Coding |
| 7   | mistral-small-2506         | mistral         | 413ms   |           |
| 8   | mistral-medium-3.5         | mistral         | 422ms   |           |
| 9   | mistral-medium-3           | mistral         | 433ms   |           |
| 10  | mistral-small-4-119b-2603  | nvidia          | 433ms   |           |
| 11  | mistral-medium-2508        | mistral         | 442ms   |           |
| 12  | mistral-medium-latest      | mistral         | 443ms   |           |
| 13  | mistral-small-latest       | mistral         | 456ms   |           |
| 14  | open-mistral-nemo          | mistral         | 400ms   |           |
| 15  | devstral-medium-latest     | mistral         | 462ms   | ✅ Coding |
| 16  | magistral-small-latest     | mistral         | 462ms   |           |
| 17  | qwen2.5-coder-32b-instruct | cloudflare      | 469ms   | ✅ Coding |
| 18  | mistral-small-2603         | mistral         | 470ms   |           |
| 19  | mistral-medium-2604        | mistral         | 472ms   |           |
| 20  | mistral-medium             | mistral         | 488ms   |           |

## Key Findings

### 1. Kilo route is entirely rate-limited (498 models, 2% success)

The kilo route has premium models (Claude Sonnet 5, GPT-5, Gemini 3.6, Grok 4.5, Kimi K3)
but 93/498 return 429 in 10-20ms — the **kilo router itself is rejecting before hitting upstream**.
This is a key/router issue, not a harness issue. The key needs to be rotated or the route
needs additional API keys.

### 2. Opencode-zen premium models need payment (45 × 401)

All paid models on opencode-zen return "No payment method" or "Insufficient balance".
Only the free-tier models work: `deepseek-v4-flash-free`, `mimo-v2.5-free`,
`nemotron-3-ultra-free`, `north-mini-code-free`, `big-pickle`, `laguna-s-2.1-free`.

### 3. Mistral route is the fastest and most reliable (66% success, 40 models)

Mistral has 40 working models with sub-500ms latency for most. Codestral-2508 (339ms)
and devstral-2512 (499ms) are coding-specialized. The failures are all non-chat models
(embed, OCR, voxtral, moderation) which we shouldn't have tested.

### 4. Modelscope is a hidden gem (74 working models, 74% success)

Modelscope has DeepSeek V4 Pro (1.9s), Qwen3-Coder-30B (658ms), Qwen3-235B (4s),
ERNIE-4.5-300B (469ms), GLM-5.2 (6s). All free, all working.

### 5. Previous "(empty)" responses were max_tokens=50, not broken models

With max_tokens=500, all previously "(empty)" models now return correct content.
The issue was reasoning models using all 50 tokens on thinking before producing output.

### 6. Harness issues identified (real bugs, not model issues)

- **SQLite recovery wedge**: sessions.db is 2.6GB with 5,482 sessions and 102,988 messages.
  Recovery takes >5s, blocking kimi-k2.6 subagent. Stale rebuild temp files (280MB) cleaned.
  Fix: prune old sessions, VACUUM the database.
- **assistant_output_seen false negative**: already fixed with `hasToolExecutionInLog()` helper.
- **Progressive tool disclosure confirmed**: subagents only load 4 tools (read, bash, edit, write)
  by default. System prompt is ~5K tokens (AGENTS.md), not 50K. Tool schemas are NOT the bottleneck.

## Subagent Model Recommendations (updated)

| Use case                | Model                  | Route          | API latency | Est. subagent |
| ----------------------- | ---------------------- | -------------- | ----------- | ------------- |
| Fast coding             | codestral-2508         | mistral        | 339ms       | ~60s          |
| Fast coding (free)      | qwen2.5-coder-32b      | cloudflare     | 469ms       | ~60s          |
| Deep refactoring        | deepseek-v4-pro        | logfare        | 2.2s        | ~600s         |
| Deep refactoring (free) | DeepSeek-V4-Pro        | modelscope     | 1.9s        | ~300s?        |
| Quick extraction        | deepseek-v4-flash      | logfare/nvidia | 1.2-1.5s    | ~120s         |
| Medium coding           | devstral-2512          | mistral        | 499ms       | ~60s          |
| Free fallback           | deepseek-v4-flash-free | opencode-zen   | 1.4s        | ~120s         |
| Qwen coding (free)      | Qwen3-Coder-30B        | modelscope     | 658ms       | ~60s          |

## Benchmark Scripts

- `scripts/benchmark-models.mjs` — curated benchmark (43 models, quick)
- `tmp/benchmark-all-models.mjs` — comprehensive benchmark (all routes, dedup)
- `tmp/benchmark-results.json` — full JSON results from this run
- `tmp/benchmark-all-output.tsv` — TSV output from this run
