// qa-ready.mjs — pre-flight guard for the browser suite classes that cost this
// repo two nights (C-class taxonomy: dev-server oracle, static-root-404, stale
// dist, missing corpus, port clashes). Exit 0 = ready; 1 = fix first.
// Usage: node scripts/qa-ready.mjs [--battery]
//   plain    : unit/contract-safe checks (corpus, dist freshness, ports)
//   --battery: also warns when a GPU suite is running (battery discipline)
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const dist = `${ROOT}/dist/svelte/index.html`
const corpus = `${ROOT}/src/data.dat`
const failures = []
const warn = (msg) => console.log(`  [warn] ${msg}`)
const fail = (msg) => { console.log(`  [FAIL] ${msg}`); failures.push(msg) }

console.log('qa-ready probe:', ROOT)

// 1. Corpus (the 8406-point worktree foot-gun)
if (!existsSync(corpus)) fail(`src/data.dat MISSING — copy from another checkout (points:0 silently)`)

// 2. dist freshness (stale dist = the STRICT_FRESH abort + phantom reds)
if (!existsSync(dist)) {
    fail(`dist/svelte/index.html MISSING — run npm run build first`)
} else {
    const distAgeMs = Date.now() - statSync(dist).mtimeMs
    if (distAgeMs > 30 * 60 * 1000) warn(`dist built >30 min ago — rebuild before STRICT_FRESH suites`)
}

// 3. port clashes (8796 test-server / 5173 dev-server)
const ports = [
    ['8796', 'test-server (playwright-web-server)'],
    ['5173', 'vite dev (deep-link spec wants this ::1)']
]
for (const [port, who] of ports) {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true })
    if (r.stdout?.includes(`:${port} `)) warn(`port ${port} in use (${who})`)
}

// 4. GPU-battery discipline (optional)
if (process.argv.includes('--battery')) {
    const r = spawnSync('tasklist', [], { encoding: 'utf8' })
    const chromiumCount = (r.stdout || '').split(/\r?\n/).filter((l) => /chrome|chromium/.test(l)).length
    if (chromiumCount > 4) warn(`${chromiumCount} chromium processes — a suite may be mid-run; avoid parallel gates`)
}

if (failures.length) {
    console.log(`\nCURED: ${failures.length} hard blockers found.`)
    process.exit(1)
}
console.log('\nREADY (warnings above are advisory).')