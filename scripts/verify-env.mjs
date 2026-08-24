#!/usr/bin/env node
/**
 * verify-env.mjs — ONE command that reproduces canonical test results.
 *
 * Encodes the four unwritten requirements that manufactured phantom failures
 * on 2026-08-23/24 (B-A1, W54-4486 cost hours before diagnosis):
 *   1. The served build must have VITE_API_BASE_URL baked in (same-origin
 *      /api.php 404s under ?staticDev=0 otherwise).
 *   2. Plain data twins must exist in dist/svelte/data/ (the build ships only
 *      .br/.gz; non-negotiating servers 404 the plains).
 *   3. Journey specs must be addressed via TEST_BASE_URL (widget-journey's
 *      BASE_URL ignores TEST_SERVER_PORT).
 *   4. The live API (:8795 php) is probed and reported — live-gated specs
 *      (e.g. B-A1) self-skip when absent instead of timing out.
 *
 * Usage:
 *   node scripts/verify-env.mjs                    # twins + api-probe + build + unit + journeys
 *   node scripts/verify-env.mjs --unit-only        # steps 1-2 + build + unit suite
 *   node scripts/verify-env.mjs --journeys-only    # steps 1-2 + api probe + journeys (expects built dist)
 *   node scripts/verify-env.mjs --no-build         # skip the vite build step
 *
 * Exit code: 0 iff every executed step passed.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const UNIT_ONLY = argv.includes('--unit-only')
const JOURNEYS_ONLY = argv.includes('--journeys-only')
const NO_BUILD = argv.includes('--no-build')
const POOL_IDX = argv.indexOf('--pool')
const POOL = POOL_IDX !== -1 ? argv[POOL_IDX + 1] : undefined // e.g. --pool forks
const PORT = Number(process.env.VERIFY_PORT || 8811)
const API_BASE = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8795'
const ROOT = process.cwd()
const DIST_INDEX = join(ROOT, 'dist', 'svelte', 'index.html')
const results = []
let staticServer = null

function step(name, ok, detail = '') {
    results.push({ name, ok })
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
    return ok
}

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
    return r.status === 0
}

async function probeApi() {
    try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 2500)
        const r = await fetch(`${API_BASE}/api.php?action=semantic_search&q=coffee`, { signal: ctrl.signal })
        clearTimeout(t)
        if (!r.ok) return false
        await r.json()
        return true
    } catch {
        return false
    }
}

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.dat': 'application/octet-stream',
    '.br': 'application/octet-stream',
    '.gz': 'application/octet-stream'
}

function startStaticServer() {
    return new Promise((res, rej) => {
        const srv = createServer((req, res) => {
            const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
            const file = join(ROOT, p.replace(/^\/+/, ''))
            try {
                // Path traversal guard: resolved path must stay under ROOT.
                if (!resolve(file).startsWith(ROOT)) throw new Error('traversal')
                const body = statSync(file).isFile() ? readFileSync(file) : null
                if (body === null) throw new Error('dir')
                res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
                res.end(body)
            } catch {
                if (!res.headersSent) {
                    res.writeHead(404)
                    res.end()
                }
            }
        })
        srv.once('error', rej)
        srv.listen(PORT, '127.0.0.1', () => {
            staticServer = srv
            res()
        })
    })
}

// ── Steps ────────────────────────────────────────────────────────────────────

// 1. Plain data twins (idempotent, ~2s).
{
    const ok = run('node', ['scripts/decompress-data-twins.mjs'])
    step('data twins restored', ok)
    if (!ok) process.exit(1)
}

// 2. Live-API availability probe (report-only).
{
    const live = await probeApi()
    step(
        'live API probe (:8795)',
        true,
        live
            ? 'LIVE — live-gated specs (B-A1) will execute'
            : 'ABSENT — live-gated specs will self-skip (start `npm run serve` to exercise them)'
    )
}

// 3. Build with VITE_API_BASE_URL baked in.
if (!NO_BUILD && !JOURNEYS_ONLY) {
    const ok = run('npm', ['run', 'build:svelte'], {
        env: { ...process.env, VITE_API_BASE_URL: API_BASE }
    })
    step('build (VITE_API_BASE_URL stamped)', ok)
    if (!ok) process.exit(1)
} else if (!existsSync(DIST_INDEX)) {
    console.error(`✗ dist/svelte/index.html missing and --no-build/--journeys-only set. Run a build first.`)
    process.exit(1)
} else {
    step('build', true, 'skipped (--no-build/--journeys-only), existing dist found')
}

await startStaticServer()
step(`static server on :${PORT}`, true)

const testEnv = {
    ...process.env,
    TEST_BASE_URL: `http://127.0.0.1:${PORT}`,
    VITE_API_BASE_URL: API_BASE,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=6144`.trim()
}

// 4. Unit suite (via scripts/run-vitest.mjs — heap-bounded launcher that owns
//    the single-flight lock contract; fail fast with a hint if locked).
let unitStatus
if (!JOURNEYS_ONLY) {
    if (existsSync(join(ROOT, 'tmp', 'vitest.single-flight.lock'))) {
        step('unit suite', false, 'tmp/vitest.single-flight.lock held by another run — wait and retry')
    } else {
        const nodeBin = process.execPath
        // Known-infra note: under the repo default vmThreads pool,
        // canvas-keyboard-nav can shed ~11 tests depending on worker grouping
        // (shared-VM pollution — see project memory 'vmThreads grouping').
        // `--pool forks` eliminates that class but currently trips 2 vm-tuned
        // tests (ssr-probe, search-engine-abort-bypass). Neither pool is
        // 100% green yet; the step below reports which world you're in.
        const extraArgs = POOL ? ['--pool', POOL] : []
        unitStatus = await new Promise((res) => {
            // Route through the repo's heap-bounded launcher (run-vitest.mjs):
            // it re-spawns node with the 6GB ceiling and forwards args.
            const child = spawn(
                nodeBin,
                ['scripts/run-vitest.mjs', 'run', '--config', 'vitest.config.js', '--maxWorkers=2', ...extraArgs],
                { env: { ...testEnv }, stdio: 'inherit' }
            )
            child.on('exit', (code) => res(code === 0))
        })
        step(`unit suite (vitest${POOL ? `, pool=${POOL}` : ', repo-default pool'})`, unitStatus)
    }
}

// 5. Journey gate via the canonical wrapper (D3D11 + low-contention defaults),
//    pointed at OUR server, no rebuild (we just built with the right env).
let journeyStatus
if (!UNIT_ONLY) {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    journeyStatus = await new Promise((res) => {
        const child = spawn(npx, ['node', 'scripts/qa-journey-headless.mjs', '--no-build'], {
            shell: process.platform === 'win32',
            env: { ...testEnv },
            stdio: 'inherit'
        })
        child.on('exit', (code) => res(code === 0))
    })
    step('journey gate (82 specs)', journeyStatus)
}

if (staticServer) staticServer.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n── verify-env summary ──`)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`)
console.log(failed.length === 0 ? 'ALL GREEN' : `${failed.length} step(s) failed`)
process.exit(failed.length === 0 ? 0 : 1)
