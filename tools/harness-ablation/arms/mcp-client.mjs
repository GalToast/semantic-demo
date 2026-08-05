#!/usr/bin/env node
/**
 * arms/mcp-client.mjs — minimal stdio MCP client for the external-subagents
 * server. Used by pi-worker.mjs (arm C) to drive a real Pi worker.
 *
 * Usage:
 *   node mcp-client.mjs start  '<json: {prompt,cwd,model}>'   -> prints start result JSON
 *   node mcp-client.mjs poll   <worker_id>                    -> prints {status, pid_alive, output_state}
 *   node mcp-client.mjs cancel <worker_id>                    -> prints 'canceled'
 *   node mcp-client.mjs watch  '<json: {prompt,cwd,model,timeoutMs}>'
 *       -> ONE server instance: start, poll until terminal/timeout, cancel on
 *          timeout, then prints {worker_id,status,timedOut} (the runner parses this)
 *
 * Speaks JSON-RPC 2.0 over the server's stdio transport (StdioServerTransport).
 */
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER = join(__dirname, '..', '..', '..', '..', '..', 'harness', 'servers', 'external-subagents', 'dist', 'mmx.js')
// Stable out_dir shared by start/poll/cancel/watch so workers are found (per-server context)
const OUT_DIR = process.env.ARMC_WORKER_DIR || join('C:', 'Users', 'HP', 'tmp', 'ablation-armc-workers')

function rpc(server, method, params, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    let buf = ''
    let settled = false
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`${method} timed out`))
      }
    }, timeoutMs)
    server.stdout.on('data', (d) => {
      buf += d.toString()
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.id === id) {
          settled = true
          clearTimeout(timer)
          if (msg.error) reject(new Error(JSON.stringify(msg.error)))
          else resolve(msg.result)
        }
      }
    })
    server.stderr.on('data', (d) => {
      const s = d.toString().trim()
      if (/fatal|uncaught|EADDRINUSE/i.test(s)) reject(new Error(s.slice(0, 200)))
    })
    server.on('exit', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`server exited code=${code}${buf ? '; buf=' + buf.slice(-200) : ''}`))
      }
    })
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function call(server, name, args) {
  const res = await rpc(server, 'tools/call', { name, arguments: args })
  const text = res?.content?.[0]?.text
  if (text) {
    try { return JSON.parse(text) } catch { return { __raw: text } }
  }
  return res
}

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'error'])

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const server = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
  })

  try {
    await rpc(server, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'harness-ablation-armc', version: '1.0.0' },
    })
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

    if (cmd === 'start') {
      const { prompt, cwd, model } = JSON.parse(arg)
      const res = await call(server, 'external_subagent_start', {
        prompt_text: prompt, cwd, model, mode: 'yolo', live_steer: false, out_dir: OUT_DIR,
      })
      console.log(JSON.stringify(res))
    } else if (cmd === 'poll') {
      const res = await call(server, 'external_subagent_poll', { worker_id: arg, out_dir: OUT_DIR })
      console.log(JSON.stringify({ status: res?.status, pid_alive: res?.pid_alive, output_state: res?.output_state }))
    } else if (cmd === 'cancel') {
      await call(server, 'external_subagent_cancel', { worker_id: arg, out_dir: OUT_DIR })
      console.log('canceled')
    } else if (cmd === 'watch') {
      const { prompt, cwd, model, timeoutMs = 120000 } = JSON.parse(arg)
      const started = Date.now()
      const startRes = await call(server, 'external_subagent_start', {
        prompt_text: prompt, cwd, model, mode: 'yolo', live_steer: false, out_dir: OUT_DIR,
      })
      const workerId = startRes?.worker_id || startRes?.id
      if (!workerId) throw new Error('watch: no worker_id in start response')
      let status = 'running'
      let timedOut = false
      while (Date.now() - started < timeoutMs) {
        const p = await call(server, 'external_subagent_poll', { worker_id: workerId, out_dir: OUT_DIR })
        status = p?.status || 'running'
        if (TERMINAL.has(status)) break
        await new Promise((r) => setTimeout(r, 5000))
      }
      timedOut = !TERMINAL.has(status)
      if (timedOut) {
        try { await call(server, 'external_subagent_cancel', { worker_id: workerId, out_dir: OUT_DIR }) } catch {}
      }
      console.log(JSON.stringify({ worker_id: workerId, status, timedOut, elapsedMs: Date.now() - started }))
    } else {
      console.error('usage: mcp-client.mjs <start|poll|cancel|watch> ...')
      process.exit(1)
    }
  } catch (e) {
    console.error('mcp-client error:', e.message)
    process.exit(1)
  } finally {
    server.kill()
  }
}

main()
