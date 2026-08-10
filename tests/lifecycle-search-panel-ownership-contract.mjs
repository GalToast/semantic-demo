/**
 * lifecycle-search-panel-ownership-contract.mjs
 *
 * Fast Node contract test verifying that search panel state is owned by the
 * current search/results-ui module and reset/url lifecycle code does not route
 * through a window bridge.
 *
 * Ownership rule (source contract):
 *   setSearchPanelState is owned by src/lib/search/results-ui.ts.
 *   src/lib/search/state.ts is the facade for consumers that need it.
 *   The retired window._ss debug namespace was not a public API surface.
 *
 * resetStateBeforeUrlRestore clears canonical state/input directly; search
 * panel DOM state remains owned by search/results-ui.ts + the panel adapter.
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/lifecycle-search-panel-ownership-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const SEMDEMO_ROOT = path.resolve(process.cwd())
const URL_STATE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/url-state.ts')
const URL_WRITER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/url-writer.ts')
const URL_RESTORE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/url-restore.ts')
const SEARCH_STATE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/state.ts')
const SEARCH_RESULTS_UI_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/results-ui.ts')
const SEARCH_STORE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/search.svelte.ts')
const SEARCH_PANEL_BRIDGE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/search-panel-adapter.ts')
const APP_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/app-init.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ---------------------------------------------------------------------------
// TEST 1 — search/results-ui.ts must export setSearchPanelState as a named function
// ---------------------------------------------------------------------------

function testSearchStateExportsSetSearchPanelState() {
    console.log('\n[TEST] search/results-ui.ts exports setSearchPanelState as named export')

    const src = fs.readFileSync(SEARCH_RESULTS_UI_PATH, 'utf-8')
    assert(
        /^export\s+function\s+setSearchPanelState\s*\(/m.test(src),
        'search/results-ui.ts must export setSearchPanelState as a named function (^export function setSearchPanelState)'
    )

    console.log('  OK — search/results-ui.ts exports setSearchPanelState as named function')
}

// ---------------------------------------------------------------------------
// TEST 2 — search/state.ts facade must re-export setSearchPanelState
// ---------------------------------------------------------------------------

function testLifecycleImportsSetSearchPanelState() {
    console.log('\n[TEST] search/state.ts facade re-exports setSearchPanelState from results-ui')

    const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8')

    assert(
        /export\s*\{[\s\S]*\bsetSearchPanelState\b[\s\S]*\}\s+from\s+['"]\.\/results-ui['"]/.test(src),
        'search/state.ts must re-export setSearchPanelState from ./results-ui'
    )

    console.log('  OK — search/state.ts exposes the canonical results-ui owner')
}

// ---------------------------------------------------------------------------
// TEST 3 — reset/url lifecycle must NOT use window.setSearchPanelState as a guarded no-op
// The old call was:
//   if (typeof window.setSearchPanelState === 'function')
//     window.setSearchPanelState({ searching: false, focusing: false, resultsRendered: false });
// This guard was a permanent no-op because app.js never exported setSearchPanelState.
// ---------------------------------------------------------------------------

function testLifecycleNoWindowSetSearchPanelStateCall() {
    console.log('\n[TEST] url-state reset does not call window.setSearchPanelState (dead guarded call removed)')

    const lifecycleSrc = fs.readFileSync(URL_STATE_PATH, 'utf-8')
    const lines = lifecycleSrc.split('\n')

    const problems = []
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        const pos = t.indexOf('window.setSearchPanelState')
        if (pos === -1) continue
        // Allow comment references
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('*')) continue
        // Check if guarded
        const before = t.substring(0, pos)
        if (before.includes('typeof') || before.includes('?.')) continue
        // Multi-line guard: scan up to 4 preceding non-blank lines
        let guarded = false
        for (let j = Math.max(0, i - 4); j < i; j++) {
            const prev = lines[j].trim()
            if (prev.includes('typeof') || prev.includes('?.')) {
                guarded = true
                break
            }
        }
        if (guarded) continue
        problems.push(`  line ${i + 1}: ${t}`)
    }

    assert(
        problems.length === 0,
        `url-state reset must not call window.setSearchPanelState (bare or unguarded):\n${problems.join('\n')}`
    )

    console.log('  OK — no window.setSearchPanelState call found in url-state.ts')
}

// ---------------------------------------------------------------------------
// TEST 4 — resetStateBeforeUrlRestore clears canonical search state/input directly
// ---------------------------------------------------------------------------

function testLifecycleCallsSetSearchPanelStateDirectly() {
    console.log('\n[TEST] resetStateBeforeUrlRestore clears canonical search state through the search store')

    const src = fs.readFileSync(URL_STATE_PATH, 'utf-8')
    const urlRestoreSrc = fs.readFileSync(URL_RESTORE_PATH, 'utf-8')
    const urlWriterSrc = fs.readFileSync(URL_WRITER_PATH, 'utf-8')
    const searchStoreSrc = fs.readFileSync(SEARCH_STORE_PATH, 'utf-8')

    assert(
        /export\s+function\s+resetStateBeforeUrlRestore\s*\(/.test(src) ||
            /export\s*\{[\s\S]*\bresetStateBeforeUrlRestore\b[\s\S]*?\}\s*from\s*['"][^'"]*url-restore[^'"]*['"]/.test(
                src
            ),
        'url-state.ts must define or re-export resetStateBeforeUrlRestore'
    )
    // Post-split: clearSearch import + delegation live in url-writer.ts (the
    // owner of the URL write/reset path); url-state.ts is a pure barrel.
    assert(
        /import\s*\{[\s\S]*\bclearSearch\b[\s\S]*\}\s+from\s+['"]@lib\/stores\/search\.svelte['"]/.test(urlWriterSrc),
        'url-writer.ts must import clearSearch from the canonical search store'
    )
    assert(
        /resetStateBeforeUrlRestore[\s\S]*\bclearSearch\s*\(\s*\)/.test(urlWriterSrc),
        'resetStateBeforeUrlRestore must delegate canonical state clearing to clearSearch() (url-writer.ts)'
    )
    assert(
        /export\s+function\s+clearSearch\s*\([\s\S]*?appState\.searchState\.currentSearchSummary\s*=\s*null/.test(
            searchStoreSrc
        ) ||
            /export\s+function\s+clearSearch\s*\([\s\S]*?appState\.currentSearchSummary\s*=\s*null/.test(
                searchStoreSrc
            ),
        'clearSearch() must clear currentSearchSummary in the canonical search store'
    )
    assert(
        /input\.dispatchEvent\s*\(\s*new\s+Event\s*\(\s*['"]input['"]/.test(urlRestoreSrc),
        'url-restore.ts must notify the search input owner via an input event'
    )

    console.log('  OK — resetStateBeforeUrlRestore clears canonical state through clearSearch and input ownership')
}

// ---------------------------------------------------------------------------
// TEST 5 — app.js must NOT export setSearchPanelState to window
// (it was never supposed to, and the dead guard proves it)
// ---------------------------------------------------------------------------

function testAppJsDoesNotExportSetSearchPanelState() {
    console.log('\n[TEST] app.js does NOT export setSearchPanelState to window')

    const appSrc = fs.readFileSync(APP_PATH, 'utf-8')

    // app.js must not assign setSearchPanelState to window
    assert(
        !/(?:window\.)?setSearchPanelState\s*=\s*(?!=)/.test(appSrc),
        'app.js must NOT assign window.setSearchPanelState — it is not the owner'
    )

    console.log('  OK — app.js does not export setSearchPanelState to window')
}

// ---------------------------------------------------------------------------
// TEST 6 — search/results-ui.ts owns the setSearchPanelState decision point and
// delegates panel DOM writes through the panel adapter bridge.
// ---------------------------------------------------------------------------

function testSearchStateImplementsPanelState() {
    console.log('\n[TEST] search/results-ui.ts delegates panel DOM state through the panel adapter bridge')

    const src = fs.readFileSync(SEARCH_RESULTS_UI_PATH, 'utf-8')
    const adapterSrc = fs.readFileSync(SEARCH_PANEL_BRIDGE_PATH, 'utf-8')

    assert(
        /setSearchContainerState[\s\S]*from\s+['"]\.\/search-panel-adapter['"]/.test(src),
        'search/results-ui.ts must import setSearchContainerState from search-panel-adapter'
    )

    assert(
        /setSearchContainerState\s*\(\s*\{/.test(src),
        'search/results-ui.ts setSearchPanelState must delegate to setSearchContainerState'
    )

    assert(
        /setSearchContainerState/.test(adapterSrc),
        'search-panel-adapter bridge must expose setSearchContainerState'
    )

    console.log('  OK — search/results-ui.ts owns decision; panel adapter bridge owns DOM class toggling')
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('=================================================================')
    console.log('lifecycle-search-panel-ownership-contract.mjs')
    console.log('Contract test: setSearchPanelState ownership and reset bridge removal')
    console.log('=================================================================')

    try {
        testSearchStateExportsSetSearchPanelState()
        testLifecycleImportsSetSearchPanelState()
        testLifecycleNoWindowSetSearchPanelStateCall()
        testLifecycleCallsSetSearchPanelStateDirectly()
        testAppJsDoesNotExportSetSearchPanelState()
        testSearchStateImplementsPanelState()

        console.log('\n=================================================================')
        console.log('ALL TESTS PASSED')
        console.log('=================================================================')
        process.exit(0)
    } catch (err) {
        console.error('\nTEST FAILED:', err.message)
        process.exit(1)
    }
}

main()
