/**
 * Motion/state contract for inspectable transition ownership.
 *
 * Static pins guard the source-level invariants (function existence, DOM dataset
 * wiring). Runtime behavioral tests exercise the actual DOM-state setters so the
 * contract survives refactors that rename functions but preserve behavior.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveSource } from './source-path.mjs'
import './helpers/svelte-rune-shim.mjs'

const root = process.cwd()
const source = {
    search: readFileSync(resolveSource('src/lib/search/state.ts', root), 'utf8'),
    searchAdapter: readFileSync(resolveSource('src/lib/search/search-panel-adapter.ts', root), 'utf8'),
    sceneReveal: readFileSync(resolveSource('src/lib/engine/scene-reveal.ts', root), 'utf8'),
    threeSetup: readFileSync(resolveSource('src/lib/engine/three-engine-core.ts', root), 'utf8'),
    frameUpdates: readFileSync(resolveSource('src/lib/engine/three-engine-frame-updates.ts', root), 'utf8'),
    journey: readFileSync(resolveSource('src/lib/journey/journey.ts', root), 'utf8'),
    journeyWebgl: readFileSync(resolveSource('src/lib/journey/route-trace.ts', root), 'utf8'),
    lifecycle: readFileSync(resolveSource('src/lib/stores/lifecycle.ts', root), 'utf8'),
    journeyCompassController: readFileSync(resolveSource('src/lib/journey/compass-state.ts', root), 'utf8')
}

const checks = [
    {
        name: 'search glow exposes active DOM state',
        pass: /function\s+setSearchGlowState[\s\S]*?document\.body\.dataset\.searchGlow\s*=\s*active\s*\?\s*['"]active['"]\s*:\s*['"]inactive['"]/.test(
            source.searchAdapter
        )
    },
    {
        name: 'search glow exposes inactive DOM state',
        pass: /function\s+setSearchGlowState[\s\S]*?document\.body\.dataset\.searchGlow\s*=\s*active\s*\?\s*['"]active['"]\s*:\s*['"]inactive['"]/.test(
            source.searchAdapter
        )
    },
    {
        name: 'scene reveal has a shared DOM-state setter',
        pass: /export\s+function\s+setSceneRevealDataset/.test(source.sceneReveal)
    },
    {
        name: 'scene reveal marks DOM active at reveal start',
        pass: /function\s+startSceneReveal[\s\S]*?setSceneRevealDataset\s*\(\s*true\s*\)/.test(source.sceneReveal)
    },
    {
        name: 'scene reveal reduced-motion path resolves DOM and JS state',
        pass: /prefersReduced[\s\S]*?setSceneRevealDataset\s*\(\s*false\s*\)[\s\S]*?state\.sceneRevealActive\s*=\s*false[\s\S]*?return\s+1\.0/.test(
            source.sceneReveal
        )
    },
    {
        name: 'renderer completion clears scene reveal DOM state',
        pass:
            /import\s+\*\s+as\s+sceneRevealMod\s+from\s+['"](?:@lib\/engine\/scene-reveal|\.\/scene-reveal)['"]/.test(
                source.frameUpdates
            ) &&
            /revealProgress\s*>=\s*1[\s\S]*?state\.sceneRevealActive\s*=\s*false[\s\S]*?sceneRevealMod\.setSceneRevealDataset\s*\(\s*false\s*\)/.test(
                source.frameUpdates
            )
    },
    {
        name: 'route choreography writes data-route-motion',
        pass: /routeMotion\s*=/.test(source.journeyWebgl)
    },
    {
        name: 'route motion is active only in galaxy view',
        pass: /routeMotion\s*=\s*.*['"]galaxy['"]\s*\?\s*phase\s*:\s*['"]inactive['"]/.test(source.journeyWebgl)
    },
    {
        name: 'focus plus search intent owns focus-search panel surface',
        pass:
            /if\s*\(\s*hasFocus\s*&&\s*hasSearchIntent\s*\)\s*return\s+['"]focus-search['"]/.test(source.lifecycle) &&
            /if\s*\(\s*graphContext\s*===\s*['"]focus-search['"]\s*\)\s*return\s+['"]focus-search['"]/.test(
                source.lifecycle
            )
    }
]

let failed = 0
for (const check of checks) {
    if (!check.pass) {
        failed += 1
        console.error(`FAIL: ${check.name}`)
    }
}

let staticPassed = checks.length - failed
console.log(`motion-state-contract static: ${staticPassed}/${checks.length} passed`)

// ── Runtime Behavioral Tests ──────────────────────────────────────────────────

// DOM shim for runtime tests
if (!globalThis.document) {
    globalThis.document = {
        body: {
            dataset: {},
            classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } }
        }
    }
}

const runtimeTests = []

async function runRuntimeTests() {
    // R1: setSceneRevealDataset sets body.dataset.sceneReveal
    try {
        const { setSceneRevealDataset } = await import('../src/lib/engine/scene-reveal.ts')

        setSceneRevealDataset(true)
        if (document.body.dataset.sceneReveal !== 'active') {
            throw new Error(`expected 'active', got '${document.body.dataset.sceneReveal}'`)
        }
        console.log('  R1 PASS: setSceneRevealDataset(true) → body.dataset.sceneReveal = active')
        runtimeTests.push(true)

        setSceneRevealDataset(false)
        if (document.body.dataset.sceneReveal !== 'inactive') {
            throw new Error(`expected 'inactive', got '${document.body.dataset.sceneReveal}'`)
        }
        console.log('  R2 PASS: setSceneRevealDataset(false) → body.dataset.sceneReveal = inactive')
        runtimeTests.push(true)
    } catch (e) {
        console.error(`  R1/R2 FAIL: ${e.message}`)
        runtimeTests.push(false, false)
    }

    // R3: setSearchGlowState sets body.dataset.searchGlow
    try {
        const { setSearchGlowState } = await import('../src/lib/search/search-panel-adapter.ts')

        setSearchGlowState(true)
        if (document.body.dataset.searchGlow !== 'active') {
            throw new Error(`expected 'active', got '${document.body.dataset.searchGlow}'`)
        }
        console.log('  R3 PASS: setSearchGlowState(true) → body.dataset.searchGlow = active')
        runtimeTests.push(true)

        setSearchGlowState(false)
        if (document.body.dataset.searchGlow !== 'inactive') {
            throw new Error(`expected 'inactive', got '${document.body.dataset.searchGlow}'`)
        }
        console.log('  R4 PASS: setSearchGlowState(false) → body.dataset.searchGlow = inactive')
        runtimeTests.push(true)
    } catch (e) {
        console.error(`  R3/R4 FAIL: ${e.message}`)
        runtimeTests.push(false, false)
    }

    // R5: Both functions follow the same active/inactive contract pattern
    try {
        const { setSceneRevealDataset } = await import('../src/lib/engine/scene-reveal.ts')
        const { setSearchGlowState } = await import('../src/lib/search/search-panel-adapter.ts')

        // Reset to known state
        setSceneRevealDataset(false)
        setSearchGlowState(false)

        // Cross-verify: setting one doesn't affect the other
        setSceneRevealDataset(true)
        if (document.body.dataset.searchGlow === 'active') {
            throw new Error('setSceneRevealDataset should not affect searchGlow')
        }
        console.log('  R5 PASS: dataset keys are independent (sceneReveal ≠ searchGlow)')
        runtimeTests.push(true)
    } catch (e) {
        console.error(`  R5 FAIL: ${e.message}`)
        runtimeTests.push(false)
    }
}

await runRuntimeTests()

const rtPassed = runtimeTests.filter(Boolean).length
const rtTotal = runtimeTests.length
const totalPassed = staticPassed + rtPassed
const totalAll = checks.length + rtTotal
console.log(`motion-state-contract results: ${staticPassed}/${checks.length} static + ${rtPassed}/${rtTotal} runtime = ${totalPassed}/${totalAll} passed`)
if (failed > 0 || rtPassed < rtTotal) process.exit(1)
