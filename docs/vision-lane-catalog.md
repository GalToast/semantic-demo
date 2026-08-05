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

## Exhaustive bridge census v3 (2026-08-05) — 27 verified families (real pixel probes)

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
