#!/usr/bin/env node
/**
 * tests/journey-webgl-lazy-contract.mjs
 *
 * Fast Node contract for the lazy-loading bridge (src/lib/engine/journey-webgl-lazy.ts).
 * This is the W44 Lever-1 Three.js bundle-split fix: it broke the STATIC import
 * chain from the main bundle to Three.js by dynamically importing the overlay
 * modules on first use. The synchronous wrappers return immediately (no-op) if
 * the module hasn't loaded yet; the dynamic import is kicked off in the background.
 *
 * The "theater" regression this locks: a prior version of url-restore-deep-link.ts
 * statically imported `@lib/journey/webgl`, pulling the Three.js chunk into the
 * main entry graph. The fix routes that consumer through THIS lazy bridge.
 *
 * Covers (all runtime, no browser/WebGL needed):
 *   1. Public API surface — ALL 21 exported wrappers are functions, and the
 *      export set is EXACTLY those 21 (catches renames, removals, surprises).
 *   2. Static-import guard (the architectural fix) — the bridge source must
 *      contain the DYNAMIC `import('@lib/journey/webgl')` and must NOT contain a
 *      STATIC `from '@lib/journey/webgl'`. Same for the other two targets.
 *   3. Consumer wiring — url-restore-deep-link.ts must import from the lazy
 *      bridge (and the two specific functions we rely on), and must NOT statically
 *      import `@lib/journey/webgl`. Plus a repo-wide check that no other file does.
 *   4. No-op safety before load — calling every wrapper while the underlying
 *      module is still pending must NOT throw and must return immediately. This is
 *      the essential lazy guarantee: a slow or failed WebGL import must never
 *      crash the app's call sites. (All calls are synchronous within the burst so
 *      webglModule stays null for the whole burst — deterministic, no flake.)
 *   5. setInspectedStrandOverlayUpdater delegates to the static adapter (no throw).
 *   6. preloadJourneyWebgl kicks off the imports without throwing (last test, so a
 *      background import resolving can't contaminate later wrapper calls).
 *
 * Runtime style mirrors mycelium-bezier-contract.mjs / engine-state-machine-contract.mjs:
 * Node ESM + ts-resolve loader + minimal window/performance shims.
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// Expose file URLs for static-source assertions.
const SRC_BRIDGE = fileURLToPath(new URL('../src/lib/engine/journey-webgl-lazy.ts', import.meta.url))
const SRC_CONSUMER = fileURLToPath(new URL('../src/lib/orchestration/url-restore-deep-link.ts', import.meta.url))

// ── Shims ────────────────────────────────────────────────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => 0
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ── Tests ────────────────────────────────────────────────────────────────────

// The complete, exact public API surface of the lazy bridge (verified by grep:
// 21 `export function` lines, no `export const`/`export type`).
const EXPECTED_EXPORTS = [
    'resetRouteTraceDiagnostics',
    'removeRouteTraceOverlay',
    'setRouteChoreographyPhase',
    'refreshRouteTraceOverlay',
    'updateRouteTraceOverlayPositions',
    'refreshFocusSemanticOverlay',
    'updateFocusSemanticOverlayPositions',
    'updateFocusSemanticOverlayFrame',
    'syncFocusSemanticOverlayResolutionPort',
    'removeFocusSemanticOverlay',
    'resetFocusThreadDiagnostics',
    'syncArrivalHandoffOverlay',
    'updateArrivalHandoffOverlay',
    'disposeArrivalHandoffOverlay',
    'updateRouteTraceOverlayFrame',
    'updateArrivalHandoffOverlayFrame',
    'syncInspectedStrandOverlay',
    'updateInspectedStrandOverlay',
    'disposeInspectedStrandOverlay',
    'setInspectedStrandOverlayUpdater',
    'preloadJourneyWebgl'
]

async function testPublicApiSurface() {
    console.log('\n[TEST] Public API surface — all 21 exports are functions')

    const mod = await import('../src/lib/engine/journey-webgl-lazy.ts')

    // (a) every expected export exists and is a function
    for (const name of EXPECTED_EXPORTS) {
        assert(name in mod, `export "${name}" must exist on the lazy bridge module`)
        assert(typeof mod[name] === 'function', `export "${name}" must be a function, got ${typeof mod[name]}`)
    }

    // (b) the export set is EXACTLY the 21 expected (no missing, no surprise extra)
    const actualFns = Object.keys(mod)
        .filter((k) => typeof mod[k] === 'function')
        .sort()
    const expectedSorted = [...EXPECTED_EXPORTS].sort()
    assert(
        actualFns.length === expectedSorted.length,
        `function-export count should be ${expectedSorted.length}, got ${actualFns.length} (${actualFns.join(', ')})`
    )
    for (let i = 0; i < expectedSorted.length; i++) {
        assert(
            actualFns[i] === expectedSorted[i],
            `export #${i} mismatch: expected "${expectedSorted[i]}", got "${actualFns[i] ?? '<missing>'}"`
        )
    }

    console.log(`  OK all ${EXPECTED_EXPORTS.length} exports present, exact set verified`)
}

async function testStaticImportGuard() {
    console.log('\n[TEST] Static-import guard — bridge uses dynamic import, not static')

    const src = readFileSync(SRC_BRIDGE, 'utf8')

    // The architectural fix: NO static `from '@lib/journey/webgl'` (that would pull
    // Three.js into the main entry graph). There is a static import of the LIGHT
    // adapter (@lib/journey/inspected-strand-overlay-adapter) — that is allowed.
    const staticWebgl = src.match(/from\s+['"]@lib\/journey\/webgl['"]/)
    assert(staticWebgl === null, `bridge must NOT statically import @lib/journey/webgl (found: ${staticWebgl?.[0]})`)

    // Must contain the DYNAMIC import('@lib/journey/webgl') — that is the lazy split.
    const dynamicWebgl = src.match(/import\(\s*['"]@lib\/journey\/webgl['"]\s*\)/)
    assert(dynamicWebgl !== null, "bridge must dynamically import('@lib/journey/webgl')")

    // Same discipline for the other two lazily-loaded targets.
    const staticRouteArrival = src.match(/from\s+['"]@lib\/journey\/route-arrival-overlay-adapter['"]/)
    assert(
        staticRouteArrival === null,
        `bridge must NOT statically import @lib/journey/route-arrival-overlay-adapter (found: ${staticRouteArrival?.[0]})`
    )
    const dynamicRouteArrival = src.match(/import\(\s*['"]@lib\/journey\/route-arrival-overlay-adapter['"]\s*\)/)
    assert(dynamicRouteArrival !== null, "bridge must dynamically import('@lib/journey/route-arrival-overlay-adapter')")

    const staticInspector = src.match(/from\s+['"]@lib\/journey\/thread-inspector-webgl['"]/)
    assert(
        staticInspector === null,
        `bridge must NOT statically import @lib/journey/thread-inspector-webgl (found: ${staticInspector?.[0]})`
    )
    const dynamicInspector = src.match(/import\(\s*['"]@lib\/journey\/thread-inspector-webgl['"]\s*\)/)
    assert(dynamicInspector !== null, "bridge must dynamically import('@lib/journey/thread-inspector-webgl')")

    console.log('  OK webgl/route-arrival/inspector all dynamic, none static')
}

async function testConsumerWiring() {
    console.log('\n[TEST] Consumer wiring — url-restore-deep-link uses the lazy bridge')

    const consumer = readFileSync(SRC_CONSUMER, 'utf8')

    // The two functions we rely on must be imported FROM the lazy bridge.
    const importsFromBridge = consumer.match(/import\s*\{[^}]*\}\s*from\s*['"]@lib\/engine\/journey-webgl-lazy['"]/)
    assert(importsFromBridge !== null, 'url-restore-deep-link must import from @lib/engine/journey-webgl-lazy')
    assert(
        importsFromBridge[0].includes('refreshFocusSemanticOverlay'),
        'url-restore-deep-link must import refreshFocusSemanticOverlay from the lazy bridge'
    )
    assert(
        importsFromBridge[0].includes('updateFocusSemanticOverlayPositions'),
        'url-restore-deep-link must import updateFocusSemanticOverlayPositions from the lazy bridge'
    )

    // The regression guard: it must NOT statically import the heavy webgl module.
    const staticWebglInConsumer = consumer.match(/from\s+['"]@lib\/journey\/webgl['"]/)
    assert(
        staticWebglInConsumer === null,
        `url-restore-deep-link must NOT statically import @lib/journey/webgl (found: ${staticWebglInConsumer?.[0]})`
    )

    // Repo-wide: no other file statically imports @lib/journey/webgl. The only
    // place a STATIC reference to that specifier may appear is inside the lazy
    // bridge's `typeof import(...)` type annotations, which are not `from` imports.
    const { execSync } = await import('node:child_process')
    let repoHits
    try {
        repoHits = execSync('grep -rnE "from \'@lib/journey/webgl\'" src/ --include=*.ts --include=*.svelte || true', {
            encoding: 'utf8'
        })
    } catch {
        repoHits = ''
    }
    assert(repoHits.trim() === '', `no file may statically import @lib/journey/webgl (found:\n${repoHits.trim()})`)

    console.log('  OK lazy bridge is the sole entry point; no static webgl import anywhere')
}

async function testNoOpSafetyBeforeLoad() {
    console.log('\n[TEST] No-op safety — every wrapper is callable while module is pending')

    const mod = await import('../src/lib/engine/journey-webgl-lazy.ts')

    // IMPORTANT: this burst is fully synchronous — no `await` between calls. The
    // dynamic import() kicked off by the first call resolves on a later microtask,
    // so webglModule/routeArrivalModule/inspectorWebglModule stay null for the
    // ENTIRE burst. Therefore every wrapper hits the `if (!xModule) { ensure...();
    // return }` no-op branch. Deterministic, no flake.
    const failures = []
    const call = (label, fn) => {
        try {
            const ret = fn()
            if (ret !== undefined) failures.push(`${label} returned ${typeof ret} (expected void/undefined)`)
        } catch (err) {
            failures.push(`${label} threw: ${err && err.message ? err.message : err}`)
        }
    }

    // ── webgl module wrappers ──
    call('resetRouteTraceDiagnostics', () => mod.resetRouteTraceDiagnostics())
    call('removeRouteTraceOverlay', () => mod.removeRouteTraceOverlay())
    call('setRouteChoreographyPhase', () => mod.setRouteChoreographyPhase('arriving'))
    call('refreshRouteTraceOverlay', () => mod.refreshRouteTraceOverlay())
    call('updateRouteTraceOverlayPositions', () => mod.updateRouteTraceOverlayPositions())
    call('refreshFocusSemanticOverlay', () => mod.refreshFocusSemanticOverlay())
    call('updateFocusSemanticOverlayPositions', () => mod.updateFocusSemanticOverlayPositions(1234.5))
    call('updateFocusSemanticOverlayFrame', () => mod.updateFocusSemanticOverlayFrame(1234.5))
    call('syncFocusSemantic' /* label only */, () => mod.syncFocusSemanticOverlayResolutionPort())
    call('removeFocusSemanticOverlay', () => mod.removeFocusSemanticOverlay())
    call('resetFocusThreadDiagnostics', () => mod.resetFocusThreadDiagnostics('test-reason'))
    call('syncArrivalHandoffOverlay', () => mod.syncArrivalHandoffOverlay())
    call('updateArrivalHandoffOverlay', () => mod.updateArrivalHandoffOverlay())
    call('disposeArrivalHandoffOverlay', () => mod.disposeArrivalHandoffOverlay())

    // ── route-arrival module wrappers ──
    call('updateRouteTraceOverlayFrame', () => mod.updateRouteTraceOverlayFrame(1234.5))
    call('updateArrivalHandoffOverlayFrame', () => mod.updateArrivalHandoffOverlayFrame(1234.5))

    // ── inspector module wrappers ──
    call('syncInspectedStrandOverlay', () => mod.syncInspectedStrandOverlay())
    call('updateInspectedStrandOverlay', () => mod.updateInspectedStrandOverlay(1234.5))
    call('disposeInspectedStrandOverlay', () => mod.disposeInspectedStrandOverlay())

    assert(failures.length === 0, `no-op safety failures:\n  ${failures.join('\n  ')}`)

    console.log('  OK all 19 wrappers callable pre-load: no throw, void return')
}

async function testSetInspectedStrandOverlayUpdaterDelegates() {
    console.log('\n[TEST] setInspectedStrandOverlayUpdater delegates to static adapter')

    const mod = await import('../src/lib/engine/journey-webgl-lazy.ts')

    // Passing a dummy updater must not throw — it delegates (statically) to the
    // light @lib/journey/inspected-strand-overlay-adapter, not to any lazy module.
    let threw = null
    try {
        mod.setInspectedStrandOverlayUpdater(function dummyUpdater() {})
    } catch (err) {
        threw = err && err.message ? err.message : String(err)
    }
    assert(threw === null, `setInspectedStrandOverlayUpdater should not throw, got: ${threw}`)

    console.log('  OK delegates to adapter without throwing')
}

async function testPreloadDoesNotThrow() {
    console.log('\n[TEST] preloadJourneyWebgl kicks off imports without throwing')

    const mod = await import('../src/lib/engine/journey-webgl-lazy.ts')

    // preloadJourneyWebgl() starts the three dynamic imports and swallows any
    // failure via .catch(silenceError(...)). It must return synchronously without
    // throwing. This is the LAST test so a background import resolving cannot make
    // a later wrapper call delegate to an uninitialized real module.
    let threw = null
    try {
        const ret = mod.preloadJourneyWebgl()
        if (ret !== undefined) threw = `preloadJourneyWebgl returned ${typeof ret} (expected void)`
    } catch (err) {
        threw = err && err.message ? err.message : String(err)
    }
    assert(threw === null, `preloadJourneyWebgl should not throw, got: ${threw}`)

    console.log('  OK preloadJourneyWebgl is safe to call')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testPublicApiSurface,
        testStaticImportGuard,
        testConsumerWiring,
        testNoOpSafetyBeforeLoad,
        testSetInspectedStrandOverlayUpdaterDelegates,
        testPreloadDoesNotThrow
    ]

    let passed = 0
    let failed = 0

    for (const test of tests) {
        try {
            await test()
            passed++
        } catch (err) {
            console.error(`  ${err.message}`)
            failed++
        }
    }

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
}

main().catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
})
