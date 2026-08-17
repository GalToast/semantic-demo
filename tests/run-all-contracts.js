/**
 * run-all-contracts.js
 *
 * Ordered QA contract runner with optional manifest-based group execution.
 *
 * Default (no flags): runs the pinned ordered list.
 *   node tests/run-all-contracts.js
 *
 * Group mode: --group=<name> reads from contracts.manifest.json
 *   node tests/run-all-contracts.js --group=core
 *   ... (see --list output for all groups)
 *
 * Single contract mode: --single= runs one file in isolation.
 *   node tests/run-all-contracts.js --single=3d-focus-pocket-selectability.spec.js
 *   node tests/run-all-contracts.js --single=3d-focus-pocket-selectability.spec.js --group=3d-smoke
 *
 * List groups: --list shows all available groups with contract counts and descriptions.
 *   node tests/run-all-contracts.js --list
 *
 * Runner help:
 *   node tests/run-all-contracts.js --help
 *
 * Validation self-test (no contracts executed):
 *   node tests/run-all-contracts.js --validate
 *
 * Stop on the first failing contract:
 *   node tests/run-all-contracts.js --group=3d-focus-neighborhood --stop-on-first-fail
 *
 * Pass detection:
 *   - Exit code 0
 *   - No "FAIL" token in stdout
 *   - No "[FAIL]" failure marker in stdout
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import http from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TESTS_DIR = __dirname
const MANIFEST_PATH = join(__dirname, 'contracts.manifest.json')
const PROJECT_ROOT = join(TESTS_DIR, '..')
const SERVER_PORT = 8795
const SERVER_START_TIMEOUT_MS = 10000
const SERVER_POLL_INTERVAL_MS = 250
const FAILURE_CONTEXT_LINES = 8

// Groups that require a local static server. The runner owns a fresh dynamic
// port for these groups and passes TEST_BASE_URL to child contracts.
const SERVER_GROUPS = new Set([
    'full',
    'scene',
    'browser-interaction',
    'short-landscape',
    'live-url',
    'extraction',
    'quality',
    'supplemental',
    'mobile-critical',
    '3d-engine',
    '3d-interaction-quality',
    '3d-pointer',
    '3d-focus-neighborhood',
    '3d-focus-neighborhood-geometry',
    '3d-focus-ghost-graph-visibility',
    '3d-hidpi-click-accuracy',
    '3d-focus-neighborhood-interaction',
    '3d-focus-pocket-geometry',
    '3d-hover-click-interaction',
    '3d-focus-desktop-click',
    '3d-rapid-re-selection',
    '3d-responsive-ui',
    '3d-visual-quality',
    '3d-resilience',
    '3d-state-data',
    '3d-accessibility-fallback-performance',
    '3d-smoke',
    '3d-regression',
    '3d-slow',
    '3d-full',
    'journey'
])

/**
 * Check if a server is already running on SERVER_PORT by sending a light HTTP request.
 * Returns true if a response is received (server is up), false otherwise.
 */
function isServerRunning(port) {
    return new Promise((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
            resolve(res.statusCode !== undefined)
        })
        req.on('error', () => resolve(false))
        req.on('timeout', () => {
            req.destroy()
            resolve(false)
        })
    })
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Find an available port in the range 8795-8895 by attempting to bind each
 * port and closing the socket immediately. Used when the canonical port
 * 8795 is contested by an unrelated process.
 */
async function findAvailablePort(startPort = 8795, endPort = 8895) {
    const net = await import('node:net')
    for (let port = startPort; port <= endPort; port++) {
        const available = await new Promise((resolve) => {
            const server = net.createServer()
            server.on('error', () => resolve(false))
            server.on('listening', () => {
                server.close()
                resolve(true)
            })
            server.listen(port, '127.0.0.1')
        })
        if (available) return port
    }
    throw new Error(`No available port in range ${startPort}-${endPort}`)
}

/**
 * Kill an entire Chromium browser process tree on Windows.
 * Playwright spawns Chromium as a grandchild of the CLI node process, so
 * child.kill() only terminates the CLI - leaked browser processes accumulate
 * across sequential contracts and cause GPU/memory pressure.
 */
function closeBrowserTree(pid) {
    if (process.platform !== 'win32') return
    try {
        execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', timeout: 8000 })
    } catch {
        // Process already gone - nothing to clean up.
    }
}

/**
 * Start a local static server from PROJECT_ROOT on SERVER_PORT.
 * Returns a handle with .kill() for shutdown.
 */
async function startStaticServer(port) {
    return new Promise((resolve, reject) => {
        const child = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '.'], {
            stdio: 'ignore',
            cwd: PROJECT_ROOT,
            detached: false
        })
        let settled = false
        child.on('error', (err) => {
            if (settled) return
            settled = true
            reject(err)
        })

        child.on('exit', (code, signal) => {
            if (settled) return
            settled = true
            reject(new Error(`Static server exited before readiness check completed (code=${code}, signal=${signal})`))
        })
        ;(async () => {
            const deadline = Date.now() + SERVER_START_TIMEOUT_MS
            while (Date.now() < deadline) {
                if (await isServerRunning(port)) {
                    if (settled) return
                    settled = true
                    resolve({ kill: () => child.kill(), port })
                    return
                }
                await sleep(SERVER_POLL_INTERVAL_MS)
            }
            if (!settled) {
                settled = true
                child.kill()
                reject(new Error(`Static server failed to respond on port ${port} within ${SERVER_START_TIMEOUT_MS}ms`))
            }
        })()
    })
}

function createServerLease(groupName) {
    if (!SERVER_GROUPS.has(groupName)) return null
    let ownedServer = null
    let borrowedLogged = false
    const explicitBaseUrl = process.env.TEST_BASE_URL
    // Tracks whether any contract has failed in this run. After the first
    // failure, the server is in an unknown state (zombie Chromium connections
    // from the failed run may exhaust Python HTTP server connection slots).
    // Force a server restart before the next contract to prevent cascade hangs.
    let hadFailure = false

    return {
        async ensure() {
            if (explicitBaseUrl) {
                if (!borrowedLogged) {
                    console.log(`  [server] using explicit TEST_BASE_URL=${explicitBaseUrl}`)
                    borrowedLogged = true
                }
                return explicitBaseUrl.replace(/\/$/, '')
            }

            if (ownedServer && !hadFailure) {
                return `http://127.0.0.1:${ownedServer.port}`
            }

            if (ownedServer && hadFailure) {
                console.log(`  [server] prior failure detected - restarting owned static server`)
                try {
                    ownedServer.kill()
                } catch {
                    // Process already gone.
                }
                ownedServer = null
                hadFailure = false
            }

            const port = await findAvailablePort()
            console.log(`  [server] auto-starting static server on dynamic port ${port}...`)
            ownedServer = await startStaticServer(port)
            console.log(`  [server] static server running on port ${ownedServer.port}`)
            return `http://127.0.0.1:${ownedServer.port}`
        },

        markFailed() {
            hadFailure = true
        },

        close() {
            if (!ownedServer) return
            console.log(`  [server] shutting down static server on port ${ownedServer.port}...`)
            try {
                ownedServer.kill()
            } catch (err) {
                console.log(`  [server] kill warning: ${err.message}`)
            }
            ownedServer = null
            console.log(`  [server] closed`)
        }
    }
}

// Pinned ordered list: this is the authoritative default run.
const PINNED_FILES = [
    'semantic-dive-ui-surface-contract.mjs',
    'search-state-surface-contract.mjs',
    'lifecycle-composition-contract.mjs',
    'state-transition-contract.mjs',
    'state-transition-table-contract.mjs',
    'step-inside-state-sync-contract.mjs',
    'focus-semantic-state-boundary-contract.mjs',
    'journey-compass-state-contract.mjs',
    'semantic-lane-contract.mjs',
    'connection-analysis-contract.mjs',
    'camera-controls-motion-contract.mjs',
    'journey-event-bindings-contract.mjs',
    'reset-callsite-routing-contract.mjs',
    'cluster-labels-contract.mjs',
    'journey-thread-inspector-contract.mjs',
    'journey-walk-thread-neighbor-timer-contract.mjs',
    'journey-ui-ownership-contract.mjs',
    'share-view-clipboard-contract.mjs',
    'keyboard-help-aria-contract.mjs',
    'weather-lifecycle-contract.mjs',
    'weather-surface-ownership-contract.mjs',
    'camera-auto-rotate-settle-contract.mjs',
    'semantic-dive-reverse-contract.mjs',
    'residual-window-bridge-inventory-contract.mjs',
    'next-explore-candidate-contract.mjs',
    'ui-renderers-helper-contract.mjs',
    'lifecycle-semantic-guide-residual-bridge-contract.mjs',
    'lifecycle-search-panel-ownership-contract.mjs',
    'lifecycle-search-panel-ownership-contract.mjs',
    'search-lifecycle-adapter-contract.mjs',
    'search-trail-cue-lifecycle-contract.mjs',
    'view-controller-ownership-contract.mjs',
    'loading-ui-contract.mjs',
    'keyboard-reset-ownership-contract.mjs',
    'focus-trap-installed-contract.mjs',
    'search-state-ui-adapter-contract.mjs',
    'search-panel-adapter-contract.mjs',
    'exploration-modes-contract.mjs',
    'scene-reveal-contract.mjs',
    'three-setup-zero-caller-dewindowing-contract.mjs',
    'scene-atmosphere-contract.mjs',
    'motion-state-contract.mjs',
    'three-visual-polish-contract.mjs',
    'reduced-motion-coverage-contract.mjs',
    'js-reduced-motion-animation-guard-contract.mjs',
    'search-peek-expanded-render-contract.mjs',
    'semantic-guide-payload-contract.mjs',
    'connection-analysis-render-state-contract.mjs',
    'reduced-motion-interruption.spec.js',
    'gemma-fallback-error.spec.js',
    'selected-card-dom-ownership-contract.mjs'
]

function loadManifest() {
    try {
        return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    } catch {
        return null
    }
}

function getGroupFromManifest(groupName) {
    const manifest = loadManifest()
    if (!manifest) {
        console.error(`  Error: contracts.manifest.json not found at ${MANIFEST_PATH}`)
        return null
    }
    const group = manifest.groups?.[groupName]
    if (!group) {
        console.error(
            `  Error: unknown group '${groupName}'. Available: ${Object.keys(manifest.groups || {}).join(', ')}`
        )
        return null
    }
    return group
}

/**
 * Discover all *-contract.mjs files in tests/ that are not self-test helpers.
 * Excludes: utils-contract.mjs, surface-contract-check.mjs (multi-surface runners).
 * Also discovers standalone Playwright interaction specs (*.spec.js) that are
 * not helper scripts - these are group-member candidates (e.g. canvas-hit-test,
 * live-reset-interaction) and must not be silently orphaned.
 */
function discoverUnlistedContracts() {
    const allMjs = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.mjs'))
    const selfTestHelpers = new Set(['utils-contract.mjs', 'surface-contract-check.mjs'])
    const contractPattern = /-contract\.mjs$/
    const mjsContracts = allMjs.filter((f) => contractPattern.test(f) && !selfTestHelpers.has(f))

    // Playwright *.spec.js files that are not helper utilities.
    // These use real browser automation and are discoverable contract entries.
    const allSpec = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.js'))
    const specExclusions = new Set(['tmp-diag-focus.spec.js', 'w51-diag.spec.js']) // temp/diagnostic files, not intended for manifest grouping
    const specContracts = allSpec.filter((f) => !specExclusions.has(f))

    return { mjsContracts, specContracts }
}

/**
 * Find the first manifest group that contains the given contract filename.
 * Used to auto-infer group/server membership when --single= is used without --group=.
 */
function findGroupForFile(singleFile) {
    const manifest = loadManifest()
    if (!manifest?.groups) return null
    for (const [groupName, group] of Object.entries(manifest.groups)) {
        if (Array.isArray(group.contracts) && group.contracts.includes(singleFile)) {
            return groupName
        }
    }
    return null
}

function resolveFiles() {
    const args = process.argv.slice(2)
    const groupArg = args.find((a) => a.startsWith('--group='))
    const singleArg = args.find((a) => a.startsWith('--single='))

    // Single contract: run in isolation, with optional group context for server setup.
    // Group is derived from --single when --group is absent but the file belongs to a server group.
    if (singleArg) {
        const singleFile = singleArg.split('=')[1]
        const singlePath = join(TESTS_DIR, singleFile)
        if (!existsSync(singlePath)) {
            console.error(`  Error: '${singleFile}' does not exist in tests/`)
            process.exit(1)
        }
        // If a group was also specified, use its server lease and timeout.
        const groupName = groupArg ? groupArg.split('=')[1] : null
        if (groupName) {
            const group = getGroupFromManifest(groupName)
            if (!group) process.exit(1)
            return {
                files: [singleFile],
                mode: `single:${singleFile} (via group:${groupName})`,
                groupTimeout: typeof group.timeout === 'number' ? group.timeout : null,
                groupName
            }
        }
        // Lone --single: auto-infer group from manifest to determine server need.
        const inferredGroupName = findGroupForFile(singleFile)
        const inferredIsServerGroup = inferredGroupName ? SERVER_GROUPS.has(inferredGroupName) : false
        if (inferredIsServerGroup) {
            const group = getGroupFromManifest(inferredGroupName)
            return {
                files: [singleFile],
                mode: `single:${singleFile} (inferred group:${inferredGroupName})`,
                groupTimeout: group && typeof group.timeout === 'number' ? group.timeout : null,
                groupName: inferredGroupName
            }
        }
        // Non-server file: run without server lease.
        return { files: [singleFile], mode: `single:${singleFile}`, groupTimeout: null, groupName: null }
    }

    if (!groupArg) {
        // Default: use pinned ordered list; no manifest discovery, no regression.
        return { files: PINNED_FILES, mode: 'pinned', groupTimeout: null, groupName: null }
    }

    const groupName = groupArg.split('=')[1]
    const group = getGroupFromManifest(groupName)

    if (!group) {
        process.exit(1)
    }

    return {
        files: group.contracts,
        mode: `group:${groupName}`,
        // Per-group timeout from manifest; null falls back to CONTRACT_TIMEOUT_MS.
        groupTimeout: typeof group.timeout === 'number' ? group.timeout : null,
        groupName
    }
}

function printUsage() {
    console.log(`
=== QA Contract Runner ===

Usage:
  node tests/run-all-contracts.js
  node tests/run-all-contracts.js --group=<name>
  node tests/run-all-contracts.js --single=<file>
  node tests/run-all-contracts.js --single=<file> --group=<name>
  node tests/run-all-contracts.js --list
  node tests/run-all-contracts.js --validate
  node tests/run-all-contracts.js --dry-run [--group=<name>|--single=<file>]

Options:
  --group=<name>          Run a manifest group.
  --single=<file>         Run one file from tests/ in isolation.
  --list                  List manifest groups.
  --validate              Validate pinned/manifest coverage without running contracts.
  --dry-run               Print the resolved file list without running contracts.
  --stop-on-first-fail    Stop the runner after the first failing contract.
  --batch-browser         Opt-in: batch all-Playwright group/single runs into one CLI process.
                           Only activates when every resolved file is a *.spec.js or Playwright .mjs.
                           Skips pinned default runs and mixed file types.
  --help                  Show this help text.
  NOTE: individual contracts resolve the @lib alias via ts-resolve-loader (see --single).
  Running a contract file directly (node tests/x.mjs) may fail with
  ERR_MODULE_NOT_FOUND for '@lib/...' when the file dynamically imports src TS.
  Use --single=<file> (or add the loader flags) for faithful local runs.

Environment:
  CONTRACT_TIMEOUT_MS     Default per-contract timeout in milliseconds.
  TEST_BASE_URL           Reuse an existing app server for browser specs.
  CONTRACT_HEADED=1       Run Playwright browser specs headed instead of headless.
`)
}

function getFailureContext(result) {
    const lines = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n').map((line) => line.trimEnd())
    const index = lines.findIndex(
        (line) =>
            line.includes('[FAIL]') ||
            line.includes('Error:') ||
            line.includes('AssertionError') ||
            line.includes('FAIL')
    )
    if (index < 0) return []
    return lines.slice(index, Math.min(lines.length, index + FAILURE_CONTEXT_LINES)).filter(Boolean)
}

// Validation

/**
 * Full validation pass; no contracts executed.
 * Exits 0 if all checks pass, nonzero otherwise.
 */
function runValidation() {
    let exitCode = 0
    const errors = []
    const warnings = []

    // 1. Every pinned file must exist on disk.
    for (const file of PINNED_FILES) {
        const path = join(TESTS_DIR, file)
        if (!existsSync(path)) {
            errors.push(`PINNED_MISSING: '${file}' is listed in PINNED_FILES but does not exist on disk`)
            exitCode = 1
        }
    }

    // 2. Manifest file must exist.
    if (!existsSync(MANIFEST_PATH)) {
        errors.push(`MANIFEST_MISSING: '${MANIFEST_PATH}' does not exist`)
        exitCode = 1
    } else {
        const manifest = loadManifest()
        if (!manifest || !manifest.groups) {
            errors.push(`MANIFEST_INVALID: contracts.manifest.json is valid JSON but missing 'groups' key`)
            exitCode = 1
        } else {
            // 3. Every group must have a non-empty contracts array.
            for (const [groupName, group] of Object.entries(manifest.groups)) {
                if (!Array.isArray(group.contracts) || group.contracts.length === 0) {
                    errors.push(`GROUP_EMPTY: group '${groupName}' has no contracts`)
                    exitCode = 1
                }
                // 4. Every file listed in a group must exist on disk.
                if (Array.isArray(group.contracts)) {
                    for (const file of group.contracts) {
                        const path = join(TESTS_DIR, file)
                        if (!existsSync(path)) {
                            errors.push(`GROUP_FILE_MISSING: group '${groupName}' lists '${file}' which does not exist`)
                            exitCode = 1
                        }
                    }
                }
            }

            // 5. The 'full' group must exactly match PINNED_FILES.
            const fullGroup = manifest.groups['full']
            if (fullGroup && Array.isArray(fullGroup.contracts)) {
                if (fullGroup.contracts.length !== PINNED_FILES.length) {
                    errors.push(
                        `FULL_GROUP_COUNT_MISMATCH: full group has ${fullGroup.contracts.length} files, pinned list has ${PINNED_FILES.length}`
                    )
                    exitCode = 1
                } else {
                    for (let i = 0; i < PINNED_FILES.length; i++) {
                        if (fullGroup.contracts[i] !== PINNED_FILES[i]) {
                            errors.push(
                                `FULL_GROUP_ORDER_MISMATCH: full group[${i}]='${fullGroup.contracts[i]}' != PINNED_FILES[${i}]='${PINNED_FILES[i]}'`
                            )
                            exitCode = 1
                        }
                    }
                }
            } else if (!fullGroup) {
                errors.push(`FULL_GROUP_MISSING: manifest is missing the 'full' group`)
                exitCode = 1
            }
        }
    }

    // 6. Report unlisted contract files (warn only; they may be intentionally excluded).
    const { mjsContracts, specContracts } = discoverUnlistedContracts()
    const allUnlisted = [...mjsContracts, ...specContracts]
    const manifestFiles = Object.values(loadManifest()?.groups || {}).flatMap((g) => g.contracts || [])
    const orphanFiles = allUnlisted.filter((f) => !PINNED_FILES.includes(f) && !manifestFiles.includes(f))
    const orphanMjs = orphanFiles.filter((f) => f.endsWith('.mjs'))
    const orphanSpec = orphanFiles.filter((f) => f.endsWith('.spec.js'))
    if (orphanMjs.length > 0) {
        warnings.push(
            `ORPHAN_MJS_CONTRACTS: ${orphanMjs.length} .mjs contract file(s) not in PINNED_FILES or any manifest group: ${orphanMjs.join(', ')}`
        )
    }
    if (orphanSpec.length > 0) {
        warnings.push(
            `ORPHAN_SPEC_CONTRACTS: ${orphanSpec.length} .spec.js file(s) not in any manifest group: ${orphanSpec.join(', ')}`
        )
    }

    // Output
    console.log('\n=== Runner Validation ===\n')
    if (errors.length > 0) {
        console.log('ERRORS:')
        for (const e of errors) console.log(`  [ERROR] ${e}`)
    }
    if (warnings.length > 0) {
        console.log('WARNINGS:')
        for (const w of warnings) console.log(`  [WARN] ${w}`)
    }
    if (errors.length === 0 && warnings.length === 0) {
        console.log('  All validations passed.')
    }
    console.log(`\n  Pinned list:      ${PINNED_FILES.length} files`)
    const totalOrphans = orphanMjs.length + orphanSpec.length
    console.log(`  Unlisted orphans: ${totalOrphans} file(s) (see warnings above)`)
    console.log('')

    process.exit(exitCode)
}

// Execute a single contract file

// Playwright test flags for browser-interaction specs.
const PLAYWRIGHT_CLI = join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
const PLAYWRIGHT_FLAGS = ['--browser=chromium']
// When the runner owns the single-threaded test server (i.e. no external
// TEST_BASE_URL was supplied and the runner spun up its own python server),
// force a single Playwright worker. The python http.server is single-threaded;
// multiple workers would contend for its connection slots and cause cascade
// hangs. When an external TEST_BASE_URL is provided the caller owns the server
// topology, so we defer to their Playwright config.
function playwrightWorkerFlags() {
    return process.env.TEST_BASE_URL ? [] : ['--workers=1']
}
if (process.env.CONTRACT_HEADED === '1' || process.env.PLAYWRIGHT_HEADED === '1' || process.env.PWDEBUG === '1') {
    PLAYWRIGHT_FLAGS.push('--headed')
}
const CONTRACT_TIMEOUT_MS = Number(process.env.CONTRACT_TIMEOUT_MS || 240000)

function isPlaywrightTestFile(filename, entry) {
    if (filename.endsWith('.spec.js')) return true
    if (!filename.endsWith('.mjs')) return false
    const source = readFileSync(entry, 'utf8')
    return /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/.test(source)
}

function runContract(filename, timeoutMs, baseUrl = null) {
    return new Promise((resolve) => {
        const entry = join(TESTS_DIR, filename)
        const start = performance.now()
        let settled = false

        // Playwright test suites may use .spec.js or explicit .mjs contract names.
        // Custom browser scripts that import `playwright` directly still run as Node.
        const isPlaywrightSpec = isPlaywrightTestFile(filename, entry)
        const exec = process.execPath
        const TS_LOADER = './' + join('tests', 'helpers', 'ts-resolve-loader.mjs').replace(/\\/g, '/')
        const SVELTE_RUNE_SHIM = './' + join('tests', 'helpers', 'svelte-rune-shim.mjs').replace(/\\/g, '/')
        const execArgs = isPlaywrightSpec
            ? [PLAYWRIGHT_CLI, 'test', `tests/${filename}`, ...PLAYWRIGHT_FLAGS, ...playwrightWorkerFlags()]
            : ['--experimental-transform-types', '--import', SVELTE_RUNE_SHIM, '--loader', TS_LOADER, entry]

        const child = spawn(exec, execArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                TEST_BASE_URL: process.env.TEST_BASE_URL || baseUrl || `http://127.0.0.1:${SERVER_PORT}`
            }
        })

        let stdout = ''
        let stderr = ''
        const timeout = setTimeout(() => {
            if (settled) return
            settled = true

            // Drain stdout/stderr so streams don't hold buffers open before killing.
            child.stdout?.destroy?.()
            child.stderr?.destroy?.()

            // On Windows, kill the full Chromium process tree via taskkill /T.
            // Playwright's CLI is the parent of the browser; killing only the CLI
            // leaves leaked grandchildren that accumulate GPU context across contracts.
            if (process.platform === 'win32') {
                closeBrowserTree(child.pid)
            } else {
                child.kill('SIGKILL')
            }

            const duration = performance.now() - start
            resolve({
                filename,
                duration,
                passed: false,
                code: -1,
                stdout,
                stderr: `${stderr}\n[RUNNER TIMEOUT] Contract timed out after ${timeoutMs}ms`.trim()
            })
        }, timeoutMs)

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString()
        })

        child.on('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            const duration = performance.now() - start

            // On normal exit, also sweep any Chromium children on Windows.
            // This is belt-and-suspenders: the browsers should exit with their parent,
            // but any that survive accumulate GPU context across the sequential run.
            if (process.platform === 'win32') {
                closeBrowserTree(child.pid)
            }

            const passed = code === 0 && !stdout.includes('FAIL') && !stdout.includes('[FAIL]')
            resolve({ filename, duration, passed, code, stdout, stderr })
        })

        child.on('error', (err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            const duration = performance.now() - start
            resolve({ filename, duration, passed: false, code: -1, stdout: '', stderr: err.message })
        })
    })
}

function runBatchContract(files, timeoutMs, baseUrl = null) {
    return new Promise((resolve) => {
        const start = performance.now()
        let settled = false

        const exec = process.execPath
        const execArgs = [
            PLAYWRIGHT_CLI,
            'test',
            ...files.map((f) => `tests/${f}`),
            ...PLAYWRIGHT_FLAGS,
            ...playwrightWorkerFlags()
        ]

        const child = spawn(exec, execArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                TEST_BASE_URL: process.env.TEST_BASE_URL || baseUrl || `http://127.0.0.1:${SERVER_PORT}`
            }
        })

        let stdout = ''
        let stderr = ''
        const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            child.stdout?.destroy?.()
            child.stderr?.destroy?.()
            if (process.platform === 'win32') {
                closeBrowserTree(child.pid)
            } else {
                child.kill('SIGKILL')
            }
            const duration = performance.now() - start
            resolve({
                filename: `batch:${files.length} files`,
                duration,
                passed: false,
                code: -1,
                stdout,
                stderr: `${stderr}\n[RUNNER TIMEOUT] Batch timed out after ${timeoutMs}ms`.trim()
            })
        }, timeoutMs)

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString()
        })

        child.on('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            const duration = performance.now() - start
            if (process.platform === 'win32') {
                closeBrowserTree(child.pid)
            }
            const passed = code === 0 && !stdout.includes('FAIL') && !stdout.includes('[FAIL]')
            resolve({ filename: `batch:${files.length} files`, duration, passed, code, stdout, stderr })
        })

        child.on('error', (err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            const duration = performance.now() - start
            resolve({
                filename: `batch:${files.length} files`,
                duration,
                passed: false,
                code: -1,
                stdout: '',
                stderr: err.message
            })
        })
    })
}

function isServerRelatedFailure(filename, result) {
    const output = `${result.stdout}\n${result.stderr}`
    return (
        output.includes('[RUNNER TIMEOUT]') ||
        output.includes('ECONNRESET') ||
        output.includes('ECONNREFUSED') ||
        output.includes('net::ERR_') ||
        output.includes('Target page, context or browser has been closed')
    )
}

function shouldRetryBrowserContract(filename, result) {
    if (result.passed) return false
    const entry = join(TESTS_DIR, filename)
    if (!isPlaywrightTestFile(filename, entry)) return false

    const output = `${result.stdout}\n${result.stderr}`
    return (
        output.includes('Test timeout') ||
        output.includes('page.waitForFunction') ||
        output.includes('[RUNNER TIMEOUT]') ||
        output.includes('Target page, context or browser has been closed') ||
        output.includes('net::ERR_') ||
        output.includes('ECONNRESET') ||
        output.includes('ECONNREFUSED')
    )
}

// Main

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printUsage()
        return
    }

    // Intercept --list before anything else.
    if (process.argv.includes('--list')) {
        const manifest = loadManifest()
        if (!manifest || !manifest.groups) {
            console.error('No manifest groups found.')
            process.exit(1)
        }
        console.log('\n=== Contract Groups ===\n')
        for (const [name, group] of Object.entries(manifest.groups)) {
            const count = Array.isArray(group.contracts) ? group.contracts.length : 0
            const desc = group.description || ''
            console.log(`  ${name} (${count})  ${desc}`)
        }
        console.log('')
        return
    }

    // Intercept --validate before anything else.
    if (process.argv.includes('--validate')) {
        runValidation()
        return // never reached in practice; runValidation exits
    }

    // Intercept --dry-run before anything else: show what would run without executing.
    if (process.argv.includes('--dry-run')) {
        const { files, mode, groupTimeout } = resolveFiles()
        const batchBrowser = process.argv.includes('--batch-browser')
        let batchNote = ''
        if (batchBrowser && mode !== 'pinned') {
            const allPlaywright = files.every((f) => {
                const entry = join(TESTS_DIR, f)
                return isPlaywrightTestFile(f, entry)
            })
            if (allPlaywright) {
                batchNote = ' [batch-browser: would run as single Playwright process]'
            } else {
                batchNote = ' [batch-browser: skipped - mixed/non-Playwright files]'
            }
        } else if (batchBrowser && mode === 'pinned') {
            batchNote = ' [batch-browser: skipped - pinned default run never batched]'
        }
        console.log(`\n=== Dry Run: ${mode}${batchNote ? ` (${batchNote.replace(/^ \[|\]$/g, '')})` : ''} ===`)
        console.log(`Would run ${files.length} contract(s):\n`)
        for (const file of files) {
            const note =
                groupTimeout !== null && groupTimeout !== CONTRACT_TIMEOUT_MS ? ` [timeout=${groupTimeout}ms]` : ''
            console.log(`  ${file}${note}`)
        }
        console.log(`\nTotal: ${files.length} contract(s)`)
        console.log('')
        return
    }

    const { files, mode, groupTimeout, groupName } = resolveFiles()
    const stopOnFirstFail = process.argv.includes('--stop-on-first-fail')
    const batchBrowser = process.argv.includes('--batch-browser')
    // Start the server for every browser spec, including Playwright .mjs files.
    // Pinned mode has no group context but still carries browser specs that need HTTP.
    const needsServer = files.some((f) => isPlaywrightTestFile(f, join(TESTS_DIR, f)))
    const effectiveGroupName = needsServer && !groupName ? 'browser-interaction' : groupName
    const serverLease = effectiveGroupName ? createServerLease(effectiveGroupName) : null

    // Determine whether the batch-browser opt-in can activate.
    let useBatchBrowser = false
    if (batchBrowser && mode !== 'pinned') {
        const allPlaywright = files.every((f) => {
            const entry = join(TESTS_DIR, f)
            return isPlaywrightTestFile(f, entry)
        })
        if (allPlaywright) {
            useBatchBrowser = true
            console.log(`  [batch-browser] all ${files.length} resolved files are Playwright specs — batching\n`)
        } else {
            const nonPlaywright = files.filter((f) => {
                const entry = join(TESTS_DIR, f)
                return !isPlaywrightTestFile(f, entry)
            })
            console.log(
                `  [batch-browser] skipped: ${nonPlaywright.length} non-Playwright file(s) in run (${nonPlaywright
                    .slice(0, 3)
                    .join(', ')}${nonPlaywright.length > 3 ? '...' : ''})`
            )
            console.log(`  [batch-browser] falling back to per-file runner\n`)
        }
    } else if (batchBrowser && mode === 'pinned') {
        console.log(`  [batch-browser] skipped: pinned default run is never batched\n`)
    }

    console.log(`\n=== QA Contract Runner ===`)
    console.log(`Mode: ${mode}${useBatchBrowser ? ' (batch-browser)' : ''}`)
    console.log(
        `Running ${files.length} contract file(s)${needsServer ? ' (browser specs detected — server will start)' : ''}\n`
    )
    if (stopOnFirstFail) console.log('Stop on first fail: enabled\n')

    const runContracts = async () => {
        const results = []

        if (useBatchBrowser) {
            const baseUrl = serverLease ? await serverLease.ensure() : null
            const timeoutMs = groupTimeout !== null ? groupTimeout : CONTRACT_TIMEOUT_MS
            console.log(`  [batch] running ${files.length} Playwright spec(s) in one process`)
            console.log(`  [batch] files: ${files.map((f) => `tests/${f}`).join(' ')}`)
            console.log(`  [batch] timeout=${timeoutMs}ms`)
            let result = await runBatchContract(files, timeoutMs, baseUrl)
            if (!result.passed && serverLease && isServerRelatedFailure('batch', result)) {
                console.log(`  [batch-retry] retrying batch after transient browser/server failure`)
                serverLease.markFailed()
                const retryBaseUrl = await serverLease.ensure()
                const retryResult = await runBatchContract(files, timeoutMs, retryBaseUrl)
                result = {
                    ...retryResult,
                    retried: true,
                    firstFailure: result
                }
            }
            results.push(result)
        } else {
            for (const file of files) {
                const baseUrl = serverLease ? await serverLease.ensure() : null
                const timeoutMs = groupTimeout !== null ? groupTimeout : CONTRACT_TIMEOUT_MS
                console.log(`  [run] ${file}${groupTimeout !== null ? ` (timeout=${timeoutMs}ms)` : ''}`)
                let result = await runContract(file, timeoutMs, baseUrl)
                if (!result.passed && serverLease && shouldRetryBrowserContract(file, result)) {
                    console.log(`  [retry] ${file} after transient browser/server failure`)
                    serverLease.markFailed()
                    const retryBaseUrl = await serverLease.ensure()
                    const retryResult = await runContract(file, timeoutMs, retryBaseUrl)
                    result = {
                        ...retryResult,
                        retried: true,
                        firstFailure: result
                    }
                }
                results.push(result)
                if (!result.passed && serverLease && isServerRelatedFailure(file, result)) {
                    serverLease.markFailed()
                }
                if (stopOnFirstFail && !result.passed) {
                    console.log(`  [stop] first failure: ${file}`)
                    break
                }
            }
        }

        const passed = results.filter((r) => r.passed)
        const failed = results.filter((r) => !r.passed)

        console.log('--- Results ---\n')

        for (const r of results) {
            const ms = r.duration < 1000 ? `${r.duration.toFixed(0)}ms` : `${(r.duration / 1000).toFixed(2)}s`
            const mark = r.passed ? 'PASS' : 'FAIL'
            console.log(`  [${mark}] ${r.filename} (${ms})${r.retried ? ' [retried]' : ''}`)
            if (!r.passed) {
                if (r.code !== 0) console.log(`         exit code: ${r.code}`)
                if (r.firstFailure) console.log(`         first attempt also failed; showing retry failure context`)
                const failureContext = getFailureContext(r)
                if (failureContext.length) {
                    for (const line of failureContext) console.log(`         ${line.trim()}`)
                }
            }
        }

        console.log(`\n--- Summary ---`)
        console.log(`  ${passed.length}/${results.length} passed`)

        if (failed.length > 0) {
            console.log(`\n  Failed: ${failed.map((f) => f.filename).join(', ')}`)
            process.exit(1)
        }

        console.log('\n  All contracts passed.\n')
    }

    try {
        await runContracts()
    } finally {
        if (serverLease) serverLease.close()
    }
}

main().catch((err) => {
    console.error('Runner error:', err)
    process.exit(1)
})
