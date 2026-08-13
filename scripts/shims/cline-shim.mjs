/* cline-shim.mjs — local OpenAI-compatible gateway over the Cline CLI free lane.
 * POST /v1/chat/completions  {model, messages, max_tokens} -> cline -P cline -m <model> --json -p <prompt>
 * GET  /v1/models -> the cline free-tier model list this shim exposes.
 *
 * Usage: node scripts/shims/cline-shim.mjs [port=8793]
 */
import http from 'node:http'
import { spawn } from 'node:child_process'

const PORT = Number(process.argv[2] || 8793)

// Only expose models that are currently free in Cline's catalog and have a
// usable route. Laguna is the verified default; DeepSeek remains cataloged but
// can be temporarily quota-limited by Cline's daily free allowance.
const MODELS = [
    {
        id: 'poolside/laguna-s-2.1:free',
        name: 'Laguna S 2.1 (free; verified)',
        context: 262144,
        maxTokens: 32768,
        vision: false,
        effort: null
    },
    {
        id: 'deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash (free; quota may be exhausted)',
        context: 1048576,
        maxTokens: 131072,
        vision: false,
        effort: 'xhigh'
    }
]

const EFFORT_BY_MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m.effort]))

function extractText(messages) {
    // Build the cline prompt from OpenAI message parts.
    // cline reads image FILES by path when referenced in the prompt (it loads them itself).
    // For image_url parts with a data: URI, the shim caller passed us a path via the message
    // text; for file:// or plain paths we pass through. If a data: URI appears (base64), we
    // note the image is attached but can't hand cline a live file path — best effort text.
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role !== 'user') continue
        if (typeof m.content === 'string') return m.content
        if (Array.isArray(m.content)) {
            const parts = []
            for (const p of m.content) {
                if (p.type === 'text') parts.push(p.text)
                else if (p.type === 'image_url') {
                    const url = String(p.image_url?.url || '')
                    if (url.startsWith('file://')) parts.push(url.slice('file://'.length))
                    else if (url.startsWith('data:')) parts.push('[image attached inline]')
                    else if (url.startsWith('http')) parts.push(url)
                }
            }
            return parts.join('\n')
        }
    }
    return ''
}

function callCline(model, prompt, maxTokens) {
    return new Promise((resolve) => {
        const clineBin =
            process.env.CLINE_BIN ||
            'C:/Users/HP/AppData/Roaming/npm/node_modules/cline/node_modules/@cline/cli-windows-x64/bin/cline.exe'
        const args = ['-P', 'cline', '-m', model, '--json', '--auto-approve', 'true']
        const effort = EFFORT_BY_MODEL[model]
        if (effort) args.push('--thinking', effort)
        // cline CLI wants the prompt as a POSITIONAL quoted arg, not -p
        // (verified: `-p <text>` → "Unknown command or unquoted prompt")
        args.push(prompt)
        const child = spawn(clineBin, args, {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PATH: process.env.PATH }
        })
        let stdout = ''
        let stderr = ''
        const t0 = Date.now()
        child.stdout.on('data', (d) => (stdout += d))
        child.stderr.on('data', (d) => (stderr += d))
        let timedOut = false
        const timer = setTimeout(
            () => {
                timedOut = true
                try {
                    child.kill()
                } catch {
                    /* already exited */
                }
            },
            Number(maxTokens > 4000 ? 300000 : 120000)
        )
        child.on('close', (code) => {
            clearTimeout(timer)
            // --json emits lines: agent_event (content_delta etc) + run_result at end
            const raw = `${stdout}\n${stderr}`
            const lines = raw
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
            let text = ''
            let inputTokens = 0
            let failure = ''
            const recordFailure = (value) => {
                if (!value) return
                if (typeof value === 'string') {
                    failure = failure || value
                    return
                }
                if (typeof value === 'object') {
                    const message = value.message || value.error || value.detail || value.type
                    if (message) failure = failure || String(message)
                }
            }
            for (const l of lines) {
                try {
                    const obj = JSON.parse(l)
                    const e = obj.event || {}
                    if (e.type === 'content_delta' && e.contentType === 'text') text += e.text || ''
                    if (e.type === 'content_start' && e.contentType === 'text') text += e.text || ''
                    if (obj.error || obj.errorMessage) recordFailure(obj.error || obj.errorMessage)
                    if (e.type === 'error' || e.error || e.errorMessage) recordFailure(e.error || e.errorMessage || e.message)
                    if (obj.type === 'usage' || obj.event?.type === 'usage' || e.type === 'usage') {
                        inputTokens = obj.inputTokens ?? e.inputTokens ?? inputTokens
                    }
                    if (obj.type === 'run_result') {
                        const usage = obj.usage || {}
                        inputTokens = usage.inputTokens || usage.totalInputTokens || inputTokens
                        const resultText = obj.text || obj.result || ''
                        if (typeof resultText === 'string') {
                            try {
                                const resultObject = JSON.parse(resultText)
                                if (resultObject?.error) recordFailure(resultObject.error)
                                else text = text || resultText
                            } catch {
                                text = text || resultText
                            }
                        } else {
                            text = text || resultText
                        }
                        if (obj.error || obj.errorMessage) recordFailure(obj.error || obj.errorMessage)
                    }
                } catch {
                    /* skip malformed line */
                }
            }
            // Some Cline failures arrive as a JSON-encoded run_result.text rather
            // than a structured error event. Never return that envelope as model text.
            if (text) {
                try {
                    const resultObject = JSON.parse(text)
                    if (resultObject?.error) {
                        recordFailure(resultObject.error)
                        text = ''
                    }
                } catch {
                    /* ordinary assistant text */
                }
            }
            resolve({
                text,
                ms: Date.now() - t0,
                code: code ?? (timedOut ? 124 : -1),
                inputTokens,
                failure,
                timedOut,
                raw: raw.slice(0, 8000)
            })
        })
        child.on('error', (error) =>
            resolve({ text: '', ms: Date.now() - t0, code: -1, inputTokens: 0, failure: error.message, timedOut: false, raw: error.stack || error.message })
        )
    })
}

function failureResponse(model, result) {
    const diagnostic = String(result.failure || result.raw || '').replace(/\s+/g, ' ').trim()
    const detail = diagnostic.slice(0, 500)
    if (result.timedOut) {
        return { status: 504, body: { error: { type: 'timeout_error', code: 'CLINE_TIMEOUT', message: `Cline timed out for ${model}` } } }
    }
    if (/429|daily free limit|inference_cap_error|rate limit|quota/i.test(diagnostic)) {
        return {
            status: 429,
            body: {
                error: {
                    type: 'rate_limit_error',
                    code: 'CLINE_FREE_QUOTA',
                    message: `Cline free quota is unavailable for ${model}${detail ? `: ${detail}` : ''}`
                }
            }
        }
    }
    if (/not found|promotion ended|unknown model/i.test(diagnostic)) {
        return {
            status: 404,
            body: {
                error: {
                    type: 'model_unavailable',
                    code: 'CLINE_MODEL_UNAVAILABLE',
                    message: `Cline does not currently serve ${model}${detail ? `: ${detail}` : ''}`
                }
            }
        }
    }
    return {
        status: 502,
        body: {
            error: {
                type: 'upstream_error',
                code: 'CLINE_UPSTREAM_ERROR',
                message: `Cline exited ${result.code} for ${model}${detail ? `: ${detail}` : ''}`
            }
        }
    }
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
        try {
            if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
                res.statusCode = 200
                res.end(
                    JSON.stringify({
                        object: 'list',
                        data: MODELS.map((m) => ({
                            id: m.id,
                            object: 'model',
                            owned_by: 'cline-free',
                            name: m.name,
                            context_window: m.context,
                            max_tokens: m.maxTokens,
                            vision: m.vision
                        }))
                    })
                )
                return
            }
            if (req.method === 'GET' && req.url === '/health') {
                res.statusCode = 200
                res.end(JSON.stringify({ status: 'ok', provider: 'cline', default_model: MODELS[0].id, models: MODELS.map((m) => m.id) }))
                return
            }
            const parsed = body ? JSON.parse(body) : {}
            const model = parsed.model || MODELS[0].id
            if (!MODELS.some((m) => m.id === model)) {
                res.statusCode = 404
                res.end(JSON.stringify({ error: { message: `Unknown model: ${model}` } }))
                return
            }
            const prompt = extractText(parsed.messages || [])
            const maxTokens = Number(parsed.max_tokens) || 2048
            const r = await callCline(model, prompt, maxTokens)
            if (!r.text) {
                const failure = failureResponse(model, r)
                res.statusCode = failure.status
                res.end(JSON.stringify(failure.body))
                return
            }
            res.end(
                JSON.stringify({
                    id: `cline-${Date.now()}`,
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: r.inputTokens || 0, completion_tokens: 0, total_tokens: r.inputTokens || 0 }
                })
            )
        } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: { message: String(e.message || e) } }))
        }
    })
})

server.listen(PORT, '127.0.0.1', () =>
    console.log(`[cline-shim] listening on http://127.0.0.1:${PORT}/v1 (models: ${MODELS.map((m) => m.id).join(', ')})`)
)
