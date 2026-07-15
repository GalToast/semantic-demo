// scripts/vision-jury.mjs
// Reusable "vision jury" CLI: ask the same image question to N vision models and
// print a score sheet. Builtins only (node:fs, node:path, global fetch). Bearer "local-probe".
//
// Usage:
//   node scripts/vision-jury.mjs <questions.json> \
//        [--jury "lane/model,lane/model,..."] \
//        [--out <report.md>] [--raw <log.jsonl>]
//
// questions.json: [ { "id", "images": [...], "text", "consensus"?: "yes-no" } ]
//   image paths are resolved relative to the questions file's dir, then cwd.

import fs from 'node:fs'
import path from 'node:path'

const ROUTER = 'http://127.0.0.1:8788'
const AUTH = 'Bearer local-probe'
const CALL_TIMEOUT_MS = 300_000
const MAX_TOKENS = 900
const RETRY_429_WAIT_MS = 30_000
const POLITE_DELAY_MS = 1500
const TRUNCATE = 800

const DEFAULT_JURY = [
    'agnes/agnes-2.0-flash',
    'zydit/mistralai/mistral-large-3-675b-instruct-2512',
    'modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct'
]

// ---------- argument parsing ----------
function parseArgs(argv) {
    const positional = []
    const opts = { jury: null, out: null, raw: null }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--jury') {
            opts.jury = argv[++i]
        } else if (a === '--out') {
            opts.out = argv[++i]
        } else if (a === '--raw') {
            opts.raw = argv[++i]
        } else if (a.startsWith('--')) {
            const eq = a.indexOf('=')
            if (eq !== -1) {
                const k = a.slice(2, eq),
                    v = a.slice(eq + 1)
                if (k === 'jury') opts.jury = v
                else if (k === 'out') opts.out = v
                else if (k === 'raw') opts.raw = v
            }
        } else {
            positional.push(a)
        }
    }
    return { questionsPath: positional[0], opts }
}

function parseJury(spec) {
    return spec
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
            const idx = entry.indexOf('/')
            if (idx === -1) throw new Error(`Bad jury entry "${entry}": expected "lane/model"`)
            return { lane: entry.slice(0, idx), model: entry.slice(idx + 1) }
        })
}

// ---------- image helpers ----------
function resolveImage(p, baseDir) {
    const candidates = [
        path.resolve(baseDir, p), // relative to questions file
        path.resolve(process.cwd(), p) // relative to cwd (repo root)
    ]
    for (const c of candidates) {
        if (fs.existsSync(c)) return c
    }
    // fall back to first candidate so the error message names a real path
    return candidates[0]
}

function imagePart(file) {
    if (!fs.existsSync(file)) {
        throw new Error(`vision-jury: image not found: ${file} (check the images[] paths in your questions.json)`)
    }
    const ext = path.extname(file).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
    const b64 = fs.readFileSync(file).toString('base64')
    return { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
}

// ---------- model call ----------
async function callModel(lane, model, content) {
    const body = {
        model,
        messages: [{ role: 'user', content }],
        max_tokens: MAX_TOKENS,
        temperature: 0
    }
    const started = Date.now()
    const tryOnce = async () => {
        const res = await fetch(`${ROUTER}/${lane}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: AUTH },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
        })
        const ms = Date.now() - started
        const text = await res.text()
        return { res, ms, text }
    }

    let r
    try {
        r = await tryOnce()
    } catch (e) {
        return { ok: false, ms: Date.now() - started, status: 'error', answer: `ERROR: ${String(e).slice(0, 200)}` }
    }

    if (r.res.status === 429) {
        await new Promise((s) => setTimeout(s, RETRY_429_WAIT_MS))
        try {
            r = await tryOnce()
        } catch (e) {
            return { ok: false, ms: Date.now() - started, status: 'error', answer: `ERROR: ${String(e).slice(0, 200)}` }
        }
    }

    if (!r.res.ok) {
        return { ok: false, ms: r.ms, status: 'error', answer: `ERROR: HTTP ${r.res.status}: ${r.text.slice(0, 200)}` }
    }

    let json
    try {
        json = JSON.parse(r.text)
    } catch (e) {
        return { ok: false, ms: r.ms, status: 'error', answer: `ERROR: bad JSON: ${String(e).slice(0, 120)}` }
    }

    const msg = json?.choices?.[0]?.message ?? {}
    let out = msg.content ?? ''
    let reasoning = msg.reasoning_content ?? ''
    if (Array.isArray(out)) out = out.map((c) => c.text || '').join(' ')

    if (String(out).trim() === '' && reasoning) {
        return {
            ok: true,
            ms: r.ms,
            status: 'empty-reasoning',
            answer: `empty content (reasoning-only)\n\n${reasoning}`
        }
    }
    if (String(out).trim() === '') {
        return { ok: true, ms: r.ms, status: 'empty', answer: '(empty response)' }
    }
    return { ok: true, ms: r.ms, status: 'ok', answer: String(out) }
}

// ---------- consensus ----------
function extractYesNo(answer) {
    const m = answer.match(/\b(yes|no)\b/i)
    return m ? m[1].toUpperCase() : null
}

function consensusLine(cells) {
    const votes = { YES: 0, NO: 0, UNKNOWN: 0 }
    const detail = []
    for (const c of cells) {
        const v = c.status === 'error' ? null : extractYesNo(c.answer)
        const bucket = v === 'YES' ? 'YES' : v === 'NO' ? 'NO' : 'UNKNOWN'
        votes[bucket]++
        detail.push(`${c.model}=${v ?? '?'}`)
    }
    const total = cells.length
    const yes = votes.YES,
        no = votes.NO
    let majority = 'INCONCLUSIVE'
    if (yes > no && yes >= Math.ceil(total / 2)) majority = 'YES'
    else if (no > yes && no >= Math.ceil(total / 2)) majority = 'NO'
    else if (yes === total) majority = 'YES'
    else if (no === total) majority = 'NO'
    return `**Consensus (yes-no):** ${yes} YES / ${no} NO / ${votes.UNKNOWN} unclear — majority **${majority}**  _(${detail.join(', ')})_`
}

// ---------- report ----------
function renderReport(questions, results) {
    const lines = []
    lines.push('# Vision Jury Score Sheet')
    lines.push('')
    lines.push(`_Generated ${new Date().toISOString()}_`)
    lines.push('')
    for (const q of questions) {
        const cells = results.filter((r) => r.questionId === q.id)
        lines.push(`## ${q.id}`)
        lines.push('')
        lines.push(q.text ? `> ${q.text.replace(/\n/g, ' ').slice(0, 240)}${q.text.length > 240 ? '…' : ''}` : '')
        lines.push('')
        for (const c of cells) {
            lines.push(`### ${c.model}`)
            lines.push('')
            const shown = c.answer.length > TRUNCATE ? c.answer.slice(0, TRUNCATE) + ' …[truncated]' : c.answer
            lines.push('```')
            lines.push(shown)
            lines.push('```')
            lines.push('')
            lines.push(`_status: ${c.status} · ${c.ms}ms_`)
            lines.push('')
        }
        if (q.consensus === 'yes-no') {
            lines.push(consensusLine(cells))
            lines.push('')
        }
    }
    return lines.join('\n')
}

// ---------- main ----------
async function main() {
    const { questionsPath, opts } = parseArgs(process.argv.slice(2))
    if (!questionsPath) {
        console.error(
            'Usage: node scripts/vision-jury.mjs <questions.json> [--jury "lane/model,..."] [--out <report.md>] [--raw <log.jsonl>]'
        )
        process.exit(2)
    }

    const baseDir = path.dirname(path.resolve(questionsPath))
    const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'))

    const jury = opts.jury ? parseJury(opts.jury) : parseJury(DEFAULT_JURY.join(','))

    const outPath = opts.out || null
    const rawPath = opts.raw || (outPath ? `${outPath}.jsonl` : 'vision-jury-raw.jsonl')

    const results = []
    const rawStream = fs.createWriteStream(rawPath, { flags: 'w' })

    console.error(`Jury: ${jury.map((j) => `${j.lane}/${j.model}`).join(', ')}`)
    console.error(`Questions: ${questions.length} · raw log -> ${rawPath}`)

    let firstCall = true
    for (const q of questions) {
        const images = (q.images || []).map((p) => {
            const r = resolveImage(p, baseDir)
            if (!fs.existsSync(r)) {
                console.error(`  WARNING: image not found: ${p} (tried ${r})`)
            }
            return r
        })
        const content = [...images.map(imagePart), { type: 'text', text: q.text }]

        for (const j of jury) {
            if (!firstCall) await new Promise((s) => setTimeout(s, POLITE_DELAY_MS))
            firstCall = false
            const label = `${j.lane}/${j.model}`
            console.error(`  ${q.id} -> ${label} …`)
            const r = await callModel(j.lane, j.model, content)
            const cell = { questionId: q.id, model: label, ms: r.ms, status: r.status, answer: r.answer }
            results.push(cell)
            rawStream.write(JSON.stringify(cell) + '\n')
            console.error(`    ${label}: ${r.status} (${r.ms}ms)`)
            await new Promise((s) => setTimeout(s, POLITE_DELAY_MS))
        }
    }

    await new Promise((res) => rawStream.end(res))

    const md = renderReport(questions, results)
    if (outPath) {
        fs.writeFileSync(outPath, md)
        console.error(`\nScore sheet written -> ${outPath}`)
    } else {
        process.stdout.write(md + '\n')
    }
    console.error(`\nDone. ${results.length} cells. Raw log: ${rawPath}`)
}

main().catch((e) => {
    console.error('FATAL:', e)
    process.exit(1)
})
