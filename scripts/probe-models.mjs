// probe-models.mjs — minimal tool-calling capability probe via the key-router.
// For each (provider, model) target, sends a tiny chat/completions request with
// ONE function tool (get_weather) and a prompt that should trigger it. Both
// non-streaming and streaming. Captures: HTTP status, finish_reason,
// tool_calls emitted (yes/no), reasoning present, content length, latency.
//
// Usage:
//   node scripts/probe-models.mjs            # full target list
//   node scripts/probe-models.mjs logfare    # one provider
//   STATUSCO=1 node scripts/probe-models.mjs # only status codes (fastest)
//
// Sidesteps the MCP/SQLite external-subagent harness entirely — this is a
// direct HTTP probe so model capability is isolated from harness reliability.
import { performance } from 'node:perf_hooks'

const ROUTER = 'http://127.0.0.1:8788'
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 25000)
const SCHEME = process.env.STATUSCO ? 'status' : 'full'

const WEATHER_TOOL = {
    type: 'function',
    function: {
        name: 'get_weather',
        description: 'Get the current weather for a given city.',
        parameters: {
            type: 'object',
            properties: { city: { type: 'string', description: 'City name' } },
            required: ['city']
        }
    }
}

const PROMPT = 'What is the weather in Tokyo right now? Call the get_weather tool to find out, then tell me.'

function targets() {
    const t = {
        logfare: [
            { id: 'kiro-auto', note: 'baseline' },
            { id: 'minimax-m3', note: 'baseline' },
            { id: 'glm-5.2', note: 'known-workish' },
            { id: 'qwen-3.8-max', note: 'FIX TARGET (pre-restart)' },
            { id: 'kimi-k2.7-code', note: 'untested' },
            { id: 'kimi-k2.6', note: 'tested-slow' },
            { id: 'deepseek-v4-flash', note: 'untested' }
        ],
        kilo: [
            { id: 'meta/muse-spark-1.1', note: 'UNTESTED target' },
            { id: 'moonshotai/kimi-k3', note: 'untested' },
            { id: 'thinkingmachines/inkling', note: 'untested' },
            { id: 'poolside/laguna-s-2.1', note: 'free' },
            { id: 'google/gemini-3.6-flash', note: 'untested' },
            { id: 'google/gemini-3.5-flash-lite', note: 'untested' },
            { id: 'anthropic/claude-opus-5-fast', note: 'untested' },
            { id: 'stepfun/step-3.7-flash:free', note: 'untested' },
            { id: 'inclusionai/ling-3.0-flash:free', note: 'untested' },
            { id: 'minimax/minimax-m3', note: 'untested-on-kilo' }
        ],
        cloudflare: [
            { id: '@cf/openai/gpt-oss-20b', note: 'just-fixed' },
            { id: '@cf/openai/gpt-oss-120b', note: 'untested' },
            { id: '@cf/moonshotai/kimi-k2.6', note: 'just-fixed' },
            { id: '@cf/zai-org/glm-4.7-flash', note: 'untested' },
            { id: '@cf/nvidia/nemotron-3-120b-a12b', note: 'untested' },
            { id: '@cf/google/gemma-4-26b-a4b-it', note: 'untested' },
            { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', note: 'untested' },
            { id: '@cf/meta/llama-4-scout-17b-16e-instruct', note: 'untested' },
            { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', note: 'untested' },
            { id: '@cf/qwen/qwen3-30b-a3b-fp8', note: 'untested' },
            { id: '@cf/qwen/qwq-32b', note: 'untested' },
            { id: '@cf/qwen/qwen2.5-coder-32b-instruct', note: 'untested' },
            { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', note: 'untested' },
            { id: '@cf/ibm-granite/granite-4.0-h-micro', note: 'untested' },
            { id: '@cf/aisingapore/gemma-sea-lion-v4-27b-it', note: 'untested' }
        ],
        groq: [
            { id: 'llama-3.3-70b-versatile', note: 'untested' },
            { id: 'llama-3.1-8b-instant', note: 'untested' },
            { id: 'openai/gpt-oss-20b', note: 'untested' },
            { id: 'openai/gpt-oss-120b', note: 'untested' },
            { id: 'groq/compound', note: 'untested' },
            { id: 'groq/compound-mini', note: 'untested' },
            { id: 'qwen/qwen3.6-27b', note: 'untested' }
        ],
        openrouter: [
            { id: 'google/gemini-3.5-flash', note: 'untested' },
            { id: 'google/gemini-3.1-pro-preview', note: 'untested' },
            { id: 'google/gemma-4-31b-it', note: 'untested' },
            { id: 'openai/gpt-oss-120b', note: 'untested' },
            { id: 'openai/gpt-oss-20b', note: 'untested' }
        ],
        nvidia: [
            { id: 'minimaxai/minimax-m3', note: 'ok NS14941_ST11906' },
            { id: 'deepseek-ai/deepseek-v4-pro', note: 'ok NS5575_ST6747' }
            // removed qwen/qwen3.5-397b-a17b (410 retired), nvidia/nemotron-3-{super,ultra,nano}* (404 not found) — 2026-07-27 probe
        ],
        modelscope: [
            { id: 'Qwen/Qwen3-235B-A22B-Thinking-2507', note: 'ok NS1442_ST1710' },
            { id: 'deepseek-ai/DeepSeek-V4-Pro', note: 'ok' },
            { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', note: 'ok NS1046_ST1739' },
            { id: 'Qwen/Qwen3-VL-235B-A22B-Instruct', note: 'ok NS3150_ST3308' },
            { id: 'Qwen/Qwen3-VL-8B-Instruct', note: 'ok NS1031_ST1213' }
            // removed Qwen-Ambassador/Qwen3.7-Max (403 no access), MiniMax/MiniMax-{M2.7,M3} (400 no provider) — 2026-07-27 probe
        ],
        gemini: [
            { id: 'gemini-2.5-pro', note: 'ok ST2230 (NS quota 429)' },
            { id: 'gemini-2.5-flash', note: 'ok ST2534 (NS quota 429)' },
            { id: 'gemini-3-flash-preview', note: 'ok ST1897 (NS quota 429)' }
        ],
        'opencode-zen': [
            { id: 'mimo-v2.5-free', note: 'ok NS4846_ST2629' },
            { id: 'deepseek-v4-flash-free', note: 'ok NS1659_ST1804' },
            { id: 'nemotron-3-ultra-free', note: 'ok NS2624 (ST failed)' }
        ]
    }
    // filter logfare glm entry (typo guard) — rebuild clean
    t.logfare = t.logfare.filter((x) => x.id && x.id !== '')
    return t
}

function body(model, stream) {
    return {
        model,
        stream,
        max_tokens: 500,
        messages: [{ role: 'user', content: PROMPT }],
        tools: [WEATHER_TOOL],
        tool_choice: 'auto'
    }
}

function wait(ms, val, ac) {
    return new Promise((res, rej) => {
        const id = setTimeout(() => {
            ac.signal && ac.signal.removeEventListener('abort', onAbort)
            res(val)
        }, ms)
        function onAbort() {
            clearTimeout(id)
            rej(new Error('aborted'))
        }
        ac.signal && ac.signal.addEventListener('abort', onAbort)
    })
}

async function probeNonStream(provider, model) {
    const ac = new AbortController()
    const tmo = setTimeout(() => ac.abort(), TIMEOUT_MS)
    const t0 = performance.now()
    try {
        const res = await fetch(`${ROUTER}/${provider}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body(model, false)),
            signal: ac.signal
        })
        const latency = Math.round(performance.now() - t0)
        const text = await res.text()
        let j = null
        try {
            j = JSON.parse(text)
        } catch {
            j = null
        }
        return parseResult(model, res.status, latency, j, text, false)
    } catch (e) {
        return {
            model,
            mode: 'nonstream',
            ok: false,
            status: 0,
            error: e.name === 'AbortError' ? 'TIMEOUT' : String(e.message).slice(0, 80),
            latency: TIMEOUT_MS
        }
    } finally {
        clearTimeout(tmo)
    }
}

async function probeStream(provider, model) {
    const ac = new AbortController()
    const tmo = setTimeout(() => ac.abort(), TIMEOUT_MS)
    const t0 = performance.now()
    let chunks = 0,
        toolCallDelta = false,
        reasoningSeen = false,
        contentSeen = false,
        errMsg = '',
        finishReason = ''
    let anyData = false
    try {
        const res = await fetch(`${ROUTER}/${provider}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
            body: JSON.stringify(body(model, true)),
            signal: ac.signal
        })
        if (!res.ok || !res.body) {
            const latency = Math.round(performance.now() - t0)
            const t = res.body ? await res.text().catch(() => '') : ''
            return {
                model,
                mode: 'stream',
                ok: false,
                status: res.status,
                error: ('HTTP ' + res.status + ' ' + t.slice(0, 100)).slice(0, 110),
                latency
            }
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            anyData = true
            let idx
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx).trim()
                buffer = buffer.slice(idx + 1)
                if (!line.startsWith('data:')) continue
                const payload = line.slice(5).trim()
                if (payload === '[DONE]') continue
                chunks++
                let evt = null
                try {
                    evt = JSON.parse(payload)
                } catch {
                    errMsg = errMsg || 'bad-chunk:' + payload.slice(0, 60)
                    continue
                }
                if (evt.error) errMsg = String(evt.error.message || evt.error).slice(0, 100)
                const choice = evt.choices && evt.choices[0]
                const delta = choice && choice.delta
                if (delta) {
                    if (delta.tool_calls && delta.tool_calls.length) toolCallDelta = true
                    if (delta.reasoning_content || delta.reasoning) reasoningSeen = true
                    if (delta.content) contentSeen = true
                }
                if (choice && choice.finish_reason) finishReason = choice.finish_reason
            }
        }
        const latency = Math.round(performance.now() - t0)
        return {
            model,
            mode: 'stream',
            ok: !errMsg && chunks > 0,
            status: 200,
            latency,
            chunks,
            toolCallDelta,
            reasoningSeen,
            contentSeen,
            finishReason: finishReason || 'none',
            error: errMsg || (anyData ? '' : 'no-data')
        }
    } catch (e) {
        return {
            model,
            mode: 'stream',
            ok: false,
            status: 0,
            error: e.name === 'AbortError' ? 'TIMEOUT' : String(e.message).slice(0, 80),
            latency: TIMEOUT_MS
        }
    } finally {
        clearTimeout(tmo)
    }
}

function parseResult(model, status, latency, j, rawText, isStream) {
    if (!j) {
        return {
            model,
            mode: 'nonstream',
            ok: false,
            status,
            error: ('non-json: ' + rawText.slice(0, 120)).slice(0, 140),
            latency
        }
    }
    if (j.error) {
        return {
            model,
            mode: 'nonstream',
            ok: false,
            status,
            error: String(j.error.message || JSON.stringify(j.error)).slice(0, 110),
            latency
        }
    }
    const choice = j.choices && j.choices[0]
    const msg = choice && choice.message
    const toolCalls = msg && msg.tool_calls
    let toolOk = false,
        toolFn = '',
        toolArgs = ''
    if (Array.isArray(toolCalls) && toolCalls.length) {
        toolOk = true
        const tc = toolCalls[0]
        toolFn = (tc.function && tc.function.name) || tc.name || ''
        toolArgs = (tc.function && tc.function.arguments) || ''
    }
    const reasoning = msg && (msg.reasoning_content || msg.reasoning || '')
    return {
        model,
        mode: 'nonstream',
        ok: true,
        status,
        latency,
        finishReason: (choice && choice.finish_reason) || 'none',
        toolCall: toolOk,
        toolFn,
        toolArgs: toolArgs.slice(0, 60),
        reasoning: reasoning ? (typeof reasoning === 'string' ? reasoning.length : 1) : 0,
        contentLen: msg && msg.content ? String(msg.content).length : 0
    }
}

function summarize(r) {
    if (r.mode === 'nonstream') {
        if (!r.ok) return `${r.status || 'ERR'} ${r.error || ''}`
        const t = r.toolCall ? `TOOL:${r.toolFn}(${r.toolArgs})` : `text:${r.contentLen}c`
        const th = r.reasoning ? ` think${r.reasoning > 50 ? '+' : ''}` : ''
        return `ok ${r.latency}ms [${r.finishReason}] ${t}${th}`
    }
    if (!r.ok) return `${r.status || 'ERR'} ${r.error || ''}`
    const t = r.toolCallDelta ? 'TOOL' : r.contentSeen ? 'text' : r.reasoningSeen ? 'think-only' : 'empty'
    return `ok ${r.latency}ms ${r.chunks}ch [${r.finishReason}] ${t}${r.reasoningSeen ? '+think' : ''}`
}

async function main() {
    const all = targets()
    const providers = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(all)
    console.log(
        `=== model tool-calling probe (scheme=${SCHEME}, timeout=${TIMEOUT_MS}ms, providers=${providers.join(',')}) ===\n`
    )
    let passNon = 0,
        passStream = 0,
        tested = 0,
        toolCapable = 0
    for (const prov of providers) {
        if (!all[prov]) {
            console.log(`(unknown provider ${prov})`)
            continue
        }
        console.log(`── ${prov} ──`)
        for (const tgt of all[prov]) {
            tested++
            const ns = await probeNonStream(prov, tgt.id)
            const st = await probeStream(prov, tgt.id)
            if (ns.ok) passNon++
            if (st.ok) passStream++
            if (ns.toolCall || st.toolCallDelta) toolCapable++
            const tag = tgt.note ? ` (${tgt.note})` : ''
            console.log(`  ${tgt.id}${tag}`)
            console.log(`     NS: ${summarize(ns)}`)
            console.log(`     ST: ${summarize(st)}`)
        }
    }
    console.log(
        `\n=== SUMMARY: ${tested} models | nonstream ok=${passNon}/${tested} | stream ok=${passStream}/${tested} | tool-capable=${toolCapable}/${tested} ===`
    )
}

main().catch((e) => {
    console.error('probe fatal:', e)
    process.exit(1)
})
