#!/usr/bin/env node
/**
 * Subagent model benchmark — dispatches a small real repo task to many models
 * via the external-subagents MCP server and records which ones actually complete.
 *
 * Usage:
 *   node scripts/benchmark-subagent-models.mjs [--models=<file>] [--concurrency=3] [--limit=50]
 *
 * If --models is omitted, it fetches the live router catalog and tests all
 * free/free-shadow/allowed-paid chat models (same cost classes as model-health-check.mjs).
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const MCP_SERVER_DIR = path.join(os.homedir(), 'harness', 'servers', 'external-subagents')
const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788'
const OUT_DIR = path.join(REPO_ROOT, 'tmp', 'subagent-benchmark')
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 3)
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0) || Infinity
const MODELS_FILE = process.argv.find((a) => a.startsWith('--models='))?.split('=')[1]
const TASK_TIMEOUT_MS = Number(process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1] || 300000)
const POLL_INTERVAL_MS = 5000

const TARGET_FILE = 'src/components/ThreadInspector.svelte'

function taskPrompt(outputPath) {
    return (
        `Read the file header comment of ${TARGET_FILE} and list the DOM ids/classes ` +
        `expected by contract tests. Write the result to ${outputPath}. ` +
        `Do not modify any other files. This is a benchmark task.`
    )
}

const explicitPaidProviderKeys = new Set(['openrouter', 'kilo', 'zen'])
const freeOrShadowProviderKeys = new Set([
    'nvidia',
    'modelscope',
    'freemodel',
    'logfare',
    'zydit',
    'zyditv4',
    'cloudflare'
])
const directQuotaProviderKeys = new Set(['gemini', 'mistral'])

function isLikelyNonChat(id) {
    return /embedding|rerank|image|tts|audio|whisper|lyria|banana|deplot|safety/i.test(id)
}

function isFreeLike(providerKey, id) {
    if (/:free\b/i.test(id)) return true
    if (/-free\b/i.test(id)) return true
    if (providerKey === 'freemodel') return true
    if (providerKey === 'logfare') return true
    return false
}

function isAllowedPaidException(providerKey, id) {
    if (providerKey === 'opencode-go') {
        return /^(mimo-v2\.5|deepseek-v4-flash)$/i.test(id)
    }
    if (providerKey === 'minimax-direct') {
        return /minimax/i.test(id)
    }
    return false
}

function costClassFor(providerKey, id) {
    if (isLikelyNonChat(id)) return 'non_chat'
    if (isFreeLike(providerKey, id)) return 'free'
    if (isAllowedPaidException(providerKey, id)) return 'allowed_paid'
    if (freeOrShadowProviderKeys.has(providerKey)) return 'free_or_shadow'
    if (directQuotaProviderKeys.has(providerKey)) return 'direct_quota'
    if (explicitPaidProviderKeys.has(providerKey)) return 'paid'
    return 'unknown'
}

function isDefaultSmokeClass(costClass) {
    return costClass === 'free' || costClass === 'free_or_shadow' || costClass === 'allowed_paid'
}

function safeModelName(model) {
    return model.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function providerQualifiedName(providerKey, modelId) {
    return modelId ? `${providerKey}/${modelId}` : providerKey
}

async function fetchJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch {
        return { raw: text.slice(0, 300) }
    }
}

async function loadModelsFromCatalog() {
    const catalog = await fetchJson(`${ROUTER}/catalog`)
    const routes = catalog.routes || []
    const models = []
    for (const route of routes) {
        const list = await fetchJson(`${route.baseUrl.replace(/\/$/, '')}/models`)
        const ids = Array.isArray(list?.data)
            ? list.data.map((m) => (typeof m === 'string' ? m : m.id || m.name || m.model)).filter(Boolean)
            : Array.isArray(list?.models)
              ? list.models.map((m) => (typeof m === 'string' ? m : m.id || m.name || m.model)).filter(Boolean)
              : []
        for (const id of ids) {
            const costClass = costClassFor(route.providerKey, id)
            if (!isDefaultSmokeClass(costClass)) continue
            if (isLikelyNonChat(id)) continue
            models.push({
                providerKey: route.providerKey,
                providerId: route.providerId,
                baseUrl: route.baseUrl,
                id,
                costClass
            })
        }
    }
    return models
}

function loadModelsFromFile(filePath) {
    const text = fs.readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8')
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
            const [providerKey, ...rest] = l.split('/')
            const id = rest.join('/')
            return { providerKey, id, costClass: costClassFor(providerKey, id) }
        })
}

class McpStdioClient {
    constructor(child) {
        this.child = child
        this.buffer = ''
        this.pending = new Map()
        this.nextId = 1
        child.stdout.on('data', (data) => this.handleData(data))
        child.stderr.on('data', (data) => process.stderr.write(data))
    }

    handleData(data) {
        this.buffer += data.toString('utf8')
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop()
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
                const msg = JSON.parse(trimmed)
                if (msg.id != null && this.pending.has(msg.id)) {
                    const { resolve, reject } = this.pending.get(msg.id)
                    this.pending.delete(msg.id)
                    if (msg.error) reject(msg.error)
                    else resolve(msg.result)
                }
            } catch {
                // ignore non-JSON lines
            }
        }
    }

    call(method, params) {
        const id = this.nextId++
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            const msg = { jsonrpc: '2.0', id, method, params }
            this.child.stdin.write(JSON.stringify(msg) + '\n')
        })
    }

    async init() {
        await this.call('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'subagent-benchmark', version: '1.0.0' }
        })
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    }

    async startWorker(model, promptText) {
        return this.call('tools/call', {
            name: 'external_subagent_start',
            arguments: {
                model,
                name: model,
                prompt_text: promptText,
                cwd: REPO_ROOT,
                report_to_file: false,
                live_steer: false,
                timeout_seconds: Math.ceil(TASK_TIMEOUT_MS / 1000)
            }
        })
    }

    async pollWorker(workerId) {
        return this.call('tools/call', {
            name: 'external_subagent_poll',
            arguments: { worker_id: workerId }
        })
    }

    async cancelWorker(workerId) {
        return this.call('tools/call', {
            name: 'external_subagent_cancel',
            arguments: { worker_id: workerId }
        }).catch(() => null)
    }

    close() {
        this.child.kill()
    }
}

async function spawnMcpClient() {
    const source = path.join(MCP_SERVER_DIR, 'src', 'mmx.ts')
    const child = spawn('bun', ['run', '--conditions=browser', source], {
        cwd: MCP_SERVER_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
    })
    const client = new McpStdioClient(child)
    await client.init()
    return client
}

function unwrapToolResult(result) {
    if (!result) return result
    if (Array.isArray(result.content) && result.content[0]?.type === 'text') {
        const text = result.content[0].text
        try {
            return JSON.parse(text)
        } catch {
            return text
        }
    }
    return result
}

async function runTask(client, model, outputPath) {
    const started = Date.now()
    let workerId
    try {
        const startResult = unwrapToolResult(await client.startWorker(model, taskPrompt(outputPath)))
        if (typeof startResult === 'string') {
            return {
                model,
                ok: false,
                phase: 'start',
                error: startResult,
                elapsedMs: Date.now() - started
            }
        }
        workerId = startResult?.worker_id
        if (!workerId) {
            return {
                model,
                ok: false,
                phase: 'start',
                error: 'No worker_id returned',
                raw: JSON.stringify(startResult),
                elapsedMs: Date.now() - started
            }
        }
    } catch (error) {
        return {
            model,
            ok: false,
            phase: 'start',
            error: error?.message || String(error),
            elapsedMs: Date.now() - started
        }
    }

    while (Date.now() - started < TASK_TIMEOUT_MS) {
        let pollResult
        try {
            pollResult = unwrapToolResult(await client.pollWorker(workerId))
        } catch (error) {
            return {
                model,
                ok: false,
                phase: 'poll',
                error: error?.message || String(error),
                elapsedMs: Date.now() - started
            }
        }
        const poll = pollResult
        if (typeof poll === 'string') {
            return {
                model,
                ok: false,
                phase: 'poll',
                error: poll,
                elapsedMs: Date.now() - started,
                workerId
            }
        }
        if (poll?.status && poll.status !== 'running' && poll.status !== 'starting') {
            const terminalOk = poll.status === 'completed' && !poll.error
            const fileExists = terminalOk && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0
            const ok = terminalOk && fileExists
            return {
                model,
                ok,
                phase: 'terminal',
                status: poll.status,
                error: poll.error || null,
                exitCode: poll.exit_code ?? null,
                elapsedMs: Date.now() - started,
                workerId,
                stdoutBytes: poll.stdout_bytes ?? null,
                stderrBytes: poll.stderr_bytes ?? null,
                reportWritten: fileExists
            }
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    await client.cancelWorker(workerId)
    return {
        model,
        ok: false,
        phase: 'timeout',
        error: `${TASK_TIMEOUT_MS}ms timeout`,
        elapsedMs: Date.now() - started,
        workerId
    }
}

async function runQueue(client, models) {
    const results = []
    let index = 0

    async function worker() {
        while (index < models.length) {
            const m = models[index++]
            const safeName = safeModelName(m.id)
            const outputPath = path.join(OUT_DIR, 'reports', `${m.providerKey}-${safeName}.md`).replace(/\\/g, '/')
            const qualified = providerQualifiedName(m.providerKey, m.id)
            process.stderr.write(`[${index}/${models.length}] ${qualified} … `)
            const result = await runTask(client, qualified, outputPath)
            results.push({ providerKey: m.providerKey, id: m.id, ...result })
            process.stderr.write(
                `${result.ok ? '✅' : '❌'} ${result.elapsedMs}ms ${result.error ? result.error.slice(0, 60) : ''}\n`
            )
        }
    }

    const workers = []
    for (let i = 0; i < Math.min(CONCURRENCY, models.length); i++) workers.push(worker())
    await Promise.all(workers)
    return results
}

function writeReports(results) {
    fs.mkdirSync(path.join(OUT_DIR, 'reports'), { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const jsonPath = path.join(OUT_DIR, `subagent-benchmark-${timestamp}.json`)
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2))

    const working = results.filter((r) => r.ok)
    const failed = results.filter((r) => !r.ok)
    working.sort((a, b) => a.elapsedMs - b.elapsedMs)
    failed.sort((a, b) => a.model.localeCompare(b.model))

    const mdLines = []
    mdLines.push(`# Subagent Model Benchmark`)
    mdLines.push(`\nGenerated: ${new Date().toISOString()}`)
    mdLines.push(`Task: read ${TARGET_FILE} header and write DOM contract ids to a report file.`)
    mdLines.push(`Timeout: ${TASK_TIMEOUT_MS}ms | Concurrency: ${CONCURRENCY}`)
    mdLines.push(`\n## Summary`)
    mdLines.push(`- **Working:** ${working.length}/${results.length}`)
    mdLines.push(`- **Failed:** ${failed.length}/${results.length}`)
    mdLines.push(`- **Fastest working:** ${working[0]?.model || 'n/a'} (${working[0]?.elapsedMs || 'n/a'}ms)`)
    mdLines.push(`\n## Working models`)
    mdLines.push(`| Model | Provider | Elapsed (ms) |`)
    mdLines.push(`|---|---|---:|`)
    for (const r of working) mdLines.push(`| ${r.model} | ${r.providerKey} | ${r.elapsedMs} |`)
    mdLines.push(`\n## Failed models`)
    mdLines.push(`| Model | Provider | Phase | Error |`)
    mdLines.push(`|---|---|---|---|`)
    for (const r of failed)
        mdLines.push(
            `| ${r.model} | ${r.providerKey} | ${r.phase} | ${(r.error || '').replace(/\|/g, '/').slice(0, 120)} |`
        )
    mdLines.push('')

    const mdPath = path.join(OUT_DIR, `subagent-benchmark-${timestamp}.md`)
    fs.writeFileSync(mdPath, mdLines.join('\n'))
    console.log(`\nWrote ${jsonPath}`)
    console.log(`Wrote ${mdPath}`)
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const models = MODELS_FILE ? loadModelsFromFile(MODELS_FILE) : await loadModelsFromCatalog()
    const limited = models.slice(0, LIMIT)
    console.log(
        `Benchmarking ${limited.length} subagent models (concurrency=${CONCURRENCY}, timeout=${TASK_TIMEOUT_MS}ms)`
    )
    const client = await spawnMcpClient()
    try {
        const results = await runQueue(client, limited)
        writeReports(results)
    } finally {
        client.close()
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
