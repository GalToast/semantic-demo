/* cline-shim.mjs — local OpenAI-compatible gateway over the Cline CLI free lane.
 * POST /v1/chat/completions  {model, messages, max_tokens} -> cline -P cline -m <model> --json -p <prompt>
 * GET  /v1/models -> the cline free-tier model list this shim exposes.
 *
 * Usage: node scripts/shims/cline-shim.mjs [port=8793]
 */
import http from 'node:http'
import { spawn } from 'node:child_process'

const PORT = Number(process.argv[2] || 8793)

// The cline "cline" provider free models (verified answering, keyless via CLI)
// reasoning: max accepted effort per model (from cline catalog reasoningOptions).
// laguna has NO reasoning option (omit --thinking); step caps at high.
const MODELS = [
    { id: 'cline-free/glm-5.2', name: 'GLM-5.2 (free)', context: 1048576, vision: false, effort: 'xhigh' },
    {
        id: 'deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash (free)',
        context: 1048576,
        vision: false,
        effort: 'xhigh'
    },
    { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1 (free)', context: 300000, vision: false, effort: null },
    {
        id: 'stepfun/step-3.7-flash',
        name: 'Step 3.7 Flash (free, vision-capable)',
        context: 256000,
        vision: true,
        effort: 'high'
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
        const args = ['-P', 'cline', '-m', model, '--json']
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
        let out = ''
        const t0 = Date.now()
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (out += d))
        const timer = setTimeout(
            () => {
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
            const lines = out
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
            let text = ''
            let _cost = 0
            let inputTokens = 0
            for (const l of lines) {
                try {
                    const obj = JSON.parse(l)
                    const e = obj.event || {}
                    if (e.type === 'content_delta' && e.contentType === 'text') text += e.text || ''
                    if (e.type === 'content_start' && e.contentType === 'text') text += e.text || ''
                    if (obj.type === 'usage' || obj.event?.type === 'usage' || e.type === 'usage') {
                        inputTokens = obj.inputTokens ?? e.inputTokens ?? inputTokens
                    }
                    if (obj.type === 'run_result') {
                        const usage = obj.usage || {}
                        inputTokens = usage.inputTokens || usage.totalInputTokens || inputTokens
                        text = text || obj.result || ''
                    }
                } catch {
                    /* skip malformed line */
                }
            }
            resolve({ text, ms: Date.now() - t0, code, inputTokens, raw: out.slice(0, 400) })
        })
        child.on('error', () => resolve({ text: '', ms: 0, code: -1, inputTokens: 0, raw: '' }))
    })
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
        try {
            if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
                res.end(
                    JSON.stringify({
                        object: 'list',
                        data: MODELS.map((m) => ({ id: m.id, object: 'model', owned_by: 'cline-free' }))
                    })
                )
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
            if (r.code !== 0 && !r.text) {
                res.statusCode = 502
                res.end(JSON.stringify({ error: { message: `cline exited ${r.code}: ${r.raw.slice(0, 200)}` } }))
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
