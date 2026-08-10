#!/usr/bin/env node
/**
 * smoke-gate.mjs — sub-60s gate: proves the app's core invariants WITHOUT a
 * dev server or browser launch. Designed for every-commit / pre-push use.
 *
 * Stages (server-free, measured 2026-08-10 on this host):
 *   1. static checks  (~4s)  — shell/skills/manifest/token sanity
 *   2. smoke contracts (~15s) — weather, loading, scene-reveal, camera settle, motion
 *   3. pure-logic unit subset (~30s) — no Svelte/DOM: url/geo/search/data/math/seed
 *
 * Total target: < 60s. Browser+server lanes (visual-smoke, 3d-smoke, widget-journey)
 * intentionally excluded — they belong to qa:* and the release gate.
 *
 * Usage: node scripts/smoke-gate.mjs [--skip-static] [--only-unit var]
 * Exit: 0 all green / 1 any stage failed.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const run = (cmdLine, label, opts = {}) => {
    const r = spawnSync(cmdLine, {
        cwd: ROOT,
        shell: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90_000,
        ...opts
    })
    const ok = (r.status ?? -1) === 0
    console.log(`\n[gate] ${label} → ${ok ? 'PASS' : 'FAIL'} (exit ${r.status ?? -1})`)
    if (!ok) {
        console.log((r.stdout || '').slice(-1500))
        console.log((r.stderr || '').slice(-1500))
    }
    return ok
}
const start = Date.now()
const results = []

// 1. static checks — shell/skills/manifest/token sanity (~4s)
results.push(run('npm run test:static', 'static checks'))

// 2. smoke contracts — server-free mjs contracts (~15s)
results.push(run('node tests/run-all-contracts.js --group=smoke', 'smoke contracts'))
results.push(run('node', 'tests/run-all-contracts.js --group=smoke', 'smoke contracts'))

// 3. pure-logic unit subset (vitest, no server) — the regression-critical core
const unitFiles = [
    'tests/unit-active/a3-1-url-search-hydration.test.ts',
    'tests/unit-active/camera-math-utils.test.ts',
    'tests/unit-active/camera-url-state-constants-contract.test.ts',
    'tests/unit-active/data-mapper.test.ts',
    'tests/unit-active/data-store-enrichment-hydration.test.ts',
    'tests/unit-active/focus-pocket-geometry-contract.test.ts',
    'tests/unit-active/geo-data-utils.test.ts',
    'tests/unit-active/route-trace-typing-contract.test.ts',
    'tests/unit-active/search-tokenizer-parity.test.ts',
    'tests/unit-active/seeded-random-ling.test.ts'
]
const existing = unitFiles.filter((f) => existsSync(resolve(ROOT, f)))
if (existing.length === 0) {
    console.log('[gate] no unit subset found — check paths')
    results.push(false)
} else {
    const cmd = 'npx vitest run --config vitest.config.js ' + existing.join(' ')
    results.push(
        spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', stdio: 'inherit', timeout: 60_000 }).status === 0
    )
    console.log('[gate] unit-subset: ' + existing.length + ' files')
}

const elapsed = (Date.now() - start) / 1000
console.log(`\n[gate] smoke nodes took ${elapsed.toFixed(1)}s`)
process.exit(results.every(Boolean) ? 0 : 1)
