/**
 * Motion/state contract for inspectable transition ownership.
 *
 * This is intentionally static. Motion bugs often come from state that exists
 * only in JS booleans, which makes browser QA and reduced-motion checks blind.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveSource } from './source-path.mjs'

const root = process.cwd()
const source = {
    search: readFileSync(resolveSource('src/lib/search/state.ts', root), 'utf8'),
    searchAdapter: readFileSync(resolveSource('src/lib/search/search-panel-adapter.ts', root), 'utf8'),
    sceneReveal: readFileSync(resolveSource('src/lib/engine/scene-reveal.ts', root), 'utf8'),
    threeSetup: readFileSync(resolveSource('src/lib/engine/three-engine.ts', root), 'utf8'),
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
            /import\s+\*\s+as\s+sceneRevealMod\s+from\s+['"]@lib\/engine\/scene-reveal-bridge['"]/.test(
                source.threeSetup
            ) &&
            /revealProgress\s*>=\s*1[\s\S]*?_state\.sceneRevealActive\s*=\s*false[\s\S]*?_sceneReveal\?\.setSceneRevealDataset\s*\(\s*false\s*\)/.test(
                source.threeSetup
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
            /if\s*\(\s*hasFocus\s*&&\s*hasSearchIntent\s*\)\s*return\s+['"]focus-search['"]/.test(
                source.lifecycle
            ) && /if\s*\(\s*graphContext\s*===\s*['"]focus-search['"]\s*\)\s*return\s+['"]focus-search['"]/.test(source.lifecycle)
    }
]

let failed = 0
for (const check of checks) {
    if (!check.pass) {
        failed += 1
        console.error(`FAIL: ${check.name}`)
    }
}

const passed = checks.length - failed
console.log(`motion-state-contract results: ${passed}/${checks.length} passed`)
if (failed) process.exit(1)
