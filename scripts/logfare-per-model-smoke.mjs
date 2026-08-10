// logfare-per-model-smoke.mjs — one solo worker per logfare model on a bounded real task.
// Measures per-model: launch success, tool execution, deliverable, survivor.
// Run AFTER the nvidia gate wave; logfare solo (1 at a time).
// Usage: node logfare-per-model-smoke.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8788/logfare/v1'
const OUT = 'C:/Users/tmp/smoke'
mkdirSync(OUT, { recursive: true })

// the 11 models from the router, with tier + prior-status from the roster doc
const MODELS = [
    'minimax-m3',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-v4-flash-0731',
    'kimi-k3',
    'kiro-auto',
    'qwen-3.6-35b-a3b',
    'glm-5.2',
    'kimi-k2.7-code',
    'qwen-3.8-max',
    'grape-2-pro'
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Simple, identical, BOUNDED smoke task with a hard number check — judgeable by deliverable.
const SMOKE_TASK = `You are a code checker in C:/Users/HP/repos/semantic-explorer.
TASK (bounded, 15 min max): Verify ONE claim with real evidence, then write a 5-line verdict.
Claim: ${process.env.SMOKE_CLAIM || `src/lib/utils/environment.ts exports a function named getViewportSize.`}
STEPS:
1. Read the file. 
2. Run: node -e "..." to confirm, or rg -n "export function getViewportSize" src/lib/utils/environment.ts
3. If TRUE, write your verdict + the function's first 2 lines to: tmp/smoke-REPORT.md
4. If FALSE, write 'CLAIM FALSE' + the actual exports to tmp/smoke-REPORT.md
STOP. Do not do anything else — no refactors, no commits, no other files. 
DELIVERABLE: tmp/smoke-REPORT.md only. Report your evidence in final message.`

async function probeSmoke(model) {
    const t = Date.now()
    try {
        const r = await fetch(`${BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 2 }),
            signal: AbortSignal.timeout(12000)
        })
        return { ok: r.status === 200, ms: Date.now() - t }
    } catch {
        return { ok: false, ms: Date.now() - t }
    }
}

for (const model of MODELS) {
    const p = await probeSmoke(model)
    const out = `${OUT}/${model}.out`

    console.log(
        `\n==================== ${model} (probe ${p.ok ? 'OK' : 'FAIL/backoff'} ${p.ms}ms) ====================`
    )
    if (!p.ok) {
        console.log('  SKIP — completions endpoint not answering for this model; record as UNAVAILABLE')
        continue
    }
    // Launch a real bounded worker (solo, sequential)
    const child = spawn(
        'node',
        [
            'C:/Users/HP/tmp/direct-mcp-worker.mjs',
            '--model',
            `logfare/${model}`,
            '--name',
            `smoke-${model.replace(/[^a-z0-9]+/gi, '-')}`,
            '--prompt',
            SMOKE_TASK,
            '--timeout',
            '180',
            '--log',
            out
        ],
        { stdio: 'inherit' }
    )
    const exited = await new Promise((res) => child.on('exit', res))
    // quickly read the driver log for verdict lines
    let tail = ''
    try {
        tail = `${existsSync(out) ? require('node:fs').readFileSync(out, 'utf8').slice(-800) : ''}`
            .split('\n')
            .filter((l) => /(verdict|CLAIM|TRUE|FALSE|REPORT|DONE|CLIENT-END|FATAL)/i.test(l))
            .slice(-4)
            .join(' | ')
    } catch {}
    console.log(`  exit=${exited ?? 'null'} | ${tail.slice(0, 300)}`)
    await sleep(3000)
}
console.log('\nSMOKE COMPLETE — assess per-model launch/report into docs/subagent-lane-inventory.md')
