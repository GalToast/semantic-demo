#!/usr/bin/env node
/**
 * qa-server.mjs - Deterministic single-server manager for contract checks.
 *
 * Owns exactly one static HTTP server on 127.0.0.1:8795.
 * - Writes tmp/qa-server.pid with the PID of the managed node http.Server child.
 * - On start: probes port, refuses if already occupied (no kill).
 * - On stop: reads tmp/qa-server.pid, sends SIGTERM, waits, removes stale pidfile.
 * - On status: reports pidfile state and port reachability.
 *
 * Usage:
 *   node scripts/qa-server.mjs start
 *   node scripts/qa-server.mjs stop
 *   node scripts/qa-server.mjs status
 *   node scripts/qa-server.mjs ensure   # start if not running, else no-op
 */

import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PIDFILE = path.join(ROOT, 'tmp', 'qa-server.pid')
const PORT = 8795
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.csv': 'text/csv',
  '.txt': 'text/plain; charset=utf-8'
}

// Port probe

function probePort(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)
    socket.on('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    socket.connect(PORT, HOST)
  })
}

// HTTP-level probe: confirms an HTTP server is responding.
function probePortSync() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/`, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

// PID file helpers

function readPidfile() {
  try {
    const raw = fs.readFileSync(PIDFILE, 'utf8').trim()
    const pid = Number(raw)
    if (!Number.isFinite(pid) || pid <= 0) return null
    return pid
  } catch {
    return null
  }
}

function writePidfile(pid) {
  fs.mkdirSync(path.dirname(PIDFILE), { recursive: true })
  fs.writeFileSync(PIDFILE, String(pid), 'utf8')
}

function removePidfile() {
  try {
    fs.unlinkSync(PIDFILE)
  } catch {
    // already gone
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Server lifecycle

function createServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0])
    if (urlPath === '/') urlPath = '/vector-explorer-polished.html'
    const filePath = path.resolve(ROOT, urlPath.replace(/^[/\\]+/, ''))
    const relativePath = path.relative(ROOT, filePath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found: ' + urlPath)
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      const mime = MIME[ext] || 'application/octet-stream'
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*'
      })
      fs.createReadStream(filePath).pipe(res)
    })
  })
  return server
}

async function cmdStart() {
  // 1. Check pidfile
  const recorded = readPidfile()
  if (recorded !== null) {
    if (isPidAlive(recorded)) {
      console.error(`qa-server: already running (pid ${recorded}). Use "stop" or "ensure".`)
      process.exit(2)
    }
    // Stale pidfile: clean up.
    console.error(`qa-server: removing stale pidfile (pid ${recorded} not alive)`)
    removePidfile()
  }

  // 2. Probe port
  const occupied = await probePortSync()
  if (occupied) {
    console.error(
      `qa-server: port ${PORT} is already in use by an unmanaged process. ` +
        `Stop it manually or use a different port.`
    )
    process.exit(3)
  }

  // 3. Start server
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.listen(PORT, HOST, () => {
      writePidfile(process.pid)
      console.log(`qa-server: ready on http://${HOST}:${PORT} (pid ${process.pid})`)
      resolve()
    })
    server.on('error', reject)
  })

  // Keep alive: the process exists to serve.
  // Signal handlers for graceful shutdown
  const shutdown = (signal) => {
    console.error(`qa-server: received ${signal}, shutting down`)
    server.close(() => {
      removePidfile()
      process.exit(0)
    })
    // Force-exit after 5s
    setTimeout(() => process.exit(1), 5000)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

async function cmdStop() {
  const recorded = readPidfile()
  if (recorded === null) {
    console.error('qa-server: no pidfile found. Nothing to stop.')
    process.exit(0)
  }

  if (!isPidAlive(recorded)) {
    console.error(`qa-server: pid ${recorded} is not alive. Removing stale pidfile.`)
    removePidfile()
    process.exit(0)
  }

  console.error(`qa-server: stopping pid ${recorded}...`)
  try {
    process.kill(recorded, 'SIGTERM')
  } catch (err) {
    console.error(`qa-server: failed to signal pid ${recorded}: ${err.message}`)
    removePidfile()
    process.exit(1)
  }

  // Wait up to 5s for process to exit
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (!isPidAlive(recorded)) {
      removePidfile()
      console.log(`qa-server: stopped (pid ${recorded})`)
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  console.error(`qa-server: pid ${recorded} did not exit within 5s. Leaving pidfile.`)
  process.exit(1)
}

async function cmdStatus() {
  const recorded = readPidfile()
  const portReachable = await probePortSync()

  const status = {
    pidfile: recorded !== null ? recorded : null,
    pidAlive: recorded !== null ? isPidAlive(recorded) : null,
    portReachable,
    port: PORT,
    host: HOST
  }

  if (recorded === null) {
    console.log(`qa-server: no pidfile. Port ${PORT} ${portReachable ? 'IS' : 'is NOT'} reachable.`)
  } else if (!isPidAlive(recorded)) {
    console.log(`qa-server: stale pidfile (pid ${recorded} not alive). Port ${PORT} ${portReachable ? 'IS' : 'is NOT'} reachable.`)
  } else {
    console.log(`qa-server: running (pid ${recorded}). Port ${PORT} ${portReachable ? 'IS' : 'is NOT'} reachable.`)
  }

  console.log(JSON.stringify(status, null, 2))
  process.exit(portReachable ? 0 : 1)
}

async function cmdEnsure() {
  const recorded = readPidfile()
  if (recorded !== null && isPidAlive(recorded)) {
    const reachable = await probePortSync()
    if (reachable) {
      console.log(`qa-server: already running and reachable (pid ${recorded})`)
      process.exit(0)
    }
    // Pid alive but port not reachable; don't start a second one.
    console.error(`qa-server: pid ${recorded} is alive but port ${PORT} not reachable.`)
    process.exit(2)
  }

  // Stale pidfile or no pidfile: clean and start.
  if (recorded !== null) {
    console.error(`qa-server: removing stale pidfile (pid ${recorded})`)
    removePidfile()
  }

  const occupied = await probePortSync()
  if (occupied) {
    console.error(`qa-server: port ${PORT} already in use by unmanaged process.`)
    process.exit(3)
  }

  // Start server (same as cmdStart but without its exit-on-duplicate logic)
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.listen(PORT, HOST, () => {
      writePidfile(process.pid)
      console.log(`qa-server: ready on http://${HOST}:${PORT} (pid ${process.pid})`)
      resolve()
    })
    server.on('error', reject)
  })

  const shutdown = (signal) => {
    console.error(`qa-server: received ${signal}, shutting down`)
    server.close(() => {
      removePidfile()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 5000)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// CLI

const cmd = process.argv[2] || 'status'

const commands = { start: cmdStart, stop: cmdStop, status: cmdStatus, ensure: cmdEnsure }

if (!commands[cmd]) {
  console.error(`Usage: node scripts/qa-server.mjs <start|stop|status|ensure>`)
  process.exit(1)
}

commands[cmd]().catch((err) => {
  console.error(`qa-server: ${err.message}`)
  process.exit(1)
})
