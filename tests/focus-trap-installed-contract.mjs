/**
 * focus-trap-installed-contract.mjs
 *
 * Static-source contract pinning the LAGUNA-FT-1 fix (commit d5ae46c0):
 * `bindFocusTrapObserver()` MUST be invoked at app-init in src/main.ts so the
 * MutationObserver that toggles the focus trap on panel-surface changes is
 * actually wired. Before d5ae46c0 the call did not exist, so the focus trap
 * never activated on surface changes — `tests/focus-trap-contract.mjs` only
 * passed because the 3D canvas is not natively focusable; the trap contract
 * was never actually exercised. This contract prevents that silent regression.
 *
 * Five points:
 *   1. `src/main.ts` imports `bindFocusTrapObserver` + `disposeFocusTrapBindings`
 *      from `@lib/utils` reachability.
 *   2. `src/lib/utils/focus-trap-bindings.ts` exports `bindFocusTrapObserver` as a
 *      real non-stub function declaration (has a non-empty body).
 *   3. `src/main.ts` invokes `bindFocusTrapObserver()` at module top-level
 *      (column 0) — NOT guarded behind `if (window)` / `if (import.meta.env.*)`
 *      / a lazy-init callback. Both install-without-cleanup and install-inside-a-
 *      conditional break the contract.
 *   4. `src/main.ts` also references `disposeFocusTrapBindings` in a teardown
 *      listener (`beforeunload` / HMR `dispose` / `unmount`), so the lifecycle is
 *      bidirectional (install + release), preventing a MutationObserver leak.
 *   5. `bindFocusTrapObserver()` body in focus-trap-bindings.ts:
 *        a) gates on `if (_focusTrapObserver) return` (idempotent re-entry guard),
 *        b) sets up `_focusTrapObserver = new MutationObserver(...)` and calls
 *           `.observe(document.body, {attributeFilter:['data-panel-surface']})`,
 *        c) the callback branches on `dataset.panelSurface` to call
 *           `trapFocusIn([...])` on the search/focus surfaces and
 *           `releaseFocusTrapNow()` otherwise.
 *
 * Source-only Node contract — no DOM, no Playwright.
 * Usage: node tests/focus-trap-installed-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const MAIN_PATH = path.join(ROOT, 'src/main.ts')
const BINDINGS_PATH = path.join(ROOT, 'src/lib/utils/focus-trap-bindings.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

const mainSrc = fs.readFileSync(MAIN_PATH, 'utf-8')
const bindingsSrc = fs.readFileSync(BINDINGS_PATH, 'utf-8')

console.log('=================================================================')
console.log('focus-trap-installed-contract.mjs (LAGUNA-FT-1 regression guard)')
console.log('=================================================================')

try {
    // Contract Point 1: src/main.ts imports bindFocusTrapObserver + disposeFocusTrapBindings
    console.log('\n[CONTRACT 1] src/main.ts imports bindFocusTrapObserver + disposeFocusTrapBindings')
    assert(
        /import\s+\{\s*[^}]*\bbindFocusTrapObserver\b[^}]*\}\s+from\s+['"]@lib\/utils['"]/.test(mainSrc),
        'src/main.ts must import bindFocusTrapObserver from @lib/utils'
    )
    assert(
        /import\s+\{\s*[^}]*\bdisposeFocusTrapBindings\b[^}]*\}\s+from\s+['"]@lib\/utils['"]/.test(mainSrc),
        'src/main.ts must import disposeFocusTrapBindings from @lib/utils'
    )
    console.log('  PASS - both binding functions are imported from @lib/utils')

    // Contract Point 2: focus-trap-bindings.ts exports bindFocusTrapObserver as a real function
    console.log('\n[CONTRACT 2] focus-trap-bindings.ts exports bindFocusTrapObserver as a real function')
    const exportMatch = bindingsSrc.match(
        /export\s+function\s+bindFocusTrapObserver\s*\(\s*\)(?:\s*:\s*void)?\s*\{([\s\S]*?)\n\}/
    )
    assert(exportMatch, 'focus-trap-bindings.ts must define bindFocusTrapObserver as an exported function declaration')
    const body = exportMatch[1]
    assert(body.trim().length > 20, 'bindFocusTrapObserver body must not be an empty stub')
    console.log('  PASS - exported function declaration with non-empty body')

    // Contract Point 3: src/main.ts invokes bindFocusTrapObserver() at module top-level (column 0)
    console.log('\n[CONTRACT 3] src/main.ts invokes bindFocusTrapObserver() at module top-level (not guarded)')
    const topLevelCall = mainSrc.match(/^(?:bindFocusTrapObserver\s*\(\s*\)\s*;?)/m)
    assert(topLevelCall, 'src/main.ts must call bindFocusTrapObserver() at column 0 (top-level, unconditional)')
    // Negative: the call must NOT be guarded behind window/env/lazy-init wrappers
    assert(
        !/if\s*\(\s*(typeof\s+window[^)]*|import\.meta\.env[^)]*|document\.readyState[^)]*)[^)]*\)\s*\{[\s\S]{0,400}bindFocusTrapObserver\s*\(/.test(
            mainSrc
        ),
        'bindFocusTrapObserver() must not be guarded behind window/env/readyState conditional'
    )
    assert(
        !/function\s+\w+[^)]*\)\s*\{[\s\S]{0,800}bindFocusTrapObserver\s*\(/.test(mainSrc),
        'bindFocusTrapObserver() must not be wrapped inside a function (must run at module init)'
    )
    console.log('  PASS - bindFocusTrapObserver() called unconditionally at app-init')

    // Contract Point 4: src/main.ts references disposeFocusTrapBindings in a teardown path
    console.log('\n[CONTRACT 4] src/main.ts wires disposeFocusTrapBindings in a teardown listener')
    assert(
        /disposeFocusTrapBindings\s*\(\s*\)/.test(mainSrc),
        'src/main.ts must invoke disposeFocusTrapBindings() somewhere'
    )
    // Cheap proximity check: disposeFocusTrapBindings call must appear inside a teardown context — either
    // beforeunload callback, import.meta.hot.dispose, or a named disposeAppListeners function.
    const disposeCallIdx = mainSrc.indexOf('disposeFocusTrapBindings(')
    assert(disposeCallIdx !== -1, 'src/main.ts must contain a disposeFocusTrapBindings call')
    const surrounding = mainSrc.slice(Math.max(0, disposeCallIdx - 2000), disposeCallIdx + 200)
    assert(
        /beforeunload|disposeAppListeners|import\.meta\.hot\.dispose|disposeFocusTrapBindings\s*\(\s*\)\s*\{/.test(
            surrounding
        ),
        'disposeFocusTrapBindings must be called from a beforeunload / disposeAppListeners / import.meta.hot.dispose teardown handler'
    )
    console.log('  PASS - disposeFocusTrapBindings wired into a teardown handler')

    // Contract Point 5: bindFocusTrapObserver body has idempotent guard + observe + surface branch
    console.log('\n[CONTRACT 5] bindFocusTrapObserver body: idempotent guard + observe + surface branch')
    assert(
        /if\s*\(\s*_focusTrapObserver\s*\)\s*return/.test(bindingsSrc),
        'bindFocusTrapObserver must guard re-entry with `if (_focusTrapObserver) return`'
    )
    assert(
        /_focusTrapObserver\s*=\s*new MutationObserver\s*\(/.test(bindingsSrc),
        'bindFocusTrapObserver must instantiate _focusTrapObserver as a new MutationObserver'
    )
    assert(
        /\.observe\s*\(\s*document\.body\s*,\s*\{[\s\S]*?attributeFilter\s*:\s*\[\s*['"]data-panel-surface['"]\s*\]/.test(
            bindingsSrc
        ),
        "bindFocusTrapObserver must call .observe(document.body, {attributeFilter:['data-panel-surface']})"
    )
    // Surface branch: trap on search/focus surfaces, release otherwise
    assert(
        /trapFocusIn\s*\(\s*\[/.test(bindingsSrc),
        'bindFocusTrapObserver callback must call trapFocusIn([...]) on the trap surfaces'
    )
    assert(
        /releaseFocusTrapNow\s*\(\s*\)/.test(bindingsSrc),
        'bindFocusTrapObserver callback must call releaseFocusTrapNow() on non-trap surfaces'
    )
    // Bonus: disposeFocusTrapBindings must exist in the same module
    assert(
        /export\s+function\s+disposeFocusTrapBindings\s*\(\s*\)(?:\s*:\s*void)?\s*\{/.test(bindingsSrc),
        'focus-trap-bindings.ts must export disposeFocusTrapBindings as a function declaration'
    )
    console.log('  PASS - idempotent guard + observe + surface branch + dispose are present')

    console.log('\n=================================================================')
    console.log('ALL CONTRACT POINTS PASSED — LAGUNA-FT-1 regression guard is in place')
    console.log('=================================================================')
    process.exit(0)
} catch (err) {
    console.error('\nCONTRACT FAILED:', err.message)
    process.exit(1)
}
