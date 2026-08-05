#!/usr/bin/env node
/**
 * arms/mcp-client.mjs — minimal stdio MCP client for the external-subagents
 * server. Used by pi-worker.mjs (arm C) to start/poll/cancel a real Pi worker.
 *
 * Usage: node mcp-client.mjs start '<json: {prompt,cwd,model}>'
 *        node mcp-client.mjs poll <worker_id>
 *        node mcp-client.mjs cancel <worker_id>
 *
 * Speaks JSON-RPC 2.0 over the server's stdio transport (StdioServerTransport).
 */
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER = join(__dirname, '..', '..', '..', '..', '..', 'harness', 'servers', 'external-subagents', 'dist', 'mmx.js')
// Stable out_dir shared by start/poll/cancel so workers are found (per-server context)
const OUT_DIR = process.env.ARMC_WORKER_DIR || join('C:', 'Users', 'HP', 'tmp', 'ablation-armc-workers')

function rpc(server, method, params) {
  return new Promise((resolve, reject) => {
    let buf = ''
    let settled = false
    const id = Math.floor(Math.random() * 1e9)
    server.stdout.on('data', (d) => {
      buf += d.toString()
      // MCP may emit notifications (no id) + responses (with id); parse lines
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.id === id) {
          settled = true
          if (msg.error) reject(new Error(JSON.stringify(msg.error)))
          else resolve(msg.result)
        }
      }
    })
    server.stderr.on('data', (d) => {
      // server logs to stderr; ignore unless it's a fatal
      const s = d.toString().trim()
      if (/fatal|uncaught|EADDRINUSE/i.test(s)) reject(new Error(s.slice(0, 200)))
    })
    server.on('exit', (code) => {
      if (!settled) reject(new Error(`server exited code=${code}${buf ? '; buf=' + buf.slice(-200) : ''}`))
    })
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const server = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
  })

  try {
    // MCP handshake
    await rpc(server, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'harness-ablation-armc', version: '1.0.0' },
    })
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

    if (cmd === 'start') {
      const { prompt, cwd, model } = JSON.parse(arg)
      const res = await rpc(server, 'tools/call', {
        name: 'external_subagent_start',
        arguments: { prompt_text: prompt, cwd, model, mode: 'yolo', live_steer: false, out_dir: OUT_DIR },
      })
      const text = res?.content?.[0]?.text || JSON.stringify(res)
      console.log(text)
    } else if (cmd === 'poll') {
      const res = await rpc(server, 'tools/call', {
        name: 'external_subagent_poll',
        arguments: { worker_id: arg, out_dir: OUT_DIR },
      })
      const text = res?.content?.[0]?.text || JSON.stringify(res)
      const parsed = JSON.parse(text)
      console.log(JSON.stringify({ status: parsed.status, pid_alive: parsed.pid_alive, output_state: parsed.output_state }))
    } else if (cmd === 'cancel') {
      const res = await rpc(server, 'tools/call', {
        name: 'external_subagent_cancel',
        arguments: { worker_id: arg, out_dir: OUT_DIR },
      })
      console.log('canceled')
    } else {
      console.error('usage: mcp-client.mjs <start|poll|cancel> ...')
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
