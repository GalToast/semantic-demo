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
 *   node scripts/verify-env.mjs --preflight-only  # assets/API/build checks, no suites
 *
 * Set VERIFY_REQUIRE_LIVE_API=1 for a release-style fail-closed API check.
 * Without it, an absent API is allowed for the static/demo gate but is reported
 * as INCOMPLETE rather than being counted as a fully green verification.
 *
 * Exit code: 0 iff no required step failed. Optional capability gaps return 0
 * with an explicit INCOMPLETE summary; set VERIFY_REQUIRE_LIVE_API=1 when the
 * live API is required.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const UNIT_ONLY = argv.includes('--unit-only')
const JOURNEYS_ONLY = argv.includes('--journeys-only')
const NO_BUILD = argv.includes('--no-build')
const PREFLIGHT_ONLY = argv.includes('--preflight-only')
const REQUIRE_LIVE_API = process.env.VERIFY_REQUIRE_LIVE_API === '1'
const POOL_IDX = argv.indexOf('--pool')
const POOL = POOL_IDX !== -1 ? argv[POOL_IDX + 1] : undefined // e.g. --pool forks
const PORT = Number(process.env.VERIFY_PORT || 8811)
const API_BASE = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8795'
const ROOT = process.cwd()
const DIST_INDEX = join(ROOT, 'dist', 'svelte', 'index.html')
const REQUIRED_RUNTIME_ASSETS = [
    { path: join('dist', 'svelte', 'data.dat'), minBytes: 1024 * 1024 },
    { path: join('dist', 'svelte', 'data', 'rows.bin'), minBytes: 1024 },
    { path: join('dist', 'svelte', 'data', 'semantic_threads_ui.dat.bin'), minBytes: 1024 }
]
const results = []
let staticServer = null

function step(name, ok, detail = '', state = ok ? 'pass' : 'fail') {
    results.push({ name, ok, state, detail })
    const marker = state === 'incomplete' ? '⚠' : ok ? '✓' : '✗'
    console.log(`${marker} ${name}${detail ? ` — ${detail}` : ''}`)
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
        if (!r.ok) return { available: false, reason: `http-${r.status}` }
        await r.json()
        return { available: true, reason: 'ok' }
    } catch (error) {
        return { available: false, reason: error?.name === 'AbortError' ? 'timeout' : 'unreachable' }
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

function checkRuntimeAssets() {
    const failures = []
    for (const asset of REQUIRED_RUNTIME_ASSETS) {
        const full = join(ROOT, asset.path)
        try {
            const size = statSync(full).size
            if (size < asset.minBytes) {
                failures.push(`${asset.path} is only ${size} bytes (minimum ${asset.minBytes})`)
            }
        } catch {
            failures.push(`${asset.path} is missing`)
        }
    }
    return failures
}

// ── Steps ────────────────────────────────────────────────────────────────────

// 1. Live-API availability probe (report-only).
{
    const live = await probeApi()
    const liveDetail = live.available
        ? 'LIVE — live-gated specs (B-A1) will execute'
        : `${REQUIRE_LIVE_API ? 'REQUIRED / ABSENT' : 'ABSENT'} (${live.reason}) — live-gated specs will self-skip; start \`npm run serve\` to exercise them`
    step(
        `live API probe (${API_BASE.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'configured endpoint'})`,
        live.available || !REQUIRE_LIVE_API,
        liveDetail,
        live.available ? 'pass' : REQUIRE_LIVE_API ? 'fail' : 'incomplete'
    )
    if (!live.available && REQUIRE_LIVE_API) {
        console.error('✗ VERIFY_REQUIRE_LIVE_API=1 requires a reachable, JSON-speaking live API.')
        process.exit(1)
    }
}

// 2. Build with VITE_API_BASE_URL baked in.
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

// 3. Restore plain data twins after the build. The build's compression gate
// must see a clean dist tree; the verification server still needs the
// decompressed runtime artifacts.
{
    const ok = run('node', ['scripts/decompress-data-twins.mjs'])
    step('data twins restored', ok)
    if (!ok) process.exit(1)
}

// 4. Runtime data preflight. A build with missing private corpus assets can
// otherwise produce a valid-looking shell that boots with points:0. Fail here
// before starting the static server or spending minutes in journey readiness.
{
    const failures = checkRuntimeAssets()
    if (failures.length > 0) {
        step('runtime data assets', false, failures.join('; '))
        process.exit(1)
    }
    step('runtime data assets', true, 'required corpus and semantic artifacts are present')
}

if (PREFLIGHT_ONLY) {
    console.log('\n── verify-env summary ──')
    for (const r of results) console.log(`${r.state === 'incomplete' ? '⚠' : r.ok ? '✓' : '✗'} ${r.name}`)
    const failed = results.filter((r) => !r.ok)
    const incomplete = results.filter((r) => r.state === 'incomplete')
    if (failed.length > 0) console.log(`${failed.length} preflight step(s) failed`)
    else if (incomplete.length > 0) console.log(`PREFLIGHT INCOMPLETE — ${incomplete.map((r) => r.name).join(', ')}`)
    else console.log('PREFLIGHT GREEN')
    process.exit(failed.length === 0 ? 0 : 1)
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
const incomplete = results.filter((r) => r.state === 'incomplete')
console.log(`\n── verify-env summary ──`)
for (const r of results) console.log(`${r.state === 'incomplete' ? '⚠' : r.ok ? '✓' : '✗'} ${r.name}`)
if (failed.length > 0) console.log(`${failed.length} step(s) failed`)
else if (incomplete.length > 0) console.log(`INCOMPLETE — ${incomplete.map((r) => r.name).join(', ')}`)
else console.log('ALL GREEN')
process.exit(failed.length === 0 ? 0 : 1)
