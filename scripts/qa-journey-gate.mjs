// qa-journey-gate.mjs — `npm run check:journey`: the widget-journey suite as a
// deploy tripwire. Starts the qa-server DETACHED (never spawnSync a server),
// waits for 200 (bounded), runs the suite with the RECIPE env
// (SEMANTIC_FORCE_WEBGL_SOFTWARE=1 — night-2026-08-17: the app's headless
// WebGL lane works ONLY via the repo config's env switch, never raw args),
// stops its own server via the pidfile, exits with the suite's code.
import { spawnSync, spawn } from 'node:child_process'
import http from 'node:http'

const ROOT = process.cwd()
const BASE = 'http://127.0.0.1:8795/'
const QUIET = process.argv.includes('--quiet')

let ownServer = false

function startServer() {
    ownServer = true
    const child = spawn(process.execPath, ['scripts/qa-server.mjs', 'start'], {
        stdio: QUIET ? 'ignore' : 'inherit',
        cwd: ROOT,
        detached: true
    })
    child.unref()
}

function stopServer() {
    spawnSync('node', ['scripts/qa-server.mjs', 'stop'], { stdio: 'inherit', cwd: ROOT })
}

function runSuite() {
    return (
        spawnSync('npx', ['playwright', 'test', 'tests/widget-journey.spec.js'], {
            stdio: 'inherit',
            env: {
                ...process.env,
                SEMANTIC_FORCE_WEBGL_SOFTWARE: '1',
                TEST_BASE_URL: `${BASE}`
            },
            timeout: 600_000,
            cwd: ROOT
        }).status ?? 1
    )
}

function probe() {
    return new Promise((resolve) => {
        const req = http.get(BASE, (res) => {
            res.resume()
            resolve(res.statusCode === 200)
        })
        req.setTimeout(2000, () => {
            req.destroy()
            resolve(false)
        })
        req.on('error', () => resolve(false))
    })
}

// 1. serve (reuse an already-up qa-server; otherwise start detached + wait)
if (!(await probe())) {
    startServer()
    let ok = false
    for (let i = 0; i < 30 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await probe()
    }
    if (!ok) {
        console.error('[journey-gate] server did not reach 200 (host busy?)')
        process.exit(2)
    }
}
console.log(`[journey-gate] serving at  -> 200`)
await new Promise((r) => setTimeout(r, 2500)) // cold-start settle before the suite

// 2. THE suite — the exact env recipe from night-2026-08-17
const suite = runSuite()

// 3. stop only a server we started
if (ownServer) stopServer()

console.log(`[journey-gate] suite exit=${suite} (0 = green)`)
process.exit(suite)
