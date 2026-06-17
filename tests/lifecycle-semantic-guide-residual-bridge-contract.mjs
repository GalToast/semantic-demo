/**
 * lifecycle-semantic-guide-residual-bridge-contract.mjs
 *
 * Documents and guards the post-W15 ownership graph:
 *
 *   Canonical owner: src/lib/stores/legend-panel.svelte.ts
 *     - updateLegendGuideState, closeLegendGuide, restoreLegendCollapsedPanel
 *
 *   Bridge re-export: src/lib/engine/legend-ui-bridge.ts
 *     - re-exports all 10 ports from the canonical store
 *
 *   Deleted kernels (no longer exist):
 *     - js/modules/legend-ui.ts
 *     - js/modules/semantic-guide.ts
 *
 * Design:
 *   - Verifies the canonical store owns the legend panel functions
 *   - Verifies lifecycle.js does not import from deleted kernels
 *   - Verifies the bridge re-exports correctly
 *   - Guards against introducing import cycles
 *
 * Runs in Node. No Playwright, no live network.
 *
 * Usage:
 *   node tests/lifecycle-semantic-guide-residual-bridge-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const SEMDEMO_ROOT = path.resolve(process.cwd())

const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.ts')
const VIEW_CONTROLLER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/view-controller.ts')
const LEGEND_PANEL_STORE = path.join(SEMDEMO_ROOT, 'src/lib/stores/legend-panel.svelte.ts')
const LEGEND_UI_BRIDGE = path.join(SEMDEMO_ROOT, 'src/lib/engine/legend-ui-bridge.ts')
const DELETED_LEGEND_UI = path.join(SEMDEMO_ROOT, 'js/modules/legend-ui.ts')
const DELETED_SEMANTIC_GUIDE = path.join(SEMDEMO_ROOT, 'js/modules/semantic-guide.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ── Read sources ────────────────────────────────────────────────────────────

function readSrc(p) {
    return fs.readFileSync(p, 'utf-8')
}

// ── TEST 1: updateLegendGuideState is owned by legend-panel.svelte.ts ──

function testUpdateLegendGuideStateOwner() {
    console.log('\n[TEST 1] updateLegendGuideState — owned by legend-panel.svelte.ts')

    const storeSrc = readSrc(LEGEND_PANEL_STORE)
    const viewControllerSrc = readSrc(VIEW_CONTROLLER_PATH)

    // legend-panel.svelte.ts must define (export) updateLegendGuideState
    assert(
        storeSrc.includes('export function updateLegendGuideState'),
        'legend-panel.svelte.ts must export updateLegendGuideState'
    )

    // legend-panel.svelte.ts must not expose it to window.
    assert(
        !storeSrc.includes('window.updateLegendGuideState'),
        'legend-panel.svelte.ts does not export updateLegendGuideState to window'
    )

    // The call site in view-controller.switchView must use the Event Bus.
    assert(
        viewControllerSrc.includes('publish(EVENTS.VIEW_CHANGED'),
        'view-controller.switchView uses Event Bus for view transitions'
    )

    assert(
        !viewControllerSrc.includes('updateLegendGuideState();'),
        'view-controller.switchView should NOT call updateLegendGuideState directly (now event-driven)'
    )

    // legend-panel.svelte.ts is a pure function module — it doesn't subscribe to events
    // itself; event subscriptions are handled by legend-ui.ts (@lib/journey/legend-ui.ts)
    // which calls setLegendOpen on VIEW_CHANGED. The store just provides the imperative surface.

    console.log('  OK — updateLegendGuideState: legend-panel.svelte.ts owns it, reached via Event Bus')
}

// ── TEST 2: restoreLegendCollapsedPanel is owned by legend-panel.svelte.ts ──

function testRestoreLegendCollapsedPanelOwner() {
    console.log('\n[TEST 2] restoreLegendCollapsedPanel — owned by legend-panel.svelte.ts')

    const storeSrc = readSrc(LEGEND_PANEL_STORE)
    const legendBindingsPath = path.join(SEMDEMO_ROOT, 'src/lib/ui/legend-bindings.ts')
    const legendBindingsSrc = readSrc(legendBindingsPath)

    assert(
        storeSrc.includes('export function restoreLegendCollapsedPanel'),
        'legend-panel.svelte.ts must export restoreLegendCollapsedPanel'
    )
    assert(
        !storeSrc.includes('window.restoreLegendCollapsedPanel'),
        'legend-panel.svelte.ts must not keep the retired window.restoreLegendCollapsedPanel export'
    )
    assert(
        !legendBindingsSrc.includes('window.restoreLegendCollapsedPanel = restoreLegendCollapsedPanel'),
        'legend-bindings.ts must not own the restoreLegendCollapsedPanel window export'
    )

    const closeLegendGuideMatch = storeSrc.match(/export function closeLegendGuide[\s\S]*?^}/m)
    assert(closeLegendGuideMatch, 'legend-panel.svelte.ts must define closeLegendGuide')

    const closeLegendGuideBody = closeLegendGuideMatch[0]
    assert(
        closeLegendGuideBody.includes('restoreLegendCollapsedPanel(infoPanel, panelBtn)'),
        'legend-panel.svelte.ts.closeLegendGuide calls restoreLegendCollapsedPanel locally'
    )
    assert(
        !closeLegendGuideBody.includes('window.restoreLegendCollapsedPanel'),
        'legend-panel.svelte.ts.closeLegendGuide must not call the legacy window bridge'
    )

    console.log('  OK — restoreLegendCollapsedPanel: legend-panel.svelte.ts-owned, used locally in closeLegendGuide')
}

// ── TEST 3: No lifecycle → event-bindings import of restoreLegendCollapsedPanel ──

function testNoNewLifecycleEventBindingsImportCycle() {
    console.log('\n[TEST 3] lifecycle does NOT import restoreLegendCollapsedPanel from event-bindings')

    const lifecycleSrc = readSrc(LIFECYCLE_PATH)

    const directRestoreImport = lifecycleSrc.match(/import.*restoreLegendCollapsedPanel.*from.*event/)
    assert(!directRestoreImport, 'lifecycle.js must NOT import restoreLegendCollapsedPanel from event-bindings.ts')

    console.log('  OK — no new direct import of restoreLegendCollapsedPanel from event-bindings.ts')
}

// ── TEST 4: lifecycle does NOT import updateLegendGuideState from semantic-guide.js ──

function testLifecycleDoesNotImportUpdateLegendGuideStateFromSemanticGuide() {
    console.log('\n[TEST 4] lifecycle does NOT import updateLegendGuideState from semantic-guide')

    const lifecycleSrc = readSrc(LIFECYCLE_PATH)

    // lifecycle imports hideSummaryCard from @lib/journey/semantic-guide.ts — that's fine
    // But it must NOT import updateLegendGuideState from any source
    const importDeclarations = lifecycleSrc.match(/^import[\s\S]*?;$/gm) || []
    const badImport = importDeclarations.some((declaration) => declaration.includes('updateLegendGuideState'))
    assert(
        !badImport,
        'lifecycle must NOT import updateLegendGuideState from any source (legend-panel.svelte.ts owns it)'
    )

    console.log('  OK — lifecycle does not import updateLegendGuideState')
}

// ── TEST 5: closeLegendGuide is legend-panel.svelte.ts-owned ──

function testCloseLegendGuideOwnership() {
    console.log('\n[TEST 5] closeLegendGuide — owned by legend-panel.svelte.ts')

    const storeSrc = readSrc(LEGEND_PANEL_STORE)

    // closeLegendGuide must be exported from legend-panel.svelte.ts
    assert(storeSrc.includes('export function closeLegendGuide'), 'legend-panel.svelte.ts must export closeLegendGuide')

    // closeLegendGuide must not be exported to window.
    assert(
        !storeSrc.includes('window.closeLegendGuide = closeLegendGuide'),
        'legend-panel.svelte.ts does not export closeLegendGuide to window'
    )

    // closeLegendGuide calls closeLegendPanel internally
    const closeLegendGuideMatch = storeSrc.match(/export function closeLegendGuide[\s\S]*?^}/m)
    assert(closeLegendGuideMatch, 'legend-panel.svelte.ts defines closeLegendGuide')
    const body = closeLegendGuideMatch[0]
    assert(body.includes('closeLegendPanel()'), 'closeLegendGuide delegates to closeLegendPanel')

    console.log('  OK — closeLegendGuide: legend-panel.svelte.ts-owned, delegates to closeLegendPanel')
}

// ── TEST 6: Deleted kernels do not exist ──

function testDeletedKernelsNotExist() {
    console.log('\n[TEST 6] Deleted kernel files do not exist')

    assert(!fs.existsSync(DELETED_LEGEND_UI), 'js/modules/legend-ui.ts must be deleted')
    assert(!fs.existsSync(DELETED_SEMANTIC_GUIDE), 'js/modules/semantic-guide.ts must be deleted')

    console.log('  OK — deleted kernel files confirmed absent')
}

// ── TEST 7: legend-ui-bridge.ts re-exports from canonical store ──

function testBridgeReexportsFromCanonicalStore() {
    console.log('\n[TEST 7] legend-ui-bridge.ts re-exports from the canonical store')

    const bridgeSrc = readSrc(LEGEND_UI_BRIDGE)

    assert(
        bridgeSrc.includes("from '@lib/stores/legend-panel.svelte.ts'") ||
            bridgeSrc.includes("from '@lib/stores/legend-panel'"),
        'legend-ui-bridge.ts must re-export from the canonical store'
    )

    // Must NOT re-export from the deleted kernel
    assert(
        !bridgeSrc.includes("from '../../../js/modules/legend-ui.ts'") &&
            !bridgeSrc.includes("from './js/modules/legend-ui.ts'"),
        'legend-ui-bridge.ts must not re-export from the deleted kernel'
    )

    console.log('  OK — legend-ui-bridge.ts re-exports from the canonical store, not the deleted kernel')
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================')
console.log('lifecycle-semantic-guide-residual-bridge-contract.mjs')
console.log('Documents: legend-panel.svelte.ts owns updateLegendGuideState,')
console.log('          closeLegendGuide, restoreLegendCollapsedPanel')
console.log('          bridge re-exports from the canonical store')
console.log('          deleted kernels are confirmed absent')
console.log('=================================================================')

try {
    testUpdateLegendGuideStateOwner()
    testRestoreLegendCollapsedPanelOwner()
    testNoNewLifecycleEventBindingsImportCycle()
    testLifecycleDoesNotImportUpdateLegendGuideStateFromSemanticGuide()
    testCloseLegendGuideOwnership()
    testDeletedKernelsNotExist()
    testBridgeReexportsFromCanonicalStore()

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED — residual bridge state documented and guarded')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}
