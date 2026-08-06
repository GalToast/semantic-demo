#!/usr/bin/env node
/**
 * Run the headless journey gate with the low-contention renderer profile.
 *
 * The journey suite creates many WebGL contexts serially. SwiftShader keeps
 * the gate deterministic on laptops while SEMANTIC_USE_D3D11=1 remains the
 * explicit hardware-renderer path for a GPU-specific check.
 */
import { spawnSync } from 'node:child_process'

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
