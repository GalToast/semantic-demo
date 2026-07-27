#!/usr/bin/env node
/**
 * scripts/test-server.mjs — Static + API proxy for Playwright tests.
 *
 * Serves the built Svelte app and root assets from the repo root, while
 * proxying `/api.php` to the PHP backend on 127.0.0.1:8795.
 *
 * Why this exists: the PHP CLI server (`php -S`) is single-threaded. When it
 * is also forced to serve static assets (HTML/CSS/JS/data), the API requests
 * queue behind long-running static transfers and contract tests time out.
 * This tiny Node server keeps static files off the PHP port so `/api.php`
 * stays responsive.
 */
import { createServer, request as httpRequest } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const PHP_TARGET = process.env.PHP_API_URL || 'http://127.0.0.1:8795'
const PORT = Number(process.env.TEST_SERVER_PORT || 8796)

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.ts': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.dat': 'application/octet-stream',
    '.gz': 'application/gzip',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8'
}

const DEFAULT_MIME = 'application/octet-stream'

function guessMime(filePath) {
    return MIME_TYPES[extname(filePath).toLowerCase()] || DEFAULT_MIME
}

function sendError(res, status, message) {
    const body = Buffer.from(message)
    res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length
    })
    res.end(body)
}

function serveStatic(req, res, filePath) {
    try {
        const st = statSync(filePath)
        if (!st.isFile()) {
            sendError(res, 404, 'Not found')
            return
        }
        res.writeHead(200, {
            'Content-Type': guessMime(filePath),
            'Content-Length': st.size,
            'Cache-Control': 'no-cache'
        })
        createReadStream(filePath).pipe(res)
    } catch (e) {
        sendError(res, 404, 'Not found')
    }
}

function proxyApi(req, res) {
    const targetUrl = new URL(req.url, PHP_TARGET)
    const proxyReq = httpRequest(
        targetUrl,
        {
            method: req.method,
            headers: {
                ...req.headers,
                host: targetUrl.host
            }
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
            proxyRes.pipe(res)
        }
    )
    proxyReq.on('error', (err) => {
        sendError(res, 502, `PHP proxy error: ${err.message}`)
    })
    req.pipe(proxyReq)
}

const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const pathname = url.pathname

    if (pathname === '/api.php' || pathname.startsWith('/api.php/')) {
        proxyApi(req, res)
        return
    }

    const filePath = resolve(ROOT, pathname.replace(/^\//, ''))
    // Prevent traversal outside repo root.
    if (!filePath.startsWith(ROOT + '\\') && filePath !== ROOT) {
        sendError(res, 403, 'Forbidden')
        return
    }
    serveStatic(req, res, filePath)
})

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Test server listening on http://127.0.0.1:${PORT}`)
    console.log(`Proxying /api.php -> ${PHP_TARGET}`)
})

server.on('error', (err) => {
    console.error('Test server error:', err)
    process.exit(1)
})
