#!/usr/bin/env node
/**
 * scripts/qa-static-server.mjs — minimal static server for Playwright QA.
 *
 * Serves dist/svelte as the document root (where the built app + its
 * compressed .br/.gz twins live) and negotiates Content-Encoding, so a plain
 * static server (python -m http.server) cannot be used: the build strips the
 * uncompressed originals for .dat/.json assets, leaving only the twins.
 *
 * Usage:  node scripts/qa-static-server.mjs [--port 8814]
 */
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..', 'dist', 'svelte')
const PORT = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8814)

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wav': 'audio/wav',
    '.dat': 'application/octet-stream',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
}

function guessMime(p) {
    return MIME[extname(p).toLowerCase()] || 'application/octet-stream'
}

function sendError(res, code, msg) {
    res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(msg)
}

function fileExists(p) {
    try {
        return statSync(p).isFile()
    } catch {
        return false
    }
}

function serveStatic(req, res, filePath) {
    const accept = (req.headers['accept-encoding'] || '').toLowerCase()

    // The build strips uncompressed originals for .dat/.json assets, leaving
    // only .br/.gz twins. Negotiate the twin first when the browser accepts
    // it; never 404 just because the raw original is gone.
    for (const ext of ['br', 'gz']) {
        if (!accept.includes(ext)) continue
        const twin = `${filePath}.${ext}`
        if (fileExists(twin)) {
            res.writeHead(200, {
                'content-type': guessMime(filePath),
                'content-encoding': ext === 'gz' ? 'gzip' : ext,
                'content-length': statSync(twin).size,
                vary: 'Accept-Encoding',
                'cache-control': 'no-cache'
            })
            createReadStream(twin).pipe(res)
            return
        }
    }

    if (fileExists(filePath)) {
        res.writeHead(200, {
            'content-type': guessMime(filePath),
            'content-length': statSync(filePath).size,
            'cache-control': 'no-cache'
        })
        createReadStream(filePath).pipe(res)
        return
    }

    sendError(res, 404, 'Not found')
}

// The app is built under dist/svelte, so the canonical URL is
// /dist/svelte/index.html. Accept both that prefix and bare paths (the
// latter for ad-hoc probes) — strip the prefix when present so the same
// server answers both.
const PREFIX = 'dist/svelte/'

const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    let pathname = url.pathname
    if (pathname === '/') pathname = '/index.html'
    let rel = pathname.replace(/^\//, '')
    if (rel.startsWith(PREFIX)) rel = rel.slice(PREFIX.length)
    const filePath = resolve(ROOT, rel)
    if (!filePath.startsWith(ROOT)) {
        sendError(res, 403, 'Forbidden')
        return
    }
    serveStatic(req, res, filePath)
})

server.listen(PORT, '127.0.0.1', () => {
    console.log(`qa-static-server listening on http://127.0.0.1:${PORT} (root: ${ROOT})`)
})
server.on('error', (err) => {
    console.error('qa-static-server error:', err.message)
    process.exit(1)
})
