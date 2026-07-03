#!/usr/bin/env bash
# scripts/agnes-chat.sh — Direct agnes-2.0-flash chat via the local proxy.
#
# Why this exists (2026-07-02/03):
#   The Pi harness `external_subagent_start` tool always prefixes bare model
#   refs with `router-opencode-zen/`. The OpenCode Zen router does NOT have
#   `agnes-2.0-flash`, so chat completion 401s and the worker goes silent
#   (PID alive, no assistant output). Same problem with `mmx_text_chat` and
#   `claude_minimax_start` — they all share the same routing layer.
#
#   The local Pi proxy at `127.0.0.1:8788/agnes/v1` fronts
#   `https://apihub.agnes-ai.com/v1` (AGNES_AI_BASE_URL) with `live=2` keys
#   and works perfectly via direct HTTP. This script is the bypass.
#
# Usage:
#   ./scripts/agnes-chat.sh 'What is 2+2?'
#   echo '{"model":"agnes-2.0-flash","max_tokens":50,"messages":[...]}' | ./scripts/agnes-chat.sh --stdin
#
# Env:
#   AGNES_AI_API_KEY          Bearer token. Defaults to env, otherwise reads from
#                             ~/.pi/agent/.qwen settings.

set -euo pipefail

# Resolve AGNES_AI_API_KEY from env or from ~/.qwen/settings.json.
if [[ -z "${AGNES_AI_API_KEY:-}" && -f "$HOME/.qwen/settings.json" ]]; then
    SETTINGS_PATH=$(cygpath -w "$HOME/.qwen/settings.json" 2>/dev/null || echo "$HOME/.qwen/settings.json")
    AGNES_AI_API_KEY=$(node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(s.env?.AGNES_AI_API_KEY || s.env?.AGNES_AI_API_KEY_2 || '')" "$SETTINGS_PATH")
    export AGNES_AI_API_KEY
fi

if [[ -z "${AGNES_AI_API_KEY:-}" ]]; then
    echo "AGNES_AI_API_KEY not set; export it or set up ~/.qwen/settings.json." >&2
    exit 1
fi

PROXY="${AGNES_PROXY:-http://127.0.0.1:8788/agnes/v1}"

# Build the payload. Two modes:
#   1. Default: build a simple chat request from the prompt arg.
#   2. --stdin: read a full JSON payload from stdin.
PAYLOAD=""
if [[ "${1:-}" == "--stdin" ]]; then
    PAYLOAD=$(cat)
else
    PROMPT="${1:?usage: agnes-chat.sh 'prompt' OR echo '{...}' | agnes-chat.sh --stdin}"
    PAYLOAD=$(printf '%s' "$PROMPT" | node -e '
        let s="";
        process.stdin.on("data",c=>s+=c);
        process.stdin.on("end",()=>{
            console.log(JSON.stringify({
                model: "agnes-2.0-flash",
                messages: [{role:"user",content:s}],
                max_tokens: 1024,
                temperature: 0.2
            }));
        });
    ')
fi

# Issue the request. Extract the assistant content cleanly.
RESPONSE=$(curl -sS "$PROXY/chat/completions" \
    -H "Authorization: Bearer $AGNES_AI_API_KEY" \
    -H "Content-Type: application/json" \
    --max-time 120 \
    --data "$PAYLOAD")

# Pipe through node so we don't depend on `jq`.
echo "$RESPONSE" | node -e '
    let s="";
    process.stdin.on("data",c=>s+=c);
    process.stdin.on("end",()=>{
        try {
            const r = JSON.parse(s);
            if (r.error) { console.error("[agnes error]", r.error.message || r.error); process.exit(1); }
            const msg = r.choices?.[0]?.message?.content ?? "";
            process.stdout.write(msg);
        } catch (e) {
            console.error("[agnes parse error]", e.message);
            console.error(s.slice(0, 500));
            process.exit(2);
        }
    });
'
