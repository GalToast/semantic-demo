#!/usr/bin/env node
/**
 * arms/pi-worker.mjs — harness-ablation ARM C: the FULL Pi harness.
 *
 * Measures what the real Pi agent (with tools, skills, MCP, repo context)
 * buys on a bug-fix task vs the bare API arms (A: looped prompt, B: one-shot).
 *
 * Executor: external-subagents MCP (persistent server, real pi worker with
 * the full harness). NOT a per-task pi CLI spawn (that was 16s+ startup and
 * churn-prone).
 *
 * Isolation: copies the task to a neutral temp dir OUTSIDE the repo (so the
 * repo's package.json "type":"module" cannot contaminate the CJS fixture).
 * Hard timeout: cancels the worker if it exceeds budget.
 *
 * Usage from the runner: runPiWorkerArm(taskDirPath, { model, timeoutMs })
 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_MODEL = process.env.MODEL_ID || 'nvidia/thinkingmachines/inkling' // stronger than flash for full-harness arm
const WORKER_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS || 90000)

/**
 * Invoke the external-subagents MCP start tool.
 * NOTE: this arm runs inside the runner (a plain Node process), NOT inside a
 * Pi session, so it cannot use the `mcp` top-level tool. It shells to a small
 * MCP client script that starts a worker via the external-subagents server.
 */
function startWorker(taskPrompt, cwd, model) {
  const client = join(__dirname, 'mcp-client.mjs')
  const res = execFileSync(process.execPath, [client, 'start', JSON.stringify({ prompt: taskPrompt, cwd, model })], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(res.trim())
}

function pollWorker(workerId) {
  const client = join(__dirname, 'mcp-client.mjs')
  const res = execFileSync(process.execPath, [client, 'poll', workerId], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(res.trim())
}

function cancelWorker(workerId) {
  try {
    const client = join(__dirname, 'mcp-client.mjs')
    execFileSync(process.execPath, [client, 'cancel', workerId], {
      cwd: __dirname,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch { /* best effort */ }
}

function copyTaskToNeutralDir(taskDirPath) {
  // Neutral temp dir OUTSIDE the repo (no package.json "type":"module")
  const ws = join(tmpdir(), `ablation-armc-${Date.now()}`)
  mkdirSync(ws, { recursive: true })
  for (const f of ['README.md', 'src', 'test']) {
    if (existsSync(join(taskDirPath, f))) {
      execFileSync('cp', ['-r', join(taskDirPath, f), join(ws, f)], { stdio: 'ignore' })
    }
  }
  // Explicit CJS package.json so node treats it as CommonJS
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  return ws
}

function runTaskTest(taskDir) {
  const res = execFileSync(process.execPath, [join(taskDir, 'test', 'test.js')], {
    cwd: taskDir,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { pass: true, out: res.trim().slice(0, 200) }
}

/**
 * Run arm C on one task. Returns { pass, steps, tokens, ms, note }.
 * taskDirPath: absolute path to the task dir.
 */
export async function runPiWorkerArm(taskDirPath, opts = {}) {
  const started = Date.now()
  const model = opts.model || DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs || WORKER_TIMEOUT_MS

  const taskSrc = readFileSync(join(taskDirPath, 'src', 'task.js'), 'utf8')
  const testSrc = readFileSync(join(taskDirPath, 'test', 'test.js'), 'utf8')
  const readme = readFileSync(join(taskDirPath, 'README.md'), 'utf8')

  // Neutral isolated workspace
  const ws = copyTaskToNeutralDir(taskDirPath)
  const relSrc = 'src/task.js'
  const relTest = 'test/test.js'

  const prompt = [
    `Fix the bug in src/task.js so the test passes. The dir is CommonJS (require/module.exports) — do NOT change the module format.`,
    ``,
    `## Task`,
    readme.trim(),
    ``,
    `## Current src/task.js`,
    '```js',
    taskSrc,
    '```',
    ``,
    `## test/test.js`,
    '```js',
    testSrc,
    '```',
    ``,
    `Loop pattern: propose a fix to src/task.js, run the test yourself with \`node test/test.js\`, read the failure, fix again — iterate until green (max 6 attempts).`,
    `When green (or out of attempts): return the FINAL content of src/task.js in a code block, then a one-line summary: "PASS attempts=N" or "FAIL attempts=N".`,
  ].join('\n')

  let workerId = null
  try {
    const s = await startWorker(prompt, ws, model)
    workerId = s?.worker_id || s?.id || null
    if (!workerId) throw new Error('startWorker: no worker_id: ' + JSON.stringify(s).slice(0, 300))

    // Poll until terminal or timeout
    const deadline = Date.now() + timeoutMs
    let status = 'running'
    while (Date.now() < deadline) {
      const p = await pollWorker(workerId)
      status = p?.status || 'running'
      if (['completed', 'failed', 'canceled', 'error'].includes(status)) break
      await new Promise((r) => setTimeout(r, 5000))
    }

    const timedOut = !['completed', 'failed', 'canceled', 'error'].includes(status)
    if (timedOut) {
      await cancelWorker(workerId)
      workerId = null
    }

    const ms = Date.now() - started
    // Read the final edited src from the workspace (best effort)
    let finalSrc = null
    try { finalSrc = readFileSync(join(ws, relSrc), 'utf8') } catch { /* not yet written */ }

    // Test the worker's edited file
    let test
    if (finalSrc) {
      // Copy edited src into a fresh neutral copy, run test
      const testWs = copyTaskToNeutralDir(taskDirPath)
      try {
        writeFileSync(join(testWs, relSrc), finalSrc)
        test = runTaskTest(testWs)
      } catch (e) {
        test = { pass: false, err: String(e.message).slice(0, 200) }
      } finally {
        try { rmSync(testWs, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 }) } catch {}
      }
    } else {
      test = { pass: false, err: 'no edited src found' }
    }

    // Restore original src (defensive)
    writeFileSync(join(taskDirPath, relSrc), taskSrc)

    const attempts = (finalSrc || '').match(/attempts=(\d+)/)?.[1] ?? null
    return {
      pass: test.pass,
      steps: attempts ? Number(attempts) : (timedOut ? 'timeout' : 1),
      tokens: 0, // MCP worker usage not surfaced in poll summary; estimate below
      ms,
      note: timedOut ? 'timeout' : test.pass ? (test.out || 'green') : (test.err || 'fail'),
    }
  } catch (e) {
    if (workerId) await cancelWorker(workerId)
    const ms = Date.now() - started
    return { pass: false, steps: 'error', tokens: 0, ms, note: String(e.message).slice(0, 300) }
  } finally {
    try { rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }) } catch {}
  }
}

// CLI: node arms/pi-worker.mjs <taskDirPath> [model]
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('pi-worker.mjs')) {
  const taskDir = process.argv[2]
  if (!taskDir) {
    console.error('usage: node arms/pi-worker.mjs <task-dir> [model]')
    process.exit(1)
  }
  const r = await runPiWorkerArm(taskDir, { model: process.argv[3] })
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.pass ? 0 : 1)
}
