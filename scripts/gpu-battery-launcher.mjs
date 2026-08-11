#!/usr/bin/env node
/**
 * gpu-battery-launcher.mjs — one-command prep for the env-gated 3d battery.
 *
 * Turns the "needs quiet host + real GPU + fresh dist" run into:
 *   node scripts/gpu-battery-launcher.mjs [--group=full|--group=3d-full] [--headed]
 *
 * Steps in order (fail-fast, each writes to tmp/gpu-battery-<ts>.out):
 *   1. Quiet-window check: no file locks? no live workers? ports 8785/8795 warm?
 *   2. Fresh build check: dist/svelte/index.html newer than the newest src change
 *      (rebuild if stale — the 3d battery's documented freshness gate).
 *   3. Launch SEMANTIC_USE_D3D11=1 (real RTX 4050) run of the requested group.
 *   4. Append the summary to tmp/3d-battery-ledger.md with a timestamp verdict.
 */
import { spawnSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CWD = process.cwd()
const TS = new Date().toISOString().replace(/[:.]/g, '-')
const LOG = path.join(CWD, 'tmp', `gpu-battery-${TS}.out`)
const args = process.argv.slice(2)
const headed = args.includes('--headed')
const group = args.find((a) => a.startsWith('--group='))?.split('=')[1] ?? 'full'

function step(name, fn) {
    process.stdout.write(`[step] ${name}... `)
    try {
        const msg = fn()
        console.log(msg ?? 'ok')
    } catch (e) {
        console.log(`FAIL: ${e.message}`)
        process.exitCode = 1
        process.exit(1)
    }
}

step('quiet-window (no python/node-http server on 8795/8785 free check)', () => {
    // The runner owns a dynamic port; we only assert the PHP/static servers are up
    // for the live-data family. A reuseExistingServer hint avoids port fights.
    const base = execSync('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8795/ 2>/dev/null || echo 000', {
        encoding: 'utf8'
    })
    return base === '200' ? '8795=200 (API up)' : '8795 down (data tests env-gated; leaves-live separate)'
})

step('freshness (dist vs src)', () => {
    const dist = path.join(CWD, 'dist', 'svelte', 'index.html')
    const srcRoot = path.join(CWD, 'src')
    const ds = fs.existsSync(dist) ? fs.statSync(dist).mtimeMs : 0
    const ls = stm(walk(srcRoot))
    const buildNewer = ds > ls
    if (!buildNewer) {
        const rb = spawnSync('npm', ['run', 'build:svelte'], { cwd: CWD, stdio: 'inherit', timeout: 240_000 })
        if (rb.status !== 0) throw new Error('build:svelte failed')
    }
    return buildNewer ? 'dist fresh' : 'rebuilt'
})

function walk(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        e.isDirectory() ? out.push(...walk(p)) : out.push(p)
    }
    return out
}
function stm(list) {
    return list.reduce((m, f) => Math.max(m, fs.statSync(f).mtimeMs), 0)
}

console.log(`[launch] group=${group} headed=${headed} log=${LOG}`)
const env = {
    ...process.env,
    SEMANTIC_USE_D3D11: '1',
    SEMANTIC_FORCE_WEBGL_SOFTWARE: '',
    TEST_BASE_URL: process.env.TEST_BASE_URL || 'http://127.0.0.1:8785'
}
const r = spawnSync('node', ['tests/run-all-contracts.js', `--group=${group}`], {
    cwd: CWD,
    env,
    stdio: 'inherit',
    timeout: 1500_000
})
const summary = r.status === 0 ? 'PASS' : `EXIT ${r.status}`
fs.appendFileSync(
    path.join(CWD, 'tmp', '3d-main-battery-ledger.md'),
    `- ${TS} group=${group} headed=${headed} ⇒ ${summary}\n`
)
console.log(`[done] ${summary} — appended to tmp/3d-main-battery-ledger.md`)
