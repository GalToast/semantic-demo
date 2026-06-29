/**
 * bootstrap-window-export-contract.mjs
 *
 * MODERNIZED: Bootstrap Window Export Contract.
 *
 * This contract tracks the bootstrap dewindowing transition:
 * 1. lifecycle.js no longer assigns core functions to window.
 * 2. Internal dependencies are explicit module exports.
 * 3. window.state is retired; __APP_STATE__ / __TEST_STATE__ are the state hooks.
 *
 * Usage:
 *   node tests/bootstrap-window-export-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTrailFromSeed } from '@lib/journey/neighborhood'

const ROOT = path.resolve(process.cwd())
const APP_PATH = path.join(ROOT, 'src/lib/orchestration/app-init.ts')
const APP_TS_PATH = path.join(ROOT, 'src/lib/orchestration/app-init.ts')
const MAIN_TS_PATH = path.join(ROOT, 'src/main.ts')
const LIFECYCLE_PATH = path.join(ROOT, 'src/lib/stores/lifecycle.ts')
const TESTS_DIR = path.join(ROOT, 'tests')
const THIS_FILE = fileURLToPath(import.meta.url)

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function read(file) {
    return fs.readFileSync(file, 'utf-8')
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) return walk(fullPath)
        return fullPath
    })
}

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const FORBIDDEN_SHIMS = [
    'setMyceliumMode',
    'setTrailDepth',
    'setSemanticDiveMode',
    'applyStoryPrompt',
    'resetExperienceState',
    'returnToOverview',
    'resetExplorationFocus',
    'refreshCompositionState',
    'focusOnPoint',
    'updateExplorationUi',
    'dispatchNavTransition',
    'updateUrlState',
    'switchView'
]

const APP_ACTION_KEYS = [
    'search',
    'clearSearch',
    'switchView',
    'focusOnNode',
    'setTrailFromSeed',
    'setTrailDepth',
    'setSemanticDiveMode',
    'returnToOverview',
    'resetExperienceState',
    'resetExplorationFocus',
    'refreshCompositionState'
]

function testNoForbiddenShims() {
    console.log('\n[TEST 1] No forbidden window shims in lifecycle.ts')

    const lcSrc = read(LIFECYCLE_PATH)

    for (const shim of FORBIDDEN_SHIMS) {
        const pattern = new RegExp(`window\\.${shim}\\s*=`, 'g')
        assert(!pattern.test(lcSrc), `lifecycle.js must NOT assign window.${shim}`)
        console.log(`  PASS — window.${shim} is retired`)
    }
}

function testLegitimateHooks() {
    console.log('\n[TEST 2] Verifying legitimate test hooks')
    const _appSrc = read(APP_PATH)
    const appTsSrc = read(APP_TS_PATH)

    assert(
        /window\.__APP_STATE__\s*=/.test(appTsSrc),
        'app.ts should retain window.__APP_STATE__ hook (inlined from bridge-registry)'
    )
    // __APP_STATE__ is assigned in app-init.ts; __TEST_STATE__ is assigned in main.ts
    // (some hooks moved during the TS migration). Accept either source.
    const mainTsSrc = read(MAIN_TS_PATH)
    assert(
        /window\.__TEST_STATE__\s*=/.test(appTsSrc) || /w\.__TEST_STATE__\s*=/.test(mainTsSrc),
        'app.ts or main.ts should retain window.__TEST_STATE__ fallback亦凡 fallback hook (inlined from bridge-registry)'
    )
    assert(!/window\.state\s*=\s*state/.test(_appSrc), 'app.js must not reintroduce retired window.state hook')
    assert(!/window\.state\s*=\s*state/.test(appTsSrc), 'app.ts must not reintroduce retired window.state hook')
    console.log('  PASS — test hooks confirmed')
}

function testAppActionsNamespace() {
    console.log('\n[TEST 4] Verifying __APP_ACTIONS__ namespace is assigned')
    const _appSrc = read(APP_PATH)
    const appTsSrc = read(APP_TS_PATH)

    assert(
        /window\.__APP_ACTIONS__\s*=\s*\{/.test(appTsSrc) ||
            /\(window as any\)\.__APP_ACTIONS__\s*=\s*\{/.test(appTsSrc),
        'app.ts should assign window.__APP_ACTIONS__ namespace (inlined from bridge-registry)'
    )
    for (const key of APP_ACTION_KEYS) {
        const objectLiteralKey = new RegExp(`${key}(?::|\\s*[,}])`).test(appTsSrc)
        const propertyAssignment = new RegExp(`window\\.__APP_ACTIONS__\\.${key}\\s*=`).test(appTsSrc)
        assert(objectLiteralKey || propertyAssignment, `__APP_ACTIONS__ should contain key: ${key}`)
    }
    assert(
        /setTrailFromSeed/.test(appTsSrc),
        '__APP_ACTIONS__.setTrailFromSeed should bind to setTrailFromSeed (direct or wrapped)'
    )
    console.log('  PASS — __APP_ACTIONS__ namespace verified')
}

function testNoBareAppActionTestCalls() {
    console.log('\n[TEST 5] No bare window app-action test invocations')

    const scanned = walk(TESTS_DIR)
        .filter((file) => /\.(?:mjs|js)$/.test(file))
        .filter((file) => path.resolve(file) !== THIS_FILE)
    const offenders = []
    const keys = APP_ACTION_KEYS.join('|')
    const bareCallPattern = new RegExp(`window\\.(${keys})\\s*(?:\\?\\.)?\\s*\\(`)
    const fallbackPattern = new RegExp(`\\?\\?\\s*window\\.(${keys})\\b`)

    for (const file of scanned) {
        const src = stripComments(read(file))
        const lines = src.split(/\r?\n/)
        lines.forEach((line, index) => {
            if (bareCallPattern.test(line) || fallbackPattern.test(line)) {
                offenders.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}`)
            }
        })
    }

    assert(
        offenders.length === 0,
        `test callers must use window.__APP_ACTIONS__ for app actions; offenders:\n${offenders.join('\n')}`
    )
    console.log('  PASS — test app-action calls use __APP_ACTIONS__')
}
function testRecenterBridgeRetired() {
    console.log('\n[TEST 3] Verifying recenterFocusedNode bridge is retired from lifecycle.ts')
    const lcSrc = read(LIFECYCLE_PATH)

    assert(
        !/window\.recenterFocusedNode\s*=/.test(lcSrc),
        'lifecycle.js must not reintroduce window.recenterFocusedNode bridge'
    )
    console.log('  PASS — recenterFocusedNode bridge remains retired')
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

console.log('=================================================================')
console.log('bootstrap-window-export-contract.mjs (MODERNIZED)')
console.log('Contract: bootstrap state hook and lifecycle shim ownership')
console.log('=================================================================')

try {
    testNoForbiddenShims()
    testLegitimateHooks()
    testRecenterBridgeRetired()
    testAppActionsNamespace()
    testNoBareAppActionTestCalls()

    console.log('\n=================================================================')
    console.log('ALL DEWINDOWING RULES PASSED')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}
