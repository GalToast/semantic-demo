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
    const serverStartTime = Date.now()
    const DIST_SVELTE = path.resolve(ROOT, 'dist', 'svelte')

    /**
     * Resolve a URL path to a file path, preferring the build output
     * (dist/svelte/) when a matching file exists there. This ensures
     * the qa-server reflects the latest build after a rebuild without
     * a restart — a common source of verification confusion (W5).
     */
    function resolveDistPreferringPath(urlPath) {
        const relative = urlPath.replace(/^[/\\]+/, '')

        // First check if the path exists under dist/svelte/
        const distCandidate = path.resolve(DIST_SVELTE, relative)
        try {
            const distStat = fs.statSync(distCandidate)
            if (distStat.isFile()) {
                return distCandidate
            }
        } catch {
            // Not in dist/svelte — will fall back to ROOT
        }

        // Fall back to ROOT (original behavior — for files like
        // semantic-demo.css and vector-explorer-pandora.css that
        // are served from the repo root during dev)
        return path.resolve(ROOT, relative)
    }

    const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent(req.url.split('?')[0])
        if (urlPath === '/') urlPath = '/dist/svelte/index.html'
        if (urlPath === '/data/' || urlPath.startsWith('/data/')) {
            urlPath = urlPath.replace('/data/', '/public/data/')
        }
        const filePath = resolveDistPreferringPath(urlPath)
        const relativePath = path.relative(ROOT, filePath)
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            res.writeHead(403)
            res.end('Forbidden')
            return
        }
        fs.stat(filePath, (err, stat) => {
            if (err || !stat.isFile()) {
                // If the path didn't exist under either dist/svelte or ROOT,
                // try ROOT directly as final fallback with the /data/ remap
                if (urlPath.startsWith('/public/data/')) {
                    const rootFallback = path.resolve(ROOT, urlPath.replace(/^[/\\]+/, ''))
                    return fs.stat(rootFallback, (err2, stat2) => {
                        if (err2 || !stat2.isFile()) {
                            res.writeHead(404, { 'Content-Type': 'text/plain' })
                            res.end('Not found: ' + urlPath)
                            return
                        }
                        serveFile(req, res, rootFallback, stat2, serverStartTime)
                    })
                }
                res.writeHead(404, { 'Content-Type': 'text/plain' })
                res.end('Not found: ' + urlPath)
                return
            }
            serveFile(req, res, filePath, stat, serverStartTime)
        })
    })
    return server
}

function serveFile(req, res, filePath, stat, serverStartTime) {
    // W5: Log a warning when a file was modified after the server started.
    // This helps catch rebuild-stale scenarios without forcing a restart.
    if (stat.mtimeMs > serverStartTime) {
        console.error(
            `[qa-server] WARNING: "${path.basename(filePath)}" was modified ` +
                `after server start (mtime ${new Date(stat.mtimeMs).toISOString()} > ` +
                `start ${new Date(serverStartTime).toISOString()}). ` +
                `The file may not reflect the latest build.`
        )
    }
    const ext = path.extname(filePath).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'
    const urlPath = new URL(req.url ?? '/', `http://${HOST}:${PORT}`).pathname

    // W63: replicate the cache policy from w44PreviewCacheHeadersPlugin so the
    // Lighthouse QA server rewards hashed assets and data files with long-lived
    // caching, instead of reporting cacheLifetimeMs = 0 for everything.
    const hashed = /[-][A-Za-z0-9_-]{8,}\.(js|css|svg|woff2?|png|jpg|jpeg|webp|dat|json|wasm)(\.gz|\.br)?$/.test(
        urlPath
    )
    const dataAsset = /\.(dat|json)(\.gz|\.br)?$/.test(urlPath)
    const precompressed = urlPath.endsWith('.br') || urlPath.endsWith('.gz')
    const acceptsBrotli = String(req.headers['accept-encoding'] ?? '').includes('br')
    const acceptsGzip = String(req.headers['accept-encoding'] ?? '').includes('gzip')

    // Serve precompressed .br/.gz assets when the client accepts the encoding and
    // the compressed file exists. This is the same logic used by Vite preview for
    // dist/svelte/data.dat.br, etc.
    const tryPrecompressed = async () => {
        if (!precompressed) {
            const encoding = acceptsBrotli ? 'br' : acceptsGzip ? 'gzip' : null
            if (!encoding) return null
            const compressedPath = `${filePath}.${encoding === 'br' ? 'br' : 'gz'}`
            try {
                const compressedStat = fs.statSync(compressedPath)
                if (compressedStat.isFile()) {
                    return { filePath: compressedPath, stat: compressedStat, encoding }
                }
            } catch {
                // compressed variant not available; fall back to raw stream
            }
        }
        return null
    }

    const send = async () => {
        const precompressed = await tryPrecompressed()
        const finalPath = precompressed?.filePath ?? filePath
        const finalStat = precompressed?.stat ?? stat
        // Content-Type describes the DECOMPRESSED payload, so it must come from the
        // original path (e.g. .css/.js), NOT the .br/.gz transport suffix that
        // tryPrecompressed appends. Using finalExt here yields
        // 'application/octet-stream' for every precompressed asset, so browsers
        // reject the stylesheet (cssRules==0) and the page renders unstyled.
        const contentType = MIME[ext] || 'application/octet-stream'

        const headers = {
            'Content-Type': contentType,
            'Content-Length': finalStat.size,
            'Access-Control-Allow-Origin': '*',
            Vary: 'Accept-Encoding'
        }
        if (precompressed?.encoding === 'br') {
            headers['Content-Encoding'] = 'br'
        } else if (precompressed?.encoding === 'gzip') {
            headers['Content-Encoding'] = 'gzip'
        }
        if (hashed) {
            headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        } else if (dataAsset) {
            headers['Cache-Control'] = 'public, max-age=300, stale-while-revalidate=86400'
        } else if (!precompressed && !urlPath.endsWith('.html')) {
            // Reasonable default for unhashed static assets (fonts, root CSS,
            // favicon, etc.) so repeat contract-test runs are not uncached.
            headers['Cache-Control'] = 'public, max-age=3600'
        }

        res.writeHead(200, headers)
        fs.createReadStream(finalPath).pipe(res)
    }

    send().catch((err) => {
        console.error(`[qa-server] serveFile error for ${filePath}:`, err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal server error')
    })
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

    // 3. Start server (hard start-deadline: parallel storms wedged this forever;
    // fail fast with diagnosis instead of hanging silent).
    const server = createServer()
    const startDeadline = setTimeout(() => {
        console.error(
            'qa-server: START TIMED OUT (30s) — host under load or a zombie holds :8795; run `tasklist | findstr node` to check.'
        )
        process.exit(2)
    }, 30_000)
    startDeadline.unref?.()
    await new Promise((resolve, reject) => {
        server.listen(PORT, HOST, () => {
            clearTimeout(startDeadline)
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
        console.log(
            `qa-server: stale pidfile (pid ${recorded} not alive). Port ${PORT} ${portReachable ? 'IS' : 'is NOT'} reachable.`
        )
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
