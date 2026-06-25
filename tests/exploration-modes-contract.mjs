/**
 * exploration-modes-contract.mjs
 *
 * Source-level contract for the Svelte-owned exploration mode seam.
 * The old monolithic lifecycle/modes implementation is retired; current
 * ownership is split across:
 *   - src/lib/stores/lifecycle.ts for lifecycle constants and trail depth
 *   - src/lib/stores/navigation.svelte.ts for mycelium mode
 *   - src/lib/stores/focus.svelte.ts for semantic-dive mode
 *   - src/lib/orchestration/cluster-filter-controller.ts for story prompts
 */

import fs from 'node:fs'
import { resolveSource } from './source-path.mjs'

const lifecycleSrc = fs.readFileSync(resolveSource('src/lib/stores/lifecycle.ts', process.cwd()), 'utf8')
const modesReexportSrc = fs.readFileSync(resolveSource('src/lib/stores/lifecycle/modes.ts', process.cwd()), 'utf8')
const navigationSrc = fs.readFileSync(resolveSource('src/lib/stores/navigation.svelte.ts', process.cwd()), 'utf8')
const focusSrc = fs.readFileSync(resolveSource('src/lib/stores/focus.svelte.ts', process.cwd()), 'utf8')
const clusterFilterSrc = fs.readFileSync(resolveSource('src/lib/stores/filter.svelte.ts', process.cwd()), 'utf8')
// applyStoryPrompt lives in orchestration/cluster-filter-controller.ts after the TS split.
const clusterFilterControllerSrc = fs.readFileSync(
    resolveSource('src/lib/orchestration/cluster-filter-controller.ts', process.cwd()),
    'utf8'
)

let passed = 0
let failed = 0

function assert(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`)
}

async function test(name, fn) {
    try {
        await fn()
        console.log(`  ok ${name}`)
        passed++
    } catch (err) {
        console.log(`  FAIL ${name}`)
        console.log(`        ${err.message}`)
        failed++
    }
}

function exportedFunctionSource(src, name) {
    const start = src.search(new RegExp(`export\\s+function\\s+${name}\\s*\\(`))
    if (start === -1) return ''
    const open = src.indexOf('{', start)
    if (open === -1) return ''
    let depth = 0
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') {
            depth--
            if (depth === 0) return src.slice(start, i + 1)
        }
    }
    return ''
}

function exportedObjectBody(src, name) {
    const match = src.match(new RegExp(`export\\s+(?:const|let|var)\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))
    return match?.[1] ?? ''
}

await test('MODE_DESCRIPTIONS is exported and non-empty', () => {
    assert(/MODE_DESCRIPTIONS/.test(modesReexportSrc), 'modes.ts re-exports MODE_DESCRIPTIONS')
    const body = exportedObjectBody(lifecycleSrc, 'MODE_DESCRIPTIONS')
    assert(body, 'MODE_DESCRIPTIONS must be exported from lifecycle.ts')
    for (const key of ['default', 'bloom', 'bridge', 'trail', 'inside']) {
        assert(new RegExp(`(?:^|[\\s,{])['"]?${key}['"]?\\s*:`).test(body), `MODE_DESCRIPTIONS has ${key} key`)
    }
})

await test('STORY_DESCRIPTIONS is exported and non-empty', () => {
    assert(/STORY_DESCRIPTIONS/.test(modesReexportSrc), 'modes.ts re-exports STORY_DESCRIPTIONS')
    const body = exportedObjectBody(lifecycleSrc, 'STORY_DESCRIPTIONS')
    assert(body, 'STORY_DESCRIPTIONS must be exported from lifecycle.ts')
    assert(/(?:^|[\s,{])['"]?standard['"]?\s*:/.test(body), 'STORY_DESCRIPTIONS has standard key')
})

await test('setTrailDepth mirrors journey, nav, and legacy state', () => {
    const body = exportedFunctionSource(lifecycleSrc, 'setTrailDepth')
    assert(/_setTrailDepth\s*\(\s*nextDepth\s*\)/.test(body), 'setTrailDepth calls journey store owner')
    assert(
        /updateNavState\s*\(\s*\{\s*trailDepth:\s*nextDepth\s*\}\s*\)/.test(body),
        'setTrailDepth mirrors navStore.trailDepth'
    )
    assert(/appState\.trailDepth\s*=\s*nextDepth/.test(body), 'setTrailDepth mirrors legacy top-level trailDepth')
    assert(
        /appState\.navState\.trailDepth\s*=\s*nextDepth/.test(body),
        'setTrailDepth mirrors legacy navState.trailDepth'
    )
    assert(!/window\.setTrailDepth\s*\(/.test(body), 'setTrailDepth avoids window.setTrailDepth bridge')
})

await test('setMyceliumMode delegates to navigation store owner', () => {
    assert(
        /setMyceliumMode\s+as\s+_setMyceliumMode/.test(lifecycleSrc),
        'lifecycle imports navigation setMyceliumMode owner'
    )
    assert(
        /export\s+const\s+setMyceliumMode\s*=\s*_setMyceliumMode/.test(lifecycleSrc),
        'lifecycle exports delegated setMyceliumMode'
    )
    const body = exportedFunctionSource(navigationSrc, 'setMyceliumMode')
    assert(/_navWritable\.update/.test(body), 'navigation setMyceliumMode updates nav writable')
    assert(/myceliumMode:\s*mode/.test(body), 'navigation setMyceliumMode writes myceliumMode')
    assert(!/window\./.test(body), 'navigation setMyceliumMode avoids window bridge calls')
    assert(!/updateUrlState\s*\(/.test(body), 'navigation setMyceliumMode avoids direct URL state writes')
})

await test('setSemanticDiveMode is owned by focus store', () => {
    assert(
        /setSemanticDiveMode\s+as\s+_setSemanticDiveMode/.test(lifecycleSrc),
        'lifecycle imports focus setSemanticDiveMode owner'
    )
    assert(
        /export\s+const\s+setSemanticDiveMode\s*=\s*_setSemanticDiveMode/.test(lifecycleSrc),
        'lifecycle exports delegated setSemanticDiveMode'
    )
    const body = exportedFunctionSource(focusSrc, 'setSemanticDiveMode')
    assert(/semanticDiveMode:\s*active/.test(body), 'focus setSemanticDiveMode writes semanticDiveMode')
})

await test('applyStoryPrompt maps story prompts to mode/filter owners', () => {
    // applyStoryPrompt is owned by cluster-filter-controller.ts after the TS split.
    // Also include filter.svelte.ts (re-exports + helpers like setFilter).
    const body = clusterFilterControllerSrc + '\n' + clusterFilterSrc
    assert(
        /story\s*===\s*['"]signal-rich['"][\s\S]*?setMyceliumMode\s*\(\s*['"]bloom['"]/.test(body),
        'signal-rich story maps to bloom mode'
    )
    assert(
        /story\s*===\s*['"]bridge-businesses['"][\s\S]*?setMyceliumMode\s*\(\s*['"]bridge['"]/.test(body),
        'bridge-businesses story maps to bridge mode'
    )
    assert(/story\s*===\s*['"]mapped-food['"]/.test(body), 'mapped-food story is handled')
    assert(
        /overwriteActiveFilters\s*\(/.test(body),
        'applyStoryPrompt resets or updates active filters through store owner'
    )
    assert(
        /storeSetClusterFilter\s*\(\s*null\s*\)/.test(body),
        'applyStoryPrompt clears active cluster filter through store owner'
    )
    assert(/syncFilterControls\s*\(/.test(body), 'applyStoryPrompt refreshes filter controls')
    assert(/(?<!window\.)applyFilters\s*\(/.test(body), 'applyStoryPrompt reapplies filters through direct owner')
    assert(
        !/window\.(applyFilters|setMyceliumMode|syncFilterControls)\s*\(/.test(body),
        'applyStoryPrompt avoids window UI bridge calls'
    )
})

console.log(`\n${'-'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'-'.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)
