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
USABLE: llama-3.2-11b-vision (local 2.4s / hosted), llama-3.2-90b-vision (11s), nemotron-3-nano-omni-30b-a3b-reasoning (HOSTED 53s — full reads), nemotron-nano-12b-v2-vl (hosted 2.4s; ghost locally), minimax-m3 (weak). HOSTED = https://integrate.api.nvidia.com/v1/chat/completions (key OK).
DEAD/ghost: phi-4-multimodal (EOL 0715), llama-4-maverick (EOL), fuyu-8b, deplot, gemma-3-12b/3-4b, gemma-4-31b (blocked), kosmos-2, phi-3-vision, phi-3.5-moe, kimi-k2.6, cosmos-reason2, neva-22b, vila (all 404 Function-not-for-account), nemotron-nano-vl-8b (500), mistral-medium-3.5 (net err).
Web-LADDER update: this does NOT change the top (Qwen3-VL still #1) — omni-30b joins as a slower feasible alternative (53s).
