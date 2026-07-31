#!/usr/bin/env node
/**
 * qa-serve.mjs - Persistent static-file server for contract checks.
 *
 * Serves the repo root on 127.0.0.1:8795 with a compatible pidfile
 * (tmp/qa-server.pid) so that scripts/qa-server.mjs status/stop
 * commands can manage it.
 *
 * - Already-running detection: exits 0 with a message if the pidfile
 *   pid is alive OR the port is reachable.
 * - Graceful shutdown on SIGINT/SIGTERM: removes pidfile, closes server.
 * - Correct Content-Type for .html/.js/.css/.json/.dat/.br/.gz.
 * - Uses only Node built-ins (http, fs, path, os).
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
    '.dat': 'application/octet-stream',
    '.br': 'application/octet-stream',
    '.gz': 'application/gzip'
}

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

function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    return MIME[ext] || 'application/octet-stream'
}

function safeResolve(base, urlPath) {
    // Strip query string and hash
    let clean = urlPath.split('?')[0].split('#')[0]
    // Decode URI components
    try {
        clean = decodeURIComponent(clean)
    } catch {
        // malformed URI — serve 400
        return null
    }
    // Map root to /dist/svelte/index.html
    if (clean === '/' || clean === '') {
        clean = '/dist/svelte/index.html'
    }
    // Resolve against base, then verify the result is inside base
    const resolved = path.resolve(base, clean.replace(/^\/+/, ''))
    const relative = path.relative(base, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return null
    }
    return resolved
}

const server = http.createServer((req, res) => {
    const filePath = safeResolve(ROOT, req.url ?? '/')
    if (filePath === null) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad request')
        return
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not found: ' + req.url)
            return
        }
        const ct = contentTypeFor(filePath)
        res.writeHead(200, {
            'Content-Type': ct,
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*'
        })
        fs.createReadStream(filePath).pipe(res)
    })
})

async function start() {
    // 1. Already-running detection
    const recorded = readPidfile()
    if (recorded !== null && isPidAlive(recorded)) {
        console.log(`qa-serve: already running (pid ${recorded}).`)
        process.exit(0)
    }
    const portReachable = await probePort()
    if (portReachable) {
        console.log(`qa-serve: port ${PORT} is already reachable.`)
        process.exit(0)
    }
    // Stale pidfile — clean it up
    if (recorded !== null) {
        removePidfile()
    }

    // 2. Start server
    await new Promise((resolve, reject) => {
        server.listen(PORT, HOST, () => {
            writePidfile(process.pid)
            console.log(`qa-serve: ready on http://${HOST}:${PORT} (pid ${process.pid})`)
            resolve()
        })
        server.on('error', reject)
    })

    // 3. Graceful shutdown
    const shutdown = (signal) => {
        console.log(`qa-serve: received ${signal}, shutting down`)
        removePidfile()
        server.close(() => {
            process.exit(0)
        })
        // Force-exit after 5s
        setTimeout(() => process.exit(1), 5000)
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((err) => {
    console.error(`qa-serve: ${err.message}`)
    process.exit(1)
})
