#!/usr/bin/env node
/**
 * Run the headless journey gate with the low-contention renderer profile.
 *
 * The journey suite creates many WebGL contexts serially. SwiftShader keeps
 * the gate deterministic on laptops while SEMANTIC_USE_D3D11=1 remains the
 * explicit hardware-renderer path for a GPU-specific check.
 */
import { spawnSync, execSync } from 'node:child_process'

const env = { ...process.env }
if (env.SEMANTIC_FORCE_WEBGL_SOFTWARE == null && env.SEMANTIC_USE_D3D11 !== '1') {
    env.SEMANTIC_FORCE_WEBGL_SOFTWARE = '1'
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = [
    'playwright',
    'test',
    'tests/widget-journey.spec.js',
    'tests/widget-journey-smoke.spec.js',
    '--browser=chromium',
    ...process.argv.slice(2)
]

console.log(
    `[qa:journey:headless] WebGL=${env.SEMANTIC_USE_D3D11 === '1' ? 'd3d11' : env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1' ? 'software' : 'default'}`
)

/**
 * Stale-8796 guard (2026-08-11). playwright.config.js uses reuseExistingServer:true,
 * so a stale holder on 8796 serves an inconsistent dist (raw .svelte.ts bundled in a
 * partially-updated build → runes crash at app.svelte.ts $state init). Warn + refuse
 * to run against a stale server; the user must stop the EXACT PID (never broad kills).
 * For automation, prefer TEST_BASE_URL pointing at a warm static server (the doc
 * recipe) which bypasses the owned-server entirely.
 */
function checkStale8796() {
    if (env.TEST_BASE_URL) return // recipe path: explicit static server, no owned 8796
    try {
        const out = execSync('netstat -ano -p tcp | findstr :8796', { encoding: 'utf8', shell: true })
        if (/LISTENING/.test(out)) {
            console.error(
                '[qa:journey:headless] WARNING: 8796 already bound — Playwright skips build and may serve a STALE dist.'
            )
            console.error(
                '  Stop the exact PID (never broad):  netstat -ano | findstr :8796 → taskkill /F /PID <pid>, then re-run.'
            )
        }
    } catch {
        /* netstat unavailable or clean — fine */
    }
}

if (!process.argv.includes('--no-stale-guard')) checkStale8796()

const result = spawnSync(npx, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
})

if (result.error) {
    console.error(`[qa:journey:headless] failed to start Playwright: ${result.error.message}`)
    process.exit(1)
}

process.exit(result.status ?? 1)
