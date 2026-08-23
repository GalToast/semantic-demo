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
const testServerPort = Number(env.TEST_SERVER_PORT || 8796)
if (!Number.isInteger(testServerPort) || testServerPort < 1024 || testServerPort > 65535) {
    throw new Error(`TEST_SERVER_PORT must be an integer between 1024 and 65535 (received ${testServerPort})`)
}
// Default to the hardware renderer. SwiftShader (software WebGL) is the
// historical default "for determinism on laptops", but on this machine it
// produces garbage: a full journey run balloons to ~51 min with the scene
// never settling (verified via tmp/journey-full-*.log). D3D11 on the RTX
// 4050 + Intel UHD settles in ~16 min. Software is still available as an
// explicit opt-in for environments without a physical GPU.
if (env.SEMANTIC_USE_D3D11 !== '0' && env.SEMANTIC_FORCE_WEBGL_SOFTWARE == null) {
    env.SEMANTIC_USE_D3D11 = '1'
}
if (env.PLAYWRIGHT_LOW_CONTENTION == null) {
    env.PLAYWRIGHT_LOW_CONTENTION = '1'
}
// Protect the live machine by default: a stale dist should fail fast rather
// than starting a full build in the same admission path as Chromium. Use the
// explicit `:fresh:headless` package script, or set PLAYWRIGHT_NO_BUILD=0, to
// opt back into the legacy build-on-demand behavior.
if (env.PLAYWRIGHT_NO_BUILD == null) {
    env.PLAYWRIGHT_NO_BUILD = '1'
}

// Wrapper-only flag: prevent a stale-dist check from starting a full npm
// build inside the browser admission path. The flag is removed before the
// arguments reach Playwright.
const noBuildFlag = process.argv.includes('--no-build')
if (noBuildFlag) env.PLAYWRIGHT_NO_BUILD = '1'
const noBuild = env.PLAYWRIGHT_NO_BUILD === '1'
const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--no-build')

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = [
    'playwright',
    'test',
    'tests/widget-journey.spec.js',
    'tests/widget-journey-smoke.spec.js',
    '--browser=chromium',
    ...passthroughArgs
]

console.log(
    `[qa:journey:headless] WebGL=${env.SEMANTIC_USE_D3D11 === '1' ? 'd3d11' : env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1' ? 'software' : 'default'} low-contention=${env.PLAYWRIGHT_LOW_CONTENTION === '1'} no-build=${noBuild} port=${testServerPort}`
)

/**
 * Stale-port guard (2026-08-11). playwright.config.js defaults to
 * reuseExistingServer=false, so an unexpected holder on the selected port causes the
 * webServer command to fail fast. This pre-flight check warns early with
 * the same actionable guidance. For automation, prefer TEST_BASE_URL pointing
 * at a warm static server (the doc recipe) which bypasses the owned-server
 * entirely. The explicit opt-in to reuse a known warm server is
 * PLAYWRIGHT_REUSE_SERVER=1.
 */
function checkStalePort() {
    if (env.TEST_BASE_URL) return // recipe path: explicit static server, no owned test port
    try {
        const out = execSync(`netstat -ano -p tcp | findstr :${testServerPort}`, { encoding: 'utf8', shell: true })
        if (/LISTENING/.test(out)) {
            if (env.PLAYWRIGHT_REUSE_SERVER === '1') {
                console.error(
                    `[qa:journey:headless] WARNING: ${testServerPort} already bound and PLAYWRIGHT_REUSE_SERVER=1 — an existing server may serve stale dist.`
                )
            } else {
                console.error(
                    `[qa:journey:headless] ERROR: ${testServerPort} already bound — the web-server command fails fast because the port is occupied.`
                )
            }
            console.error(
                `  Stop the exact PID (never broad):  netstat -ano | findstr :${testServerPort} → taskkill /F /PID <pid>, then re-run.`
            )
        }
    } catch {
        /* netstat unavailable or clean — fine */
    }
}

if (!process.argv.includes('--no-stale-guard')) checkStalePort()

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
