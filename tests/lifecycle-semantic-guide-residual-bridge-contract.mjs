/**
 * lifecycle-semantic-guide-residual-bridge-contract.mjs
 *
 * Documents and guards the post-W15 ownership graph:
 *
 *   Canonical owner: src/lib/stores/legend-panel.svelte.ts
 *     - updateLegendGuideState, closeLegendGuide, restoreLegendCollapsedPanel
 *
 *   No-resurrection guards:
 *     - lifecycle must NOT import updateLegendGuideState
 *     - view-controller must NOT call updateLegendGuideState directly
 *     - legend-ui-bridge.ts has been absorbed (no longer exists)
 *
 *   Deleted kernels (no longer exist):
 * -
 * -
 *     - src/lib/engine/legend-ui-bridge.ts (absorbed into canonical store)
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

const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts')
const VIEW_CONTROLLER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/view-controller.ts')
const LEGEND_PANEL_STORE = path.join(SEMDEMO_ROOT, 'src/lib/stores/legend-panel.svelte.ts')
const DELETED_LEGEND_UI = path.join(SEMDEMO_ROOT, 'js/modules/legend-ui.ts')
const DELETED_SEMANTIC_GUIDE = path.join(SEMDEMO_ROOT, 'js/modules/semantic-guide.ts')
const DELETED_BRIDGE = path.join(SEMDEMO_ROOT, 'src/lib/engine/legend-ui-bridge.ts')

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

    // view-controller uses Svelte stores for view transitions (not event bus).
    // It must NOT call updateLegendGuideState directly — that is the store's job.
    assert(
        !viewControllerSrc.includes('updateLegendGuideState()'),
        'view-controller must NOT call updateLegendGuideState directly'
    )

    // No-resurrection guard: lifecycle must not import updateLegendGuideState
    const lifecycleSrc = readSrc(LIFECYCLE_PATH)
    const importDeclarations = lifecycleSrc.match(/^import[\s\S]*?;$/gm) || []
    const badImport = importDeclarations.some((d) => d.includes('updateLegendGuideState'))
    assert(
        !badImport,
        'lifecycle must NOT import updateLegendGuideState (legend-panel.svelte.ts owns it)'
    )

    console.log('  OK — updateLegendGuideState: legend-panel.svelte.ts owns it; no direct call from view-controller or lifecycle')
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

function testBridgeAbsorbedNoResurrection() {
    console.log('\n[TEST 7] legend-ui-bridge.ts absorbed — no resurrection')

    // The bridge file has been absorbed into the canonical store.
    // Guard against re-creating it as a stale re-export layer.
    assert(
        !fs.existsSync(DELETED_BRIDGE),
        'src/lib/engine/legend-ui-bridge.ts must not exist (absorbed into canonical store)'
    )

    // The canonical store must still own the functions directly.
    const storeSrc = readSrc(LEGEND_PANEL_STORE)
    assert(
        storeSrc.includes('export function updateLegendGuideState'),
        'legend-panel.svelte.ts still exports updateLegendGuideState directly'
    )
    assert(
        storeSrc.includes('export function closeLegendGuide'),
        'legend-panel.svelte.ts still exports closeLegendGuide directly'
    )

    console.log('  OK — legend-ui-bridge.ts absent; canonical store owns all functions directly')
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================')
console.log('lifecycle-semantic-guide-residual-bridge-contract.mjs')
console.log('Documents: legend-panel.svelte.ts owns updateLegendGuideState,')
console.log('          closeLegendGuide, restoreLegendCollapsedPanel')
console.log('          absorbed bridge must not resurrect')
console.log('          deleted kernels + bridge confirmed absent')
console.log('=================================================================')

try {
    testUpdateLegendGuideStateOwner()
    testRestoreLegendCollapsedPanelOwner()
    testNoNewLifecycleEventBindingsImportCycle()
    testLifecycleDoesNotImportUpdateLegendGuideStateFromSemanticGuide()
    testCloseLegendGuideOwnership()
    testDeletedKernelsNotExist()
    testBridgeAbsorbedNoResurrection()

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED — no-resurrection guards and ownership verified')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nTEST FAILED:', err.message)
    process.exit(1)
}
