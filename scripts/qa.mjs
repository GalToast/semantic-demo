#!/usr/bin/env node
/**
 * scripts/qa.mjs — Unified QA runner for Semantic Explorer.
 *
 * Replaces the ~94 scattered `qa:*` and `test:*` npm scripts with a single
 * configurable CLI. Keeps contract surface names and visual audit states as
 * first-class arguments instead of first-class script names.
 *
 * Usage:
 *   node scripts/qa.mjs surface    [options]
 *   node scripts/qa.mjs contract  [options]
 *   node scripts/qa.mjs visual    [options]
 *   node scripts/qa.mjs playthrough [options]
 *   node scripts/qa.mjs contract-group <group-name> [options]
 *
 * Global flags:
 *   --headed           Run Playwright in headed mode (default: headless)
 *   --url <url>        Override the default application URL
 *   --help             Show this help text
 *
 * Surface mode:
 *   node scripts/qa.mjs surface --states=mobile-idle,desktop-idle --headed
 *   node scripts/qa.mjs surface --state=search-error
 *   node scripts/qa.mjs surface --all --headed
 *
 * Contract mode:
 *   node scripts/qa.mjs contract --surfaces=mobile-idle,focus-pocket
 *   node scripts/qa.mjs contract --surface=compass-rail --headed
 *   node scripts/qa.mjs contract --all
 *
 * Visual mode:
 *   node scripts/qa.mjs visual --states=01-mobile-idle,07-desktop-idle
 *   node scripts/qa.mjs visual --all --headed
 *
 * Playthrough mode:
 *   node scripts/qa.mjs playthrough --headed
 *   node scripts/qa.mjs playthrough --real-route-visual --headed
 *
 * Contract-group mode (delegates to tests/run-all-contracts.js):
 *   node scripts/qa.mjs contract-group core
 *   node scripts/qa.mjs contract-group 3d-smoke --stop-on-first-fail
 *
 * Environment variables (used by underlying test files):
 *   PW_HEADLESS=1              Force headless
 *   PLAYWRIGHT_HEADLESS=1      Force headless
 *   SEMANTIC_VISUAL_AUDIT_STATES  Comma-separated state list for visual audit
 *   SURFACE_CONTRACT_URL         Override default contract-check URL
 *   SURFACE_CONTRACT_SHELL       Override shell (legacy|svelte)
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *   2 — invalid arguments / help requested
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')

/* ── CLI parsing ─────────────────────────────────────────────────────────── */

const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/qa.mjs <mode> [options]

Modes:
  surface          DOM/layout surface contract checks
  contract         Alias for surface (backward compatible)
  visual           Screenshot-based visual state audit
  playthrough      Full product playthrough
  contract-group   Run a named contract group (delegates to run-all-contracts.js)

Options:
  --state=<name>     Single surface or visual state
  --states=<list>    Comma-separated list of states
 --surface=<name>   Same as --state (contract mode alias)
 --surfaces=<list>  Same as --states (contract mode alias)
  --preset=<name>   Named preset, currently: mobile-critical
  --all              Run all known states/surfaces
  --headed           Show browser window
  --url=<url>        Override application URL
  --stop-on-first-fail  (contract-group mode only)
`)
    process.exit(2)
}

const mode = args[0]
const rest = args.slice(1)

function hasFlag(f) {
    return rest.includes(f)
}
function flagValue(f) {
    const i = rest.indexOf(f)
    if (i !== -1 && i + 1 < rest.length) return rest[i + 1]
    for (const a of rest) {
        if (a.startsWith(`${f}=`)) return a.slice(f.length + 1)
    }
    return undefined
}

const headed = hasFlag('--headed') ? true : undefined
const urlOverride = flagValue('--url') || flagValue('--url')
const preset = flagValue('--preset')

const SURFACE_PRESETS = new Map([
    [
        'mobile-critical',
        [
            'mobile-idle',
            'search-chrome',
            'search-no-results',
            'mobile-product-focus-route',
            'mobile-product-preview-route',
            'focus-pocket',
            'map-trail',
            'controls',
            'field-node',
            'compass-rail',
            'global-spacing',
            'mobile-semantic-dive-320'
        ]
    ]
])

function restWithoutPreset() {
    return rest.filter((arg, index) => {
        if (arg === '--preset') return false
        if (index > 0 && rest[index - 1] === '--preset') return false
        return !arg.startsWith('--preset=')
    })
}

/* ── Mode dispatch ─────────────────────────────────────────────────────── */

async function runSurfaceContract() {
    const node = process.execPath
    const script = join(root, 'tests', 'surface-contract-check.mjs')
    const presetSurfaces = preset ? SURFACE_PRESETS.get(preset) : null
    if (preset && !presetSurfaces) {
        console.error(`Unknown contract preset: ${preset}`)
        console.error(`Known presets: ${[...SURFACE_PRESETS.keys()].join(', ')}`)
        process.exit(2)
    }
    const spawnArgs = [script, ...restWithoutPreset()]
    if (presetSurfaces) {
        spawnArgs.push(`--surfaces=${presetSurfaces.join(',')}`)
    }
    if (headed && !rest.some((a) => a === '--headed')) {
        spawnArgs.push('--headed')
    }
    const env = { ...process.env }
    if (urlOverride) env.SURFACE_CONTRACT_URL = urlOverride
    // The contract runner already understands --surface / --surfaces / --shell
    return spawnSync(node, spawnArgs, { stdio: 'inherit', cwd: root, env })
}

async function runVisualAudit() {
    const node = process.execPath
    const script = join(root, 'tests', 'visual-state-audit.mjs')
    const loader = join(root, 'tests/helpers/ts-resolve-loader.mjs')
    const spawnArgs = ['--loader', pathToFileURL(loader).href, script, ...rest]
    if (headed && !rest.some((a) => a === '--headed')) {
        spawnArgs.push('--headed')
    }
    const env = { ...process.env }
    if (urlOverride) env.SURFACE_CONTRACT_URL = urlOverride
    return spawnSync(node, spawnArgs, { stdio: 'inherit', cwd: root, env })
}

async function runPlaythrough() {
    const node = process.execPath
    const script = join(root, 'tests', 'product-playthrough-audit.mjs')
    const spawnArgs = [script, ...rest]
    if (headed && !rest.some((a) => a === '--headed')) {
        spawnArgs.push('--headed')
    }
    // Propagate --url to the child via env so it matches runSurfaceContract /
    // runVisualAudit. Without this, `qa.mjs playthrough --url=...` silently
    // drops the override.
    const env = { ...process.env }
    if (urlOverride) env.SURFACE_CONTRACT_URL = urlOverride
    return spawnSync(node, spawnArgs, { stdio: 'inherit', cwd: root, env })
}

async function runContractGroup() {
    const node = process.execPath
    const script = join(root, 'tests', 'run-all-contracts.js')
    const groupName = rest[0]
    if (!groupName || groupName.startsWith('--')) {
        console.error('Error: contract-group mode requires a group name, e.g.')
        console.error('  node scripts/qa.mjs contract-group core')
        console.error('  node scripts/qa.mjs contract-group 3d-smoke --stop-on-first-fail')
        process.exit(2)
    }
    const spawnArgs = [script, `--group=${groupName}`, ...rest.slice(1)]
    return spawnSync(node, spawnArgs, { stdio: 'inherit', cwd: root })
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
    let result
    switch (mode) {
        case 'surface':
        case 'contract':
            result = await runSurfaceContract()
            break
        case 'visual':
            result = await runVisualAudit()
            break
        case 'playthrough':
            result = await runPlaythrough()
            break
        case 'contract-group':
            result = await runContractGroup()
            break
        default:
            console.error(`Unknown mode: ${mode}`)
            console.error('Run `node scripts/qa.mjs --help` for usage.')
            process.exit(2)
    }
    if (result) {
        if (result.status !== null) {
            process.exit(result.status)
        }
        // status === null means the child was killed by a signal (e.g. SIGTERM from CI).
        // Surface a non-zero exit so signal-killed children don't silently report success.
        process.exit(1)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
