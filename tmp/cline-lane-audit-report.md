# Cline Free Lane Audit — shim (tmp/cline-shim.mjs) vs docs (docs/free-lane-notes.md)

## Shim facts
- Spawn bin: process.env.CLINE_BIN || C:/Users/HP/AppData/Roaming/npm/node_modules/cline/node_modules/@cline/cli-windows-x64/bin/cline.exe (cline-shim.mjs:40). CLINE_BIN override wins.
- Arg order: -P cline -m <model> --json [--thinking <effort>] -p <prompt> (41-45); --thinking inserted only when effort is truthy, before -p.
- Effort map (16-23), 4 models: cline-free/glm-5.2 -> xhigh; deepseek/deepseek-v4-flash -> xhigh; poolside/laguna-s-2.1:free -> null (omits --thinking); stepfun/step-3.7-flash -> high.
- Models list: exactly the 4 above (context 1M/1M/300k/256k; vision true ONLY for step-3.7-flash).
- GET /v1/models (87-89): data = MODELS.map(m => ({id, object:model, owned_by:cline-free})) — reflects all 4 ids accurately.
- Chat response (106-113): standard chat.completion; content=r.text; usage.prompt_tokens=r.inputTokens||0, completion_tokens hardcoded 0.
- Model-not-found -> 404 (93-97); missing model defaults to MODELS[0] (glm-5.2). Timeout (50): maxTokens>4000 ? 300s : 120s.

## Doc vs code
1. Doc:11/13 call step-3.7-flash VISION-capable and VISION-LANE-OK — code sets vision:true, BUT extractText (25-36) lifts only text parts (line 32 .filter text) and drops image parts (line 26 comment: ignore image parts, later pass images...). The shim NEVER sends images to cline; a multimodal request silently degrades to text. The vision claim does not hold through THIS shim (PIXELS-verified at openrouter is a different route).
2. Everything else the doc says about the shim matches: spawn path + CLINE_BIN override (doc 14-16 == line 40); reasoning-effort map (doc 81-85 == 16-23); 4 models (doc 7 == MODELS); command shape (doc 6 == 41-45).
3. Doc omits: response usage.completion_tokens is always 0; timeout is fixed-length (2min/5min) and unmarked; stderr is merged into stdout.

## Bugs/risks
1. **Vision flag is cosmetic** — extractText strips image parts (31-33), so the only vision model serves text-only; callers told it is vision-capable lose image content (doc overstates).
2. **Timeout can hang the request** — line 50 child.kill() does not itself resolve; resolution relies on close. If the Windows child ignores the kill / close never fires, the HTTP request never returns (no second timer, no timeout flag/branch). A killed-with-partial-text run returns code!==0 with text set -> passes the 101 gate -> 200 with partial content.
3. **Usage/error hygiene** — completion_tokens hardcoded 0 (112) is misleading; let cost = 0 (57) is dead; stderr is appended into out (48-49) so non-JSON cline logs mix into the parse stream (try/catch-masked).

## OK
- Spawn path + CLINE_BIN override exactly as doc (40).
- Effort map matches doc verbatim (xhigh / xhigh / omit / high) (16-23 vs 81-85).
- 4 models; ids match doc dispatch refs (46).
- /v1/models returns the 4 models with correct ids (88).
- Model-not-found -> 404 handled cleanly (93-97); unknown model is never forwarded to cline.
- Response envelope is a valid OpenAI chat.completion shape (106-113).
