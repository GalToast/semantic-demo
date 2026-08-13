#!/usr/bin/env node
/**
 * scripts/playwright-web-server.mjs
 * Cross-platform wrapper for the Playwright webServer command.
 * Sets VITE_API_BASE_URL then runs build + test-server.
 * Works on Windows, Linux, and macOS.
 */
import { execSync } from 'node:child_process'
import { getPlaywrightDistFreshness } from './playwright-dist-freshness.mjs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

function isPortInUse(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = createConnection(port, host)
        socket.once('connect', () => { socket.destroy(); resolve(true) })
        socket.once('error', () => resolve(false))
    })
}

// The API origin the browser should talk to. Defaults to the local static
// stand-in for backward compat (a NODE server — /api.php there is served as
// raw text, never executed). When a REAL PHP executor is up, start with
// PHP_API_URL. E.g. php -S 127.0.0.1:8799 -t . + PHP_API_URL=http://127.0.0.1:8799.
// (See tmp/test-topology-audit-2026-08-04 for the full topology census.)
const API_HOST = process.env.PHP_API_URL || process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8795'
process.env.VITE_API_BASE_URL = API_HOST

console.log(`[playwright-web-server] VITE_API_BASE_URL=${API_HOST}`)

// Fail fast if 8796 is already bound by an unexpected holder.
// PLAYWRIGHT_REUSE_SERVER=1 is handled by Playwright itself (it skips this
// command when reuseExistingServer is true and the port is live), so reaching
// here means the port is either free or unexpectedly occupied.
const portOccupied = await isPortInUse(8796)
if (portOccupied) {
    console.error('[playwright-web-server] ERROR: Port 8796 is already bound by another process.')
    console.error('If this is unexpected, stop the exact PID (never broad kills):')
    console.error('  netstat -ano | findstr :8796')
    console.error('  taskkill /F /PID <pid>')
    console.error('To explicitly reuse an existing server, set PLAYWRIGHT_REUSE_SERVER=1.')
    process.exit(1)
}

const distIndex = process.env.PLAYWRIGHT_DIST_INDEX || resolve(ROOT, 'dist/svelte/index.html')
const freshness = getPlaywrightDistFreshness({ root: ROOT, distIndex })
const forceBuild = process.env.PLAYWRIGHT_FORCE_BUILD === '1'

if (forceBuild || !freshness.fresh) {
    const reason = forceBuild ? 'PLAYWRIGHT_FORCE_BUILD=1' : `dist ${freshness.reason}`
    console.log(`[playwright-web-server] Running npm run build (${reason})...`)
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
} else {
    console.log(`[playwright-web-server] Reusing fresh dist (${distIndex})`)
}

console.log('[playwright-web-server] Starting test server on port 8796...')
execSync('node scripts/test-server.mjs', { cwd: ROOT, stdio: 'inherit' })
