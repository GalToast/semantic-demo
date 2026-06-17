/**
 * panel-bindings-leak-regression.mjs
 *
 * Regression test for the panel-bindings resize-listener leak.
 *
 * Bug: js/modules/bindings/panel-bindings.ts (commit 1682f31 prior) only added
 *      window.addEventListener('resize', ...) without a teardown path.
 *      Repeated bindPanelControls() calls stacked duplicate listeners and
 *      pending rAFs, causing the resize handler to fire N times after N binds.
 *
 * Fix (commit 1682f31): Added `unbindPanelControls()` with AbortController pattern.
 *                       bindPanelControls() calls unbindPanelControls() first
 *                       (idempotent), creates a fresh AbortController, and passes
 *                       `{ signal: controller.signal }` to addEventListener. The
 *                       pending rAF is cancelled on abort.
 *
 * This test verifies the source pattern stays in place. If anyone refactors
 * away the AbortController or removes the idempotency guard, this test fails.
 *
 * Run: node tests/panel-bindings-leak-regression.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PANEL_BINDINGS_PATH = path.join(__dirname, '..', 'js', 'modules', 'bindings', 'panel-bindings.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle)
    assert(found, `${label}: expected source to contain "${needle}"`)
}

function assertMatches(haystack, pattern, label) {
    assert(pattern.test(haystack), `${label}: expected source to match ${pattern}`)
}

console.log('============================================================')
console.log('panel-bindings-leak-regression.mjs')
console.log('Static-grep regression: resize-listener leak AbortController pattern')
console.log('============================================================')

const src = fs.readFileSync(PANEL_BINDINGS_PATH, 'utf-8')

// 1. unbindPanelControls must exist and be exported
assertMatches(src, /export\s+function\s+unbindPanelControls\s*\(\s*\)/, 'unbindPanelControls must be exported')

// 2. bindPanelControls must call unbindPanelControls at the top (idempotency)
assertMatches(
    src,
    /export\s+function\s+bindPanelControls[\s\S]{0,200}unbindPanelControls\s*\(\s*\)/,
    'bindPanelControls must call unbindPanelControls() at the top (idempotency)'
)

// 3. AbortController must be used to back the resize listener
assertContains(src, 'AbortController', 'AbortController must be referenced')
assertContains(src, 'new AbortController()', 'a new AbortController must be created')

// 4. addEventListener for resize must use the AbortController signal
assertMatches(
    src,
    /window\.addEventListener\(\s*['"]resize['"][\s\S]{0,200}signal:\s*controller\.signal/,
    'resize addEventListener must pass { signal: controller.signal }'
)

// 5. unbindPanelControls must call controller.abort() to tear down listeners
assertMatches(
    src,
    /unbindPanelControls[\s\S]{0,300}_resizeAbortController\.abort\(\)/,
    'unbindPanelControls must call _resizeAbortController.abort()'
)

// 6. Pending rAF must be cancelled on unbind (prevents post-teardown execution)
assertMatches(
    src,
    /unbindPanelControls[\s\S]{0,300}cancelAnimationFrame/,
    'unbindPanelControls must call cancelAnimationFrame to cancel pending rAF'
)

// 7. After abort, state must be reset to null (prevents double-abort and enables
//    a clean re-bind cycle)
assertContains(src, '_resizeAbortController = null', '_resizeAbortController must be nulled after abort')
assertContains(src, '_resizeRafId = null', '_resizeRafId must be nulled after cancel')

console.log('  OK unbindPanelControls exported')
console.log('  OK bindPanelControls is idempotent (calls unbind first)')
console.log('  OK AbortController backs the resize listener')
console.log('  OK addEventListener uses { signal: controller.signal }')
console.log('  OK unbindPanelControls calls controller.abort()')
console.log('  OK unbindPanelControls cancels pending rAF')
console.log('  OK AbortController and rAF state nulled after teardown')
console.log('\n============================================================')
console.log('ALL CHECKS PASSED')
console.log('============================================================')
