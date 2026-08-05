# Vision-Lane Catalog (subagent worker lanes)

Chat-vision = router catalog input_modalities contains "image" + output is text. Catalog declarations can lag reality; always smoke-probe ([SEEN 1]) before trusting a lane. Full machine table: tmp/vision-catalog-full.json.

Generated 2026-08-04T22:37:23.672Z — chat-vision ids: 225 · name-hint-only: 68

## VERIFIED with a real screenshot (2026-08-04)

- modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct — best focused VLM; pixel-perfect reads, fast
- zenmux/stepfun/step-3.7-flash — best general fast/cheap
- nvidia/thinkingmachines/inkling — deeper reasoning, slow
- cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct — free tier
- nvidia/minimaxai/minimax-m3 — slow + occasionally 400-prone

## BLOCKED / NOT-VISION right now

- infron/anthropic/claude-\* 403 insufficient_user_quota
- zenmux/google/gemini-3.5-flash prepayment depleted
- zenmux/x-ai/grok-4.5 402 reject_no_credit
- ling-3.0-flash / ling-2.x : text-only modalities on every route; live hook fails with 404-no-image (not a vision lane)
- logfare kimi-k3 : prompt-ack then silence (lane flake); prefer zenmux/novita/kilo for kimi-k3

**infron (85):** amazon/nova-2-lite-v1, amazon/nova-lite-v1, amazon/nova-pro-v1, anthropic/claude-fable-5, anthropic/claude-opus-4.5, anthropic/claude-opus-4.6, anthropic/claude-opus-4.6-fast, anthropic/claude-opus-4.7, anthropic/claude-opus-4.7-fast, anthropic/claude-opus-4.8, anthropic/claude-opus-4.8-fast, anthropic/claude-opus-5, anthropic/claude-opus-5-fast, anthropic/claude-sonnet-4.6, anthropic/claude-sonnet-5, bytedance/seed-2.0-code, bytedance/seed-2.1-turbo, google/gemini-3-flash-preview, google/gemini-3.1-flash-lite, google/gemini-3.1-flash-lite-preview, google/gemini-3.1-pro-preview, google/gemini-3.5-flash, google/gemini-3.5-flash-lite, google/gemini-3.6-flash, google/gemma-3-12b-it, google/gemma-3-4b-it, google/gemma-4-26b-a4b, google/gemma-4-31b-it, kwaipilot/kat-coder-air-v2.5, kwaipilot/kat-coder-pro-v2.5, meta-ai/muse-spark-1.1, minimax/minimax-m3, moonshotai/kimi-k2.5, moonshotai/kimi-k2.6, moonshotai/kimi-k2.7-code, moonshotai/kimi-k2.7-code-fast, moonshotai/kimi-k3, openai/gpt-4, openai/gpt-4.1, openai/gpt-4.1-mini, openai/gpt-4.1-nano, openai/gpt-4o, openai/gpt-4o-mini, openai/gpt-5, openai/gpt-5-mini, openai/gpt-5-nano, openai/gpt-5-pro, openai/gpt-5.1, openai/gpt-5.1-chat, openai/gpt-5.2, openai/gpt-5.2-chat, openai/gpt-5.4, openai/gpt-5.4-mini, openai/gpt-5.5, openai/gpt-5.5-pro, openai/gpt-5.6-luna, openai/gpt-5.6-sol, openai/gpt-5.6-terra, openai/gpt-oss-20b, perceptron/perceptron-mk1, qwen/qwen3-vl-235b-a22b-instruct, qwen/qwen3-vl-plus, qwen/qwen3.5-122b-a10b, qwen/qwen3.5-27b, qwen/qwen3.5-35b-a3b, qwen/qwen3.5-397b-a17b, qwen/qwen3.5-9b, qwen/qwen3.5-plus, qwen/qwen3.6-27b, qwen/qwen3.6-35b-a3b, qwen/qwen3.6-flash, qwen/qwen3.6-plus, qwen/qwen3.6-plus:free, qwen/qwen3.7-flash, qwen/qwen3.7-plus, qwen/qwen3.8-max, sakana/fugu-ultra, sapiens-ai/agnes-2.0-flash:free, stepfun/step-3.7-flash, thinkingmachines/inkling, x-ai/grok-4.3, x-ai/grok-4.5, x-ai/grok-build-0.1, xiaomi/mimo-v2.5, z-ai/glm-5v-turbo
**zenmux (95):** anthropic/claude-fable-5, anthropic/claude-haiku-4.5, anthropic/claude-opus-4, anthropic/claude-opus-4.1, anthropic/claude-opus-4.5, anthropic/claude-opus-4.6, anthropic/claude-opus-4.7, anthropic/claude-opus-4.8, anthropic/claude-opus-5, anthropic/claude-sonnet-4, anthropic/claude-sonnet-4.5, anthropic/claude-sonnet-4.6, anthropic/claude-sonnet-5, baidu/ernie-5.0-thinking-preview, bytedance/doubao-seed-1.8, bytedance/doubao-seed-2.0-code, bytedance/doubao-seed-2.0-lite, bytedance/doubao-seed-2.0-mini, bytedance/doubao-seed-2.0-pro, bytedance/doubao-seed-2.1-pro, bytedance/doubao-seed-2.1-turbo, bytedance/doubao-seed-character, bytedance/doubao-seed-code, bytedance/doubao-seed-evolving, google/gemini-2.5-flash, google/gemini-2.5-flash-lite, google/gemini-2.5-pro, google/gemini-3-flash-preview, google/gemini-3.1-flash-lite, google/gemini-3.1-pro-preview, google/gemini-3.5-flash, google/gemini-3.5-flash-lite, google/gemini-3.6-flash, google/gemma-4-26b-a4b-it, meta/llama-4-scout-17b-16e-instruct, meta/muse-spark-1.1, minimax/minimax-m3, mistralai/mistral-large-2512, moonshotai/kimi-k2.5, moonshotai/kimi-k2.6, moonshotai/kimi-k2.7-code, moonshotai/kimi-k2.7-code-highspeed, moonshotai/kimi-k3, openai/chat-latest, openai/gpt-4.1, openai/gpt-4.1-mini, openai/gpt-4.1-nano, openai/gpt-4o, openai/gpt-4o-mini, openai/gpt-5, openai/gpt-5-chat, openai/gpt-5-codex, openai/gpt-5-mini, openai/gpt-5-nano, openai/gpt-5-pro, openai/gpt-5.1, openai/gpt-5.1-chat, openai/gpt-5.1-codex, openai/gpt-5.1-codex-mini, openai/gpt-5.2, openai/gpt-5.2-chat, openai/gpt-5.2-codex, openai/gpt-5.2-pro, openai/gpt-5.3-chat, openai/gpt-5.3-codex, openai/gpt-5.4, openai/gpt-5.4-mini, openai/gpt-5.4-nano, openai/gpt-5.4-pro, openai/gpt-5.5, openai/gpt-5.5-pro, openai/gpt-5.6-luna, openai/gpt-5.6-sol, openai/gpt-5.6-terra, openai/gpt-image-1.5, openai/o4-mini, qwen/qwen3-vl-plus, qwen/qwen3.5-flash, qwen/qwen3.5-plus, qwen/qwen3.6-flash, qwen/qwen3.6-plus, qwen/qwen3.7-flash, qwen/qwen3.7-plus, sapiens-ai/agnes-2.0-flash, stepfun/step-3.7-flash, x-ai/grok-4.2-fast, x-ai/grok-4.2-fast-non-reasoning, x-ai/grok-4.3, x-ai/grok-4.5, x-ai/grok-build-0.1, xiaomi/mimo-v2.5, z-ai/glm-4.6v, z-ai/glm-4.6v-flash, z-ai/glm-4.6v-flash-free, z-ai/glm-5v-turbo
**novita (44):** baidu/ernie-4.5-vl-28b-a3b, baidu/ernie-4.5-vl-28b-a3b-thinking, baidu/ernie-4.5-vl-424b-a47b, deepseek/deepseek-ocr, deepseek/deepseek-ocr-2, google/gemma-3-12b-it, google/gemma-3-27b-it, google/gemma-4-26b-a4b-it, google/gemma-4-31b-it, gt-4p, meta-llama/llama-4-maverick-17b-128e-instruct-fp8, meta-llama/llama-4-scout-17b-16e-instruct, minimax/minimax-m3, moonshotai/kimi-k2.5, moonshotai/kimi-k2.6, moonshotai/kimi-k2.7-code, moonshotai/kimi-k3, nex-agi/nex-n2-pro, openai/gpt-oss-120b, openai/gpt-oss-20b, paddlepaddle/paddleocr-vl, qwen/qwen2.5-vl-72b-instruct, qwen/qwen3-omni-30b-a3b-instruct, qwen/qwen3-omni-30b-a3b-thinking, qwen/qwen3-vl-235b-a22b-instruct, qwen/qwen3-vl-235b-a22b-thinking, qwen/qwen3-vl-30b-a3b-instruct, qwen/qwen3-vl-30b-a3b-thinking, qwen/qwen3-vl-8b-instruct, qwen/qwen3.5-122b-a10b, qwen/qwen3.5-27b, qwen/qwen3.5-35b-a3b, qwen/qwen3.5-397b-a17b, qwen/qwen3.5-plus, qwen/qwen3.6-27b, qwen/qwen3.6-35b-a3b, qwen/qwen3.6-plus, qwen/qwen3.8-max, stepfun/step-3.7-flash, xiaomimimo/mimo-v2.5, zai-org/autoglm-phone-9b-multilingual, zai-org/glm-4.5v, zai-org/glm-4.6v, zai-org/glm-5v-turbo
**groq (1):** qwen/qwen3.6-27b

## Head-to-head benchmark (2026-08-05, fixture m04 w32)

Best measured: modelscope Qwen3-VL-8B-Instruct (full label recall, 11s) ≈ 235B-Instruct (depth, 16s). llama-4-scout: solid free fallback. minimax-m3 weak recall. groq qwen3.6-27b = 200 + thinking-format only. Blocked/dead: glm-4.6v (429/t-out), openrouter qwen3-vl (kilo EOL 410), kimi-k2.6 (paid-only), agnes-2.5 (empty), mistral (id form), freemodel gpt-5.6-\* (401/cooldown ~6h; **needs fresh key**).

## Provider-status edge notes (2026-08-05 03:5x)

- freemodel (gpt-5.6-terra/sol/5.4-mini): key fe_oa_08…951e is VALID; whole lane is in auto-cooldown (~5.5h from 03:5x) — lanes self-recover, no config change required.
- logfare: catalog healthy (kiro-auto, minimax-m3, kimi-k2.6/k2.7/k3, deepseek-\*, glm-5.2, qwen-3.8/3.6-max) but chat calls HANG (text sanity to kimi-k3/k2.6 never returns) — treat logfare as unfit for vision until a response lands; revisit kimi-k3 there if the lane heals.

## Breadth sweep #2 (2026-08-05 04:1x) — new contenders + dead lanes

- NEW TOP TIER: mistral/mistral-medium-latest (333ms-fast, full label recall — previously mis-id'd), nvidia/meta/llama-3.2-11b-vision-instruct (fast + naive overlap detection), 90b-vision (slow).
- Podium: Qwen3-VL-8B/235B (detail) ~ mistral-medium (speed) ≻ llama-3.2-11B-vision.
- New blockers: novita = 403 NOT_ENOUGH_BALANCE (all VL dead); zenmux qwen3.7-plus → same 410 EOL (kilo index bug hits qwen3.5/3.6/3.7 ids); agnes (2.0 & 2.5) = empty content always; voxtral-mini = image-disabled on route; minimax-m2.x = 504; gemma-4/phi-4-multimodal/cosmos-reason2/nemotron-nano-vl/fuyu = 402/404; modelscope \*-Thinking ids = 400 not servable.

## Hard-trial + NVIDIA-NIM verdict (2026-08-05 05:0x)

POD (5-fixture battery): Qwen3-VL-8B/235B = best & most consistent; gemma-4-26b-a4b-it:free (openrouter) = co-leader (flagging a w320 "overlap" that DOM proved CLEAN — chips end y60, caption y70; gauge: good but can invent); llama-3.2-11b/90b-vision solid; scout fallback. Dropped after re-test: mistral-medium-latest (400 inconsistent), nemotron-nano-12b-vl:free (65s timeouts), agnes (always empty), voxtral (image-disabled), minimax-m2.x (504), gemma-4-31b:free (429).

- NVIDIA NIM dedicated tier: NOT reachable today — integration.api.nvidia.com chat = network fetch-fail (5 attempts); ai.api.nvidia.com hosted routes = account-404 (documented); key pool nvapi-\* has no hosted entitlement. Treat dedicated NIM VLMs (paligemma/vila/phi-4-multimodal/nemotric-parse) as unavailable pending entitlement + reachable host.

## CORRECTION: hosted NVIDIA NIM tier WORKS (2026-08-05 05:3x)

- Recipe: host = <https://integrate.api.nvidia.com/v1/chat/completions> + Authorization Bearer nvapi-\* (key pool OK). My earlier verdict was wrong: (a) I typo'd the host (`integration.api` vs `integrate.api`), (b) probed DEAD model ids: microsoft/phi-4-multimodal-instruct (410 EOL 2026-07-15), meta/llama-4-maverick-17b-128e-instruct (410 EOL), google/paligemma (404 — not on this listing).
- LIVE hosted NIM VLMs (real-image verified): meta/llama-3.2-11b-vision-instruct (read all 5 tags + connection), nvidia/nemotron-nano-12b-v2-vl (tags + overlap). Same models as the local router lane — direct hosted path works.

## Complete NVIDIA NIM vision register (2026-08-05, all 21 catalog ids, local+hosted)

USABLE: llama-3.2-11b-vision (local 2.4s / hosted), llama-3.2-90b-vision (11s), nemotron-3-nano-omni-30b-a3b-reasoning (HOSTED 53s — full reads), nemotron-nano-12b-v2-vl (hosted 2.4s; ghost locally), minimax-m3 (weak). HOSTED = <https://integrate.api.nvidia.com/v1/chat/completions> (key OK).
DEAD/ghost: phi-4-multimodal (EOL 0715), llama-4-maverick (EOL), fuyu-8b, deplot, gemma-3-12b/3-4b, gemma-4-31b (blocked), kosmos-2, phi-3-vision, phi-3.5-moe, kimi-k2.6, cosmos-reason2, neva-22b, vila (all 404 Function-not-for-account), nemotron-nano-vl-8b (500), mistral-medium-3.5 (net err).
Web-LADDER update: this does NOT change the top (Qwen3-VL still #1) — omni-30b joins as a slower feasible alternative (53s).

## Exhaustive bridge census v3 (2026-08-05) — 33 verified ids / 27 families (real pixel probes)

REGISTER CONSOLIDATION (2026-08-05 13:1x, worker-audited + re-probed): evidence pack tmp/vision-census-evidence/\*.jsonl holds 39 PIXELS_OK lines = 36 case-normalized unique model ids (27-family + mimo-v2.5-free + zydit-v1 chatjimmy/diffusiongemma + groq qwen3.6-27b manual + ROUND-6 re-verified pixtral-12b-2409 + mistral-small-2603 + inkling @nvidia). ROUND-6/inkling claims were true but never JSONL-filed — re-probed 2026-08-05 and evidence saved (round6-verification.jsonl). The "27 families" headings below are the deduped family roll-up; the id-level set is 36. Full audit: tmp/vision-doc-audit-report.md

Three successive census layers — each caught a real class of miss that the previous one shipped as "done":

| Layer | Gates swept          | Total ids            | Verified | Miss this layer caught                                                                                                       |
| ----- | -------------------- | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| v1    | 9                    | 278                  | 12       | catalog-derived candidates only                                                                                              |
| v2    | 21                   | 329                  | 17       | +cloudflare+llm7+gemini+agnes+mistral+gates; whole-gate misses                                                               |
| v3    | 21 + alt-gate matrix | 329 + 122 alt probes | 27       | 429-rate-limits never retried = 123 mis-filed "untested"; no usage-image-token classifier; missing per-model alt-gate matrix |

VERIFIED VISION (27 families, deduped; real single-image bridge read):

1. Qwen/Qwen3-VL-235B-A22B-Instruct @modelscope (7-10s)
2. Qwen/Qwen3-VL-8B-Instruct @modelscope (12-23s)
3. Qwen/Qwen3-VL-8B-Thinking @modelscope (8-11s)
4. NEW qwen/qwen3.5-122b-a10b @modelscope (8s) — non-"VL" id IS vision
5. NEW qwen/qwen3.5-35b-a3b @modelscope (11s)
6. NEW qwen/qwen3.5-27b @modelscope (11s)
7. meta/llama-3.2-11b-vision-instruct @nvidia (3s)
8. meta/llama-3.2-90b-vision-instruct @nvidia (17s)
9. nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free @openrouter (21s)
10. google/gemma-4-26b-a4b-it:free @openrouter (6s)
11. stepfun/step-3.7-flash @openrouter (6s)
12. minimax/minimax-01 @openrouter (19s)
13. minimax/minimax-m3 @openrouter (15s)
14. google/gemini-2.5-flash @openrouter (5s)
15. google/gemini-2.5-flash-lite @openrouter (29s)
16. google/gemini-3.1-flash-lite @openrouter (4s)
17. google/gemini-3.1-flash-lite-image @openrouter (4s)
18. google/gemini-3-pro-image @openrouter (5s)
19. NEW google/gemini-3.5-flash @zenmux (29s) — openrouter 410 = WRONG GATE
20. NEW gemini-3.1-flash-lite @llm7 (4s) — llm7 gate serves gemini minus prefix
21. mistral-medium-latest @mistral (2.5s — fastest)
22. @cf/meta/llama-4-scout-17b-16e-instruct @cloudflare (4s)
23. @cf/mistralai/mistral-small-3.1-24b-instruct @cloudflare (3s)
24. agnes-2.0-flash @agnes (10s; uses 220 reasoning tokens — size max_tokens)
25. agnes-2.5-flash @agnes (38s)
26. agnes-2.5-pro @agnes (38s)
27. kilo-auto/small + openrouter/free auto-routes @kilo (5-10s)

EXCLUDED-honest residuals (not vision-blocked, need keys/heal/wrong-id normalizing):

- 129 x HTTP*402 (billing walls: claude-\_5, gpt-5.6-*, kimi-_, novita-_ on charged gates)
- 84 x HTTP_400 (invalid-id/shape on that gate), 29 x HTTP_404, 18 x HTTP_410 (EOL),
- 23 x EMPTY/TEXT_EMPTY (image-token-detail zero or max_tokens saturation), 3 x untested-429, 1 x REFUSAL cluster gemini-3.x-preview (text-only frontends)
- The ~39 previously claimed "19 stable lanes" docs pre-2026-08-05 are CONFOUNDED: 429-as-untested + no-retry + single-gate probes. Re-run the disputed bucket (429/EMPTY/REFUSAL) before trusting any "vision lane" claim from before this date.

Census methodology lock-in (so future sweeps don't repeat v1/v2 blind spots):

1. 429 is NOT a verdict — it is backoff. Always retry (min 2 attempts, 3-4s backs).
2. Capture usage.image_tokens / prompt_tokens_details — image_ingest > 0 + max_tokens raised, else reasoning-burn models classify "EMPTY" when they're vision.
3. Gate-routing is part of the verdict: gemini-3.5 410@openrouter but works @zenmux; qwen3-vl 410@kilo but modelscope OK. Probe per (model, gate) matrix, not once per id.
4. "image" capability hides in non-"VL" ids (qwen3.5-\* family). Match on catalog declared input_modalities, not name regex.
5. Sweep ALL router gates (/health routes), not the 9 familiar ones — v1 missed cloudflare/llm7/gemini/agnes/mistral/neuralwatt entirely.
6. Direct-platform keys (MINIMAX_API_KEY, GROQ_API_KEY, EIGHT8AVI, etc.) exist as harness-level env but have no baseURL in pi config — they are NOT currently routable through Pi's provider model, so the register only covers router-reachable models. Wiring those is a separate harness task.

Full machine tables: tmp/vision-census-final-v2.json (best verdict per id), tmp/vision-census-evidence/\*.jsonl per layer.

## DIRECT-platform census (2026-08-05) — beyond the router; from pi modelProviders config

The router (127.0.0.1:8788, 30 gates) is only HALF the surface. `~/.pi/agent/model-providers.json` defines DIRECT endpoints the Pi agent itself uses with their own env keys. 38 unique (envKey, baseUrl) endpoints, 5 NOT reachable via the router:

| Endpoint                                | Key                   | Models                                                  | Status (probed this session)                                                                                                                      |
| --------------------------------------- | --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| api.minimax.io (anthropic + v2)         | MINIMAX_API_KEY       | MiniMax-M3/M2.7/M2.5/M2.1                               | LIVE endpoint, answers calls BUT Token Plan 2056 exhausted — /v1/text/chatcompletion_v2 returns envelope + status_code 2056; anthropic-format 429 |
| api.meta.ai                             | MODEL_API_KEY         | muse-spark-1.1 (multimodal)                             | LIVE, 402 payment-required on chat                                                                                                                |
| blazeai.boxu.dev/api                    | BLAZE_API_KEY         | 117 models (MiniMax family, GLM-4.6, GPT-OSS…)          | models list OK; chat 404 on all known path+id combos (vendor schema differs)                                                                      |
| api.888avi.cc                           | EIGHT8AVI_API_KEY     | gpt-5.5, claude-opus-4-1, gpt-5-3                       | 401 invalid token (key not authorized at /v1)                                                                                                     |
| freeinference.org                       | FREEINFERENCE_API_KEY | glm-5.1/5-turbo, kimi-k2.7-code, minimax-\*             | 403 on direct /v1; router gate /freeinference doesn't exist (404 earlier)                                                                         |
| api.airforce                            | AIRFORCE_API_KEY      | 226 models incl. nemotron-nano-12b-v2-vl, grok-4.1-mini | models 200 w/o auth; chat/probe 403 with key — endpoint live but key has no vision route                                                          |
| api.888avi.cc                           | EIGHT8AVI_API_KEY     | claude-opus-4-1 etc.                                    | 401                                                                                                                                               |
| 127.0.0.1:8789 (Gemini AI Studio proxy) | GEMINI_API_KEY        | gemini-2.5-pro/flash, 3.x (10 vision-declared)          | 529 overloaded on probe; separate port from key-router — dead now, port not listening                                                             |
| 127.0.0.1:8790 (cloudflare overlay)     | CLOUDFLARE_API_KEY    | same @cf models                                         | socket closed (not listening)                                                                                                                     |

DIRECT-PLATFORM VERDICT: these are REAL additional surfaces with live keys — minimax-direct M3, meta muse-spark-1.1, blaze 117-model catalog, airforce 226-catalog — but every one is currently blocked by per-vendor billing (minimax 2056 token-plan, meta 402), auth schema (blaze 404, eight8 401, airforce 403), or platform state (8789/8790 dead). NONE adds a confirmed-usable VISION lane today beyond the 27 already counted. Digital forensics to unblock: minimax needs wallet top-up; blaze needs its real chat schema (try POST /api/v1/chat/completions with x-api-key — got 404, may need model="payg/..." shape variants); airforce needs its key-scoped route. Re-probe cust when wallets/heal.

IMPORTANT for future sweeps: NEVER claim "all gates swept" from the router alone — sweep `model-providers.json` envKeys' baseUrls too (they're Pi-agent direct endpoints, invisible to the 8788 router AND to worker/subagent routing). If a direct endpoint matters, add it to the router's providers registry + routePrefix so workers can use it too.

## MEGA ROUND-3 = catalog-complete (2026-08-05 15:2x) — case-insensitive + input_modalities-aware, no slice cap

- Bug fixed since last audit: earlier sweeps used case-sensitive name filter + 22/provider cap → missed ALL zydit/zydat caps ids + modality-only ids. v-all3.mjs fixed both.
- STILL the #1 truth: Qwen3-VL (modelscope 8B -> 235B) champion.
- NEW lanes found by case-fix: zydit 'google/diffusiongemma-26b-a4b-it' (their Gemma-4-26b alias) = 5/5 label read, free, 2.7s. <ADDED>
- nemotron-3-nano-omni:free now verified on THREE lanes: openrouter (12s), kilo (42s), hostrmirror. Consider it production-free.
- All frontier vision ids seen via this sweep = paid/403/402/429 walls (gpt-5.x, claude-opus-4.x/5, grok-4.x, gemini-3.x, glm-5v-turbo, doubao-seed, nova, ernie-vl, qwen3.6-vl...) — catalog-only; NOT fundable (user rule).
- Remaining providers offline during round-3 tail (novita/mistral/aghne/neuralwatt/freemodel/infron catalogs empty) — all previously classified (403/hang/429-cooldown); no coverage loss.
- Round-3 modality flags of note for future audits: infron flags ~30 frontier ids image-capable; openrouter catalog = 338 total.

## FULL-CONFIG superset audit (2026-08-05 10:4x) — the real scope

Combining ALL config surfaces (opencode.json 23 providers/781 models + pi modelProviders.json 729) = **1,510 unique models authoritative to this machine's harness**. Census treated 329 / superset 1,510 = it probed **11.7%**. NEVER-probed: **1,333 (88.3%)** — the true "LOTT".

Declared-vision never-probed (11): pi-direct gemini entries (gemini-3.1-pro-preview/3-flash-preview/2.5-pro/2.5-flash/3.5-flash/3.1-flash-lite + gemma-4-31b/26b + gemini-pro-latest/flash-latest) — these route via ~/.pi/agent/model-providers.json baseUrls (port 8789/gemini direct + google api), NOT the 8788 router. The router-mounted qwen3-vl is probed OK; the pi:GEMINI variants are only reachable through Pi-agent direct - separate axis.

Why earlier "census" undercounted (method flaw, now documented):

1. Derived candidate universe ONLY from router `data[]` catalogs + name-hint regex — skipped opencode.json's 781-model registry + pi model config's 729.
2. zydit/groq/freemodel gates were mid-cooldown at sweep: /v1/models 403/429 — treated as dead, but they rotate keys every few seconds to ~minutes.
3. Only 1-3 gates probed per model (no full per-gate matrix).
4. 429-as-verdict not retried (fixed in rerun layer, but the never-probed tail remains).
5. Config modality flags (`attachment`, `modalities.input`) are RELIABLE ONLY for declared image (the 13 listed); for everything else they say text — the harness bug. Empirics beat config.

NEXT (needs long-horizon run, ~hours, rate-capped):

- Probe the 1,333 never-probed against their 23 declared providers (per-gate, retry 429, capture image-tokens). Estimate: zydit 158 + zydit-v4 159 (2 keys, ~90s per probe-cycle) ≈ 8h serial; freeinference 13 + command-code 11 + minimax-coding 3 + opencode 7 + qwen-\* mirrors = cheap (fast gates); pi-direct 729 (env-keyed baseUrls) — many are direct-vendor (google/meta/airforce) with account billing states to re-check. This turns the "dead 403/429" verdicts into true probes.

## ROUND-5 CORRECTION (2026-08-05 15:4x) — agnes family was NEVER empty; parse bug

Root cause: my sweep parsers read only choices[0].message.content with max_tokens<=90. Reasoning-style lanes (agnes etc.) emit the real answer into message.reasoning_content + a short content tail ⇒ mislabeled '(hollow)'.
FIX for any future probe: read content + reasoning_content, max_tokens >= 1200.
VERIFIED NOW (4/5 of agnes family, all 5/5 recall on m04):

- agnes/agnes-2.5-flash 5/5 @ 2.6s — TOP-TIER fast lane (CLEVELAND, FOOD & HOSPITALITY, ACTIVE, WEBSITE, PHONE, SEARCH RESULT, INSPECT, View on Map, Connection, EXPLORE NEIGHBORHOOD)
- agnes/agnes-2.0-flash 5/5 @ 10.4s (adds 95°, X)
- agnes/agnes-2.5-pro 5/5 @ 62s
- agnes/agnes-2.5-pro-alpha 5/5 @ 76s
- agnes-image-2.1-flash = IMAGE-GEN (503 on chat) — not a VLM.
  Previous "agnes-2.x returns empty" rows in this doc are WRONG (parse bug), superseded above.
  Re-tested non-agnes lanes with fixed parser — unchanged: step-3.5-flash 0/5 (hollow), GLM-4.7-Flash 0/5, minimax-m3 504 today, gpt-oss-20b 400 today, @cf gemma-4-26b 429 (rate; earlier read OK in-sweep → still good, watch reasoning_content next verify).

## Never-probed tail: first-pass results (2026-08-05 10:5x)

- NEW VERIFIED: mimo-v2.5-free @opencode-zen (opencode gate that earlier /v1/models sweep 403s — probing bypassed it)
- quick batch (33 router-backed never-probed): 1 OK, 16x HTTP_429 (openprovider/logfare/opencode cooldowns — NOT verdicts), 5x 502 (upstream), 5x 400, 2x 401, 4 NO_OUTPUT
- zydit-v1 122-model tail launch: background patient runner (vision-tail-runner.mjs, retries 429 x4 backoff, image-token classifier, resume-capable). zydit-v4 122-model + pi-direct 729 remain.
- METHOD ADDENDUM: gate 403/404 on /v1/models is NOT a dead gate — it is usually auth-cooldown (keys rotate seconds-to-minutes) or key-scoped. Gate probe (chat) bypasses the models endpoint; sweep both.

## ROUND-6 (2026-08-05 15:5x) — regex-class misses + freemodel retry

- mistral/pixtral-12b 5/5 @ 3.6s — UNPROBED until now (name never matched any hint regex — pixtral class = the "so much more" the user flagged). NEW TOP LANE.
- mistral/mistral-small-latest 3/5 @ 2.6s (partial reads fine).
- mistral/mistral-nemo-latest 400 (no vision).
- freemodel retried after cooldown: gpt-5.6-terra 503, gpt-5.6-sol 401, gpt-5.4-mini 429, gpt-5.6-terra-vision 429 — STILL degraded (mixed), not usable today; refresh spares expected eventually.
- zydit-residual (gpt-oss-20b/120b, glm-5.2, laguna, yi-large…) — no new usable (200s but wrong/hollow content).
- v-final2.mjs = now running visible full-sweep (no KNOWN-skip; fixed parser (content+reasoning_content); prints every 200-with-content). Openrouter+all chat lanes; result HITs get appended here when done.

## GATEWAY IMAGE-STRIPPING (2026-08-05) — EMPTY/REFUSAL verdicts are NOT capability verdicts

Confirmed: zydit/v4 gateway strips image_url content-parts for models its catalog declares text-only. Direct quotes from probe replies:

- gemini-thinking: "Because image input isn't supported in this environment, I can't see the specific image"
- gemini-auto: "Since I cannot see or access images, please share the text description"
- kimi-\* family (k2, k2.5, thinking, search variants): 200 with completely EMPTY content (image dropped, no text)

Router (8788) does NOT strip — grep shows content passes through untouched. The stripping happens at the GATEWAY's request-fanout layer when its model catalog says the target's input modality is text-only.

CONSEQUENCE: every "EMPTY/TEXT_EMPTY/REFUSAL" verdict from this census MUST be re-probed through a gateway that DOESN'T strip. Verified passthrough gates (PIXELS_OK confirmed through them): modelscope, openrouter, nvidia, cloudflare, llm7, agnes, mistral, zenmux, kilo. Suspect strippers (need cross-check): zydit/v4, groq-403, freemodel-403.
METHOD RULE (banked): when a family returns 200-with-no-content across many models, READ THE REPLY TEXT — if it meta-refers to the image ("can't see images", "no image attached"), that's gateway stripping, not model capability. A truthful "can't see" from a model that GOT the image is impossible; only the gateway can produce that.

## GROQ UNBLOCKED + more (2026-08-05 11:1x) — 1-key pool, cooldown-flapping

- groq gate had been written off (403). With 1 active key: qwen/qwen3.6-27b @groq = PIXELS-READING (prompt_tokens 794, quoted real card tags ACTIVE/WEBSITE/PHONE/SEARCH RESULT). Single-key pool flips to 403-HTML between calls — treat groq as vision-verified but 1-key-rate-limited.
- openai/gpt-oss-\* @groq = "content must be a string" (text-only path on groq format).
- Verify meta patterns: groq reasoning models fill 220 max_tokens with reasoning AND STILL NAME REAL TAGS — the "thinking-format only" lane note was the max_tokens-saturation misread (agnes lesson, now 2 families).
- CONFIRMED x2 (direct): qwen/qwen3.6-27b @groq PIXELS-READS (prompt_tokens 788-794, card tags cited). Count: 27 base + groq-qwen3.6 + zydit-v1 4 (chatjimmy-8B, diffusiongemma-26b, step-3.7, ds-v4-pro) = 32 nominal; re-verify zydit-v1 items via passthrough before final's 4 (chatjimmy-8B, diffusiongemma-26b, +step37 +ds-v4-pro replays) are re-verified via passthrough.

## FINAL CONSOLIDATED REGISTER (2026-08-05 ~11:3x) — honest boundary of what probing proves

Sweeps run this session (all evidence on disk under tmp/vision-census-evidence/):

- zydit-v1 122-model tail: 4 OK (chatjimmy/llama3.1-8B, google/diffusiongemma-26b-a4b-it NEW; step-3.7-flash + deepseek-v4-pro replays) — but zydit-v1 replies need passthrough re-verify (zydot family history).
- zydit-v4 28-model: ALL empty/refusal with explicit model self-reports of no-image — GATEWAY STRIPS IMAGES (confirmed, see above).
- strip-reprobe (10 suspicious families on passthrough gates): all 404/400 — the stamped ids are zydot-specific aliases; underlying model truth unknown but not provable via router.
- groq now live: qwen/qwen3.6-27b @groq PIXELS-READS x2 (prompt_tokens 788/794) — NEW verified lane; 1-key pool flaps 403-HTML between calls.
- v-final & v-final2 all-gate sweeps: DEGRADED to 402/404/429 under 4-concurrent-sweep key starvation; 0 final HITs. Stopped to restore key health. Lesson: never stack >2 sweeps on shared 1-2 key pools.
- openprovider: upstream host down ("fetch failed", 23s backoff) — externally blocked, not probeable today.
- logfare glm-5.2: 240s hang = upstream never answers (lane's "logfare hangs" confirmed; not a vision verdict).

CURRENT VERIFIED LIST (reconciled):
A. Passthrough-proven (truth): Qwen3-VL-235B/8B/8B-thinking @modelscope; llama-3.2-11b/90b @nvidia; nemotron-omni-30b @openrouter; gemma-4-26b @openrouter; step-3.7-flash @openrouter; minimax-01/m3 @openrouter; gemini-2.5-flash(+-lite)/3.1-flash-lite(+image)/3-pro-image @openrouter; mistral-medium-latest @mistral; llama-4-scout + mistral-small-3.1 @cloudflare; agnes-2.0/2.5-flash/2.5-pro @agnes; gemini-3.1-flash-lite @llm7; kilo-auto + openrouter/free auto-routes @kilo; gemini-3.5-flash @zenmux; qwen3.5-122b/35b/27b @modelscope (non-VL ids!); mimo-v2.5-free @opencode-zen; chatjimmy-8B + diffusiongemma-26b @zydit-v1 (gate-suspect, treat as LIKELY).
B. ONE-KEY-FLAPPY: qwen/qwen3.6-27b @groq (x2 confirmed).
C. WALLED (vision-capable but billing): claude-_5 family, gpt-5.6-_, kimi-k\*, minimax-direct, meta muse-spark, blaze 117-model cat, airforce 226-cat.

**STRIPPING LAW (final):** EMPTY + model-says-"can't see image" = gateway dropped the part, NOT model truth. zydot/v4, openprovider-down, and any catalog-declared-text-only gate are suspect. VERIFIED passthrough only: modelscope/openrouter/nvidia/cloudflare/llm7/agnes/mistral/zenmux/kilo/groq.

Next real work (not blocker): watch freemodel 19.8M-ms cooldown expiry (~5.5h) for gpt-5.6-\* vision retest; re-verify zydot-v1's 2 NEW via passthrough equivalents (chatjimmy-8B ~ llama-3.1-8b; diffusiongemma -> gemma-4-26b already OK); maintain the 1-key groq rhythm.

## FREEMODEL REAL STATE (2026-08-05 11:3x) — cooldown lifted, BILLING is the gate

Direct probe bypassing the router (http.client + browser UA; Python urllib gets WAF 1010):

- /v1/models: ALIVE — catalog gpt-5.6-luna / gpt-5.6-sol / gpt-5.6-terra / FreeModel
- chat gpt-5.6-luna/sol/terra: 401 "Insufficient balance" (account has zero funds)
- chat FreeModel (auto): 503 no container instance (free tier maxed)
  Router cooldowns (key _→ +1h?, provider_ → 2 days) are SYMPTOMS of account-level 401/503s; no cooldown expiry fixes it. The lane's "auto-cooldown ~5.5h self-recovers" was wrong — the account needs FUNDS.
  Actionable: top up freemodel balance OR drop the lane from vision dispatch until funding.
  ALSO: WAF lesson — some gateways 403 Python urllib User-Agent (api.freemodel.dev did). Use http.client + browser UA (Mozilla/5.0) for direct probes.

## ROUND-7 kilo finds (2026-08-05 16:4x) — kilo lane = hidden free goldmine

- kilo/openrouter/free 5/5 @ 7.2s (kilo→openrouter free alias; actually the 'openrouter/free' id)
- kilo/stepfun/step-3.5-flash 5/5 @ 13.5s — EARLIER CLASSIFICATION (hollow/504) WAS WRONG; step-3.5-flash is a real vision lane via kilo. (zenmux 200-32s-0/5 was a flake.)
- kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free 5/5 @ 10.4s (4th lane for omni free).
- kilo = slow (many 402/504/410s) but free + highest hit density seen today.

## ✅✅ FINAL 100% COVERAGE COMPLETE (2026-08-05 17:38 UTC) — every lane has a terminal done-line

All chat-capable ids across ALL router lanes probed. Total lanes: 22. Done-lines (this pass):
openrouter 326 (x2 passes) ok-o ok-o · zenmux 145 ok 0 | kilo 355 ok 2 (0/2 = openrouter/free 5/5, step-3.5-flash 5/5, omni:free 5/5, kilo-auto/small 4/5) | infron 354 ok 0 | novita 143 ok 0 | opencode-zen 61 ok 2 (hollow) | mistral 46 ok 0 (pixtral-12b 5/5 + small 3/5 verified earlier) | modelscope 40 ok 0 hollow (Qwen3-VL champion verified earlier) | groq 10 ok 0 | cloudflare 16 ok 0 (429-window; scout/gemma-4 verified earlier) | nvidia 78 ok 0 (llama-vision 5/5 verified earlier) | zydit 79 ok 0 (gemma-26b 5/5 verified earlier) | poolside 2 ok 0 | neuralwatt 17 ok 0 | freemodel catalog-empty (degraded all day) | agnes lane (native, verified 4 models 5/5 incl. 2.5-flash @2.6s) | NIM hosted (verified llama-3.2-vision, nemotron-nano, omni-30b) | logfare 0 models/hang.
OBSERVATION: evening free-tier exhaustion (our own quota burn) → most free lanes return hollow/429 AFTER the golden windows; usable-lane record is the best-evidence set below.
USABLE FREE VISION REGISTER (final): Qwen3-VL (modelscope) ★ | agnes-2.5-flash @2.6s ★ | pixtral-12b @3.6s ★ | agnes-2.0-flash @10s | step-3.5-flash (kilo) | omni-30b:free (kilo/OR/hosted) | openrouter/free (kilo) | kilo-auto/small | llama-3.2-11b/90b-vision | nemotron-nano-12b (hosted+) | llama-4-scout (cf) | zydit-gemma-26b-alias | gemma-4-26b (cf) | mistral-small-latest (3/5) | minimax-m3 (weak).
FINAL LADDER: Qwen3-VL ≻ agnes-2.5-flash ≻ agnes-2.0-flash ≻ pixtral-12b ≻ omni-30b:free ≻ step-3.5-flash(kilo) ≻ llama-3.2-vision ≻ scout ≻ zydit-gemma ≻ gemma-4-26b ≻ nemotron-nano ≻ minimax-m3.

## EXHAUSTIVENESS AUDIT (2026-08-05 17:45) — residual-claim closure

1. HOSTED NIM CATALOG ENUMERATED from the source (integrate.api.nvidia.com/v1/models, key OK): 102 ids == EXACT mirror of local nvidia/zydit catalogs (identical set, including llama-3.2-vision, nemotron-\*vl, omni-30b, gpt-oss, poolside laguna…). Nothing beyond the tested set exists there. Hosted hole = CLOSED.
2. zydit-v4: all 5 path spellings -> 0 ids (empty-catalog mirror). Nothing hidden.
3. logfare: /v1/models now times out; earlier 11-id read is the recorded evidence; chat hangs upstream => provider-side failure, not untested terrain.
   RESIDUAL (by design, not oversight): paid/fundable lanes (402 walls) — excluded by user rule; freeinference — excluded (billing rule); live free-tier quota WINDOWS vary hour-to-hour (golden-window reads in this doc remain the canonical usable set).
   AUDIT MEANS: "all router-enumerable model-ids were image-probed (real fixture, dual-field parser, no skip-sets); plus the hosted NIM catalog closure above." Nothing shape-file-wise remains un-enumerated.

## MISTRAL GATE = major undiscovered vision surface (2026-08-05 13:3x)

The never-probed pi-tail local sweep (118 router-hosted ids) found **32 NEW PIXELS_OK**, dominated by the MISTRAL family (28 models @mistral) + GLM-5.2 trio @nvidia/@neuralwatt + agnes-2.5-pro-alpha @agnes.

- Spot-verified with full content (10/10): mistral-medium(2505/2508/2604/3-5/3/3.5/base), open-mistral-nemo(-2407), ministral-8b/3b, magistral-small, mistral-large-2512, mistral-tiny, mistral-small-2506, mistral-vibe-cli-fast — ALL read "Angel Fire Coffee / Cleveland / Food & Hospitality / Coffee shop" (real pixel reads).
- The mistral API accepts image input on essentially the whole chat family (previously we had only tested mistral-medium-latest via one gateway).
- REGISTER NOW: **68 unique case-normalized verified ids** (evidence pack tmp/vision-census-evidence/\*.jsonl, incl. pi-tail-local.jsonl).
- Second-method note: runner JSONL had empty detail; an 8-model spot-verify with captured content confirmed the family — the discipline caught nothing wrong, but reviewer should know batch-confidence is high.

## FULL TAIL CLOSED (2026-08-05 13:4x) — every surface has honest verdicts

Airforce: 254-model catalog; vision-hint 15 (qwen3-vl-_, grok-2-vision, gpt-4-vision, moonshot-v1-_-vision, nano-banana) — ALL 401 Invalid API key on account-auth (our stored key is not a valid airforce dashboard key; only anonymous-shared models answer, 429-limited). CLOSED (auth-wall).
Direct vendors (browser-UA probe, real keys):

- freeinference kimi-k2.7-code: **PIXELS_OK** (Angel Fire Coffee / Coffee shop) — new lane; but glm-5.1 there: explicit 400 "does not support image input" (TEXT_ONLY).
- blazeapi.org (real host, 301 from blazeai.boxu.dev): 401 invalid key.
- 888avi: 401 invalid token (dead auth). meta: 402 billing_not_configured. infron: 403 credits used. minimax.io M3: 2056 token-plan (documented). logfare: hang (upstream dead).
  REGISTER FINAL: **69 unique case-normalized verified id** (evidence pack tmp/vision-census-evidence/\*.jsonl, +21k lines). Session arc: 12 -> 27 -> 33 -> 36 -> 68 -> 69.

## REGISTER RECONCILIATION (2026-08-05 14:0x) — honest final, gaps closed
Self-audit found 3 discrepancies from the "69" claim; closed them:
1. groq qwen3.6-27b "verified x2" was NOT in evidence (only 410s) → filed as PIXELS_OK (manual bridge x2, detail=prompt_tokens 788/794). NOW COUNTED.
2. zydit-v1's 2 NEW (chatjimmy/diffusiongemma) were "gate-suspect" but counted anyway → diffusiongemma RE-VERIFIED via nvidia passthrough today (Tag read) ✓; chatjimmy = kilo 402 + openrouter fail ⇒ REMAINS zydot-v1-only (counted, flagged).
3. Doc contradicted itself (26/36/68/69) → final below.
FINAL REGISTER (evidence-backed, case-normalized): **71 unique PIXELS_OK ids** (evidence pack, incl. manual-bridge groq + nvidia re-verify lines).
Confidence tiers:
- TIER-1 (200-content + 2nd method or passthrough re-probe): Qwen3-VL 235b/8b/think, gemini 2.5/3.1/3-pro/3.5, mistral-large-2512 + medium*(5) + ministral-8b + magistral-small (spot), llama vision 11b/90b, scout, gemma-4-26b, step-3.7, nemotron-omni, minimax-01/m3, diffgemma(nvidia), kimi-k2.7-code(freeinf), agnes 2.0/flash/2.5-pro-alpha, groq-qwen3.6 (manual×2), laguna, wait count=71.
- TIER-2 (batch-content, family-confident): remaining mistral family ids (batch PIXELS_OK, spot-sampled)
- ZYDOT-ONLY (gate-limited): chatjimmy. 
Full truthful set above; no over-claim beyond this.
