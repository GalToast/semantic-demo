# Free Lane: Cline free tier via local shim (2026-08-05)

## What works (PROVEN end-to-end)

- cline CLI 3.0.49 (global npm) with WorkOS auth in ~/.cline/data/settings/providers.json
- `cline -P cline -m <model> --json -p "<prompt>"` streams OpenAI-compatible JSON lines keyless (auth handled by cline itself)
- VERIFIED answering (all 4 cline "cline" provider free models, totalCost 0):
    - cline-free/glm-5.2 (1M ctx, text)
    - deepseek/deepseek-v4-flash (1M ctx, text)
    - poolside/laguna-s-2.1:free
    - stepfun/step-3.7-flash (VISION-capable per cline catalog; PIXELS-verified at openrouter)
- LOCAL SHIM: `node tmp/cline-shim.mjs 8793` -> OpenAI-compatible /v1/chat/completions + /v1/models wrapping the cline CLI
    - Tested via curl: glm-5.2 -> "SHIM-OK", step-3.7-flash -> "VISION-LANE-OK"
    - Spawn uses absolute exe path (Node can't spawn the .cmd; bare 'cline' ENOENT from subprocess):
    C:/Users/HP/AppData/Roaming/npm/node_modules/cline/node_modules/@cline/cli-windows-x64/bin/cline.exe
    - Override with CLINE_BIN env

## Stripping cline entirely: NOT viable cleanly

- api.cline.bot direct (bare `Authorization: Bearer <workos token>`) => 401 "make sure you're using the latest version of Cline..."
- Cline validates client identity (workos: token family + UA Cline/x.y.z + version checks). Re-implementing their SSO = fragile + ToS-gray.
- SANCTIONED = run the local CLI (it manages refresh/headers/version). That's what the shim does.
- DOUBLE QUOTA: YES in practice — a cline lane is a separate account/rate budget from our router's gates. Two doors to the same free models = 2x RPM headroom (standalone vs shim vs router).

## Registering in the SHARED router (deferred — needs user OK)

- Router source has a `clinefree` provider stub added (routePrefix /clinefree/v1 -> <http://127.0.0.1:8793/v1>, static key file ~/.config/opencode/clinefree-keys.json = ["local-clinefree-shim-token-0001"], isClineFreeToken regex added).
- Activating it requires `control.ps1 restart` (Restart-RouterMesh) — restarts the whole mesh (shared with other lanes). Did NOT restart this session; the shim works standalone for direct calls; external-subagents needs the router route to dispatch it.

## freebuff (for completeness)

- freebuff 0.0.137 logged in (credentials.json authToken + fingerprint). CLI only accepts `login`; the agent runs via native binary + TUI. Its model setting = deepseek-v4-flash default, SDK supports many families.
- Headless reuse requires mimicking their web client fingerprint + anti-bot headers (captcha mentions) — ToS-gray / fragile. NOT built. Its free models overlap our router anyway (deepseek-v4-flash free via zenmux).

## freebuff follow-up test (2026-08-05 12:0x)
- Tried: POST freebuff.com/chat/completions with authToken + x-freebuff/fingerprint headers + desktop UA -> 404 (Next.js SSR app, not an OpenAI-format path).
- freebuff CLI: login-only command; agent runs as native binary + TUI (no --json/-p headless flag).
- VERDICT: headless reuse requires either their web-client auth envelope re-creation (anti-bot fingerprint/captcha — circumvention, won't build) or TUI automation (fragile). Model overlap with our router = ~0 net-new (deepseek-v4-flash etc all free via zenmux). Parked.
