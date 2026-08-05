#!/usr/bin/env node
/**
 * tools/harness-ablation/run.mjs — ablation runner (upgraded, backward-compatible).
 *
 * Arms:
 *   A (loop): model sees task + repo, iterates up to MAX_STEPS with test feedback.
 *   B (one-shot): single answer, no feedback loop.
 *   C (pi-worker): PLACEHOLDER stub — returns pass:false with note.
 *
 * CLI flags (env fallbacks retained):
 *   --arm=A|B|C|both|all     default both (A,B)
 *   --task=all|task-N         default all
 *   --repeats=N               default 1
 *   --max-steps=N             default 5 (arm A only)
 *   --model=MODEL_ID          default from MODEL_ID or settings
 *   --base-url=URL            default from OPENAI_BASE_URL or settings
 *   --api-key=KEY             default from OPENAI_API_KEY or settings
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TASKS_DIR = join(__dirname, 'tasks')
const RESULTS_DIR = join(__dirname, 'results')

/* ------------------------------------------------------------------ */
/* CLI parsing                                                          */
/* ------------------------------------------------------------------ */
function cliFlag(name) {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
    return arg ? arg.split('=')[1] : null
}
function cliHas(name) {
    return process.argv.includes(`--${name}`)
}

function parseArm() {
    const raw = cliFlag('arm') || 'both'
    const map = {
        A: ['A'],
        B: ['B'],
        C: ['C'],
        both: ['A', 'B'],
        all: ['A', 'B', 'C']
    }
    // Support comma-separated lists (e.g. --arm=A,B,C)
    if (raw.includes(',')) {
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s) => map[s] != null)
    }
    return map[raw] ?? ['A', 'B']
}

const ARM_FILTER = parseArm()
const TASK_FILTER_RAW = cliFlag('task')
const TASK_FILTER = TASK_FILTER_RAW === null ? 'all' : TASK_FILTER_RAW

const REPEATS = Math.max(1, Number(cliFlag('repeats') || process.env.REPEATS || 1))
const MAX_STEPS = Math.max(1, Number(cliFlag('max-steps') || process.env.MAX_STEPS || 5))

/* ------------------------------------------------------------------ */
/* Config / providers                                                   */
/* ------------------------------------------------------------------ */
function loadQwenProviders() {
    try {
        const p = join(homedir(), '.qwen', 'settings.json')
        if (!existsSync(p)) return {}
        const s = JSON.parse(readFileSync(p, 'utf8'))
        return s.modelProviders ?? {}
    } catch {
        return {}
    }
}

function pickProvider(providers) {
    for (const [name, value] of Object.entries(providers)) {
        const entries = Array.isArray(value) ? value : Object.values(value ?? {})
        for (const e of entries) {
            if (e && typeof e === 'object' && e.baseUrl && String(e.baseUrl).includes('127.0.0.1:8788')) {
                return { name, baseUrl: e.baseUrl.replace(/\/$/, ''), apiKey: e.apiKey ?? '' }
            }
        }
    }
    return null
}

const providers = loadQwenProviders()
const provider = pickProvider(providers)
const BASE_URL =
    cliFlag('base-url') || process.env.OPENAI_BASE_URL || provider?.baseUrl || 'http://127.0.0.1:8788/nvidia/v1'
const API_KEY = cliFlag('api-key') || process.env.OPENAI_API_KEY || provider?.apiKey || 'sk-none'
const MODEL = cliFlag('model') || process.env.MODEL_ID || 'nvidia/thinkingmachines/inkling'

/* ------------------------------------------------------------------ */
/* Chat (returns { content, tokensUsed })                               */
/* ------------------------------------------------------------------ */
async function chat(messages) {
    // Retry transient network/timeout errors (router contention, slow heads)
    const ATTEMPTS = 3
    let lastErr
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
            const res = await fetch(`${BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
                body: JSON.stringify({ model: MODEL, messages, temperature: 0.2 }),
                signal: AbortSignal.timeout(120000)
            })
            if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 200)}`)
            const data = await res.json()
            const content = data.choices?.[0]?.message?.content ?? ''
            const usage = data.usage ?? {}
            let tokensUsed = usage.total_tokens ?? usage.completion_tokens ?? usage.prompt_tokens ?? null
            if (tokensUsed == null) {
                const promptChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
                tokensUsed = Math.round((promptChars + content.length) / 4)
            }
            return { content, tokensUsed }
        } catch (e) {
            lastErr = e
            const isTransient = /timeout|UND_ERR|fetch failed|ECONNRESET|ETIMEDOUT|429/.test(String(e))
            if (!isTransient) throw e
            const delay = Math.min(5000, 500 * attempt)
            console.log(`  [retry ${attempt}/${ATTEMPTS} after ${delay}ms: ${String(e).slice(0, 80)}]`)
            await new Promise((r) => setTimeout(r, delay))
        }
    }
    throw lastErr
}

/* ------------------------------------------------------------------ */
/* Task fixtures (kept intact)                                            */
/* ------------------------------------------------------------------ */
function taskList() {
    return readdirSync(TASKS_DIR)
        .filter((d) => d.startsWith('task-'))
        .sort()
}

function readTask(taskDir) {
    const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
    return {
        readme: read(join(TASKS_DIR, taskDir, 'README.md')),
        src: read(join(TASKS_DIR, taskDir, 'src', 'task.js')),
        test: read(join(TASKS_DIR, taskDir, 'test', 'test.js'))
    }
}

function runTest(taskDir) {
    const tmp = join(TASKS_DIR, `.tmp-test-${taskDir}`)
    try {
        execFileSync('rm', ['-rf', tmp])
        execFileSync('cp', ['-r', join(TASKS_DIR, taskDir), tmp])
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({ type: 'commonjs' }))
        const res = execFileSync(process.execPath, [join(tmp, 'test', 'test.js')], {
            cwd: tmp,
            stdio: 'pipe',
            encoding: 'utf8'
        })
        return { pass: true, out: res.trim().slice(0, 200) }
    } catch (e) {
        return { pass: false, err: String(e.stderr || e.message).slice(0, 300) }
    } finally {
        try {
            execFileSync('rm', ['-rf', tmp])
        } catch {
            /* ignore */
        }
    }
}

function patchSource(src, patch) {
    const fence = patch.match(/```(?:diff|js)?\n([\s\S]*?)```/)
    const candidate = fence ? fence[1] : patch
    return candidate.trim().length > src.length * 0.5 ? candidate : src
}

/* ------------------------------------------------------------------ */
/* Arm implementations                                                  */
/* ------------------------------------------------------------------ */
async function armA(task, taskDir) {
    const messages = [
        {
            role: 'system',
            content:
                'You fix a small bug in a JS file. The repo has src/task.js and test/test.js. Return ONLY the corrected full src/task.js content in a code fence.'
        },
        {
            role: 'user',
            content: `## Task\n${task.readme}\n\n## Current src/task.js\n\`\`\`js\n${task.src}\n\`\`\`\n\n## test/test.js\n\`\`\`js\n${task.test}\n\`\`\``
        }
    ]
    for (let step = 0; step < MAX_STEPS; step++) {
        const { content: reply, tokensUsed } = await chat(messages)
        const patched = patchSource(task.src, reply)
        writeFileSync(join(TASKS_DIR, taskDir, 'src', 'task.js'), patched)
        const r = runTest(taskDir)
        writeFileSync(join(TASKS_DIR, taskDir, 'src', 'task.js'), task.src) // restore original
        if (r.pass) return { pass: true, steps: step + 1, tokensUsed }
        messages.push({ role: 'assistant', content: reply })
        messages.push({ role: 'user', content: `Test failed: ${r.err}. Try again.` })
    }
    // Final attempt token count estimated from last interaction if loop exits without pass
    return { pass: false, steps: MAX_STEPS, tokensUsed: 0 }
}

async function armB(task, taskDir) {
    const { content: reply, tokensUsed } = await chat([
        {
            role: 'system',
            content:
                'You fix a small bug in a JS file. Return ONLY the corrected full src/task.js content in a code fence. No explanations.'
        },
        {
            role: 'user',
            content: `## Task\n${task.readme}\n\n## src/task.js\n\`\`\`js\n${task.src}\n\`\`\`\n\n## test/test.js\n\`\`\`js\n${task.test}\n\`\`\``
        }
    ])
    const patched = patchSource(task.src, reply)
    writeFileSync(join(TASKS_DIR, taskDir, 'src', 'task.js'), patched)
    const r = runTest(taskDir)
    writeFileSync(join(TASKS_DIR, taskDir, 'src', 'task.js'), task.src)
    return { pass: r.pass, steps: 1, tokensUsed }
}

async function armC(task, taskDir) {
    // Real pi-worker arm: full harness (tools/skills/MCP/context) via pi cli.
    const { runPiWorkerArm } = await import('./arms/pi-worker.mjs')
    const r = await runPiWorkerArm(join(TASKS_DIR, taskDir))
    return { pass: r.pass, steps: r.steps, tokensUsed: r.tokens, note: r.note }
}

/* ------------------------------------------------------------------ */
/* Registry helpers                                                     */
/* ------------------------------------------------------------------ */
const ARM_REGISTRY = {
    A: armA,
    B: armB,
    C: armC
}

/* ------------------------------------------------------------------ */
/* Execution loop                                                       */
/* ------------------------------------------------------------------ */
const rows = []
for (const t of taskList()) {
    if (TASK_FILTER !== 'all' && t !== TASK_FILTER) continue
    const task = readTask(t)
    for (const armId of ARM_FILTER) {
        const armFn = ARM_REGISTRY[armId]
        if (!armFn) continue
        for (let r = 1; r <= REPEATS; r++) {
            const started = Date.now()
            const result = await armFn(task, t)
            const ms = Date.now() - started
            rows.push({
                task: t,
                arm: armId,
                run: r,
                pass: result.pass,
                steps: result.steps,
                ms,
                tokens: result.tokensUsed ?? 0,
                note: result.note || null
            })
        }
    }
}

/* ------------------------------------------------------------------ */
/* Metrics / variance                                                    */
/* ------------------------------------------------------------------ */
function armSummary(armId) {
    const rs = rows.filter((r) => r.arm === armId)
    if (rs.length === 0) return null
    const passes = rs.filter((r) => r.pass).length
    const passRate = passes / rs.length
    const tokens = rs.map((r) => r.tokens)
    const meanTokens = tokens.reduce((a, b) => a + b, 0) / tokens.length
    const ms = rs.map((r) => r.ms)
    const meanMs = ms.reduce((a, b) => a + b, 0) / ms.length
    const minMs = Math.min(...ms)
    const maxMs = Math.max(...ms)
    const minTokens = Math.min(...tokens)
    const maxTokens = Math.max(...tokens)
    return {
        passRate,
        passes,
        totalRuns: rs.length,
        meanTokens: Math.round(meanTokens),
        meanMs: Math.round(meanMs),
        minMs,
        maxMs,
        minTokens,
        maxTokens
    }
}

/* ------------------------------------------------------------------ */
/* Archive previous latest before overwrite                            */
/* ------------------------------------------------------------------ */
function archiveLatest() {
    const latestPath = join(RESULTS_DIR, 'latest.json')
    if (!existsSync(latestPath)) return
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const archivePath = join(RESULTS_DIR, `archive-${ts}.json`)
    copyFileSync(latestPath, archivePath)
}

mkdirSync(RESULTS_DIR, { recursive: true })
archiveLatest()

/* ------------------------------------------------------------------ */
/* Per-arm summary + table                                               */
/* ------------------------------------------------------------------ */
const summaries = {}
for (const armId of ARM_FILTER) {
    summaries[armId] = armSummary(armId)
}

console.log(`\n=== Harness Ablation — ${MODEL} (repeats=${REPEATS}, arms=${ARM_FILTER.join(',')}) ===`)
console.table(
    rows.map((r) => ({
        task: r.task,
        arm: r.arm,
        run: r.run,
        pass: r.pass ? 'PASS' : 'FAIL',
        steps: r.steps,
        ms: r.ms,
        tokens: r.tokens
    }))
)

console.log('\n--- Per-arm summary ---')
for (const armId of ARM_FILTER) {
    const s = summaries[armId]
    if (!s) {
        console.log(`${armId}: no runs`)
        continue
    }
    console.log(
        `${armId}: passRate=${(s.passRate * 100).toFixed(0)}% ` +
            `(passes=${s.passes}/${s.totalRuns}) | ` +
            `meanMs=${s.meanMs} (min=${s.minMs}, max=${s.maxMs}) | ` +
            `meanTokens=${s.meanTokens} (min=${s.minTokens}, max=${s.maxTokens})`
    )
}

/* ------------------------------------------------------------------ */
/* JSON output                                                           */
/* ------------------------------------------------------------------ */
const latestPayload = {
    model: MODEL,
    repeats: REPEATS,
    arms: ARM_FILTER,
    maxSteps: MAX_STEPS,
    generated_at: new Date().toISOString(),
    rows,
    summaries
}

writeFileSync(join(RESULTS_DIR, 'latest.json'), JSON.stringify(latestPayload, null, 2))
console.log('Results: tools/harness-ablation/results/latest.json')
console.log('Archive: previous latest saved to results/archive-timestamp>.json')
