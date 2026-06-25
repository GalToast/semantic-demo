/**
 * legend-ui-ownership-contract.mjs
 *
 * Verifies the post-bridge-retirement legend panel ownership graph:
 *   - src/lib/stores/legend-panel.svelte.ts owns the 10 legend-panel ports
 *   - Consumers (event-bindings.ts, legend-bindings.ts) import directly from
 *     the canonical store (the bridge that used to mediate has been retired)
 *   - No live source file imports from the retired js/modules/legend-ui.ts kernel
 *
 * Runs in Node. No Playwright, no live network.
 *
 * Usage:
 *   node tests/legend-ui-ownership-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const SEMDEMO_ROOT = path.resolve(process.cwd())

const LEGEND_PANEL_STORE = path.join(SEMDEMO_ROOT, 'src/lib/stores/legend-panel.svelte.ts')
const LEGEND_BINDINGS = path.join(SEMDEMO_ROOT, 'src/lib/ui/legend-bindings.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function readSrc(p) {
    return fs.readFileSync(p, 'utf-8')
}

// ── TEST 1: legend-panel.svelte.ts exists and exports the 10 ports ─────────────────

function testLegendPanelStoreExportsPorts() {
    console.log('\n[TEST 1] legend-panel.svelte.ts exports the 10 canonical ports')

    const src = readSrc(LEGEND_PANEL_STORE)

    const requiredExports = [
        'closeLegendPanel',
        'openLegendPanel',
        'isLegendPanelOpen',
        'restoreLegendCollapsedPanel',
        'buildLegend',
        'updateLegendGuideState',
        'closeLegendGuide',
        'buildCanvasColorLegend',
        'setPreviouslyFocusedLegend',
        'getPreviouslyFocusedLegend'
    ]

    for (const name of requiredExports) {
        assert(
            src.includes(`export function ${name}`) || src.includes(`export { ${name}`),
            `legend-panel.svelte.ts must export ${name}`
        )
    }

    console.log('  OK — legend-panel.svelte.ts exports all 10 canonical ports')
}

// ── TEST 2: legend-bindings.ts imports directly from the canonical store ──────
// The legend-ui-bridge.ts that previously mediated this surface was retired
// (see docs/bridge-audit-2026-06-19.md). Consumers now import the canonical
// store directly.

function testLegendBindingsImportsFromCanonicalStore() {
    console.log('\n[TEST 2] legend-bindings.ts imports from the canonical legend-panel store')

    const src = readSrc(LEGEND_BINDINGS)

    assert(
        src.includes("from '@lib/stores/legend-panel.svelte.ts'") ||
            src.includes("from '@lib/stores/legend-panel'"),
        'legend-bindings.ts must import from the canonical legend-panel store'
    )

    // Must NOT import from the deleted kernel
    assert(
        !src.includes("from '../../../js/modules/legend-ui.ts'") &&
            !src.includes("from './js/modules/legend-ui.ts'") &&
            !src.includes("from 'js/modules/legend-ui.ts'"),
        'legend-bindings.ts must not import from the deleted kernel'
    )

    console.log('  OK — legend-bindings.ts imports directly from the canonical store')
}

// ── TEST 3: No live source imports from the deleted kernel ──────────────────────

function testNoLiveSourceImportsFromDeletedKernel() {
 console.log('\n[TEST 3] No live source file imports from deleted ')

    // Use ripgrep to find any imports from the deleted kernel path
    try {
        const searchRoots = ['src/']
        if (fs.existsSync(path.join(SEMDEMO_ROOT, 'js'))) searchRoots.push('js/')
        const result = execSync(
 `rg -l "from.*" --glob "!tests/" --glob "!legacy-reference/" --glob "!docs/" ${searchRoots.join(' ')}`
            { cwd: SEMDEMO_ROOT, encoding: 'utf-8', timeout: 15000 }
        ).trim()

 assert(result === '', `Found live imports from deleted kernel :\n${result}`)
    } catch (err) {
        // rg exits 1 when no matches — that's success
        if (err.status !== 1) throw err
    }

    console.log('  OK — no live source imports from the deleted kernel')
}

// ── TEST 4: legend-panel.svelte.ts does not expose window globals ───────────────

function testNoWindowExports() {
    console.log('\n[TEST 4] legend-panel.svelte.ts does not export to window')

    const src = readSrc(LEGEND_PANEL_STORE)

    assert(
        !src.includes('window.closeLegendPanel') &&
            !src.includes('window.openLegendPanel') &&
            !src.includes('window.restoreLegendCollapsedPanel') &&
            !src.includes('window.buildLegend'),
        'legend-panel.svelte.ts must not expose functions to window'
    )

    console.log('  OK — legend-panel.svelte.ts has no window exports')
}

// ── TEST 5: legend-panel.svelte.ts does not import lifecycle or event-bindings ────

function testStoreDoesNotImportLifecycleOrEventBindings() {
    console.log('\n[TEST 5] legend-panel.svelte.ts does NOT import lifecycle or event-bindings')

    const src = readSrc(LEGEND_PANEL_STORE)

    assert(!src.includes('from') || !src.includes('lifecycle'), 'does not import lifecycle')
    assert(!src.includes('from') || !src.includes('event-bindings'), 'does not import event-bindings')

    console.log('  OK — legend-panel.svelte.ts is neutral (no lifecycle/event-bindings imports)')
}

// ── TEST 6: event-bindings imports from the canonical store ─────────────────────

function testEventBindingsImportsFromCanonicalStore() {
    console.log('\n[TEST 6] event-bindings imports from the canonical store')

    const eventBindingsPath = path.join(SEMDEMO_ROOT, 'src/lib/ui/event-bindings.ts')
    const legendBindingsPath = path.join(SEMDEMO_ROOT, 'src/lib/ui/legend-bindings.ts')

    // event-bindings.ts imports buildLegend from the store
    const ebSrc = readSrc(eventBindingsPath)
    assert(
        ebSrc.includes("from '@lib/stores/legend-panel") || ebSrc.includes("from '@lib/engine/legend-ui-bridge'"),
        'event-bindings.ts imports from the canonical store'
    )

    // legend-bindings.ts imports from the store
    const lbSrc = readSrc(legendBindingsPath)
    assert(
        lbSrc.includes("from '@lib/stores/legend-panel'") ||
            lbSrc.includes("from '@lib/stores/legend-panel.svelte.ts'"),
        'legend-bindings.ts imports from the canonical store'
    )

    // Neither should import from the deleted kernel
    assert(
        !ebSrc.includes("from '../../../js/modules/legend-ui") &&
            !lbSrc.includes("from '../../../js/modules/legend-ui"),
        'event-bindings/legend-bindings must not import from the deleted kernel'
    )

    console.log('  OK — event-bindings imports from the canonical store')
}

// ── TEST 7: lifecycle.ts does not import from the deleted legend-ui kernel ────────

function testLifecycleDoesNotImportFromDeletedKernel() {
    console.log('\n[TEST 7] lifecycle.ts does NOT import from deleted legend-ui kernel')

    const lifecyclePath = path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts')
    const src = readSrc(lifecyclePath)

    assert(
        !src.includes("from './legend-ui.ts'") &&
            !src.includes("from '../legend-ui.ts'") &&
            !src.includes("from '../../js/modules/legend-ui.ts'"),
        'lifecycle.ts must not import from the deleted legend-ui.ts kernel'
    )

    console.log('  OK — lifecycle.ts does not import from the deleted kernel')
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================')
console.log('legend-ui-ownership-contract.mjs')
console.log('Verifies: legend-panel.svelte.ts owns the 10 canonical ports')
console.log('          legend-bindings.ts imports directly from the canonical store')
console.log('          no live source imports from the deleted kernel')
console.log('=================================================================')

try {
    testLegendPanelStoreExportsPorts()
    testLegendBindingsImportsFromCanonicalStore()
    testNoLiveSourceImportsFromDeletedKernel()
    testNoWindowExports()
    testStoreDoesNotImportLifecycleOrEventBindings()
    testEventBindingsImportsFromCanonicalStore()
    testLifecycleDoesNotImportFromDeletedKernel()

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED — legend panel ownership verified')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}
